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

  // 5. Car Brands and their Models
  const brandsWithModels: {
    name: string;
    isPopular: boolean;
    models: string[];
  }[] = [
    {
      name: 'Toyota',
      isPopular: true,
      models: ['Camry', 'Corolla', 'Land Cruiser', 'Hilux'],
    },
    {
      name: 'Honda',
      isPopular: true,
      models: ['Civic', 'Accord', 'CR-V'],
    },
    {
      name: 'Nissan',
      isPopular: true,
      models: ['Patrol', 'Altima', 'Sunny'],
    },
    {
      name: 'Hyundai',
      isPopular: true,
      models: ['Elantra', 'Sonata', 'Tucson'],
    },
    {
      name: 'Kia',
      isPopular: true,
      models: ['Sportage', 'Optima'],
    },
    {
      name: 'Ford',
      isPopular: false,
      models: ['F-150', 'Explorer'],
    },
    {
      name: 'Chevrolet',
      isPopular: false,
      models: ['Tahoe', 'Camaro'],
    },
    {
      name: 'Lexus',
      isPopular: true,
      models: ['ES 350', 'RX 350'],
    },
    {
      name: 'BMW',
      isPopular: false,
      models: ['3 Series', '5 Series', '7 Series', 'X5'],
    },
    {
      name: 'Mercedes-Benz',
      isPopular: false,
      models: ['C-Class', 'E-Class', 'S-Class', 'G-Class'],
    },
    {
      name: 'GMC',
      isPopular: false,
      models: ['Yukon', 'Sierra'],
    },
    {
      name: 'Mitsubishi',
      isPopular: false,
      models: ['Pajero', 'Outlander'],
    },
  ];

  for (const item of brandsWithModels) {
    const brand = await prisma.carBrandOption.upsert({
      where: { name: item.name },
      update: { isPopular: item.isPopular },
      create: { name: item.name, isPopular: item.isPopular },
    });

    for (const modelTitle of item.models) {
      await prisma.carModelOption.upsert({
        where: {
          brandId_title: {
            brandId: brand.id,
            title: modelTitle,
          },
        },
        update: {},
        create: {
          title: modelTitle,
          brandId: brand.id,
        },
      });
    }
  }
  console.log('Upserted Car Brand and Model Options with relationships');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
