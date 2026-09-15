/**
 * src/lib/agent/tools.ts
 *
 * Typed tool registry for the KAI Voice Agent (PRD §5, §19, §20).
 *
 * Principles enforced here:
 *  - Tools are the ONLY thing Gemini may call (no arbitrary execution).
 *  - Read tools (get_apy, get_token_price, get_wallet_balance,
 *    search_conservation_nfts) execute server-side and return REAL data.
 *  - Would-be write tools (swap / mpesa / escrow / nft) never execute here.
 *    They return a deterministic PLAN with `requiresHumanApproval: true`.
 *    Execution happens on the client after the human approves (MetaMask/Core)
 *    or through the existing M-Pesa STK route.
 *  - The agent never ships to the chain by itself.
 *
 * Server-only module. Do not import from client bundles.
 */

import { createPublicClient, getAddress, http, formatUnits } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { ERC20_ABI } from '@/lib/erc20abi';
import { prisma } from '@/lib/prisma';

export const CHAIN = {
  name: 'Avalanche C-Chain (Fuji)',
  chainId: 43113,
  rpc: process.env.NEXT_PUBLIC_AVAX_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
  explorer: 'https://testnet.snowtrace.io',
} as const;

const rpcClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(CHAIN.rpc),
});

export type ToolKind = 'data' | 'plan';

export interface ToolResult {
  kind: ToolKind;
  /** Human + model readable summary. JSON-serializable. */
  payload: Record<string, unknown>;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  /** Safe executor. Returns data for reads, deterministic plans for writes. */
  run: (args: Record<string, string>) => Promise<ToolResult>;
}

export const USD_PER_KES = parseFloat(process.env.PAYSTACK_KES_PER_USD || '130');

/** Reference protocol parameters — NOT a live market oracle. */
const PROTOCOL_APY: Record<string, { apyPct: string; apyBps: number; risk: string }> = {
  kvyBOB: { apyPct: '7.5%',  apyBps: 750,  risk: 'Low' },
  kvNVR:  { apyPct: '12.0%', apyBps: 1200, risk: 'Medium' },
  kvYGOLD:{ apyPct: '18.0%', apyBps: 1800, risk: 'Medium' },
  kvGAMI: { apyPct: '22.0%', apyBps: 2200, risk: 'High' },
  NVR:    { apyPct: '15.2%', apyBps: 1520, risk: 'Medium' },
  YTOKEN: { apyPct: '14.8%', apyBps: 1480, risk: 'Medium' },
  yBOB:   { apyPct: '7.5%',  apyBps: 750,  risk: 'Low' },
  CENTS:  { apyPct: '6.5%',  apyBps: 650,  risk: 'Low' },
};

/** Reference testnet prices — informational only (PRD §20: never invent tool data). */
const REFERENCE_PRICE_USD: Record<string, number> = {
  AVAX: 42.0,
  KAI: 0.42,
  NVR: 1.5,
  yBOB: 1.0,
  yTOKEN: 1.6,
  yGOLD: 1.9,
  GAMI: 0.08,
  CENTS: 0.01,
};

function isValidAddress(a: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(a ?? '');
}

const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  NVR: '0x6489Ea8302b00A8eEd4D82a78A5f9e71Fe2DaC62',
  yBOB: '0xE4f6A3506616f7c8e445B20a5D93521bFeE97979',
  yTOKEN: '0xF550ACf387011BC0172F2a14656AcE65846b7fBC',
  KAI: '0xaA9953BAB5de2147cC0c919Ab2ff22d809188514',
};

async function getWalletBalance(address: string, token?: string | null): Promise<ToolResult> {
  if (!isValidAddress(address)) {
    return {
      kind: 'data',
      payload: { error: `Invalid Ethereum address: ${address}` },
    };
  }
  const checksummed = getAddress(address);
  try {
    if (!token || token.toUpperCase() === 'AVAX') {
      const wei = await rpcClient.getBalance({ address: checksummed });
      return {
        kind: 'data',
        payload: { address: checksummed, token: 'AVAX', balance: formatUnits(wei, 18), unit: 'AVAX' },
      };
    }
    const sym = token.toUpperCase();
    const tokenAddr = TOKEN_ADDRESSES[sym];
    if (!tokenAddr) {
      return { kind: 'data', payload: { error: `Unknown token: ${token}` } };
    }
    const raw = (await rpcClient.readContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [checksummed],
    })) as bigint;
    return {
      kind: 'data',
      payload: { address: checksummed, token: sym, balance: formatUnits(raw, 18), unit: sym },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'RPC error';
    return { kind: 'data', payload: { error: message } };
  }
}

