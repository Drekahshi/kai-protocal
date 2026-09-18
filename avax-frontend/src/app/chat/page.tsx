'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Bot, Send as SendIcon, Volume2, VolumeX,
  ChevronLeft, Loader2, Database, Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import VoiceMicButton from '@/components/VoiceMicButton';
import { formatChat } from '@/lib/formatChat';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

const WELCOME = `Hey! I'm **KAI AVAX Agent**, your Avalanche DeFi companion powered by **Groq (Llama 3.1 8B)** with RAG context from Nuvari docs.

Ask me about:
• Ecosystem tokens (NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS)
• Yield vaults and defensive commodity-backed vaults
• Smart insurance, pension, and trust contracts
• How to deploy on Avalanche C-Chain
• Nuvari business model & revenue`;

const QUICK_PROMPTS = [
  { label: 'NVR token',   q: 'What is the NVR token?' },
  { label: 'yBOB',        q: 'Explain yBOB Stablecoin' },
  { label: 'Yield',       q: 'How do YToken and YGold work?' },
  { label: 'x402',        q: 'Explain the x402 settlement layer' },
  { label: 'Fuji setup',  q: 'AVAX Fuji testnet setup' },
  { label: 'RAG context', q: 'RAG context available?' },
];

interface Msg { role: 'ai' | 'user'; text: string; agent?: string; isRag?: boolean; }

