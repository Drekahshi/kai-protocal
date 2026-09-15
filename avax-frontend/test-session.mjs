import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const walletAddress = '0xaA9953BAB5de2147cC0c919Ab2ff22d809188514'.toLowerCase();
try {
  const existing = await prisma.kaiUser.findUnique({ where: { privyUserId: 'test-privy-777' }, include: { wallets: true } });
  console.log('existing:', existing ? existing.id : null);
  let user, isNew = false;
  if (existing) {
    user = existing;
  } else {
    isNew = true;
    user = await prisma.kaiUser.create({ data: { name: 'Test User', email: 'test-privy-777@kai.local', privyUserId: 'test-privy-777', status: 'NORMAL', wallets: { create: [{ chain: 'AVALANCHE', address: walletAddress }] } }, include: { wallets: true } });
  }
  console.log('user ok:', user.id, 'isNew:', isNew);
  if (isNew) {
    await prisma.kaiBarLedger.create({ data: { userId: user.id, type: 'WELCOME_BONUS', amount: 1000, description: 'Welcome bonus', referenceId: `welcome-${user.id}` } });
    console.log('ledger ok');
  }
} catch (e) {
  console.log('ERROR:', e.message);
  if (e.meta) console.log('META:', JSON.stringify(e.meta).slice(0,300));
} finally {
  await prisma.$disconnect();
}
