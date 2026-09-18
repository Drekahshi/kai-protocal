'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, ChevronLeft, Loader2, RefreshCw,
  Wrench, ChevronRight, X, Database,
  Coins, BarChart3, ShieldCheck, Vote, Gift, Leaf,
  BookOpen, TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import AgentProposalCard, { AgentProposal } from '@/components/AgentProposalCard';
import VoiceMicButton from '@/components/VoiceMicButton';
import { ECOSYSTEM_TOKENS } from '@/lib/tokens';
import { VAULT_ADDRESSES } from '@/lib/addresses';
import { formatChat } from '@/lib/formatChat';

interface Msg {
  role: 'ai' | 'user';
  text: string;
  agent?: string;
  sources?: number;
  proposal?: AgentProposal;
}

const TOOLS = [
  {
    group: 'Portfolio', icon: Coins, color: '#10b981',
    items: [
      { label: 'Check wallet balances',     q: 'Show all my token balances and total portfolio value in USD' },
      { label: 'Best yield opportunity',    q: 'What is the best yield opportunity in KAI right now?' },
      { label: 'Vault APY comparison',      q: 'Compare all KAI vault APYs and risk levels' },
    ],
  },
  {
    group: 'Liquidity', icon: BarChart3, color: '#3b82f6',
    items: [
      { label: 'Pool reserves & rates',     q: 'Show current KAI AMM pool reserves and swap rates' },
      { label: 'Impermanent loss estimate', q: 'Explain impermanent loss for KAI pools and how to minimise it' },
      { label: 'Add liquidity guide',       q: 'How do I add liquidity to the NVR/yBOB pool step by step?' },
    ],
  },
  {
    group: 'Governance', icon: Vote, color: '#a855f7',
    items: [
      { label: 'Draft DAO proposal',        q: 'Draft a KAI DAO governance proposal to increase GAMI vault APY to 25%' },
      { label: 'Explain NVR voting',        q: 'How does NVR token governance voting work in KAI?' },
      { label: 'Policy recommendation',     q: 'Give me a personalised KAI policy recommendation for medium risk tolerance' },
    ],
  },
  {
    group: 'Security', icon: ShieldCheck, color: '#22c55e',
    items: [
      { label: 'Audit KaiVault contract',   q: 'Audit the KaiVault smart contract for security vulnerabilities' },
      { label: 'DID activity log',          q: 'Show recent agent activity and authorization status from DID tracker' },
      { label: 'x402 payment status',       q: 'What is the current x402 payment rail configuration?' },
    ],
  },
  {
    group: 'Learn', icon: BookOpen, color: '#f59e0b',
    items: [
      { label: 'Start KAI onboarding',      q: 'Guide me through the KAI Nuvari onboarding step by step' },
      { label: 'Explain yield farming',     q: 'Explain yield farming and how KAI vaults work in simple terms' },
      { label: 'Community commodities',     q: 'What community commodities can be tokenized on KAI and at what APY?' },
    ],
  },
  {
    group: 'Ecosystem', icon: Leaf, color: '#06b6d4',
    items: [
      { label: 'All KAI tokens explained',  q: 'Explain all 6 KAI ecosystem tokens and their roles' },
      { label: 'M-Pesa integration',        q: 'How does the KAI M-Pesa integration work for KES payments?' },
      { label: 'Conservation NFTs',         q: 'Explain the KAI Conservation NFT marketplace and how to buy with yBOB' },
    ],
  },
];

function detectProposal(query: string): AgentProposal | undefined {
  const q = query.toLowerCase();
  const yBOB = ECOSYSTEM_TOKENS.find(t => t.symbol === 'yBOB');
  if ((q.includes('deposit') || q.includes('vault')) && q.includes('ybob')) {
    return {
      agentName: 'Vault Agent', actionType: 'APPROVE_STAKE',
      title: 'Deposit yBOB into Vault',
      description: 'Deposit yBOB into the kvyBOB yield vault to earn 7.5% APY.',
      amount: '10', tokenSymbol: 'yBOB', tokenAddress: yBOB?.address as `0x${string}`,
      targetContract: VAULT_ADDRESSES.yBOB ?? '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
      projectedApy: '7.5% APY',
    };
  }
  if (q.includes('transfer') && q.includes('ybob')) {
    // Only propose a real transfer when the user actually gave a recipient address —
    // this proposal card executes on-chain as soon as it's approved, with no way to
    // edit the recipient, so it must never fall back to a made-up address.
    const addressMatch = query.match(/0x[a-fA-F0-9]{40}/);
    if (!addressMatch) return undefined;
    return {
      agentName: 'Tx Agent', actionType: 'TRANSFER',
      title: 'Transfer yBOB',
      description: 'Transfer yBOB on Avalanche Fuji testnet.',
      amount: '5', tokenSymbol: 'yBOB', tokenAddress: yBOB?.address as `0x${string}`,
      recipientAddress: addressMatch[0] as `0x${string}`,
    };
  }
}

