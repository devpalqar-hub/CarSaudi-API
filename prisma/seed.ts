import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── Role Definitions ───────────────────────────────────

const ROLES = [
  {
    name: 'SUPER_ADMIN',
    label: 'Super Admin',
    description:
      'Full platform access with all administrative privileges. Can manage all users, roles, and platform configurations.',
  },
  {
    name: 'SECONDARY_ADMIN',
    label: 'Secondary Admin',
    description:
      'Administrative access with most management capabilities except Super Admin operations.',
  },
  {
    name: 'MODERATOR',
    label: 'Moderator',
    description:
      'Content moderation access for reviewing and managing vehicle listings and user content.',
  },
  {
    name: 'DEALER',
    label: 'Dealer',
    description:
      'Verified car dealer account with vehicle listing management and dealer portal access.',
  },
  {
    name: 'USER',
    label: 'User',
    description:
      'Standard platform user who can browse, search, and inquire about vehicle listings.',
  },
];

async function main() {
  console.log('🌱 Starting seed...');

  // ── Seed Roles (idempotent) ──────────────────────────

  console.log('📋 Seeding roles...');
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {
        label: role.label,
        description: role.description,
      },
      create: {
        name: role.name,
        label: role.label,
        description: role.description,
      },
    });
  }
  console.log(`✅ ${ROLES.length} roles seeded`);

  // ── Seed Super Admin ─────────────────────────────────

  const superAdminRole = await prisma.role.findUnique({
    where: { name: 'SUPER_ADMIN' },
  });

  if (!superAdminRole) {
    throw new Error('SUPER_ADMIN role not found after seeding');
  }

  // Check if any user already has SUPER_ADMIN role
  const existingAdmin = await prisma.user.findFirst({
    where: {
      roles: {
        some: {
          role: { name: 'SUPER_ADMIN' },
        },
      },
    },
  });

  if (existingAdmin) {
    console.log('✅ Super Admin already exists:', existingAdmin.email);
    return;
  }

  // Upsert Super Admin user (handles pre-existing users from before migration)
  const hashedPassword = await bcrypt.hash('Admin@123', 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@carsaudi.com' },
    update: {
      accountStatus: 'ACTIVE',
      isVerified: true,
    },
    create: {
      fullName: 'Super Admin',
      email: 'admin@carsaudi.com',
      phone: '+966500000000',
      password: hashedPassword,
      accountStatus: 'ACTIVE',
      isVerified: true,
    },
  });

  // Assign SUPER_ADMIN role if not already assigned
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
    },
  });

  console.log('✅ Super Admin created/updated successfully');
  console.log('   Email:', superAdmin.email);
  console.log('   Password: Admin@123');
  console.log('   ⚠️  Please change this password after first login!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
