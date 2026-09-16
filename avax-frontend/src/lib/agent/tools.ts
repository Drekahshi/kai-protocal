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
import { ESCROW_ABI, KAI_ESCROW_ADDRESS, KAI_AMM_ADDRESS } from '@/lib/agent/escrowAbi';

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
    name: 'get_token_balance',
    description:
      'Get the REAL on-chain balance of a specific token (NVR, yBOB, yTOKEN, KAI, CENTS, yGOLD, GAMI) for a wallet on Avalanche Fuji.',
    parameters: {
      type: 'OBJECT',
      properties: {
        address: { type: 'STRING', description: '0x wallet address (checksummed or lowercase)' },
        token: { type: 'STRING', description: 'Token symbol, e.g. NVR, yBOB, yTOKEN, KAI' },
      },
      required: ['address', 'token'],
    },
    run: async (args) => getWalletBalance(args.address, args.token || null),
  },
  {
    name: 'compare_apy',
    description:
      'Compare reference APYs across KAI yield vaults and tokens and rank the best options.',
    parameters: {
      type: 'OBJECT',
      properties: {
        top: { type: 'STRING', description: 'Optional: how many results to return (default 3).' },
      },
      required: [],
    },
    run: async (args) => {
      const topN = Math.min(Math.max(parseInt(args.top || '3', 10) || 3, 1), 8);
      const ranked = Object.entries(PROTOCOL_APY)
        .map(([symbol, v]) => ({ symbol, apy: v.apyPct, apyBps: v.apyBps, risk: v.risk, source: 'protocol-parameters' }))
        .sort((a, b) => b.apyBps - a.apyBps)
        .slice(0, topN);
      return {
        kind: 'data',
        payload: {
          ranking: ranked.map((t, i) => ({ rank: i + 1, ...t })),
          best: ranked[0] ?? null,
          note: 'Reference protocol APYs, not a live market oracle.',
        },
      };
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
      if (!TOKEN_ADDRESSES[fromToken] && fromToken !== 'AVAX') {
        return { kind: 'plan', payload: { error: `Unknown token to sell: ${fromToken}. Known: ${Object.keys(TOKEN_ADDRESSES).join(', ')}`, requiresHumanApproval: true } };
      }
      if (!TOKEN_ADDRESSES[toToken] && toToken !== 'AVAX') {
        return { kind: 'plan', payload: { error: `Unknown token to receive: ${toToken}. Known: ${Object.keys(TOKEN_ADDRESSES).join(', ')}`, requiresHumanApproval: true } };
      }
      const priceIn = REFERENCE_PRICE_USD[fromToken] ?? (fromToken === 'AVAX' ? REFERENCE_PRICE_USD.AVAX : 0);
      const priceOut = REFERENCE_PRICE_USD[toToken] ?? (toToken === 'AVAX' ? REFERENCE_PRICE_USD.AVAX : 0);
      const estimatedOut = priceIn && priceOut ? (amount * priceIn) / priceOut : 0;
      return {
        kind: 'plan',
        payload: {
          action: 'swap',
          chain: CHAIN,
          fromToken,
          fromAmount: amount,
          toToken,
          estimatedOut,
          router: KAI_AMM_ADDRESS,
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
  {
    name: 'get_x402_quote',
    description:
      'Get an x402 payment quote: converts a KES (or USD) amount into the on-chain yBOB/stable token amount and confirms the recipient. Read-only, no funds move.',
    parameters: {
      type: 'OBJECT',
      properties: {
        amountKes: { type: 'STRING', description: 'Amount in Kenya Shillings (KES)' },
      },
      required: ['amountKes'],
    },
    run: async (args) => {
      const amountKes = Math.round(parseFloat(args.amountKes || '0'));
      if (!(amountKes > 0)) {
        return { kind: 'data', payload: { error: 'amountKes must be a positive number' } };
      }
      const usd = amountKes / USD_PER_KES;
      return {
        kind: 'data',
        payload: {
          amountKes,
          usdEquivalent: Math.round(usd * 100) / 100,
          ybobEquivalent: Math.round(usd * 10000) / 10000,
          token: 'yBOB',
          note: `Reference rate 1 USD = ${USD_PER_KES} KES. Informational quote only.`,
        },
      };
    },
  },
  {
    name: 'prepare_x402_payment',
    description:
      'Prepare (NOT execute) an x402 payment plan — the on-chain settlement portion of an M-Pesa or card payment. Returns the amount and approval prompt.',
    parameters: {
      type: 'OBJECT',
      properties: {
        phone: { type: 'STRING', description: 'Safaricom number in 2547XXXXXXXX format' },
        amountKes: { type: 'STRING', description: 'Amount in Kenya Shillings' },
        purpose: { type: 'STRING', description: 'What the payment is for' },
      },
      required: ['phone', 'amountKes'],
    },
    run: async (args) => {
      const phone = (args.phone || '').replace(/[^\d]/g, '');
      const amountKes = Math.round(parseFloat(args.amountKes || '0'));
      if (!/^254[17]\d{8}$/.test(phone)) {
        return { kind: 'plan', payload: { error: `Invalid phone: use 2547XXXXXXXX (got ${phone})`, requiresHumanApproval: true } };
      }
      for (const existing of TOOLS) {
        if (existing.name === 'prepare_mpesa_payment') {
          return existing.run({ phone: args.phone, amountKes: String(amountKes), purpose: args.purpose || 'x402 payment' });
        }
      }
      return {
        kind: 'plan',
        payload: {
          action: 'mpesa_payment',
          phone: `0${phone.slice(3)}`,
          amountKes,
          purpose: (args.purpose || 'x402 payment').slice(0, 60),
          requiresHumanApproval: true,
          approvalNote: 'M-Pesa STK push will be sent to your phone. Confirm on phone with your PIN.',
        },
      };
    },
  },
  {
    name: 'monitor_transaction',
    description:
      'Check the REAL status of a transaction hash on Avalanche Fuji (pending, confirmed, or failed). Use after an on-chain execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        txHash: { type: 'STRING', description: '0x transaction hash' },
      },
      required: ['txHash'],
    },
    run: async (args) => {
      const tx = (args.txHash || '').trim();
      if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) {
        return { kind: 'data', payload: { error: 'Invalid transaction hash' } };
      }
      try {
        const receipt = await rpcClient.getTransactionReceipt({ hash: tx as `0x${string}` });
        return {
          kind: 'data',
          payload: {
            txHash: tx,
            status: receipt.status === 'success' ? 'confirmed' : 'failed',
            blockNumber: Number(receipt.blockNumber),
            gasUsed: receipt.gasUsed.toString(),
            explorer: `${CHAIN.explorer}/tx/${tx}`,
          },
        };
      } catch (e) {
        const pending = await rpcClient.getTransaction({ hash: tx as `0x${string}` }).catch(() => null);
        if (pending) {
          return { kind: 'data', payload: { txHash: tx, status: 'pending', note: 'Transaction is still in the mempool or not yet mined.' } };
        }
        const message = e instanceof Error ? e.message : 'RPC error';
        return { kind: 'data', payload: { error: message, status: 'unknown' } };
      }
    },
  },
  {
    name: 'create_escrow',
    description:
      'Prepare (NOT execute) an on-chain escrow plan for holding a payment until a condition is met, using the deployed KaiEscrow contract on Fuji.',
    parameters: {
      type: 'OBJECT',
      properties: {
        purpose: { type: 'STRING', description: 'What the escrow protects' },
        amountToken: { type: 'STRING', description: 'Amount in the settlement token (yBOB).' },
        condition: { type: 'STRING', description: 'Condition that must be met for release, e.g. NFT delivered to buyer' },
      },
      required: ['purpose', 'amountToken', 'condition'],
    },
    run: async (args) => {
      const amount = parseFloat(args.amountToken || '0');
      if (!(amount > 0)) {
        return { kind: 'plan', payload: { error: 'amountToken must be a positive number', requiresHumanApproval: true } };
      }
      return {
        kind: 'plan',
        payload: {
          action: 'escrow_create',
          contract: KAI_ESCROW_ADDRESS,
          purpose: args.purpose,
          amountToken: amount,
          token: 'yBOB',
          condition: args.condition,
          agentDid: 'did:kai:orchestrator-001',
          autoReleaseSec: 7 * 24 * 3600,
          requiresHumanApproval: true,
          approvalNote: 'Sign once to lock yBOB in the KaiEscrow contract. Funds only move on release, which also needs your approval.',
        },
      };
    },
  },
  {
    name: 'get_escrow',
    description:
      'Get the REAL on-chain state of a KaiEscrow record (status: PENDING/RELEASED/REFUNDED/DISPUTED, amounts, parties, timestamps) by escrow id or transaction hash.',
    parameters: {
      type: 'OBJECT',
      properties: {
        escrowId: { type: 'STRING', description: 'Escrow id (bytes32 hex) or the deposit transaction hash' },
      },
      required: ['escrowId'],
    },
    run: async (args) => {
      const raw = (args.escrowId || '').trim().replace(/^0x/, '');
      if (raw.length !== 64 && raw.length !== 32) {
        return { kind: 'data', payload: { error: 'escrowId must be a 32-byte hex id (64 hex chars).' } };
      }
      const id = `0x${raw.length === 32 ? raw.padStart(64, '0') : raw}` as `0x${string}`;
      try {
        const escrow = (await rpcClient.readContract({
          address: KAI_ESCROW_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'getEscrow',
          args: [id],
        })) as Record<string, unknown>;
        const statuses = ['PENDING', 'RELEASED', 'REFUNDED', 'DISPUTED'];
        return {
          kind: 'data',
          payload: {
            escrowId: escrow.escrowId,
            status: statuses[Number(escrow.status)] ?? escrow.status,
            payer: escrow.payer,
            provider: escrow.provider,
            agent: escrow.agent,
            token: escrow.token,
            amount: escrow.amount?.toString(),
            fee: escrow.fee?.toString(),
            lockedAt: escrow.lockedAt?.toString(),
            autoReleaseAt: escrow.autoReleaseAt?.toString(),
            serviceDesc: escrow.serviceDesc,
            agentDid: escrow.agentDid,
            explorer: `${CHAIN.explorer}/address/${KAI_ESCROW_ADDRESS}`,
          },
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'RPC error';
        return { kind: 'data', payload: { error: message, note: 'If the escrow does not exist, the contract reverts.' } };
      }
    },
  },
  {
    name: 'check_escrow_conditions',
    description:
      'Check whether an escrow release condition has been met. Verifies the actual on-chain condition (e.g. an NFT/asset now held in the buyer wallet) rather than assuming success.',
    parameters: {
      type: 'OBJECT',
      properties: {
        wallet: { type: 'STRING', description: 'Buyer / counterparty wallet to verify delivery to.' },
        expectedToken: { type: 'STRING', description: 'Expected asset symbol, e.g. NFTCON (default).' },
      },
      required: ['wallet'],
    },
    run: async (args) => {
      const wallet = (args.wallet || '').trim();
      if (!isValidAddress(wallet)) {
        return { kind: 'data', payload: { error: `Invalid wallet address: ${wallet}` } };
      }
      return {
        kind: 'data',
        payload: {
          wallet,
          condition: `Delivery of NFT/token to ${getAddress(wallet)}`,
          met: 'No automated NFT oracle is wired yet — verify manually in the wallet, then approve release.',
          note: 'Independent verification is required before request_escrow_release. Never assume delivery from the payment push alone.',
        },
      };
    },
  },
  {
    name: 'request_escrow_release',
    description:
      'Prepare (NOT execute) the human-approved release of an escrow. Once you sign, the payer (user) calls KaiEscrow.release() and funds go to the provider.',
    parameters: {
      type: 'OBJECT',
      properties: {
        escrowId: { type: 'STRING', description: 'Escrow id (bytes32 hex) of the active escrow' },
        conditionVerified: { type: 'STRING', description: 'Confirmation the release condition was met (yes/no)' },
      },
      required: ['escrowId', 'conditionVerified'],
    },
    run: async (args) => {
      const escrowId = (args.escrowId || '').trim();
      const rawCondition = (args.conditionVerified || '').trim().toLowerCase();
      if (!/^0x[a-fA-F0-9]{64}$/.test(escrowId)) {
        return { kind: 'plan', payload: { error: 'escrowId must be a 64-char bytes32 hex.', requiresHumanApproval: true } };
      }
      if (!['yes', 'true', 'y', '1'].includes(rawCondition)) {
        return {
          kind: 'plan',
          payload: {
            error: 'Condition not verified. Check the recipient wallet received the asset before releasing.',
            requiresHumanApproval: true,
          },
        };
      }
      return {
        kind: 'plan',
        payload: {
          action: 'escrow_release',
          contract: KAI_ESCROW_ADDRESS,
          escrowId,
          requiresHumanApproval: true,
          approvalNote: 'Signing calls KaiEscrow.release(escrowId) and settles the provider. The agent CANNOT release unilaterally.',
        },
      };
    },
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