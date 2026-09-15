/**
 * POST /api/agent — KAI Voice Agent orchestrator (PRD §3, §5, §10, §20).
 *
 * Body: { message, wallet? }
 *
 * Flow per request:
 *   1. Gemini (gemini-2.5-flash) with a typed function-declaration tool set.
 *   2. If a tool call is requested: read-only data tools run server-side;
 *      sensitive "prepare_*" tools return a deterministic PLAN that is
 *      emitted to the client as an `approval` SSE event — never executed here.
 *   3. Final narration is streamed as SSE `data: {"token": ...}` events.
 *
 * The agent NEVER signs or sends transactions. The user's wallet is the
 * authority (MetaMask/Core signatures), and approval cards run on the client.
 */

import { NextResponse } from 'next/server';
import { functionDeclarations, findTool, type ToolResult } from '@/lib/agent/tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are KAI, a voice-first financial and conservation agent on Avalanche C-Chain (Fuji, chainId 43113).

YOUR POWERS:
- Answer questions about KAI vaults, APYs, tokens, conservation NFTs, payments and escrow.
- Use the provided tools for REAL data: balances, APYs, prices, conservation catalog.
- For actions that move money (swaps, M-Pesa payments, NFT purchases, escrow) call the matching "prepare_*" tool. It returns a PLAN. You never execute it.
- After a plan is produced, briefly narrate it to the user in plain language and say you are waiting for their approval.

HARD RULES:
- NEVER invent balances, APYs, prices, transactions or records. If a tool returns data, use it. Otherwise say the data is unavailable.
- NEVER claim a payment, swap or transfer succeeded.
- NEVER ask for seed phrases or private keys.
- Be concise, natural, friendly. Use short sentences (good for voice output).
- If the user asks you to "swap", "buy", "pay", "sell" or "hold in escrow", you MUST produce the matching prepare_* plan instead of pretending to do it.

AVAILABLE TOOLS: ${functionDeclarations().map((t) => t.name).join(', ')}`;

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiContent {
  role: 'user' | 'model' | 'function';
  parts: GeminiPart[];
}

function sse(message: string, event?: string): string {
  const lines = event ? `event: ${event}\ndata: ${message}\n\n` : `data: ${message}\n\n`;
  return lines;
}

async function callGemini(contents: GeminiContent[]) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: [{ functionDeclarations: functionDeclarations() }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${raw.slice(0, 300)}`);
  }
  return (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[] };
      finishReason?: string;
    }>;
  };
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  const streamAndFinish = (reply: string, approvals: Record<string, unknown>[]) => {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    (async () => {
      try {
        for (const plan of approvals) {
          await writer.write(encoder.encode(sse(JSON.stringify({ plan }), 'approval')));
        }
        if (reply) {
          const words = reply.split(' ');
          for (const word of words) {
            await writer.write(encoder.encode(sse(JSON.stringify({ token: word === words[0] ? word : ` ${word}` }))));
            await new Promise((r) => setTimeout(r, 14));
          }
          await writer.write(encoder.encode(sse(JSON.stringify({ done: true, sources: approvals.length }))));
        } else {
          await writer.write(encoder.encode(sse(JSON.stringify({ token: '*Approval required above.*' }))));
          await writer.write(encoder.encode(sse(JSON.stringify({ done: true, sources: approvals.length }))));
        }
      } finally {
        await writer.close();
      }
    })();
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  };

  if (!GEMINI_KEY) {
    return streamAndFinish(
      'KAI Voice Agent is online, but the GEMINI_API_KEY is not set on this deployment yet. ' +
        'Everything else is ready — add the key and I will be fully live.',
      [],
    );
  }

  let body: { message?: string; wallet?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = (body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const wallet = (body.wallet || '').trim();
  const initials = wallet ? `\n\nThe user's connected wallet address is ${wallet}. Use it with get_wallet_balance when relevant.` : '';

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: message + initials }] },
  ];

  const approvals: Record<string, unknown>[] = [];
  let finalText = '';

  try {
    for (let i = 0; i < 4; i++) {
      const data = await callGemini(contents);
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      const textPart = parts.find((p) => p.text)?.text || '';
      const funcCall = parts.find((p) => p.functionCall)?.functionCall;

      if (funcCall) {
        const tool = findTool(funcCall.name);
        const fnArgs = (funcCall.args ?? {}) as Record<string, string>;

        if (!tool) {
          contents.push(
            { role: 'model', parts: [{ functionCall: { name: funcCall.name, args: funcCall.args } }] },
            {
              role: 'function',
              parts: [{ functionResponse: { name: funcCall.name, response: { error: `Unknown tool ${funcCall.name}` } } }],
            },
          );
          continue;
        }

        const result: ToolResult = await tool.run(fnArgs);
        if (result.kind === 'plan') {
          approvals.push({ name: tool.name, ...result.payload });
        }

        contents.push(
          { role: 'model', parts: [{ functionCall: { name: funcCall.name, args: funcCall.args } }] },
          {
            role: 'function',
            parts: [{
              functionResponse: {
                name: funcCall.name,
                response: result.payload as Record<string, unknown>,
              },
            }],
          },
        );
        continue;
      }

      if (textPart) {
        finalText = textPart;
        return streamAndFinish(finalText, approvals);
      }
    }

    return streamAndFinish(finalText || 'I could not finish planning that request. Please try rephrasing.', approvals);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Agent error';
    console.error('[/api/agent]', msg);
    return streamAndFinish(
      'I hit a temporary issue reaching the AI model. If your request involves money, I did not send anything. Please try again.',
      [],
    );
  }
}