import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Check if super admin already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.SUPER_ADMIN },
  });

  if (existingAdmin) {
    console.log('✅ Super Admin already exists:', existingAdmin.email);
    return;
  }

  // Create Super Admin
  const hashedPassword = await bcrypt.hash('Admin@123', 12);

  const superAdmin = await prisma.user.create({
    data: {
      fullName: 'Super Admin',
      email: 'admin@carsaudi.com',
      phone: '+966500000000',
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      accountStatus: 'ACTIVE',
      isVerified: true,
    },
  });

  console.log('✅ Super Admin created successfully');
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
