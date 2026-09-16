/**
 * POST /api/agent — KAI Voice Agent orchestrator (PRD §3, §5, §10, §20).
 *
 * Body: { message, wallet? }
 *
 * Flow per request:
 *   1. Gemini (gemini-3.6-flash) with a typed function-declaration tool set.
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
import { KAI_ORCHESTRATOR_DID } from '@/lib/agent/escrowAbi';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
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

// ── RAG: conversation memory only ─────────────────────────────────────────────
// Per-wallet ring buffer of recent turns. RAG is NEVER the source of truth for
// balances, transactions or escrow state — those are always fetched live via
// the tool registry. This only lets the agent answer "what did I ask earlier?".
const CONVERSATION_MEMORY = new Map<string, { role: string; text: string }[]>();
const MEMORY_MAX = 12; // keep the last 12 turns per wallet

function remember(wallet: string | undefined, role: string, text: string) {
  const key = wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : 'anonymous';
  const buf = CONVERSATION_MEMORY.get(key) ?? [];
  buf.push({ role, text });
  if (buf.length > MEMORY_MAX) buf.splice(0, buf.length - MEMORY_MAX);
  CONVERSATION_MEMORY.set(key, buf);
}

function recall(wallet: string | undefined): GeminiContent[] {
  const key = wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : 'anonymous';
  const buf = CONVERSATION_MEMORY.get(key) ?? [];
  return buf.map((t) => ({
    role: t.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: t.text }],
  }));
}

// ── DID audit trail ───────────────────────────────────────────────────────────
const AUDIT_FILE = join(process.cwd(), '.agent-audit.jsonl');
const AUDIT_RING: Record<string, unknown>[] = [];

function audit(entry: Record<string, unknown>) {
  const line = JSON.stringify({
    did: KAI_ORCHESTRATOR_DID,
    at: new Date().toISOString(),
    ...entry,
  });
  AUDIT_RING.push(JSON.parse(line));
  if (AUDIT_RING.length > 200) AUDIT_RING.shift();
  appendFile(AUDIT_FILE, `${line}\n`).catch(() => {});
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

  remember(wallet || undefined, 'user', message);

  // RAG memory: inject the last few turns so "what did I ask earlier?" works.
  const history = recall(wallet || undefined);
  history.push({ role: 'user', parts: [{ text: message + initials }] });
  const contents: GeminiContent[] = history;

  const approvals: Record<string, unknown>[] = [];
  let finalText = '';
  let planCount = 0;

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
          audit({ event: 'tool_unknown', tool: funcCall.name, wallet: wallet || null });
          contents.push(
            { role: 'model', parts: [{ functionCall: { name: funcCall.name, args: funcCall.args } }] },
            {
              role: 'function',
              parts: [{ functionResponse: { name: funcCall.name, response: { error: `Unknown tool ${funcCall.name}` } } }],
            },
          );
          continue;
        }

        audit({ event: 'tool_call', tool: tool.name, args: fnArgs, wallet: wallet || null });

        const result: ToolResult = await tool.run(fnArgs);
        if (result.kind === 'plan') {
          planCount += 1;
          approvals.push({ name: tool.name, ...result.payload });
          audit({
            event: 'approval_request',
            tool: tool.name,
            payload: result.payload,
            wallet: wallet || null,
          });
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
        remember(wallet || undefined, 'model', finalText);
        audit({ event: 'reply', text: finalText, planCount, wallet: wallet || null });
        return streamAndFinish(finalText, approvals);
      }
    }

    if (finalText) remember(wallet || undefined, 'model', finalText);
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

/** GET /api/agent — expose the agent's DID audit trail (last 100 entries). */
export async function GET() {
  return NextResponse.json({
    did: KAI_ORCHESTRATOR_DID,
    count: AUDIT_RING.length,
    entries: AUDIT_RING.slice(-100),
  });
}