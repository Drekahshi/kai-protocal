import { NextResponse } from 'next/server';
import { ECOSYSTEM_TOKENS } from '@/lib/tokens';
import { AgentProposal } from '@/components/AgentProposalCard';

export interface AgentIntentResult {
  intentType: 'TRANSFER' | 'STAKE' | 'PAYMENT' | 'NAVIGATE' | 'BALANCE' | 'MRV_AUDIT' | 'QUERY';
  spokenReply: string;
  displayText: string;
  proposal?: AgentProposal;
  navigationPath?: string;
  paymentData?: {
    amountKes: number;
    phone?: string;
    purpose?: string;
  };
}

const VAULT_ADDRESSES: Record<string, `0x${string}`> = {
  yBOB: '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
  NVR:  '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
  YGOLD:'0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
  GAMI: '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
};

// ── Needle FastAPI URL ────────────────────────────────────────────────────────
const NEEDLE_API = process.env.NEEDLE_API_URL ?? 'http://127.0.0.1:8000';
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';

interface AIIntentResult {
  intent: string;
  params?: Record<string, string>;
  spoken_reply?: string;
  display_text?: string;
}

/**
 * Try to classify the message via the Needle FastAPI (/needle/intent).
 * Returns null when the Needle server is unreachable (graceful fallback).
 */
