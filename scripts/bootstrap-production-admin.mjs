import { randomUUID } from 'node:crypto';

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const required = (name) => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
};

const requiredSecret = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must not contain leading or trailing whitespace`);
  }
  return value;
};

if (process.env.BOOTSTRAP_CONFIRM !== 'CREATE_FIRST_ADMIN') {
  throw new Error('Set BOOTSTRAP_CONFIRM=CREATE_FIRST_ADMIN to authorize this one-time operation');
}

required('DATABASE_URL');
const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
const password = requiredSecret('BOOTSTRAP_ADMIN_PASSWORD');
const firstName = process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || 'TeamSynch';
const lastName = process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || 'Administrator';
const organizationName = process.env.BOOTSTRAP_ORGANIZATION_NAME?.trim() || 'TeamSynch AI';
const organizationSlug = process.env.BOOTSTRAP_ORGANIZATION_SLUG?.trim() || 'teamsynch-ai';

if (!/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
}

if (password.length < 14) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 14 characters');
}

if (!/^[a-z0-9-]+$/.test(organizationSlug)) {
  throw new Error('BOOTSTRAP_ORGANIZATION_SLUG must contain only lowercase letters, numbers, and hyphens');
}

const prisma = new PrismaClient();

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma.$transaction(async (tx) => {
    const [organizationCount, userCount] = await Promise.all([
      tx.organization.count(),
      tx.user.count(),
    ]);

    if (organizationCount !== 0 || userCount !== 0) {
      throw new Error(
        `Bootstrap refused: database already contains ${organizationCount} organization(s) and ${userCount} user(s)`,
      );
    }

    const organization = await tx.organization.create({
      data: {
        id: randomUUID(),
        name: organizationName,
        slug: organizationSlug,
        plan: 'PRO',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        firstName,
        lastName,
        email,
        password: passwordHash,
        role: Role.SUPER_ADMIN,
        emailVerified: true,
        passwordChangedAt: new Date(),
      },
    });

    return { organization, user };
  });

  console.log('Production administrator created successfully.');
  console.log(`Workspace ID: ${result.organization.id}`);
  console.log(`Email: ${result.user.email}`);
} finally {
  await prisma.$disconnect();
}
