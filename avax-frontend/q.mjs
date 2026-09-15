import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const r = await prisma.$queryRawUnsafe(`SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'Chain' ORDER BY e.enumsortorder`);
console.log('Chain enum values:', r.map(x=>x.enumlabel).join(', '));
await prisma.$disconnect();