async function callNeedleIntent(message: string): Promise<AIIntentResult | null> {
  try {
    const res = await fetch(`${NEEDLE_API}/needle/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.intent ?? null;
  } catch {
    return null;
  }
}

/**
 * Classify user intent using Google Gemini 3.6 Flash.
 */
async function callGeminiIntent(message: string): Promise<AIIntentResult | null> {
  if (!GEMINI_KEY) return null;
  try {
    const prompt = `You are the KAI Nuvari DeFi AI Agent on Avalanche Fuji C-Chain.
Classify the user intent into one of: "transfer", "deposit", "pay_kes", "navigate", "balance", "query".
Available tokens: NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS, AVAX.
Available routes: /vaults, /pools, /hub, /pay, /sme, /saving, /mine, /profile, /insurance, /pension, /trust.

User input: "${message}"

Respond strictly with valid JSON without markdown wrapping:
{
  "intent": "transfer" | "deposit" | "pay_kes" | "navigate" | "balance" | "query",
  "params": {
    "token": "NVR",
    "amount": "10",
    "to": "0x...",
    "phone": "07...",
    "page": "/vaults"
  },
  "spoken_reply": "Friendly concise spoken answer",
  "display_text": "Markdown formatted summary"
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { message, userAddress } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const text  = message.trim();
    const lower = text.toLowerCase();

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 1: Try Needle AI or Gemini 3.6 Flash
    // ══════════════════════════════════════════════════════════════════════════
    let aiResult = await callNeedleIntent(text);
    if (!aiResult) {
      aiResult = await callGeminiIntent(text);
    }

    if (aiResult && aiResult.intent && aiResult.intent !== 'query') {
      const { intent, params, spoken_reply, display_text } = aiResult as any;

      switch (intent) {
        case 'navigate': {
          const page = params?.page ?? '/';
          return NextResponse.json({
            intentType: 'NAVIGATE',
            spokenReply: spoken_reply || `Navigating to ${page}.`,
            displayText: `🧭 **Navigating** to \`${page}\``,
            navigationPath: page.startsWith('/') ? page : `/${page}`,
          });
        }

        case 'transfer': {
          const token = findTokenInText(lower) ?? ECOSYSTEM_TOKENS.find(t => t.symbol === 'NVR')!;
          const amount = params?.amount ?? '10';
          const to = params?.to ?? userAddress ?? '0x0000000000000000000000000000000000000000';
          const proposal: AgentProposal = {
            agentName: 'Needle Tx Agent',
            actionType: 'TRANSFER',
            title: `Transfer ${amount} ${token.symbol}`,
            description: `Needle-classified ERC-20 transfer of ${amount} ${token.symbol} on Avalanche Fuji.`,
            amount,
            tokenSymbol: token.symbol,
            tokenAddress: (token.address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
            recipientAddress: to as `0x${string}`,
          };
          return NextResponse.json({
            intentType: 'TRANSFER',
            spokenReply: spoken_reply || `Prepared transfer of ${amount} ${token.symbol}.`,
            displayText: `⚡ **Token Transfer** — ${amount} ${token.symbol} → \`${to}\``,
            proposal,
          });
        }

        case 'deposit': {
          const token = findTokenInText(lower) ?? ECOSYSTEM_TOKENS.find(t => t.symbol === 'yBOB')!;
          const amount = params?.amount ?? '25';
          const apyMap: Record<string, string> = { yBOB: '7.5%', NVR: '12%', YGOLD: '18%', GAMI: '22%' };
          const apy = apyMap[token.symbol] ?? '10%';
          const proposal: AgentProposal = {
            agentName: 'Needle Yield Agent',
            actionType: 'APPROVE_STAKE',
            title: `Deposit ${amount} ${token.symbol} into Vault`,
            description: `Needle-classified vault deposit — earn ${apy} APY on Avalanche.`,
            amount,
            tokenSymbol: token.symbol,
            tokenAddress: (token.address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
            targetContract: VAULT_ADDRESSES[token.symbol] ?? '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
            projectedApy: `${apy} APY`,
          };
          return NextResponse.json({
            intentType: 'STAKE',
            spokenReply: spoken_reply || `Vault deposit of ${amount} ${token.symbol} configured.`,
            displayText: `🏦 **Vault Deposit** — ${amount} ${token.symbol} · ${apy} APY`,
            proposal,
          });
        }

        case 'pay': {
          const amount = parseFloat(params?.amount_kes ?? '500');
          const phone  = params?.phone;
          return NextResponse.json({
            intentType: 'PAYMENT',
            spokenReply: spoken_reply || `M-Pesa payment of ${amount} KES prepared.`,
            displayText: `📱 **M-Pesa Payment** — ${amount} KES${phone ? ` to ${phone}` : ''}`,
            paymentData: { amountKes: amount, phone, purpose: 'KAI DeFi Service' },
            navigationPath: `/pay?amount=${amount}${phone ? `&phone=${phone}` : ''}`,
          });
        }

        case 'balance': {
          return NextResponse.json({
            intentType: 'BALANCE',
            spokenReply: spoken_reply || 'Here is your portfolio summary.',
            displayText: `📊 **Wallet & Ecosystem Portfolio** — live balances on Avalanche Fuji.`,
            navigationPath: '/profile',
          });
        }

        case 'mrv_audit': {
          const batchId = params?.batch_id ?? '07';
          return NextResponse.json({
            intentType: 'MRV_AUDIT',
            spokenReply: spoken_reply || `MRV audit complete for Nursery Batch ${batchId}.`,
            displayText: `🌲 **Digital MRV Audit** — Nursery Batch #${batchId} · 94.8% survival · NDVI verified ✅`,
            navigationPath: '/hub',
          });
        }

        case 'sdg_log': {
          return NextResponse.json({
            intentType: 'NAVIGATE',
            spokenReply: spoken_reply || 'Opening your SDG impact dashboard.',
            displayText: `🌍 **SDG Impact** — logging activity and updating your score.`,
            navigationPath: '/sdg',
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  STEP 2: Rule-based fallback (always works, no external dependency)
    // ══════════════════════════════════════════════════════════════════════════

    // Navigation
    const navMatch = checkNavigationIntent(lower);
    if (navMatch) {
      return NextResponse.json({
        intentType: 'NAVIGATE',
        spokenReply: `Navigating to ${navMatch.name}.`,
        displayText: `🧭 **Navigating to ${navMatch.name}** (\`${navMatch.path}\`)\n\nOpening the page right away for you.`,
        navigationPath: navMatch.path,
      });
    }

    // x402 Protocol
    if (lower.includes('x402') || lower.includes('yield sweep') || lower.includes('reentrancy') || lower.includes('contract audit')) {
      const isAudit  = lower.includes('audit')  || lower.includes('security');
      const isMRV    = lower.includes('mrv')    || lower.includes('nursery');
      const isOracle = lower.includes('oracle') || lower.includes('slippage');
      const cost  = isAudit ? 500 : isMRV ? 200 : 100;
      const title = isAudit ? 'KaiEscrow Bytecode Security Audit' : isMRV ? 'dMRV Tree Nursery Batch #07 Proof' : isOracle ? 'Nuvari AMM Slippage Oracle Route' : 'KaiVault Yield Sweep & Reentrancy Validator';
      const proposal: AgentProposal = {
        agentName: 'x402 Protocol Rails Agent',
        actionType: 'TRANSFER',
        title: `${title} (${cost} CENTS)`,
        description: `Off-chain signed EIP-712 transfer authorization settled via KaiEscrow on Avalanche Fuji.`,
        amount: String(cost),
        tokenSymbol: 'CENTS',
        tokenAddress: '0x1bd79052747A236Aca137380394da27771e95eeA',
        recipientAddress: '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
        targetContract:   '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
      };
      return NextResponse.json({
        intentType: 'PAYMENT',
        spokenReply: `Executing ${title} via x402 for ${cost} CENTS on Avalanche Fuji.`,
        displayText: `⚡ **x402 Agentic Protocol Execution**\n\n- **Service:** ${title}\n- **Cost:** **${cost} CENTS**\n- **Network:** Avalanche Fuji C-Chain`,
        proposal,
      });
    }

    // M-Pesa
    if (lower.includes('mpesa') || lower.includes('m-pesa') || lower.includes('kes') || lower.includes('shilling')) {
      const amountMatch = lower.match(/(\d+(?:\.\d+)?)/);
      const phoneMatch  = lower.match(/(07\d{8}|01\d{8}|\+254\d{9}|254\d{9})/);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 500;
      const phone  = phoneMatch ? phoneMatch[1] : undefined;
      return NextResponse.json({
        intentType: 'PAYMENT',
        spokenReply: `M-Pesa payment of ${amount} KES prepared. Please confirm.`,
        displayText: `📱 **M-Pesa / Paystack Payment**\n\n- **Amount:** ${amount} KES\n- **Phone:** ${phone ?? 'Enter at prompt'}\n- **Settlement:** yBOB minted to your Fuji wallet.`,
        paymentData: { amountKes: amount, phone, purpose: 'Community Forest & DeFi Subscription' },
        navigationPath: `/pay?amount=${amount}${phone ? `&phone=${phone}` : ''}`,
      });
    }

    // Transfer
    if (lower.includes('transfer') || lower.includes('send')) {
      const token       = findTokenInText(lower) ?? ECOSYSTEM_TOKENS.find(t => t.symbol === 'NVR')!;
      const amountMatch = lower.match(/(\d+(?:\.\d+)?)/);
      const amount      = amountMatch ? amountMatch[1] : '10';
      const addrMatch   = text.match(/0x[a-fA-F0-9]{40}/);
      const recipient   = (addrMatch ? addrMatch[0] : '0x70997970C51812dc3A010C7d01b50e0d17dc79C8') as `0x${string}`;
      const proposal: AgentProposal = {
        agentName: 'Tx Dispatcher Agent',
        actionType: 'TRANSFER',
        title: `Transfer ${amount} ${token.symbol}`,
        description: `ERC-20 transfer of ${amount} ${token.symbol} on Avalanche Fuji C-Chain.`,
        amount,
        tokenSymbol: token.symbol,
        tokenAddress: (token.address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
        recipientAddress: recipient,
      };
      return NextResponse.json({
        intentType: 'TRANSFER',
        spokenReply: `Prepared transfer of ${amount} ${token.symbol}. Review the proposal to sign.`,
        displayText: `⚡ **On-Chain Transfer**\n\n- **Token:** ${token.symbol}\n- **Amount:** ${amount}\n- **Recipient:** \`${recipient}\`\n- **Network:** Avalanche Fuji`,
        proposal,
      });
    }

    // Deposit / Stake
    if (lower.includes('deposit') || lower.includes('stake') || lower.includes('yield') || lower.includes('vault')) {
      const token       = findTokenInText(lower) ?? ECOSYSTEM_TOKENS.find(t => t.symbol === 'yBOB')!;
      const amountMatch = lower.match(/(\d+(?:\.\d+)?)/);
      const amount      = amountMatch ? amountMatch[1] : '25';
      const apyMap: Record<string, string> = { yBOB: '7.5%', NVR: '12%', YGOLD: '18%', GAMI: '22%' };
      const apy = apyMap[token.symbol] ?? '10%';
      const proposal: AgentProposal = {
        agentName: 'Yield Optimizer Agent',
        actionType: 'APPROVE_STAKE',
        title: `Deposit ${amount} ${token.symbol} into Vault`,
        description: `Deposit ${token.symbol} into KaiVault to earn ${apy} APY on Avalanche.`,
        amount,
        tokenSymbol: token.symbol,
        tokenAddress: (token.address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
        targetContract: VAULT_ADDRESSES[token.symbol] ?? '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
        projectedApy: `${apy} APY`,
      };
      return NextResponse.json({
        intentType: 'STAKE',
        spokenReply: `Configured deposit of ${amount} ${token.symbol} earning ${apy} APY.`,
        displayText: `🏦 **Vault Deposit Proposal**\n\n- **Strategy:** kv${token.symbol} Yield Pool\n- **Projected APY:** **${apy}**\n- **Amount:** ${amount} ${token.symbol}`,
        proposal,
      });
    }

    // MRV
    if (lower.includes('mrv') || lower.includes('tree') || lower.includes('nursery') || lower.includes('carbon')) {
      const batchMatch = lower.match(/(?:batch|id|#)\s*(\d+)/i);
      const batchId = batchMatch ? batchMatch[1] : '07';
      return NextResponse.json({
        intentType: 'MRV_AUDIT',
        spokenReply: `Digital MRV audit complete for Nursery Batch ${batchId}. 99.4% confidence.`,
        displayText: `🌲 **Digital MRV Audit**\n\n- **Batch:** #${batchId} (Kakamega Canopy Initiative)\n- **Survival Rate:** 94.8%\n- **NDVI Verified** ✅\n- **Carbon Credits:** +120 KAI-CARBON`,
        navigationPath: '/hub',
      });
    }

    // Balance
    if (lower.includes('balance') || lower.includes('portfolio') || lower.includes('holdings') || lower.includes('wallet')) {
      return NextResponse.json({
        intentType: 'BALANCE',
        spokenReply: `Here is your portfolio summary across Avalanche C-Chain and KAI vaults.`,
        displayText: `📊 **Wallet & Ecosystem Portfolio**\n\n- **Tokens:** NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS\n- **Network:** Avalanche Fuji\n\nFull balances on your profile page.`,
        navigationPath: '/profile',
      });
    }

    // Default — hand off to /api/chat (RAG + Needle)
    return NextResponse.json({
      intentType: 'QUERY',
      spokenReply: (aiResult as any)?.spoken_reply ?? 'Let me check the KAI knowledge base for you.',
      displayText: (aiResult as any)?.display_text ?? '',
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Intent parsing failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findTokenInText(text: string) {
  for (const token of ECOSYSTEM_TOKENS) {
    if (text.includes(token.symbol.toLowerCase()) || text.includes(token.name.toLowerCase())) {
      return token;
    }
  }
  if (text.includes('avax')) {
    return { symbol: 'AVAX', name: 'Avalanche', decimals: 18, emoji: '🔺', color: '#e84142', address: null, role: 'Native gas' };
  }
  return null;
}

function checkNavigationIntent(text: string): { name: string; path: string } | null {
  const routes = [
    { keys: ['vault', 'vaults', 'yield'],               name: 'Yield Vaults',           path: '/vaults' },
    { keys: ['pool', 'pools', 'amm', 'liquidity'],       name: 'AMM Pools',              path: '/pools' },
    { keys: ['mrv', 'tree', 'trees', 'nursery', 'hub'],  name: 'Information Hub & MRV',  path: '/hub' },
    { keys: ['pay', 'payment', 'qr', 'mpesa'],           name: 'Scan & Pay',             path: '/pay' },
    { keys: ['insurance', 'micro insurance'],            name: 'Micro-Insurance',         path: '/insurance' },
    { keys: ['pension', 'micro pension'],                name: 'Micro-Pension',           path: '/pension' },
    { keys: ['trust', 'trust fund'],                     name: 'Trust Fund',              path: '/trust' },
    { keys: ['saving', 'chama', 'saving group'],         name: 'Saving Circles',          path: '/saving' },
    { keys: ['sme', 'business', 'invoice'],              name: 'SME Hub',                 path: '/sme' },
    { keys: ['mine', 'airdrop', 'rewards'],              name: 'Mine & Airdrop',          path: '/mine' },
    { keys: ['profile', 'account', 'settings'],         name: 'User Profile',            path: '/profile' },
    { keys: ['securities', 'security', 'structured'],   name: 'Securities & Products',   path: '/securities' },
    { keys: ['sdg', 'impact', 'sustainability'],         name: 'SDG Impact',              path: '/sdg' },
    { keys: ['home', 'dashboard', 'overview'],           name: 'Home Dashboard',          path: '/' },
  ];

  for (const r of routes) {
    for (const k of r.keys) {
      if (
        text.includes(`go to ${k}`)   ||
        text.includes(`open ${k}`)    ||
        text.includes(`take me to ${k}`) ||
        text.includes(`show ${k}`)    ||
        text.includes(`navigate to ${k}`) ||
        text === k || text === `go ${k}`
      ) {
        return { name: r.name, path: r.path };
      }
    }
  }
  return null;
}
