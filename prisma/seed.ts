import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Super Admin User
  const adminPassword = await bcrypt.hash('Password@123', 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@villasqatar.com' },
    update: {},
    create: {
      email: 'admin@villasqatar.com',
      password: adminPassword,
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log('Upserted Super Admin:', superAdmin.email);

  // 2. Furnishing Options
  const furnishingOptions = ['Furnished', 'Semi-Furnished', 'Unfurnished'];
  for (const title of furnishingOptions) {
    await prisma.furnishingOption.upsert({
      where: { title },
      update: {},
      create: { title },
    });
  }
  console.log('Upserted Furnishing Options');

  // 3. Amenity Options

}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
