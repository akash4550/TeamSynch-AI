import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { TeamRepository } from './team.repository';

import {
  CreateTeamDto,
  UpdateTeamDto,
  TeamQueryDto,
  InviteMemberDto,
} from './team.dto';

import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../core/events/EventBus';
import { emailQueue } from '../jobs/queues';
import { EntitlementService } from '../billing/entitlement.service';
import {
  createInviteToken,
  verifyInviteToken,
} from '../../core/utils/inviteToken';

import { InvitationStatus, Role, TeamRole } from '@prisma/client';

export interface AcceptInvitationDto {
  firstName?: string;
  lastName?: string;
  password?: string;
}

export class TeamService {
  private repository: TeamRepository;
  private entitlementService: EntitlementService;

  constructor() {
    this.repository = new TeamRepository();
    this.entitlementService = new EntitlementService();
  }

  async getTeams(
    organizationId: string,
    query: TeamQueryDto
  ) {
    return this.repository.findMany(
      organizationId,
      query
    );
  }

  async getUserTeams(
    organizationId: string,
    userId: string
  ) {
    return this.repository.getUserTeams(
      organizationId,
      userId
    );
  }

  async getTeamById(
    organizationId: string,
    teamId: string
  ) {
    const team =
      await this.repository.findById(
        organizationId,
        teamId
      );

    if (!team) {
      throw new AppError(
        'Team not found',
        404
      );
    }

    return team;
  }

  async createTeam(
    organizationId: string,
    ownerId: string,
    data: CreateTeamDto
  ) {
    return this.repository.create(
      organizationId,
      ownerId,
      data
    );
  }

  async updateTeam(
    organizationId: string,
    teamId: string,
    data: UpdateTeamDto
  ) {
    const team =
      await this.repository.update(
        organizationId,
        teamId,
        data
      );

    if (!team) {
      throw new AppError(
        'Team not found',
        404
      );
    }

    return team;
  }

  async deleteTeam(
    organizationId: string,
    teamId: string
  ) {
    const team =
      await this.repository.softDelete(
        organizationId,
        teamId
      );

    if (!team) {
      throw new AppError(
        'Team not found',
        404
      );
    }

    return team;
  }

  async getMembers(
    organizationId: string,
    teamId: string
  ) {
    await this.getTeamById(
      organizationId,
      teamId
    );

    return this.repository.getMembers(
      organizationId,
      teamId
    );
  }

  async updateMembership(
    organizationId: string,
    teamId: string,
    targetUserId: string,
    role: TeamRole
  ) {
    await this.getTeamById(
      organizationId,
      teamId
    );

    const membership =
      await this.repository.getMembership(
        teamId,
        targetUserId
      );

    if (!membership) {
      throw new AppError(
        'User is not a member of this team',
        404
      );
    }

    if (
      membership.role === TeamRole.OWNER
      &&
      role !== TeamRole.OWNER
    ) {
      throw new AppError(
        'Cannot change owner role',
        400
      );
    }

    return this.repository.updateMembership(
      teamId,
      targetUserId,
      role
    );
  }

  async removeMember(
    organizationId: string,
    teamId: string,
    targetUserId: string
  ) {
    await this.getTeamById(
      organizationId,
      teamId
    );

    const membership =
      await this.repository.getMembership(
        teamId,
        targetUserId
      );

    if (!membership) {
      throw new AppError(
        'User is not a member of this team',
        404
      );
    }

    if (
      membership.role === TeamRole.OWNER
    ) {
      throw new AppError(
        'Cannot remove team owner',
        400
      );
    }

    return this.repository.removeMember(
      teamId,
      targetUserId
    );
  }

  async getInvitations(
    organizationId: string,
    teamId: string
  ) {
    await this.getTeamById(
      organizationId,
      teamId
    );

    return this.repository.getInvitations(
      organizationId,
      teamId
    );
  }

