import { NextResponse } from 'next/server';
import { VAULT_ADDRESSES, AMM_ADDRESS, EXPLORER_BASE } from '@/lib/addresses';

// Vercel Hobby plan cap is 300s
export const maxDuration = 300;

const RAG_API_URL  = process.env.RAG_API_URL    || 'http://localhost:8000';
const GROQ_API_KEY = process.env.GROQ_API_KEY    || '';
const GROQ_MODEL   = process.env.GROQ_MODEL      || 'llama-3.1-8b-instant';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_KEY   = process.env.GEMINI_API_KEY  || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL    || 'gemini-1.5-flash';

// ── Built-in KAI knowledge base (fallback when all LLMs are offline) ──────────
const KAI_KB: { match: RegExp; answer: string }[] = [
  {
    match: /token|kai|nvr|ybob|ytoken|ygold|gami|cents/i,
    answer: `**KAI Nuvari Ecosystem Tokens** on Avalanche Fuji C-Chain:\n\n- **KAI** - Governance & utility token. Powers DAO voting and protocol fees.\n- **NVR (Nuvari)** - Vault receipt token. Earned by depositing into KAI vaults.\n- **yBOB** - USD-pegged yield-bearing stablecoin. 1 yBOB ≈ 1 USD, earns ~7.5% APY in kvyBOB vault.\n- **yTOKEN** - Community yield token. Linked to SME and saving group liquidity.\n- **yGOLD** - Tokenized gold commodity. Backed by community commodity pools.\n- **GAMI** - Gaming & airdrop incentive token. Distributed via the Mine/Airdrop module.\n- **CENTS** - Micro-payment unit. Used for M-Pesa & Paystack payment rails.\n\n1 AVAX ≈ 100 ecosystem tokens on testnet. All tokens are ERC-20 on Avalanche C-Chain.`,
  },
  {
    match: /vault|apy|yield|deposit|stake/i,
    answer: `**KAI Yield Vaults** - Earn passive yield on Avalanche:\n\n- **kvyBOB Vault** - 7.5% APY · deposit yBOB · low risk\n- **kvNVR Vault** - 12% APY · deposit NVR · medium risk\n- **kvYGOLD Vault** - 18% APY · deposit yGOLD · commodity-backed\n- **kvGAMI Vault** - 22% APY · deposit GAMI · high risk / high reward\n\n**How to deposit:**\n1. Connect MetaMask or Core Wallet to Fuji testnet\n2. Navigate to /vaults and select a vault\n3. Approve the token spend, then click **Deposit**\n4. You receive NVR receipt tokens representing your share\n\nYield accrues every block (~2 seconds on Avalanche).`,
  },
  {
    match: /pool|liquidity|amm|swap|impermanent/i,
    answer: `**KAI AMM Pools** - Avalanche-native liquidity:\n\n- **NVR/yBOB** - Core stable pair · 0.3% swap fee\n- **AVAX/KAI** - Main gateway pair · 0.3% fee\n- **yGOLD/yBOB** - Commodity stable pair · 0.25% fee\n\n**Adding Liquidity:**\n1. Go to /pools and pick a pair\n2. Approve both tokens\n3. Set amounts (equal value) and click **Add**\n4. Receive LP tokens representing your share\n\n**Impermanent Loss** occurs when token prices diverge. The yBOB pairs have minimal IL since both sides are stable or pegged.`,
  },
  {
    match: /govern|dao|vote|proposal/i,
    answer: `**KAI DAO Governance** - On-chain voting with KAI tokens:\n\n- **1 KAI = 1 vote** · lock KAI to gain voting power\n- Proposals need **100 KAI** quorum to pass\n- Voting period: **3 days**\n- Timelock: **24h** before execution\n\n**Active Proposal Types:**\n- Vault APY adjustments\n- Fee distribution changes\n- New token listings\n- Community treasury allocations\n\nNavigate to /cfa → Governance to create or vote on proposals.`,
  },
  {
    match: /mpesa|payment|kes|pay|scan/i,
    answer: `**KAI × M-Pesa Integration** - Fiat on/off ramp for Kenya:\n\n- Send KES via M-Pesa → receive yBOB or CENTS on-chain\n- Exchange rate: **1 USD = ~130 KES** (live rate)\n- Powered by **Safaricom Daraja API** + Paystack for card payments\n- **Scan & Pay** (/pay) - generate a QR code, recipient scans and pays in KES\n- Settlement: yBOB sent to your wallet within ~30 seconds\n\nCurrently on Fuji testnet with M-Pesa sandbox.`,
  },
  {
    match: /nft|conservation|art|marketplace/i,
    answer: `**KAI Conservation NFT Marketplace** (/connft):\n\n- Artists and conservationists mint NFTs representing real forest assets\n- Buy with **yBOB** - 1 yBOB = 1 USD equivalent\n- **5% of every sale** goes to the Community Forest Treasury\n- NFTs are ERC-721 on Avalanche C-Chain\n- Fuji testnet: gas fees < 0.001 AVAX per transaction\n\nConnect your wallet and navigate to /connft to browse or list.`,
  },
  {
    match: /sme|business|invoice|loan/i,
    answer: `**SME Dashboard** (/sme) - Digitise your small business on-chain:\n\n- **Invoice Tokenisation** - create on-chain invoices backed by yBOB\n- **Micro-loans** - borrow against inventory collateral\n- **Cash Digitisation** - convert M-Pesa float to yBOB instantly\n- **Inventory tracking** - log stock on IPFS with Avalanche timestamps\n\nDesigned for Kenyan MSMEs. No bank account required.`,
  },
  {
    match: /saving|chama|group|pool fund/i,
    answer: `**Saving Group** (/saving) - Decentralised chama (ROSCA) on Avalanche:\n\n- Create or join a saving circle with 2-20 members\n- Pool yBOB or KAI weekly/monthly\n- Smart contract auto-distributes the pot in turn\n- **Yield on idle funds** - pooled amount earns vault APY while waiting\n- Transparent on-chain history - no disputes\n\nNavigate to /saving to create your first on-chain chama.`,
  },
  {
    match: /security|audit|vulnerab|safe/i,
    answer: `**KAI Smart Contract Security:**\n\n- All contracts audited by internal review on Fuji testnet\n- Using **OpenZeppelin** v5 libraries (ReentrancyGuard, Ownable, ERC-20)\n- **DID tracker** logs every agent action with timestamps\n- x402 payment rails require signed authorisation before any transfer\n- Key contracts:\n  - KaiVault: \`${VAULT_ADDRESSES.NVR ?? 'see /vaults'}\`\n  - NuvariAMM: \`${AMM_ADDRESS ?? 'see /pools'}\`\n\nAlways verify contract addresses on ${EXPLORER_BASE} before interacting.`,
  },
  {
    match: /avax|avalanche|fuji|testnet|network/i,
    answer: `**Avalanche C-Chain (Fuji Testnet):**\n\n- **Chain ID:** 43113\n- **RPC:** \`https://api.avax-test.network/ext/bc/C/rpc\`\n- **Explorer:** https://testnet.snowtrace.io\n- **Block time:** ~2 seconds\n- **Get test AVAX:** https://faucet.avax.network\n\n**Wallet Setup:**\n1. Add Fuji to MetaMask: Settings → Networks → Add Network\n2. Use the RPC above with Chain ID 43113\n3. Get free test AVAX from the faucet\n4. Connect at the top of the KAI app`,
  },
];

