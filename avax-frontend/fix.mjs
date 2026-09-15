import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
await prisma.$executeRawUnsafe(`ALTER TYPE "Chain" ADD VALUE IF NOT EXISTS 'AVALANCHE'`);
console.log('done: AVALANCHE added to Chain enum');
await prisma.$disconnect();