  /*
   * FEATURE (ledger #1, 2026-08-05 — invitation accept lifecycle): the
   * invitation row used to be created and then NOTHING happened — no
   * email, no link, no accept path (TeamMemberInvited was declared on the
   * EventBus with zero emitters). inviteMember now: rejects inviting an
   * existing member honestly (409) instead of crashing the later accept
   * on the membership unique; upserts the (teamId, email) row so
   * re-invites supersede (old emailed links die via the expiry-bound
   * HMAC token); enqueues the invitation email through the SAME
   * documented email-queue boundary every outbound mail in this stack
   * uses; and emits the domain event for real.
   */
  async inviteMember(
    organizationId: string,
    teamId: string,
    invitedById: string,
    data: InviteMemberDto
  ) {
    const team = await this.getTeamById(
      organizationId,
      teamId
    );

    const email = data.email.toLowerCase();

    // Inviting someone who is already a member would only crash their
    // accept later on the @@unique([teamId, userId]) membership — say so now.
    const existingUser = await prisma.user.findFirst({
      where: { organizationId, email, deletedAt: null },
    });

    if (existingUser) {
      const membership = await this.repository.getMembership(
        teamId,
        existingUser.id
      );

      if (membership) {
        throw new AppError(
          'This person is already a member of the team',
          409
        );
      }
    }

    const invitation = await this.repository.createInvitation(
      organizationId,
      teamId,
      email,
      invitedById
    );

    const token = createInviteToken(
      invitation.id,
      invitation.expiresAt
    );
    const inviteUrl = `${env.FRONTEND_URL}/accept-invitation?token=${encodeURIComponent(token)}`;

    await emailQueue.add('TEAM_INVITATION', {
      organizationId,
      userId: invitedById,
      to: email,
      subject: `You've been invited to join ${team.name} on TeamSynch AI`,
      template: 'TEAM_INVITATION',
      context: {
        inviteUrl,
        teamName: team.name,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    });

    eventBus.emitEvent('TeamMemberInvited', {
      organizationId,
      teamId,
      email,
      actorId: invitedById,
    });

    return invitation;
  }

  /*
   * FEATURE (ledger #1): public read of an invitation link for the accept
   * page. Read-pure (no lazy status mutations). Malformed/forged/unknown
   * tokens are 400s; honest state reasons let the page render the right
   * card. Exposes only what the invitee needs: email, team/org names and
   * whether an account already exists (drives password-less accept).
   */
  async inspectInvitation(token: string) {
    const parts = verifyInviteToken(token);
    if (!parts) {
      throw new AppError('Invalid invitation link', 400);
    }

    const invitation = await this.repository.findInvitationById(
      parts.invitationId
    );

    if (!invitation) {
      throw new AppError('Invalid invitation link', 400);
    }

    /*
     * BUG FIX (#88, 2026-08-05 — expiry sweep misreported as "used"):
     * ledger #2's daily cleanup sweeps past-expiry PENDING rows to status
     * EXPIRED. The old order ran the generic `status !== PENDING` guard
     * BEFORE the expiry check, so every swept misreported inspected as
     * reason 'USED' ("This invitation has already been used.") — the
     * honest 'EXPIRED' card became unreachable within 24h of expiry.
     * Expiry is now evaluated first, in BOTH its forms (swept status, or
     * PENDING past its expiry not yet swept). Note the old standalone
     * `expiresAt <= now` branch is fully absorbed here — do not re-add it
     * below, or swept rows regress to the lie again.
     */
    const isPastExpiry = invitation.expiresAt.getTime() <= Date.now();

    if (
      invitation.status === InvitationStatus.EXPIRED ||
      (invitation.status === InvitationStatus.PENDING && isPastExpiry)
    ) {
      return {
        valid: false,
        reason: 'EXPIRED' as const,
        message:
          'This invitation has expired — ask a team admin to invite you again.',
      };
    }

    // Only a live row can mismatch (upsert resets status to PENDING with a
    // bumped expiry), so SUPERSEDED AFTER the expiry check stays truthful:
    // a stale link whose row has since expired reports EXPIRED, the honest
    // state of the invitation it points at.
    if (invitation.expiresAt.getTime() !== parts.expiresAtMs) {
      return {
        valid: false,
        reason: 'SUPERSEDED' as const,
        message:
          'This link has been replaced by a newer invitation email — use the latest one.',
      };
    }

    // ACCEPTED / REJECTED — genuinely consumed (expiry-time on an accepted
    // row says nothing about whether it was used, so 'USED' stays correct).
    if (invitation.status !== InvitationStatus.PENDING) {
      return {
        valid: false,
        reason: 'USED' as const,
        message: 'This invitation has already been used.',
      };
    }

    if (invitation.team.deletedAt) {
      return {
        valid: false,
        reason: 'UNAVAILABLE' as const,
        message: 'This team is no longer available.',
      };
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: invitation.organizationId,
        email: invitation.email,
        deletedAt: null,
      },
    });