function kaiKnowledgeFallback(message: string): string {
  const q = message.toLowerCase();
  for (const entry of KAI_KB) {
    if (entry.match.test(q)) return entry.answer;
  }
  return `**KAI Agent** - I'm your DeFi guide for the KAI Nuvari ecosystem on Avalanche.\n\nHere's what I can help you with:\n- **Tokens** - NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS\n- **Vaults** - Yield strategies from 7.5% to 22% APY\n- **Pools** - AMM liquidity and swap rates\n- **Governance** - DAO proposals and voting\n- **Payments** - M-Pesa KES ↔ yBOB on-ramp\n- **Conservation NFTs** - Forest-backed digital assets\n\nTry asking: *"What are the KAI vault APYs?"* or *"How do I add liquidity?"*`;
}

/** Stream a plain string as SSE events (token by token) */
function streamText(text: string): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  (async () => {
    // Split into word-sized chunks for a realistic typing effect
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const token = (i === 0 ? '' : ' ') + words[i];
      await writer.write(enc.encode(`data: ${JSON.stringify({ token })}\n\n`));
      // Small delay to simulate streaming
      await new Promise(r => setTimeout(r, 18));
    }
    await writer.write(enc.encode(`data: ${JSON.stringify({ done: true, sources: 0 })}\n\n`));
    await writer.close();
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

const SYSTEM_PROMPT = `You are KAI, a premium AI advisor for the KAI Nuvari DeFi ecosystem on Avalanche C-Chain.
You help users with:
- KAI ecosystem tokens: NVR (governance, 15.2% vault APY), yBOB (volatility buffer, 7.5% APY), YTOKEN (diversified investment vault, 14.8% APY), YGOLD (gold-backed reserve, 12.4% APY), GAMI (community rewards, 22.0% APY), CENTS (micro-utility, 6.5% APY)
- DeFi vaults and yield strategies on the KAI AMM
- KAI DAO governance, token burns, and fee model
- KAI Micro-Pension, Micro-Insurance, and Trust Fund smart contracts
- Avalanche C-Chain development (Fuji testnet, Snowtrace, MetaMask, Core Wallet)

Keep answers concise, professional, and friendly. Use bullet points where helpful.`;

/** Stream from Google Gemini API via SSE */
async function streamGemini(message: string): Promise<Response | null> {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Question: ${message}` }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!res.ok || !res.body) return null;

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data) continue;
            try {
              const chunk = JSON.parse(data);
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              if (text) {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
              }
            } catch {
              // skip unparseable SSE frame
            }
          }
        }
        await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, sources: 0 })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return null;
  }
}

/** Non-streaming direct call to Google Gemini */
async function callGemini(message: string): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Question: ${message}` }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

// ── POST /api/chat ─────────────────────────────────────────────────────────────
// Accepts { message, rag, stream? }
// When stream=true  → proxies the FastAPI /stream SSE or Gemini/Groq SSE
// When stream=false → calls /chat or direct LLM for a JSON response
export async function POST(req: Request) {
  try {
    const { message, rag = true, stream = true } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // ── Streaming path ─────────────────────────────────────────────────────────
    if (stream) {
      // 1. Try FastAPI /stream endpoint first
      try {
        const ragRes = await fetch(`${RAG_API_URL}/stream`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message, rag }),
        });

        if (ragRes.ok && ragRes.body) {
          return new Response(ragRes.body, {
            headers: {
              'Content-Type':  'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection':    'keep-alive',
              'X-Accel-Buffering': 'no',
            },
          });
        }
      } catch {
        // FastAPI offline — fall through
      }

      // 2. Try Google Gemini API streaming directly
      if (GEMINI_KEY) {
        const geminiStream = await streamGemini(message);
        if (geminiStream) return geminiStream;
      }

      // 3. Try Groq direct stream fallback
      if (GROQ_API_KEY) {
        try {
          const groqRes = await fetch(GROQ_URL, {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model:   GROQ_MODEL,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: message },
              ],
              stream:  true,
              temperature: 0.3,
              max_tokens: 1024,
            }),
            signal: AbortSignal.timeout(10_000),
          });

          if (groqRes.ok && groqRes.body) {
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();
            const encoder = new TextEncoder();

            (async () => {
              const reader = groqRes.body!.getReader();
              const dec = new TextDecoder();
              let buf = '';
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buf += dec.decode(value, { stream: true });
                  const lines = buf.split('\n');
                  buf = lines.pop() ?? '';
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') {
                      await writer.write(encoder.encode(
                        `data: ${JSON.stringify({ done: true, sources: 0 })}\n\n`
                      ));
                      break;
                    }
                    try {
                      const chunk = JSON.parse(data);
                      const token = chunk.choices?.[0]?.delta?.content ?? '';
                      if (token) {
                        await writer.write(encoder.encode(
                          `data: ${JSON.stringify({ token })}\n\n`
                        ));
                      }
                    } catch { /* skip */ }
                  }
                }
              } finally {
                await writer.close();
              }
            })();

            return new Response(readable, {
              headers: {
                'Content-Type':  'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection':    'keep-alive',
                'X-Accel-Buffering': 'no',
              },
            });
          }
        } catch {
          // Groq error — fall through to knowledge base
        }
      }

      // 4. Built-in knowledge base fallback
      return streamText(kaiKnowledgeFallback(message));
    }

    // ── Non-streaming (legacy JSON) path ────────────────────────────────────────
    try {
      if (rag) {
        try {
          const ragRes = await fetch(`${RAG_API_URL}/chat`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ message, rag: true }),
            signal:  AbortSignal.timeout(5_000),
          });
          if (ragRes.ok) {
            const ragData = await ragRes.json();
            return NextResponse.json({
              text:         ragData.text,
              agent:        ragData.agent || 'KAI AVAX Agent',
              rag_used:     true,
              sources_count: ragData.sources_count ?? 0,
            });
          }
        } catch {
          // RAG server offline — fall through
        }
      }

      // Try Google Gemini
      if (GEMINI_KEY) {
        const geminiText = await callGemini(message);
        if (geminiText) {
          return NextResponse.json({
            text:          geminiText,
            agent:         'KAI Gemini Agent',
            rag_used:      false,
            sources_count: 0,
          });
        }
      }

      // Try Groq
      if (GROQ_API_KEY) {
        const groqRes2 = await fetch(GROQ_URL, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model:   GROQ_MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: message },
            ],
            stream:  false,
            temperature: 0.3,
            max_tokens: 1024,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (groqRes2.ok) {
          const groqData = await groqRes2.json();
          return NextResponse.json({
            text:          groqData.choices?.[0]?.message?.content || 'No response.',
            agent:         'KAI Groq Agent',
            rag_used:      false,
            sources_count: 0,
          });
        }
      }

      // Fallback
      return NextResponse.json({
        text:          kaiKnowledgeFallback(message),
        agent:         'KAI Agent (offline)',
        rag_used:      false,
        sources_count: 0,
      });
    } catch {
      return NextResponse.json({
        text:          kaiKnowledgeFallback(message),
        agent:         'KAI Agent (offline)',
        rag_used:      false,
        sources_count: 0,
      });
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[/api/chat]', msg);
    return streamText(kaiKnowledgeFallback(''));
  }
}