function fmt(text: string) {
  return formatChat(text);
}

interface KaiAgentChatProps {
  /** When provided, renders a close (X) control instead of a back-to-home link — used inside the overlay panel. */
  onClose?: () => void;
}

export default function KaiAgentChat({ onClose }: KaiAgentChatProps) {
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: 'ai',
    text: 'Hello! I\'m **KAI** - your DeFi assistant for the Nuvari ecosystem on Avalanche.\n\nAsk me anything about tokens, vaults, pools, governance, or community products. Open **Tools** to run pre-built queries instantly.',
    agent: 'KAI Agent', sources: 0,
  }]);
  const [input,       setInput]      = useState('');
  const [loading,     setLoading]    = useState(false);
  const [rag,         setRag]        = useState(true);
  const [toolsOpen,   setToolsOpen]  = useState(false);
  const [activeGroup, setActiveGroup]= useState(TOOLS[0].group);
  const [online,      setOnline]     = useState<boolean | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const checkHealth = useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://127.0.0.1:8000';
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      setOnline(r.ok);
    } catch { setOnline(false); }
  }, []);
  useEffect(() => { checkHealth(); }, [checkHealth]);

  const send = async (override?: string) => {
    const query = (override ?? input).trim();
    if (!query || loading) return;
    setInput('');
    const proposal = detectProposal(query);
    setMsgs(prev => [...prev, { role: 'user', text: query }]);
    setLoading(true);
    setMsgs(prev => [...prev, { role: 'ai', text: '', agent: 'KAI Agent', sources: 0, proposal }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, rag, stream: true }),
      });
      if (!res.ok || !res.body) throw new Error(`API ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.token) {
              full += evt.token;
              setMsgs(prev => { const c = [...prev]; c[c.length-1] = { ...c[c.length-1], text: full }; return c; });
            }
            if (evt.done) setMsgs(prev => { const c = [...prev]; c[c.length-1] = { ...c[c.length-1], sources: evt.sources ?? 0 }; return c; });
          } catch { /* skip */ }
        }
      }
    } catch {
      setMsgs(prev => {
        const c = prev.slice(0,-1);
        return [...c, { role: 'ai', text: 'Cannot reach agent server. Make sure `python server.py` is running at port 8000.', agent: 'System' }];
      });
    } finally { setLoading(false); }
  };

  const useTool = (q: string) => { setInput(q); setToolsOpen(false); setTimeout(() => inputRef.current?.focus(), 100); };

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'transparent',
      color: '#f0f0ff', overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
    }}>
      {/* ── Aurora background ──────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `
          radial-gradient(ellipse 70% 50% at 10% 0%,   rgba(16,185,129,0.18) 0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 90% 100%, rgba(5,150,105,0.10) 0%, transparent 55%),
          radial-gradient(ellipse 40% 35% at 50% 50%,  rgba(16,185,129,0.04) 0%, transparent 70%)
        `,
      }} />

      {/* ── TOP BAR ──────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        flexShrink: 0, zIndex: 10,
        background: 'rgba(6,6,8,0.97)',
        borderBottom: '1px solid rgba(16,185,129,0.20)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 4px 20px rgba(0,0,0,0.40)',
      }}>
        {!onClose && (
          <Link href="/" aria-label="Back" style={{ color: 'rgba(255,255,255,0.30)', textDecoration: 'none', display: 'flex', alignItems: 'center', marginRight: 2 }}>
            <ChevronLeft size={20} />
          </Link>
        )}

        {/* Bot avatar — AVAX style */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #34d399 0%, #10b981 45%, #064e3b 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 2px rgba(16,185,129,0.25), 0 0 16px rgba(16,185,129,0.35)',
        }}>
          <Bot size={18} color="#fff" strokeWidth={1.8} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, margin: 0, lineHeight: 1.1, color: '#ffffff', letterSpacing: '-0.2px' }}>KAI Agent</p>
          <p style={{ fontSize: 10, margin: 0, lineHeight: 1.2, fontWeight: 700,
            color: online === true ? '#4ade80' : online === false ? '#f87171' : 'rgba(255,255,255,0.30)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 7 }}>●</span>
            {online === true ? 'Online · Avalanche Fuji' : online === false ? 'Offline - start server' : 'Checking…'}
          </p>
        </div>

        {/* RAG toggle */}
        <button onClick={() => setRag(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
          background: rag ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${rag ? 'rgba(16,185,129,0.38)' : 'rgba(255,255,255,0.08)'}`,
          color: rag ? '#ff6b6b' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, flexShrink: 0,
          transition: 'all 0.18s',
        }}>
          <Database size={11} /> RAG {rag ? 'ON' : 'OFF'}
        </button>

        {/* Health refresh */}
        <button onClick={checkHealth} aria-label="Refresh connection status" style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0, cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.18s',
        }}>
          <RefreshCw size={13} color="rgba(255,255,255,0.38)" />
        </button>

        {/* Tools toggle */}
        <button onClick={() => setToolsOpen(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
          background: toolsOpen ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${toolsOpen ? 'rgba(16,185,129,0.45)' : 'rgba(255,255,255,0.08)'}`,
          color: toolsOpen ? '#ff6b6b' : 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 800,
          transition: 'all 0.18s',
          boxShadow: toolsOpen ? '0 0 12px rgba(16,185,129,0.20)' : 'none',
        }}>
          <Wrench size={12} color={toolsOpen ? '#ff6b6b' : 'rgba(255,255,255,0.38)'} /> Tools
        </button>

        {/* Overlay close button */}
        {onClose && (
          <button onClick={onClose} aria-label="Close chat" style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={15} color="rgba(255,255,255,0.45)" />
          </button>
        )}
      </header>

      {/* ── BODY ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* ── CHAT ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {msgs.map((m, i) => {
              const isUser = m.role === 'user';
              return (
                <div key={i} style={{
                  display: 'flex', gap: 10,
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                }}>
                  {/* Bot avatar */}
                  {!isUser && (
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginBottom: 2,
                      background: 'linear-gradient(135deg,#34d399,#10b981,#064e3b)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 10px rgba(16,185,129,0.28)',
                    }}>
                      <Bot size={14} color="#fff" strokeWidth={1.8} />
                    </div>
                  )}

                  <div style={{ maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                    {/* Agent label */}
                    {!isUser && m.agent && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(16,185,129,0.70)', letterSpacing: 0.8, textTransform: 'uppercase', marginLeft: 4 }}>
                        {m.agent}{m.sources ? ` · ${m.sources} sources` : ''}
                      </span>
                    )}

                    {/* Bubble */}
                    <div style={{
                      padding: '14px 18px',
                      borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                      background: isUser
                        ? 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%)'
                        : 'linear-gradient(135deg, rgba(22,12,14,0.96) 0%, rgba(18,14,20,0.94) 100%)',
                      border: isUser ? 'none' : '1px solid rgba(16,185,129,0.16)',
                      fontSize: 15, lineHeight: 1.75, color: isUser ? '#ffffff' : '#e8e8f0',
                      boxShadow: isUser
                        ? '0 4px 18px rgba(16,185,129,0.35), 0 1px 0 rgba(255,255,255,0.12) inset'
                        : '0 2px 16px rgba(0,0,0,0.40)',
                      wordBreak: 'break-word',
                    }}
                      dangerouslySetInnerHTML={{ __html: fmt(m.text || (loading && i === msgs.length - 1 ? '…' : '')) }}
                    />

                    {m.proposal && <AgentProposalCard proposal={m.proposal} />}
                  </div>
                </div>
              );
            })}

            {/* Typing dots */}
            {loading && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#34d399,#064e3b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 10px rgba(16,185,129,0.28)' }}>
                  <Loader2 size={14} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
                <div style={{ padding: '11px 16px', borderRadius: '4px 18px 18px 18px', background: 'rgba(22,12,14,0.96)', border: '1px solid rgba(16,185,129,0.16)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  {[0,1,2].map(n => (
                    <div key={n} style={{
                      width: 6, height: 6, borderRadius: '50%', background: '#10b981',
                      animation: `kai-dot ${0.8 + n*0.18}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick suggestion chips */}
          <div style={{
            padding: '0 16px 8px', display: 'flex', gap: 7,
            overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0,
          }}>
            {['What tokens does KAI have?', 'Best vault APY?', 'How do I swap tokens?', 'How does M-Pesa work?', 'Explain KAI governance'].map(q => (
              <button key={q} onClick={() => send(q)} style={{
                flexShrink: 0, padding: '5px 13px', borderRadius: 999, cursor: 'pointer',
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)',
                color: 'rgba(240,240,255,0.60)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                transition: 'all 0.16s',
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.18)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,185,129,0.45)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.08)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(240,240,255,0.60)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,185,129,0.22)';
                }}
              >{q}</button>
            ))}
          </div>

          {/* ── Input bar ── */}
          <div style={{
            padding: '10px 16px 14px', flexShrink: 0,
            borderTop: '1px solid rgba(16,185,129,0.14)',
            background: 'rgba(6,6,8,0.98)',
            display: 'flex', gap: 9, alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px';
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask KAI anything about DeFi, tokens, vaults…  (Enter to send)"
              rows={1}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(16,185,129,0.18)',
                borderRadius: 14,
                padding: '11px 15px',
                color: '#f0f0ff', fontSize: 14,
                resize: 'none', outline: 'none', fontFamily: 'inherit',
                lineHeight: 1.55, minHeight: 44, maxHeight: 110,
                caretColor: '#10b981',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'rgba(16,185,129,0.55)';
                e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)';
              }}
              onBlur={e => {
                e.target.style.borderColor = 'rgba(16,185,129,0.18)';
                e.target.style.boxShadow = 'none';
              }}
            />
            <VoiceMicButton
              onCommand={(voiceText) => {
                send(voiceText);
              }}
              disabled={loading}
              size="md"
              showVoiceToggle={true}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                background: input.trim() && !loading
                  ? 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%)'
                  : 'rgba(255,255,255,0.05)',
                border: input.trim() && !loading ? 'none' : '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: input.trim() && !loading ? '0 4px 18px rgba(16,185,129,0.45)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <Send size={17} color={input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.22)'} />
            </button>
          </div>
        </div>

        {/* ── TOOLS PANEL ──────────────────────────────────────── */}
        {toolsOpen && (
          <div style={{
            width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: 'rgba(8,6,8,0.99)', borderLeft: '1px solid rgba(16,185,129,0.18)',
            overflow: 'hidden',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid rgba(16,185,129,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
              background: 'rgba(16,185,129,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 7, background: 'rgba(16,185,129,0.16)',
                  border: '1px solid rgba(16,185,129,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wrench size={12} color="#10b981" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.2px' }}>Agent Tools</span>
              </div>
              <button onClick={() => setToolsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex', padding: 4, borderRadius: 6 }}>
                <X size={15} />
              </button>
            </div>

            {/* Tool groups */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {TOOLS.map(group => {
                const open = activeGroup === group.group;
                const Icon = group.icon;
                return (
                  <div key={group.group}>
                    <button
                      onClick={() => setActiveGroup(open ? '' : group.group)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 16px', cursor: 'pointer', border: 'none',
                        background: open ? `${group.color}12` : 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        color: open ? group.color : 'rgba(240,240,255,0.48)',
                        fontSize: 12, fontWeight: 700, textAlign: 'left', transition: 'all 0.15s',
                      }}>
                      <Icon size={14} color={open ? group.color : 'rgba(255,255,255,0.28)'} strokeWidth={1.8} />
                      <span style={{ flex: 1 }}>{group.group}</span>
                      <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', opacity: 0.45 }} />
                    </button>

                    {open && (
                      <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 10px 10px' }}>
                        {group.items.map(item => (
                          <button key={item.label} onClick={() => useTool(item.q)} style={{
                            width: '100%', textAlign: 'left', padding: '8px 11px', borderRadius: 10, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            color: 'rgba(240,240,255,0.65)', fontSize: 11.5, marginBottom: 5,
                            display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.35,
                            transition: 'all 0.15s',
                          }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = `${group.color}14`;
                              (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
                              (e.currentTarget as HTMLButtonElement).style.borderColor = `${group.color}30`;
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(240,240,255,0.65)';
                              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)';
                            }}
                          >
                            <ChevronRight size={10} color={group.color} style={{ flexShrink: 0 }} />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes kai-dot {
          0%,100% { opacity: 0.35; transform: translateY(0); }
          50%      { opacity: 1;    transform: translateY(-3px); }
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(16,185,129,0.30); border-radius: 2px; }
        textarea::placeholder { color: rgba(240,240,255,0.22) !important; }
      `}</style>
    </div>
  );
}