    return {
      valid: true as const,
      email: invitation.email,
      teamName: invitation.team.name,
      organizationName: invitation.organization.name,
      expiresAt: invitation.expiresAt.toISOString(),
      existingUser: !!existingUser,
    };
  }

  /*
   * FEATURE (ledger #1): consume an invitation link. Defense order:
   * signature -> row -> PENDING -> bound-expiry match (supersede kill) ->
   * not expired -> account exists (attach, password NOT required — the
   * token is the email-ownership proof and the outcome is pinned to the
   * invited email) or create (bcrypt 12, EMPLOYEE, USER plan-quota gate).
   * Single-use is atomic via the status-flip count===1 guard; membership
   * creation is idempotent (alreadyMember tolerated).
   */
  async acceptInvitation(
    token: string,
    data: AcceptInvitationDto
  ) {
    const parts = verifyInviteToken(token);
    if (!parts) {
      throw new AppError('Invalid invitation link', 400);
    }

    const invitation = await this.repository.findInvitationById(
      parts.invitationId
    );

    if (!invitation) {
      throw new AppError('Invalid invitation link', 400);
    }

    /*
     * BUG FIX (#88, 2026-08-05 — same sweep-interplay defect as
     * inspectInvitation above): before this reorder, a cleanup-swept
     * EXPIRED row failed the `status !== PENDING` guard first and the
     * invitee got 409 "already been used" for an invitation that was
     * never used, with the honest 410 unreachable within 24h of expiry.
     * Expiry first (swept status OR unswept PENDING past expiry), then
     * supersede mismatch (only live rows can mismatch), then consumed.
     * The old standalone `expiresAt <= now` 410 is absorbed — do not
     * re-add it, or swept rows regress to the 409 lie.
     */
    const isPastExpiry = invitation.expiresAt.getTime() <= Date.now();

    if (
      invitation.status === InvitationStatus.EXPIRED ||
      (invitation.status === InvitationStatus.PENDING && isPastExpiry)
    ) {
      throw new AppError(
        'This invitation has expired — ask a team admin to invite you again',
        410
      );
    }

    if (invitation.expiresAt.getTime() !== parts.expiresAtMs) {
      throw new AppError(
        'This invitation link is no longer valid — use the newest invitation email',
        400
      );
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new AppError(
        'This invitation has already been used',
        409
      );
    }

    if (invitation.team.deletedAt) {
      throw new AppError(
        'This team is no longer available',
        410
      );
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: invitation.organizationId,
        email: invitation.email,
        deletedAt: null,
      },
    });

    if (existingUser && !existingUser.isActive) {
      throw new AppError(
        'This account has been deactivated — contact your workspace admin',
        403
      );
    }

    let passwordHash: string | null = null;

    if (!existingUser) {
      const firstName = data.firstName?.trim();
      const lastName = data.lastName?.trim();

      if (!firstName || !lastName) {
        throw new AppError(
          'First and last name are required to create your account',
          400
        );
      }

      if (!data.password || data.password.length < 8) {
        throw new AppError(
          'Password must be at least 8 characters',
          400
        );
      }

      // New accounts consume a seat: the USER plan quota must be honest
      // here exactly like POST /users (#49).
      await this.entitlementService.checkEntitlement(
        invitation.organizationId,
        'USER'
      );

      // Slow bcrypt stays OUTSIDE the transaction.
      passwordHash = await bcrypt.hash(data.password, 12);
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const flip = await tx.teamInvitation.updateMany({
        where: {
          id: invitation.id,
          status: InvitationStatus.PENDING,
        },
        data: { status: InvitationStatus.ACCEPTED },
      });

      if (flip.count !== 1) {
        throw new AppError(
          'This invitation has already been used',
          409
        );
      }

      let userId: string;
      let createdAccount = false;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const created = await tx.user.create({
          data: {
            organizationId: invitation.organizationId,
            email: invitation.email,
            password: passwordHash!,
            firstName: data.firstName!.trim(),
            lastName: data.lastName!.trim(),
            role: Role.EMPLOYEE,
          },
        });
        userId = created.id;
        createdAccount = true;
      }

      let alreadyMember = false;
      const membership = await tx.teamMembership.findUnique({
        where: {
          teamId_userId: {
            teamId: invitation.teamId,
            userId,
          },
        },
      });

      if (membership) {
        alreadyMember = true;
      } else {
        await tx.teamMembership.create({
          data: {
            teamId: invitation.teamId,
            userId,
            role: TeamRole.MEMBER,
          },
        });
      }

      return { userId, createdAccount, alreadyMember };
    });

    eventBus.emitEvent('UserJoinedTeam', {
      organizationId: invitation.organizationId,
      teamId: invitation.teamId,
      userId: outcome.userId,
      actorId: outcome.userId,
    });

    return {
      email: invitation.email,
      teamId: invitation.teamId,
      teamName: invitation.team.name,
      ...outcome,
    };
  }
}
