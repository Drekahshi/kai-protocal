'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, ChevronLeft, Mic, MicOff, Volume2, VolumeX, ShieldCheck, Loader2, Send as SendIcon, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatChat } from '@/lib/formatChat';
import {
  executeEscrowCreate,
  executeEscrowRelease,
  executeSwap,
  snowtraceLink,
} from '@/lib/agent/executeSchema';

interface Plan {
  name?: string;
  action?: string;
  [key: string]: unknown;
}

interface Msg {
  role: 'ai' | 'user';
  text: string;
  plans?: Plan[];
}

const WELCOME =
  "Hey, I'm KAI Voice Agent. Talk to me or type. I can read your Avalanche balances, compare APYs, check conservation NFTs, quote x402 payments, and prepare swap, M-Pesa, NFT and on-chain escrow plans. You approve every financial action in your wallet — I never move money without you signing.";

// Must match the server-side default in lib/mpesa.ts's MPESA_KES_PER_USD — this
// client constant only exists to pre-convert into /api/mpesa/stk's `priceYbob`
// (USD) field, which the server re-converts back to KES via usdToKes(). If the
// server rate is ever overridden via env, this will silently drift out of sync.
const USD_PER_KES = 130;

export default function VoiceAgentPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([{ role: 'ai', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speakOn, setSpeakOn] = useState(true);
  const [wallet, setWallet] = useState('');
  const [micSupported, setMicSupported] = useState(true);
  const [stkStatus, setStkStatus] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<{ recognize: () => void; abort: () => void } | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, interim]);

  const speak = useCallback(
    (text: string) => {
      if (!speakOn || typeof window === 'undefined' || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const clean = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`(.*?)`/g, '$1');
      const utt = new SpeechSynthesisUtterance(clean);
      const v = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'));
      if (v) utt.voice = v;
      window.speechSynthesis.speak(utt);
    },
    [speakOn],
  );

  const connectWallet = useCallback(async (): Promise<string> => {
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('No wallet detected.');
      let accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa869' }], // 43113 — Avalanche Fuji C-Chain (0xa86a/43114 is mainnet)
      }).catch(async () => {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0xa869',
            chainName: 'Avalanche Fuji C-Chain',
            rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
            nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
          }],
        });
      });
      setWallet(accounts[0]);
      return accounts[0];
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Win = window as any;
    const SR = Win.SpeechRecognition || Win.webkitSpeechRecognition;
    if (!SR) {
      setMicSupported(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInterim(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = {
      recognize: () => {
        setInterim('');
        setListening(true);
        rec.start();
      },
      abort: () => {
        rec.stop();
        setListening(false);
      },
    };
    return () => {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  const moveToAppRoute = (path: string) => router.push(path);

  const approvePlan = async (plan: Plan) => {
    const action = plan.action || plan.name || '';
    if (action === 'mpesa_payment') {
      const phoneRaw = String(plan.phone || '').replace(/\D/g, '');
      const northNum = phoneRaw.startsWith('0') ? `254${phoneRaw.slice(1)}` : phoneRaw;
      const amountKes = Number(plan.amountKes || 0);
      setStkStatus(`Sending M-Pesa STK push to ${plan.phone} for KSh ${amountKes}… confirm with PIN on your phone.`);
      try {
        const res = await fetch('/api/mpesa/stk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: northNum,
            nftId: 'voice-agent',
            nftName: String(plan.purpose || 'KAI payment'),
            priceYbob: amountKes / USD_PER_KES,
          }),
        });
        const data = await res.json().catch(() => ({}));
        setStkStatus(res.ok ? data.message || `STK push sent. Check ${plan.phone} and enter your PIN.` : `Failed: ${data.error || 'unknown error'}`);
      } catch {
        setStkStatus('Failed to reach M-Pesa. Try again.');
      }
      return;
    }
    if (action === 'swap') {
      // send_swap — funds MUST come from this exact signed flow (never the agent).
      if (!wallet) {
        const acct = await connectWallet();
        if (!acct) { setStkStatus('Connect a wallet first to sign the swap.'); return; }
      }
      setStkStatus('Signing the swap in your wallet…');
      try {
        const res = await executeSwap({
          fromToken: String(plan.fromToken || ''),
          fromAmount: Number(plan.fromAmount || 0),
          toToken: String(plan.toToken || ''),
        });
        setStkStatus(`Swap sent — ${snowtraceLink('tx', res.txHash)}. Track it on Snowtrace.`);
      } catch (e) {
        setStkStatus(`Swap failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
      return;
    }
    if (action === 'nft_purchase') {
      moveToAppRoute('/connft');
      return;
    }
    if (action === 'escrow_create') {
      // create_escrow — approve yBOB + deposit into KaiEscrow after human approval.
      if (!wallet) {
        const acct = await connectWallet();
        if (!acct) { setStkStatus('Connect a wallet first to lock escrow funds.'); return; }
      }
      setStkStatus('Signing yBOB approval, then locking funds in KaiEscrow…');
      try {
        const res = await executeEscrowCreate({
          purpose: String(plan.purpose || 'KAI agent payment'),
          amountToken: Number(plan.amountToken || 0),
          token: String(plan.token || 'yBOB'),
        });
        setStkStatus(`Escrow funded — ${snowtraceLink('tx', res.txHash)}. Funds are locked until release condition + your approval.`);
      } catch (e) {
        setStkStatus(`Escrow failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
      return;
    }
    if (action === 'escrow_release') {
      // request_escrow_release — agent cannot release unilaterally; human signs.
      if (!wallet) {
        const acct = await connectWallet();
        if (!acct) { setStkStatus('Connect a wallet first to approve escrow release.'); return; }
      }
      setStkStatus('Signing escrow release — paying the provider…');
      try {
        const res = await executeEscrowRelease(String(plan.escrowId || ''));
        setStkStatus(`Escrow released — ${snowtraceLink('tx', res.txHash)}. Provider paid.`);
      } catch (e) {
        setStkStatus(`Release failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
      return;
    }
    if (action === 'escrow') {
      setStkStatus('Escrow plan created. To lock funds, ask me to "hold in escrow" and approve the escrow_create plan.');
      return;
    }
    setStkStatus(`Approved plan: ${action} (link signed through wallet when available).`);
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((p) => [...p, { role: 'user', text: msg }, { role: 'ai', text: '' }]);
    setLoading(true);
    setStkStatus(null);

    let account = wallet;
    if (!account) account = await connectWallet();

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, wallet: account || undefined }),
      });
      if (!res.ok || !res.body) throw new Error('bad response');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let aiText = '';
      const plans: Plan[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          let event = 'message';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          let json: any;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          if (event === 'approval' && json.plan) {
            plans.push(json.plan as Plan);
            continue;
          }
          if (typeof json.token === 'string') {
            aiText += json.token;
            // Append to the live AI placeholder bubble pushed at the start of send().
            setMessages((p) => {
              const idx = p.length - 1;
              if (p[idx]?.role !== 'ai') return p;
              const clone = p.slice();
              clone[idx] = { ...clone[idx], text: aiText };
              return clone;
            });
          }
        }
      }

      if (aiText) {
        setMessages((p) => {
          const idx = p.length - 1;
          if (p[idx]?.role !== 'ai') return p;
          const clone = p.slice();
          clone[idx] = { ...clone[idx], text: aiText, plans };
          return clone;
        });
        speak(aiText);
      } else if (plans.length) {
        setMessages((p) => {
          const idx = p.length - 1;
          const text = '**Please review the plan below and approve or reject it.**';
          if (p[idx]?.role !== 'ai') return [...p, { role: 'ai', text, plans }];
          const clone = p.slice();
          clone[idx] = { ...clone[idx], text, plans };
          return clone;
        });
        speak('Please review the plan and approve or reject it.');
      } else {
        // Neither text nor a plan came back — drop the empty placeholder bubble.
        setMessages((p) => (p[p.length - 1]?.role === 'ai' && !p[p.length - 1].text ? p.slice(0, -1) : p));
      }
    } catch {
      const text = '**Voice Agent error.** If money is involved, nothing was sent. Try again.';
      setMessages((p) => {
        const idx = p.length - 1;
        if (p[idx]?.role !== 'ai') return [...p, { role: 'ai', text }];
        const clone = p.slice();
        clone[idx] = { ...clone[idx], text };
        return clone;
      });
    } finally {
      setLoading(false);
      setInterim('');
    }
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.abort();
      if (interim.trim()) send(interim);
    } else {
      recRef.current?.recognize();
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh', position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(160deg, #060608 0%, #0a0f0c 55%, #061018 100%)',
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(600px 300px at 20% 0%, rgba(16,185,129,0.10), transparent 60%)' }} />

      {/* Header */}
      <header style={{ position: 'relative', zIndex: 10, padding: '48px 16px 14px', display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(6,6,8,0.92) 0%, rgba(6,6,8,0.55) 100%)', backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/chat" style={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}><ChevronLeft size={20} /></Link>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #064e3b)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 22px rgba(16,185,129,0.55)' }}>
            <Bot size={20} color="#fff" />
          </div>
          {listening && <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: '1.5px solid #f43f5e', animation: 'glow-pulse 1.2s ease-in-out infinite' }} />}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0 }}>KAI Voice Agent</p>
          <p style={{ fontSize: 10, color: '#10b981', margin: 0, fontWeight: 700 }}>{listening ? '● Listening…' : (loading ? '● Processing' : '● Neural orchestrator · Gemini')}</p>
        </div>
        <button onClick={() => setSpeakOn((v) => !v)} title="Voice replies" style={{
          width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: speakOn ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
        }}>
          {speakOn ? <Volume2 size={15} color="#10b981" /> : <VolumeX size={15} color="rgba(255,255,255,0.35)" />}
        </button>
      </header>

      {/* Wallet strip */}
      <div style={{ position: 'relative', zIndex: 9, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={connectWallet} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
          background: wallet ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)', color: wallet ? '#34d399' : 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 700,
        }}>
          <Wallet size={12} />
          {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)} · Fuji` : 'Connect wallet'}
        </button>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Agent never signs. You approve in MetaMask/Core.</span>
      </div>

      {/* Messages */}
      <main style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 8, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, scrollbarWidth: 'thin' }}>
        {messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
            <div style={{
              maxWidth: '84%', padding: m.role === 'user' ? '9px 14px' : '11px 15px', borderRadius: m.role === 'user' ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
              background: m.role === 'user' ? 'linear-gradient(135deg, rgba(16,185,129,0.85), rgba(5,150,105,0.75))' : 'rgba(18,18,26,0.78)',
              backdropFilter: 'blur(16px)', fontSize: 14, lineHeight: 1.7, color: '#fff', wordBreak: 'break-word',
              boxShadow: m.role === 'user' ? '0 4px 18px rgba(16,185,129,0.28)' : '0 4px 20px rgba(0,0,0,0.4)',
            }}>
              <div dangerouslySetInnerHTML={{ __html: formatChat(m.text) }} />
            </div>
          </motion.div>
        ))}

        {interim && (
          <div style={{ alignSelf: 'flex-start', padding: '9px 14px', borderRadius: 18, background: 'rgba(244,63,94,0.12)', color: 'rgba(255,255,255,0.75)', fontSize: 13, fontStyle: 'italic' }}>
            {interim}
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#064e3b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={14} color="#fff" style={{ animation: 'spin 0.9s linear infinite' }} />
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 18, background: 'rgba(18,18,26,0.78)', display: 'flex', gap: 4 }}>
              {[0, 1, 2].map((j) => (
                <span key={j} style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', animation: `pulse-gold ${0.7 + j * 0.18}s ease-in-out infinite` }} />
              ))}
            </div>
          </div>
        )}

        {stkStatus && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#86efac', fontSize: 12 }}>
            {stkStatus}
          </motion.div>
        )}

        {/* Approval cards */}
        {messages.map((m, i) =>
          (m.plans || []).map((plan, pi) => (
            <motion.div key={`approve-${i}-${pi}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} style={{
              position: 'relative', zIndex: 9, padding: 14, borderRadius: 16, border: '1px solid rgba(245,158,11,0.35)',
              background: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(18,18,26,0.85))', backdropFilter: 'blur(14px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ShieldCheck size={16} color="#fbbf24" />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#fbbf24', letterSpacing: 0.5, textTransform: 'uppercase' }}>Human approval required</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: 10 }}>
                {Object.entries(plan).filter(([k]) => !['name'].includes(k)).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 92, textTransform: 'capitalize', fontSize: 11 }}>{k.replace(/([A-Z])/g, ' $1')}</span>
                    <span style={{ fontWeight: 700 }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => approvePlan(plan)} style={{
                  flex: 1, padding: '9px 12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, color: '#fff',
                  background: 'linear-gradient(135deg, #10b981, #047857)', boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
                }}>
                  Approve
                </button>
                <button onClick={() => { setStkStatus(null); speak('Plan rejected. Nothing was sent.'); }} style={{
                  flex: 1, padding: '9px 12px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.5)', cursor: 'pointer', fontWeight: 800, fontSize: 12, color: '#f87171',
                  background: 'transparent',
                }}>
                  Reject
                </button>
              </div>
            </motion.div>
          )),
        )}

        <div ref={endRef} style={{ height: 4 }} />
      </main>

      {/* Input bar */}
      <footer style={{ position: 'relative', zIndex: 10, padding: '10px 14px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: 'linear-gradient(0deg, rgba(6,6,8,0.96) 0%, rgba(6,6,8,0.7) 100%)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMic} disabled={!micSupported}
            title={!micSupported ? 'Mic not supported in this browser' : (listening ? 'Stop & send' : 'Tap to talk')} style={{
              width: 52, height: 52, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: micSupported ? 'pointer' : 'not-allowed',
              background: listening ? 'linear-gradient(135deg, #f43f5e, #be123c)' : 'linear-gradient(135deg, #34d399, #10b981, #047857)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: listening ? '0 0 24px rgba(244,63,94,0.55)' : '0 0 20px rgba(16,185,129,0.5)',
            }}>
            {listening ? <MicOff size={20} color="#fff" /> : <Mic size={20} color="#fff" />}
          </motion.button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 24, padding: '6px 6px 6px 14px' }}>
            <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={micSupported ? 'Tap the mic, or type…' : 'Type your request…'}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, resize: 'none', fontFamily: 'inherit', minHeight: 26, padding: '4px 0' }} />
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => send()} disabled={!input.trim() || loading} style={{
              width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              background: input.trim() && !loading ? 'linear-gradient(135deg, #34d399, #047857)' : 'rgba(255,255,255,0.08)',
            }}>
              <SendIcon size={16} color={input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.25)'} />
            </motion.button>
          </div>
        </div>
        {!micSupported && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 6 }}>Voice input needs Chrome/Edge. Typing works everywhere.</p>}
      </footer>
    </div>
  );
}