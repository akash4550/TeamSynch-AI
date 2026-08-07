import { PrismaClient, TaskPriority, TaskStatus, ProjectStatus, Role, TeamRole, LeadStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { assertSeedTargetSafe } from './seed-guard';

const DEMO_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

const prisma = new PrismaClient();

async function main() {
  /*
   * BUG FIX (#107, 2026-08-06): this script drops EVERY row in EVERY
   * table below (19 un-scoped deleteMany calls) — not "seed records", as
   * the old comment claimed while README offered only a docs-only
   * "never run it against production" warning. The target is now
   * verified BEFORE any write: production boot envs are refused outright,
   * non-loopback targets require SEED_CONFIRM_DATABASE=<exact db name>
   * (see seed-guard.ts). Localhost development stays zero-friction.
   */
  assertSeedTargetSafe(process.env);

  console.log('🌱 Starting database seed...');

  // Full wipe for idempotency: every row in every table is deleted.
  // Guarded by assertSeedTargetSafe above — new destructive steps added
  // here must stay BELOW that call.
  await prisma.aIUsageLog.deleteMany();
  await prisma.cRMActivity.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.client.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.teamInvitation.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // 1. Create Organization
  // RELEASE 2026-08-07: the demo organization is exactly `akash4550`
  // (slug passes the org slug rule ^[a-z0-9-]+$). Renamed from Acme Corp.
  const org = await prisma.organization.create({
    data: {
      id: DEMO_ORGANIZATION_ID,
      name: 'akash4550',
      slug: 'akash4550',
      plan: 'PRO',
      subscriptionStatus: 'ACTIVE',
    },
  });
  console.log(`Created Organization: ${org.name} (workspace ID: ${org.id})`);

  // 2. Create Users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'demo@teamsynch-ai.com',
      password: hashedPassword,
      firstName: 'Alice',
      lastName: 'Admin',
      role: Role.ADMIN,
      organizationId: org.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@teamsynch-ai.com',
      password: hashedPassword,
      firstName: 'Bob',
      lastName: 'Manager',
      role: Role.MANAGER,
      organizationId: org.id,
    },
  });
  console.log('Created Users: demo@teamsynch-ai.com, manager@teamsynch-ai.com');

  // 3. Create Teams
  const engTeam = await prisma.team.create({
    data: {
      name: 'Engineering',
      description: 'Core product engineering and architecture team.',
      color: '#3B82F6',
      organizationId: org.id,
      ownerId: admin.id,
      memberships: {
        create: [
          { userId: admin.id, role: TeamRole.OWNER },
          { userId: manager.id, role: TeamRole.MEMBER },
        ],
      },
    },
  });
  console.log(`Created Team: ${engTeam.name}`);

  // 4. Create Projects & Tasks
  const project1 = await prisma.project.create({
    data: {
      name: 'Q3 Enterprise Launch',
      key: 'Q3LAUNCH',
      description: 'Go-to-market strategy for the new enterprise tier.',
      status: ProjectStatus.ACTIVE,
      organizationId: org.id,
      ownerId: admin.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Finalize Security Audit',
      description: 'Review the security headers and rate limits.',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      position: 65536,
      organizationId: org.id,
      projectId: project1.id,
      assigneeId: admin.id,
      reporterId: manager.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Deploy to Kubernetes',
      description: 'Setup the production cluster and push docker images.',
      status: TaskStatus.TODO,
      priority: TaskPriority.CRITICAL,
      position: 131072,
      organizationId: org.id,
      projectId: project1.id,
      assigneeId: manager.id,
      reporterId: admin.id,
    },
  });
  console.log('Created Project & Tasks.');

  // 5. Create CRM Pipeline (Clients, Contacts, Leads, Stages, Opportunities)
  const client1 = await prisma.client.create({
    data: {
      name: 'Globex Corporation',
      industry: 'Technology',
      email: 'contact@globex.com',
      phone: '+1 (555) 019-2834',
      organizationId: org.id,
      ownerId: admin.id,
    },
  });

  await prisma.contact.create({
    data: {
      clientId: client1.id,
      organizationId: org.id,
      firstName: 'Hank',
      lastName: 'Scorpio',
      email: 'hank@globex.com',
      designation: 'CEO',
    },
  });

  const lead1 = await prisma.lead.create({
    data: {
      title: 'Globex Enterprise License 2026',
      source: 'Inbound Referral',
      score: 85,
      status: LeadStatus.QUALIFIED,
      expectedValue: 150000,
      organizationId: org.id,
      assignedTo: admin.id,
    },
  });

  const stageNew = await prisma.pipelineStage.create({
    data: { name: 'New Lead', probability: 20, position: 100, organizationId: org.id },
  });

  const stageNegotiation = await prisma.pipelineStage.create({
    data: { name: 'Negotiation', probability: 75, position: 200, organizationId: org.id },
  });

  await prisma.opportunity.create({
    data: {
      organizationId: org.id,
      leadId: lead1.id,
      stageId: stageNegotiation.id,
      expectedRevenue: 150000,
      probability: 75,
      closeDate: new Date('2026-12-01'),
    },
  });

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
