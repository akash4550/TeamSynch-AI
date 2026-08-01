import { randomUUID } from "node:crypto";
import { Server } from "node:http";
import { AddressInfo } from "node:net";

import { Role, Team, TeamInvitation, User } from "@prisma/client";

import app from "../../../app";
import { prisma } from "../../../config/prisma";
import { closeRedisClient } from "../../../core/redis/redis.client";
import { signAccessToken } from "../../../core/security/jwt";
import { allQueues } from "../../jobs/queues";

interface InvitationResponse {
  id: string;
  organizationId: string;
  teamId: string;
  email: string;
  status: string;
  invitedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface JsonResponse {
  success?: boolean;
  data?: InvitationResponse[];
  error?: {
    message: string;
  };
}

interface TestResponse {
  status: number;
  body: JsonResponse;
}

let server: Server;
let baseUrl: string;

let primaryOrganizationId: string;
let otherOrganizationId: string;

let primaryAdmin: User;
let primaryManager: User;
let otherTenantAdmin: User;

let primaryTeam: Team;
let otherTenantTeam: Team;
let primaryInvitation: TeamInvitation;

const createUser = (
  organizationId: string,
  role: Role,
  label: string,
): Promise<User> =>
  prisma.user.create({
    data: {
      organizationId,
      firstName: label,
      lastName: "User",
      email: `${label.toLowerCase()}-${randomUUID()}@example.com`,
      password: "team-invitations-test-password-hash",
      role,
      emailVerified: true,
    },
  });

const tokenFor = (user: User): string =>
  signAccessToken({
    userId: user.id,
    organizationId: user.organizationId,
  });

const getInvitations = async (
  teamId: string,
  actor: User,
): Promise<TestResponse> => {
  const response = await fetch(
    `${baseUrl}/api/v1/teams/${teamId}/invitations`,
    {
      headers: {
        Authorization: `Bearer ${tokenFor(actor)}`,
      },
    },
  );

  const responseText = await response.text();

  return {
    status: response.status,
    body: responseText
      ? (JSON.parse(responseText) as JsonResponse)
      : { success: response.ok },
  };
};

const clearTestData = async (): Promise<void> => {
  await prisma.teamInvitation.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
};

beforeAll(async () => {
  server = app.listen(0);

  await new Promise<void>((resolve) => {
    server.once("listening", resolve);
  });

  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await clearTestData();

  const primaryOrganization = await prisma.organization.create({
    data: {
      name: "Team Invitations Primary Organization",
      slug: `team-invitations-primary-${randomUUID()}`,
    },
  });

  const otherOrganization = await prisma.organization.create({
    data: {
      name: "Team Invitations Other Organization",
      slug: `team-invitations-other-${randomUUID()}`,
    },
  });

  primaryOrganizationId = primaryOrganization.id;
  otherOrganizationId = otherOrganization.id;

  [primaryAdmin, primaryManager, otherTenantAdmin] = await Promise.all([
    createUser(primaryOrganizationId, Role.ADMIN, "PrimaryAdmin"),
    createUser(primaryOrganizationId, Role.MANAGER, "PrimaryManager"),
    createUser(otherOrganizationId, Role.ADMIN, "OtherTenantAdmin"),
  ]);

  primaryTeam = await prisma.team.create({
    data: {
      organizationId: primaryOrganizationId,
      ownerId: primaryAdmin.id,
      name: `Primary Team ${randomUUID()}`,
    },
  });

  otherTenantTeam = await prisma.team.create({
    data: {
      organizationId: otherOrganizationId,
      ownerId: otherTenantAdmin.id,
      name: `Other Team ${randomUUID()}`,
    },
  });

  primaryInvitation = await prisma.teamInvitation.create({
    data: {
      organizationId: primaryOrganizationId,
      teamId: primaryTeam.id,
      email: `invitee-${randomUUID()}@example.com`,
      invitedById: primaryAdmin.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await prisma.teamInvitation.create({
    data: {
      organizationId: otherOrganizationId,
      teamId: otherTenantTeam.id,
      email: `other-invitee-${randomUUID()}@example.com`,
      invitedById: otherTenantAdmin.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
});

afterAll(async () => {
  await clearTestData();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });

    server.closeAllConnections();
  });

  await Promise.all(allQueues.map((queue) => queue.close()));
  await closeRedisClient();
  await prisma.$disconnect();
});

describe("team invitation listing security", () => {
  test("allows an administrator to list only the requested team invitations", async () => {
    const response = await getInvitations(primaryTeam.id, primaryAdmin);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data?.[0]).toMatchObject({
      id: primaryInvitation.id,
      organizationId: primaryOrganizationId,
      teamId: primaryTeam.id,
      email: primaryInvitation.email,
      invitedBy: {
        id: primaryAdmin.id,
        email: primaryAdmin.email,
      },
    });

    expect(JSON.stringify(response.body)).not.toContain(primaryAdmin.password);
  });

  test("rejects a manager without TEAM.MANAGE permission", async () => {
    const response = await getInvitations(primaryTeam.id, primaryManager);

    expect(response.status).toBe(403);
  });

  test("does not expose another organization team invitations", async () => {
    const response = await getInvitations(otherTenantTeam.id, primaryAdmin);

    expect(response.status).toBe(404);
    expect(response.body.error?.message).toBe("Team not found");
  });
});
