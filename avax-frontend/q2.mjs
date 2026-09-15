import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const r = await prisma.$queryRawUnsafe(`
  SELECT t.typname AS name, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS vals
  FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
  WHERE t.typname NOT LIKE '\\_%'
  GROUP BY t.typname ORDER BY t.typname`);
for (const row of r) console.log(row.name + ' :: ' + row.vals);
await prisma.$disconnect();
