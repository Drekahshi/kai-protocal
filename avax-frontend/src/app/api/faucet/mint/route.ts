import { NextResponse } from 'next/server';
import { createWalletClient, http, parseUnits, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import { ECOSYSTEM_TOKENS } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

const ERC20_MINT_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export async function POST(req: Request) {
  try {
    const { recipient, symbol = 'NVR', amount = 100 } = await req.json();

    if (!recipient || !isAddress(recipient)) {
      return NextResponse.json({ error: 'Valid recipient address is required' }, { status: 400 });
    }

    const token = ECOSYSTEM_TOKENS.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
    if (!token?.address) {
      return NextResponse.json({ error: `Token ${symbol} is not deployed on Fuji` }, { status: 400 });
    }

    let rawPk = (process.env.AVAX_PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
    if (!rawPk) {
      return NextResponse.json({ error: 'Server deployer private key not configured' }, { status: 500 });
    }
    if (!rawPk.startsWith('0x')) rawPk = `0x${rawPk}`;

    const rpcUrl = process.env.AVAX_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
    const account = privateKeyToAccount(rawPk as `0x${string}`);
    const client = createWalletClient({
      account,
      chain: avalancheFuji,
      transport: http(rpcUrl),
    });

    const mintAmountWei = parseUnits(amount.toString(), token.decimals);

    const hash = await client.writeContract({
      address: token.address,
      abi: ERC20_MINT_ABI,
      functionName: 'mint',
      args: [recipient as `0x${string}`, mintAmountWei],
    });

    return NextResponse.json({
      success: true,
      symbol: token.symbol,
      amount,
      recipient,
      txHash: hash,
      explorerUrl: `https://testnet.snowtrace.io/tx/${hash}`,
      message: `Minted ${amount} ${token.symbol} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Mint failed';
    console.error('[/api/faucet/mint error]:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
