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

if (process.env.BOOTSTRAP_CONFIRM !== 'RESET_PRODUCTION_ADMIN_PASSWORD') {
  throw new Error(
    'Set BOOTSTRAP_CONFIRM=RESET_PRODUCTION_ADMIN_PASSWORD to authorize this operation',
  );
}

required('DATABASE_URL');
const organizationId = required('BOOTSTRAP_ORGANIZATION_ID');
const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
const password = requiredSecret('BOOTSTRAP_ADMIN_PASSWORD');

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
  throw new Error('BOOTSTRAP_ORGANIZATION_ID must be a valid UUID');
}

if (!/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
}

if (password.length < 14) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 14 characters');
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: {
      organizationId_email: {
        organizationId,
        email,
      },
    },
    select: {
      id: true,
      email: true,
      role: true,
      organization: {
        select: {
          id: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!user || user.organization.id !== organizationId) {
    throw new Error('The requested production administrator was not found');
  }

  if (user.role !== Role.SUPER_ADMIN) {
    throw new Error('Password reset refused: the target user is not a SUPER_ADMIN');
  }

  if (!user.organization.isActive || user.organization.deletedAt !== null) {
    throw new Error('Password reset refused: the target organization is inactive');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    }),
    prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  console.log('Production administrator password reset successfully.');
  console.log(`Workspace ID: ${organizationId}`);
  console.log(`Email: ${user.email}`);
  console.log('Existing refresh sessions revoked.');
} finally {
  await prisma.$disconnect();
}