export default function AVAXChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: WELCOME, agent: 'KAI AVAX Agent' },
  ]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [voiceOn, setVoiceOn]       = useState(false);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [focused, setFocused]       = useState(false);
  const endRef    = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`(.*?)`/g, '$1');
    const utt   = new SpeechSynthesisUtterance(clean);
    const v     = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
    if (v) utt.voice = v;
    window.speechSynthesis.speak(utt);
  };

  const send = async (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg || loading) return;
    setMessages(p => [...p, { role: 'user', text: msg }]);
    setInput('');
    setLoading(true);

    try {
      let res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, rag: ragEnabled, stream: false }),
      });

      if (!res.ok) {
        res = await fetch(`${BACKEND_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, rag: ragEnabled, stream: false }),
        });
      }

      if (!res.ok) throw new Error('Both endpoints failed');

      const data    = await res.json();
      const aiText  = data.text || data.response || 'No response generated.';
      const newMsg: Msg = {
        role: 'ai', text: aiText,
        agent: data.agent || 'KAI AVAX Agent',
        isRag: data.rag_used,
      };
      setMessages(p => [...p, newMsg]);
      if (voiceOn) speak(aiText);
    } catch {
      setMessages(p => [
        ...p,
        { role: 'ai', text: '**Connection Error.** Make sure your GROQ_API_KEY is set in .env or the backend is up.', agent: 'System' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      position: 'relative', overflow: 'hidden',
      background: 'transparent',
    }}>
      {/* ── Ambient orbs that don't block the background image ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'linear-gradient(180deg, rgba(6,6,8,0.55) 0%, rgba(6,6,8,0.40) 50%, rgba(6,6,8,0.72) 100%)',
      }} />
      <div style={{
        position: 'absolute', top: '10%', right: '-10%', width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0, animation: 'float-slow 8s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '20%', left: '-8%', width: 260, height: 260, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0, animation: 'float-slow 11s ease-in-out infinite reverse',
      }} />

      {/* ── HEADER ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        padding: '48px 16px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(6,6,8,0.90) 0%, rgba(6,6,8,0.60) 100%)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <ChevronLeft size={20} />
        </Link>

        {/* Agent avatar with pulse ring */}
        <div style={{ position: 'relative', flexShrink: 0 }} className="float">
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981, #064e3b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(16,185,129,0.55)',
          }}>
            <Bot size={20} color="#fff" />
          </div>
          {/* Pulse ring */}
          <span style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            border: '1.5px solid rgba(16,185,129,0.45)',
            animation: 'glow-pulse 2.5s ease-in-out infinite',
          }} />
          <span style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 11, height: 11, borderRadius: '50%',
            background: '#22c55e', border: '2px solid rgba(6,6,8,0.9)',
          }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0 }}>KAI AVAX Agent</p>
          <p style={{ fontSize: 10, color: '#10b981', margin: 0, fontWeight: 700, letterSpacing: 0.2 }}>
            ● Qwen3:1.7b · Avalanche C-Chain RAG
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setRagEnabled(r => !r)}
            title={ragEnabled ? 'RAG On' : 'RAG Off'}
            style={{
              width: 34, height: 34, borderRadius: 10, border: 'none',
              background: ragEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
              boxShadow: ragEnabled ? '0 0 12px rgba(16,185,129,0.25)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
            <Database size={14} color={ragEnabled ? '#10b981' : 'rgba(255,255,255,0.35)'} />
          </button>
          <button
            onClick={() => setVoiceOn(v => !v)}
            style={{
              width: 34, height: 34, borderRadius: 10, border: 'none',
              background: voiceOn ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
              boxShadow: voiceOn ? '0 0 12px rgba(16,185,129,0.25)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
            {voiceOn
              ? <Volume2  size={14} color="#10b981" />
              : <VolumeX  size={14} color="rgba(255,255,255,0.35)" />}
          </button>
        </div>
      </div>

      {/* ── RAG status pill ── */}
      <AnimatePresence>
        {ragEnabled && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{
              position: 'relative', zIndex: 9,
              margin: '0 18px',
              padding: '5px 12px',
              background: 'rgba(16,185,129,0.06)',
              borderRadius: '0 0 10px 10px',
              display: 'flex', gap: 6, alignItems: 'center',
              fontSize: 10, color: 'rgba(255,255,255,0.50)',
            }}>
            <Sparkles size={10} color="#10b981" />
            RAG active · KAI Chain docs indexed
            <code style={{ color: '#10b981', fontSize: 9 }}>bizmodel.md</code>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── QUICK PROMPTS ── */}
      <div style={{
        position: 'relative', zIndex: 9,
        padding: '10px 16px 2px',
        display: 'flex', gap: 7, overflowX: 'auto',
        scrollbarWidth: 'none', flexShrink: 0,
      }}>
        {QUICK_PROMPTS.map(p => (
          <motion.button
            key={p.q}
            whileHover={{ y: -2, scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => send(p.q)}
            style={{
              flexShrink: 0, padding: '6px 13px',
              borderRadius: 20, border: 'none',
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.80)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
              transition: 'background 0.2s',
            }}>
            {p.label}
          </motion.button>
        ))}
      </div>

      {/* ── MESSAGES ── */}
      <div style={{
        flex: 1, overflowY: 'auto', position: 'relative', zIndex: 8,
        padding: '14px 16px 8px',
        display: 'flex', flexDirection: 'column', gap: 6,
        scrollbarWidth: 'thin',
      }}>
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: 'flex',
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                gap: 10,
                alignItems: 'flex-end',
                marginBottom: 4,
              }}>
              {/* AI avatar */}
              {m.role === 'ai' && (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #10b981, #064e3b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(16,185,129,0.35)',
                  marginBottom: 2,
                }}>
                  <Bot size={15} color="#fff" />
                </div>
              )}

              {/* Bubble — no hard border, pure blur + gradient */}
              <div style={{
                maxWidth: '82%',
                padding: m.role === 'user' ? '10px 15px' : '12px 16px',
                borderRadius: m.role === 'user'
                  ? '20px 20px 5px 20px'
                  : '20px 20px 20px 5px',
                background: m.role === 'user'
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.85), rgba(5,150,105,0.75))'
                  : 'rgba(18,18,26,0.72)',
                backdropFilter: 'blur(18px)',
                boxShadow: m.role === 'user'
                  ? '0 4px 20px rgba(16,185,129,0.30), 0 1px 0 rgba(255,255,255,0.12) inset'
                  : '0 4px 24px rgba(0,0,0,0.40), 0 1px 0 rgba(255,255,255,0.05) inset',
                fontSize: 14,
                lineHeight: 1.75,
                color: '#fff',
                wordBreak: 'break-word',
              }}>
                {m.role === 'ai' && m.agent && (
                  <p style={{
                    fontSize: 9, color: '#34d399', fontWeight: 700,
                    margin: '0 0 5px', letterSpacing: 0.5,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {m.isRag && <Database size={8} />}
                    {m.agent}
                  </p>
                )}
                <div dangerouslySetInnerHTML={{ __html: formatChat(m.text) }} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #10b981, #064e3b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 12px rgba(16,185,129,0.35)',
              }}>
                <Loader2 size={15} color="#fff" style={{ animation: 'spin 0.9s linear infinite' }} />
              </div>
              <div style={{
                padding: '12px 16px', borderRadius: '20px 20px 20px 5px',
                background: 'rgba(18,18,26,0.72)', backdropFilter: 'blur(18px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
              }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#10b981',
                      animation: `pulse-gold ${0.7 + j * 0.18}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={endRef} style={{ height: 4 }} />
      </div>

      {/* ── INPUT BAR ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        padding: '10px 14px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: 'linear-gradient(0deg, rgba(6,6,8,0.95) 0%, rgba(6,6,8,0.75) 100%)',
        backdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <motion.div
          animate={{
            boxShadow: focused
              ? '0 0 0 1.5px rgba(16,185,129,0.45), 0 8px 32px rgba(16,185,129,0.18)'
              : '0 2px 16px rgba(0,0,0,0.35)',
          }}
          transition={{ duration: 0.2 }}
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-end',
            background: 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(16px)',
            borderRadius: 22,
            padding: '8px 8px 8px 16px',
          }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask KAI about AVAX, tokens, vaults…"
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: 14,
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.55,
              maxHeight: 120,
              minHeight: 24,
              padding: '4px 0',
              caretColor: '#10b981',
            }}
          />
          <VoiceMicButton
            onCommand={(voiceText) => {
              send(voiceText);
            }}
            disabled={loading}
            size="md"
            showVoiceToggle={false}
          />
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: input.trim() && !loading
                ? 'linear-gradient(135deg, #34d399, #10b981, #047857)'
                : 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              boxShadow: input.trim() && !loading ? '0 0 18px rgba(16,185,129,0.50)' : 'none',
              transition: 'all 0.2s',
            }}>
            <SendIcon size={17} color={input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.25)'} />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
