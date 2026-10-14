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
    where: { email: 'admin@carsaudi.com' },
    update: {},
    create: {
      email: 'admin@carsaudi.com',
      password: adminPassword,
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log('Upserted Super Admin:', superAdmin.email);

  // 2. Car Type Options (body style)
  const carTypeOptions = [
    'Sedan',
    'SUV',
    'Hatchback',
    'Coupe',
    'Pickup Truck',
    'Van',
    'Convertible',
    'Crossover',
  ];
  for (const title of carTypeOptions) {
    await prisma.carTypeOption.upsert({
      where: { title },
      update: {},
      create: { title },
    });
  }
  console.log('Upserted Car Type Options');

  // 3. Car Feature Options
  const carFeatureOptions = [
    'Sunroof',
    'Leather Seats',
    'Navigation System',
    'Bluetooth',
    'Cruise Control',
    'Backup Camera',
    'Alloy Wheels',
    'Keyless Entry',
    'Parking Sensors',
    'Heated Seats',
    'Third Row Seating',
    'Apple CarPlay / Android Auto',
    'Lane Assist',
    'Blind Spot Monitor',
    'Ventilated Seats',
    'Panoramic Roof',
    'Premium Sound System',
  ];
  for (const title of carFeatureOptions) {
    await prisma.carFeatureOption.upsert({
      where: { title },
      update: {},
      create: { title },
    });
  }
  console.log('Upserted Car Feature Options');

  // 4. Car Tag Options
  const carTagOptions = [
    'Single Owner',
    'Accident-Free',
    'GCC Spec',
    'Under Warranty',
    'Certified Pre-Owned',
    'Imported',
    'Full Service History',
    'No Paint Work',
    'Agency Maintained',
  ];
  for (const title of carTagOptions) {
    await prisma.carTagOption.upsert({
      where: { title },
      update: {},
      create: { title },
    });
  }
  console.log('Upserted Car Tag Options');

  // 5. Car Brand Options (a few flagged as popular)
  const carBrandOptions: { name: string; isPopular: boolean }[] = [
    { name: 'Toyota', isPopular: true },
    { name: 'Honda', isPopular: true },
    { name: 'Nissan', isPopular: true },
    { name: 'Hyundai', isPopular: true },
    { name: 'Kia', isPopular: true },
    { name: 'Ford', isPopular: false },
    { name: 'Chevrolet', isPopular: false },
    { name: 'Lexus', isPopular: true },
    { name: 'BMW', isPopular: false },
    { name: 'Mercedes-Benz', isPopular: false },
    { name: 'GMC', isPopular: false },
    { name: 'Mitsubishi', isPopular: false },
  ];
  for (const brand of carBrandOptions) {
    await prisma.carBrandOption.upsert({
      where: { name: brand.name },
      update: {},
      create: { name: brand.name, isPopular: brand.isPopular },
    });
  }
  console.log('Upserted Car Brand Options');

  // 6. Car Model Options
  const carModelOptions = [
    'Camry',
    'Corolla',
    'Land Cruiser',
    'Hilux',
    'Civic',
    'Accord',
    'CR-V',
    'Patrol',
    'Altima',
    'Sunny',
    'Elantra',
    'Sonata',
    'Tucson',
    'Sportage',
    'Optima',
    'F-150',
    'Explorer',
    'Tahoe',
    'Camaro',
    'ES 350',
    'RX 350',
  ];
  for (const title of carModelOptions) {
    await prisma.carModelOption.upsert({
      where: { title },
      update: {},
      create: { title },
    });
  }
  console.log('Upserted Car Model Options');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