export const TOOLS: AgentTool[] = [
  {
    name: 'get_apy',
    description:
      'Get currently reference APYs for KAI yield vaults and ecosystem tokens (kvyBOB, kvNVR, kvYGOLD, kvGAMI, NVR, yTOKEN, yBOB, CENTS).',
    parameters: {
      type: 'OBJECT',
      properties: {
        vault: { type: 'STRING', description: 'Optional vault/symbol to query. If omitted, return all.' },
      },
      required: [],
    },
    run: async (args) => {
      const vault = (args.vault || '').trim().toUpperCase();
      const all = Object.entries(PROTOCOL_APY).map(([symbol, v]) => ({
        symbol, apy: v.apyPct, apyBps: v.apyBps, risk: v.risk, source: 'protocol-parameters',
      }));
      const filtered = vault ? all.filter((t) => t.symbol.toUpperCase() === vault || t.symbol.toUpperCase().includes(vault)) : all;
      return { kind: 'data', payload: { apys: filtered, note: 'Reference protocol APYs, not a live market oracle.' } };
    },
  },
  {
    name: 'get_token_price',
    description: 'Get the reference (informational) token price in USD for AVAX, KAI, NVR, yBOB, yTOKEN, yGOLD, GAMI, CENTS.',
    parameters: {
      type: 'OBJECT',
      properties: {
        token: { type: 'STRING', description: 'Token symbol, e.g. AVAX or yBOB.' },
      },
      required: ['token'],
    },
    run: async (args) => {
      const sym = (args.token || '').trim().toUpperCase();
      const price = REFERENCE_PRICE_USD[sym];
      if (price === undefined) {
        return { kind: 'data', payload: { error: `Unknown token: ${sym}`, known: Object.keys(REFERENCE_PRICE_USD) } };
      }
      return { kind: 'data', payload: { token: sym, priceUsd: price, unit: 'USD', note: 'Reference price, informational only.' } };
    },
  },
  {
    name: 'get_wallet_balance',
    description: 'Get the REAL on-chain balance of a wallet address on Avalanche Fuji, in AVAX or an ecosystem token (AVAX, NVR, yBOB, yTOKEN, KAI).',
    parameters: {
      type: 'OBJECT',
      properties: {
        address: { type: 'STRING', description: '0x wallet address (checksummed or lowercase)' },
        token: { type: 'STRING', description: 'Token symbol. Default AVAX.' },
      },
      required: ['address'],
    },
    run: async (args) => getWalletBalance(args.address, args.token || null),
  },
  {
    name: 'search_conservation_nfts',
    description:
      'Search the conservation NFT/products catalog on KAI (forest assets, categories, APY, TVL in KES). Returns REAL records from the KAI database.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search term, e.g. forest, tree species name, or category.' },
      },
      required: [],
    },
    run: async (args) => {
      try {
        const q = (args.query || '').trim();
        const where = q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { category: { contains: q, mode: 'insensitive' as const } },
                { token: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : undefined;
        const products = await prisma.forestProduct.findMany({ where, take: 10, orderBy: { tvlKes: 'desc' } });
        return {
          kind: 'data',
          payload: {
            results: products.map((p) => ({
              id: p.id, name: p.name, category: p.category, apyPct: `${p.apyPercent}%`,
              token: p.token, status: p.status, tvlKes: p.tvlKes,
            })),
            note: 'Real records from the KAI database.',
          },
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'DB unavailable';
        return { kind: 'data', payload: { error: message } };
      }
    },
  },
  {
    name: 'prepare_swap',
    description:
      'Prepare (NOT execute) a plan to swap one token for another on Avalanche. Returns the full transaction plan for human approval in the wallet.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fromToken: { type: 'STRING', description: 'Token to sell, e.g. AVAX' },
        fromAmount: { type: 'STRING', description: 'Amount to sell' },
        toToken: { type: 'STRING', description: 'Token to receive' },
      },
      required: ['fromToken', 'fromAmount', 'toToken'],
    },
    run: async (args) => {
      const fromToken = (args.fromToken || '').trim().toUpperCase();
      const toToken = (args.toToken || '').trim().toUpperCase();
      const amount = parseFloat(args.fromAmount || '0');
      if (!(amount > 0)) {
        return { kind: 'plan', payload: { error: 'fromAmount must be a positive number', requiresHumanApproval: true } };
      }
      return {
        kind: 'plan',
        payload: {
          action: 'swap',
          chain: CHAIN,
          fromToken,
          fromAmount: amount,
          toToken,
          estimatedFeeBps: 30,
          requiresHumanApproval: true,
          approvalNote: 'Open MetaMask/Core to sign the exact swap on-chain.',
        },
      };
    },
  },
  {
    name: 'prepare_mpesa_payment',
    description:
      'Prepare (NOT execute) an M-Pesa STK payment plan. Returns amount in KES and the phone prompt for the human to confirm with PIN.',
    parameters: {
      type: 'OBJECT',
      properties: {
        phone: { type: 'STRING', description: 'Safaricom number in 2547XXXXXXXX format' },
        amountKes: { type: 'STRING', description: 'Amount in Kenya Shillings' },
        purpose: { type: 'STRING', description: 'What the payment is for' },
      },
      required: ['phone', 'amountKes', 'purpose'],
    },
    run: async (args) => {
      const phone = (args.phone || '').replace(/[^\d]/g, '');
      const amountKes = Math.round(parseFloat(args.amountKes || '0'));
      if (!/^254[17]\d{8}$/.test(phone)) {
        return { kind: 'plan', payload: { error: `Invalid phone: use 2547XXXXXXXX (got ${phone})`, requiresHumanApproval: true } };
      }
      if (!(amountKes > 0)) {
        return { kind: 'plan', payload: { error: 'amountKes must be positive', requiresHumanApproval: true } };
      }
      return {
        kind: 'plan',
        payload: {
          action: 'mpesa_payment',
          phone: `0${phone.slice(3)}`,
          amountKes,
          purpose: (args.purpose || '').slice(0, 60),
          requiresHumanApproval: true,
          approvalNote: 'An M-Pesa STK push will be sent to your phone. Confirm on phone with your PIN.',
        },
      };
    },
  },
  {
    name: 'prepare_nft_purchase',
    description: 'Prepare (NOT execute) a conservation NFT purchase plan so the human can approve and pay.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nftId: { type: 'STRING', description: 'NFT id from the catalog (e.g. nft5 or a returned id)' },
        paymentMethod: { type: 'STRING', enum: ['mpesa', 'card', 'yBOB'], description: 'Preferred payment method' },
      },
      required: ['nftId', 'paymentMethod'],
    },
    run: async (args) => ({
      kind: 'plan',
      payload: {
        action: 'nft_purchase',
        nftId: args.nftId,
        paymentMethod: args.paymentMethod || 'mpesa',
        requiresHumanApproval: true,
        approvalNote: 'Approve to start M-Pesa payment and the Avalanche NFT transfer.',
      },
    }),
  },
  {
    name: 'create_escrow_plan',
    description:
      'Prepare (NOT execute) an escrow plan. Funds stay locked in the escrow contract and are only released when the delivery condition is met, then approved.',
    parameters: {
      type: 'OBJECT',
      properties: {
        purpose: { type: 'STRING', description: 'What the escrow protects' },
        valueUsd: { type: 'STRING', description: 'Value in USD' },
        condition: { type: 'STRING', description: 'Condition that must be met for release' },
      },
      required: ['purpose', 'valueUsd', 'condition'],
    },
    run: async (args) => ({
      kind: 'plan',
      payload: {
        action: 'escrow',
        purpose: args.purpose,
        valueUsd: parseFloat(args.valueUsd || '0'),
        condition: args.condition,
        requiresHumanApproval: true,
        approvalNote: 'Escrow locks funds on-chain. Release requires the condition above + human approval.',
      },
    }),
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);

export function findTool(name: string): AgentTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function functionDeclarations() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}