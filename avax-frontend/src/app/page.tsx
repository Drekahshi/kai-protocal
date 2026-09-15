'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { useKaivaxStore } from '@/store/useKaivaxStore';
import { useAIChatStore } from '@/store/useAIChatStore';
const WalletConnectModal = dynamic(() => import('@/components/WalletConnectModal'), { ssr: false });
import { ECOSYSTEM_TOKENS, TICKER_TOKENS } from '@/lib/tokens';
import { ERC20_ABI } from '@/lib/erc20abi';
import { formatChat } from '@/lib/formatChat';
import {
  Trees, Store, Users, FlaskConical, ScanLine,
  Droplets, ImageIcon, Lock, Globe, LayoutGrid, Gift,
  Bot, Copy, RefreshCw, ChevronRight, TrendingUp,
  ShieldCheck, Coins, Wallet,
  CircleDollarSign, BarChart3, Activity, Zap,
  Mountain, Link2,
} from 'lucide-react';

/* text-shadow so words stay readable over the (now dimmed) background photo */
const R:  React.CSSProperties = { textShadow: '0 1px 6px rgba(0,0,0,0.60)' };

const HL = {
  green: { color: '#34d399', fontWeight: 700 } as React.CSSProperties,
};

/* Sentence-case, low-emphasis eyebrow label — replaces tracked-out ALL CAPS. */
const label: React.CSSProperties = { fontSize: 12, color: 'var(--home-muted)', letterSpacing: 0, textTransform: 'none', fontWeight: 600, margin: '0 0 8px' };
const sectionDivider = '1px solid rgba(255,255,255,0.10)';

const QUICK = [
  { name: 'AI Agent',   href: '/ai',        icon: Bot },
  { name: 'Playground', href: '/nuvari',     icon: FlaskConical },
  { name: 'Scan & Pay', href: '/pay',        icon: ScanLine },
  { name: 'Products',   href: '/products',   icon: CircleDollarSign },
  { name: 'SDG Impact', href: '/sdg',        icon: Globe },
  { name: 'Securities', href: '/securities', icon: ShieldCheck },
  { name: 'NFT Mkt',    href: '/connft',     icon: ImageIcon },
  { name: 'Pools',      href: '/pools',      icon: Droplets },
  { name: 'Vaults',     href: '/vaults',     icon: Lock },
  { name: 'Airdrop',    href: '/mine',       icon: Gift },
  { name: 'KAI Web',    href: '/kai',        icon: Globe },
  { name: 'TaaS',       href: '/taas',       icon: LayoutGrid },
];

const DASHBOARDS = [
  { id:'cfa',    href:'/cfa',    icon:Trees, label:'CFA Dashboard',  hl:'Community Forest',   sub:'Treasury and governance'  },
  { id:'sme',    href:'/sme',    icon:Store, label:'SME Dashboard',   hl:'Digitise Cash',      sub:'Loans and inventory'      },
  { id:'saving', href:'/saving', icon:Users, label:'Saving Group',    hl:'Pool Funds & Yield', sub:'Decentralised savings'  },
];

function buildCalls(addr: `0x${string}` | undefined) {
  if (!addr) return [];
  return ECOSYSTEM_TOKENS.filter(t => t.address).map(t => ({
    address: t.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf' as const,
    args: [addr],
  }));
}

const TOKEN_ICON: Record<string, React.ComponentType<{ size:number; color:string; strokeWidth:number }>> = {
  AVAX: Activity, NVR: Zap, yBOB: CircleDollarSign,
  YTOKEN: TrendingUp, YGOLD: BarChart3, GAMI: Coins, CENTS: CircleDollarSign,
};

/* No price oracle is wired up yet — these are manually maintained estimates,
   not a live feed. Keep the UI label ("Estimated portfolio value") honest about that. */
const ESTIMATED_USD_RATES: Record<string, number> = {
  avax: 26, ybob: 1, nvr: 0.12, ygold: 2.01, ytoken: 0.27, gami: 0.056, cents: 0.009,
};

export default function Home() {
  const { address, isConnected } = useAccount();
  const { data: avaxBal, refetch: refetchAvax } = useBalance({ address });
  const { connectWallet, disconnectWallet, setAvaxBalance, setAllBalances } = useKaivaxStore();
  const openAIChat = useAIChatStore(s => s.open);

  const [showModal,  setShowModal]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [agentQ,     setAgentQ]     = useState('');
  const [agentA,     setAgentA]     = useState('');
  const [agentBusy,  setAgentBusy]  = useState(false);
  const [profile,    setProfile]    = useState<{ name?: string; displayName?: string } | null>(null);
  const agentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    isConnected && address ? connectWallet('metamask', address) : disconnectWallet();
  }, [isConnected, address]);

  useEffect(() => {
    if (!address) { setProfile(null); return; }
    fetch(`/api/profile?wallet=${address}`)
      .then(r => r.json())
      .then(d => setProfile(d.profile ?? null))
      .catch(() => setProfile(null));
  }, [address]);

  useEffect(() => {
    if (avaxBal) setAvaxBalance(Number(formatUnits(avaxBal.value, avaxBal.decimals)));
  }, [avaxBal]);

  const contractCalls = buildCalls(address);
  const { data: tokenData, refetch: refetchTokens } = useReadContracts({ contracts: contractCalls });

  const tokenBals: Record<string,number> = (() => {
    const out: Record<string,number> = {};
    ECOSYSTEM_TOKENS.filter(t => t.address).forEach((t,i) => {
      const r = tokenData?.[i];
      out[t.symbol.toLowerCase()] = r?.status==='success' && r.result!==undefined
        ? Number(formatUnits(r.result as bigint,18)) : 0;
    });
    ECOSYSTEM_TOKENS.filter(t => !t.address).forEach(t => { out[t.symbol.toLowerCase()] = 0; });
    return out;
  })();

  useEffect(() => {
    if (isConnected)
      setAllBalances({ nvr:tokenBals.nvr??0, ybob:tokenBals.ybob??0, ytoken:tokenBals.ytoken??0, ygold:tokenBals.ygold??0, gami:tokenBals.gami??0, cents:tokenBals.cents??0 });
  }, [JSON.stringify(tokenBals), isConnected]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.allSettled([refetchAvax(), refetchTokens()]);
    setRefreshing(false);
  };

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const avaxAmt = avaxBal ? Number(formatUnits(avaxBal.value, avaxBal.decimals)) : 0;
  const allTokens = [
    { symbol:'AVAX', value:avaxAmt, color:'#10b981', deployed:true },
    ...ECOSYSTEM_TOKENS.map(t => ({ symbol:t.symbol, value:tokenBals[t.symbol.toLowerCase()]??0, color:t.color, deployed:!!t.address })),
  ];
  const totalUsd = avaxAmt*ESTIMATED_USD_RATES.avax
    + (tokenBals.ybob??0)*ESTIMATED_USD_RATES.ybob
    + (tokenBals.nvr??0)*ESTIMATED_USD_RATES.nvr
    + (tokenBals.ygold??0)*ESTIMATED_USD_RATES.ygold
    + (tokenBals.ytoken??0)*ESTIMATED_USD_RATES.ytoken
    + (tokenBals.gami??0)*ESTIMATED_USD_RATES.gami
    + (tokenBals.cents??0)*ESTIMATED_USD_RATES.cents;
  const activeTokenCount = allTokens.filter(b => b.value > 0).length;
  const balancesLoading = isConnected && tokenData === undefined;
  const displayName = profile?.displayName || profile?.name || (address ? `${address.slice(0,6)}…${address.slice(-4)}` : '');

  const askAgent = async () => {
    if (!agentQ.trim() || agentBusy) return;
    setAgentBusy(true); setAgentA('');
    try {
      const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message:agentQ, rag:true }) });
      const d = await r.json();
      setAgentA(d.text || d.response || 'No answer returned.');
    } catch { setAgentA('Agent offline. Start the server.'); }
    finally { setAgentBusy(false); }
  };

  return (
    <main style={{ minHeight:'100dvh', color:'#fff', fontFamily:'var(--font-sans)', position:'relative', paddingBottom:80 }}>
      {/* Photo demoted behind a dark base + fade — panels carry the page now */}
      <div className="home-bg-base" aria-hidden />
      <div className="home-bg-photo" aria-hidden />
      <div className="home-bg-fade" aria-hidden />

      {/* TICKER */}
      <div className="ticker-wrap" style={{ padding:'6px 0', position:'relative', zIndex:5 }}>
        <div className="ticker-track" style={{ display:'inline-flex', gap:36, paddingLeft:20, whiteSpace:'nowrap' }}>
          {[...TICKER_TOKENS,...TICKER_TOKENS,...TICKER_TOKENS].map((t,i) => (
            <span key={i} style={{ fontSize:11, fontWeight:600 }}>
              <span style={{ color:'rgba(255,255,255,0.40)' }}>{t.s} </span>
              <span style={{ color:'rgba(255,255,255,0.85)', fontWeight:700 }}>{t.p} </span>
              <span style={{ color:'#34d399', fontWeight:800 }}>{t.c}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Bottom nav (site-wide) is the one and only navigation on this page —
          no second, competing top tab bar. */}

      <div className="home-container" style={{ position:'relative', zIndex:5 }}>

        {/* HERO */}
        <div style={{ paddingTop:48, textAlign:'center', position:'relative', zIndex:5 }}>
          <Mountain size={36} color="#6ee7b7" strokeWidth={1.6} style={{ marginBottom:12 }}/>
          <h1 style={{ fontSize:34, fontWeight:900, margin:'0 0 8px', letterSpacing:'-1px', ...R }}>
            <span style={HL.green}>KAI</span> <span style={{ color:'#fff' }}>Nuvari</span>
          </h1>
          <p style={{ fontSize:17, color:'rgba(232,242,238,0.78)', margin:0, maxWidth:520, marginInline:'auto', lineHeight:1.6 }}>
            A DeFi ecosystem on Avalanche C-Chain with six tokens, yield vaults, liquidity pools, and DAO governance.
          </p>

          <motion.button whileTap={{ scale:0.98 }} onClick={() => setShowModal(true)}
            style={{
              marginTop:24, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:10,
              padding:'13px 28px', borderRadius:12, cursor:'pointer', border:'none',
              background:'var(--home-accent)',
              fontSize:15, fontWeight:800, color:'#04140f',
            }}>
            <Link2 size={16}/>
            {isConnected ? `Connected: ${address?.slice(0,6)}…${address?.slice(-4)}` : 'Connect Wallet'}
            {isConnected && <span style={{ width:8, height:8, borderRadius:'50%', background:'#04140f' }} />}
          </motion.button>

          <p style={{ marginTop:16, fontSize:12, color:'var(--home-muted)' }}>
            Avalanche C-Chain · MetaMask and Core Wallet supported
          </p>
        </div>

        {/* TWO-COLUMN LAYOUT — wallet/profile + agent on the right (sticky on
            desktop), portfolio/dashboards/actions on the left */}
        <div className="home-grid" style={{ marginTop:56 }}>

          <div className="home-aside">
            {/* PROFILE */}
            <div className="home-panel">
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <div style={{
                    width:52, height:52, borderRadius:'50%', border:'2px solid var(--home-accent)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:20, fontWeight:900, color:'#6ee7b7',
                  }}>{(displayName || 'K').charAt(0).toUpperCase()}</div>
                  <span style={{ position:'absolute', bottom:1, right:0, width:11, height:11, borderRadius:'50%', background:'#22c55e', border:'2px solid #0c1e18' }} />
                </div>
                <div>
                  <p style={{ fontSize:17, fontWeight:800, margin:0, color:'#fff' }}>
                    {isConnected ? (displayName || 'KAI Member') : 'Not connected'}
                  </p>
                  <p style={{ fontSize:14, color:'rgba(232,242,238,0.75)', margin:'2px 0 0', lineHeight:1.5 }}>
                    {isConnected
                      ? "You're an active KAI Nuvari member on Avalanche Fuji, based in Kenya."
                      : 'Connect a wallet to see your profile.'}
                  </p>
                  {isConnected && !profile && (
                    <Link href="/profile" className="text-link" style={{ fontSize:12 }}>Complete your profile →</Link>
                  )}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, paddingTop:16, borderTop: sectionDivider }}>
                {[
                  { l:'Est. value', v: isConnected ? (balancesLoading ? '…' : `$${totalUsd.toFixed(2)}`) : '$0.00', color:'#34d399', icon:Wallet },
                  { l:'Network',   v:'Fuji',   color:null,      icon:Mountain },
                  { l:'Tokens',    v:isConnected ? (balancesLoading ? '…' : String(activeTokenCount)) : '0', color:null, icon:Coins },
                  { l:'Status',    v:isConnected ? 'Active' : 'Idle', color:isConnected ? '#34d399' : null, icon:Zap },
                ].map(s => (
                  <div key={s.l} style={{ textAlign:'center' }}>
                    <s.icon size={16} color={s.color ?? 'var(--home-muted)'} strokeWidth={1.8} style={{ display:'block', margin:'0 auto 6px' }}/>
                    <p style={{ fontSize:17, fontWeight:800, color:s.color ?? '#fff', margin:'0 0 2px' }}>{s.v}</p>
                    <p style={{ fontSize:10, color:'var(--home-muted)', margin:0 }}>{s.l}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* KAI AGENT */}
            <div className="home-panel" id="agent"
              style={{ scrollMarginTop:70 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <Bot size={20} color="#34d399" />
                <p style={{ fontSize:17, fontWeight:800, margin:0, color:'#fff' }}>
                  <span style={HL.green}>KAI</span> Intelligence
                </p>
              </div>
              <p style={{ fontSize:14, color:'rgba(232,242,238,0.75)', margin:'0 0 14px', lineHeight:1.6 }}>
                Live and ready to help, powered by Qwen3 RAG.{' '}
                <button onClick={openAIChat} className="text-link" style={{ background:'none', border:'none', cursor:'pointer', padding:0, font:'inherit', fontSize:'inherit' }}>Open the full chat →</button>
              </p>

              <p style={label}>Quick ask</p>
              <p style={{ fontSize:13, lineHeight:2, marginBottom:14 }}>
                {['What tokens does KAI have?','Best yield now?','How to get started?','Pool rates?'].map((q,i,arr) => (
                  <span key={q}>
                    <button onClick={() => setAgentQ(q)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, font:'inherit', fontWeight:600, color: agentQ===q ? '#34d399' : 'rgba(255,255,255,0.65)' }}>{q}</button>
                    {i < arr.length-1 && <span style={{ color:'rgba(255,255,255,0.25)' }}> · </span>}
                  </span>
                ))}
              </p>

              <div style={{ display:'flex', gap:9, marginBottom: agentA ? 16 : 0 }}>
                <textarea ref={agentRef} value={agentQ}
                  onChange={e => setAgentQ(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && !e.shiftKey && (e.preventDefault(), askAgent())}
                  placeholder="Ask KAI anything…" rows={2}
                  style={{ flex:1, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.16)', borderRadius:10, padding:'10px 13px', fontSize:13, color:'#fff', outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.5, caretColor:'#34d399' }}
                  onFocus={e => (e.target.style.borderColor='rgba(52,211,153,0.65)')}
                  onBlur={e  => (e.target.style.borderColor='rgba(255,255,255,0.16)')}
                />
                <button onClick={askAgent} disabled={agentBusy||!agentQ.trim()} style={{
                  padding:'0 18px', borderRadius:10, alignSelf:'flex-end', flexShrink:0, border:'none', height:44,
                  background:agentQ.trim()&&!agentBusy?'var(--home-accent)':'rgba(255,255,255,0.08)',
                  color:agentQ.trim()&&!agentBusy?'#04140f':'rgba(255,255,255,0.30)',
                  cursor:agentQ.trim()?'pointer':'not-allowed',
                  fontSize:13, fontWeight:700,
                }}>
                  {agentBusy ? 'Asking…' : 'Send'}
                </button>
              </div>

              <AnimatePresence>
                {agentA && (
                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                    style={{ paddingLeft:14, borderLeft:'2px solid #34d399', fontSize:13, color:'rgba(255,255,255,0.85)', lineHeight:1.65, maxHeight:200, overflowY:'auto' }}>
                    <span dangerouslySetInnerHTML={{ __html:formatChat(agentA) }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="home-main">
            {/* PORTFOLIO */}
            <div className="home-panel">
              <p style={label}>Estimated portfolio value</p>
              {balancesLoading ? (
                <p style={{ fontSize:14, color:'var(--home-muted)', marginBottom:16 }}>Loading…</p>
              ) : (
                <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:20 }}>
                  <span style={{ fontSize:48, fontWeight:900, letterSpacing:-2, color:isConnected?'#fff':'rgba(255,255,255,0.25)', lineHeight:1 }}>
                    ${isConnected ? totalUsd.toFixed(2) : '0.00'}
                  </span>
                  {isConnected && totalUsd>0 && <span style={{ fontSize:13, ...HL.green }}>+0.00%</span>}
                </div>
              )}

              {isConnected ? (
                <>
                  <div style={{ overflowX:'auto', scrollbarWidth:'none', marginBottom:18 }}>
                    <div style={{ display:'flex', gap:24, minWidth:'max-content' }}>
                      {balancesLoading ? <p style={{ fontSize:13, color:'rgba(255,255,255,0.40)' }}>Loading balances…</p> : allTokens.map(b => {
                        const Icon = TOKEN_ICON[b.symbol] || Coins;
                        return (
                          <div key={b.symbol} style={{ textAlign:'center' }}>
                            <span style={{ display:'block', margin:'0 auto 4px' }}><Icon size={16} color={b.color} strokeWidth={1.8} /></span>
                            <p style={{ fontSize:9, color:'var(--home-muted)', margin:'0 0 2px', fontWeight:700 }}>{b.symbol}</p>
                            <p style={{ fontSize:13, fontWeight:800, color:b.color, margin:0 }}>
                              {b.value>=1000?`${(b.value/1000).toFixed(1)}K`:b.value>=0.001?b.value.toFixed(3):'0.000'}
                            </p>
                            {!b.deployed && <p style={{ fontSize:8, color:'rgba(255,255,255,0.30)', fontWeight:700, margin:'2px 0 0' }}>Coming soon</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <p style={{ fontSize:12, color:'var(--home-muted)', display:'flex', flexWrap:'wrap', alignItems:'center', gap:14 }}>
                    <span style={{ fontFamily:'monospace' }}>{address}</span>
                    <button onClick={copyAddress} style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', background:copied?'var(--home-accent)':'rgba(255,255,255,0.10)', color:copied?'#04140f':'rgba(255,255,255,0.75)', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                      {copied?'✓ Copied':(<><Copy size={12}/> Copy</>)}
                    </button>
                    <button onClick={handleRefresh} style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.10)', color:'rgba(255,255,255,0.75)', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                      <RefreshCw size={12} style={{ animation:refreshing?'spin 1s linear infinite':'none' }} /> Refresh
                    </button>
                  </p>
                </>
              ) : (
                <button onClick={() => setShowModal(true)} className="text-link" style={{ background:'none', border:'none', cursor:'pointer', padding:0, font:'inherit', fontSize:14 }}>
                  Connect a wallet to see your balances →
                </button>
              )}
            </div>

            {/* DASHBOARDS */}
            <div className="home-panel" id="dashboards"
              style={{ marginTop:32, scrollMarginTop:70 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <p style={{ ...label, margin:0 }}>Dashboards</p>
                <span style={{ fontSize:12, fontWeight:700, color:'#34d399' }}>● 3 active</span>
              </div>
              <div>
                {DASHBOARDS.map((d) => {
                  const Icon = d.icon;
                  return (
                    <Link key={d.id} href={d.href} className="dash-row">
                      <Icon size={22} className="action-icon" strokeWidth={1.6} style={{ flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:15, fontWeight:800, margin:'0 0 3px', color:'rgba(255,255,255,0.95)' }}>{d.hl} <span style={{ fontWeight:600, color:'var(--home-muted)', fontSize:13 }}>· {d.label}</span></p>
                        <p style={{ fontSize:12, color:'var(--home-muted)', margin:0 }}>{d.sub}</p>
                      </div>
                      <span className="dash-open" style={{ fontSize:12, fontWeight:700, color:'var(--home-muted)', display:'flex', alignItems:'center', gap:4, flexShrink:0, transition:'color 0.15s ease' }}>
                        Open <ChevronRight size={13}/>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* QUICK ACTIONS */}
            <div id="actions"
              style={{ marginTop:32, scrollMarginTop:70 }}>
              <p style={label}>Quick actions</p>
              <div className="qa-grid">
                {QUICK.map((a) => {
                  const Icon = a.icon;
                  const isAgent = a.href === '/ai';
                  const content = (
                    <>
                      <Icon size={22} className="action-icon" strokeWidth={1.6}/>
                      <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.85)', textAlign:'center', lineHeight:1.2 }}>
                        {a.name}
                      </span>
                    </>
                  );
                  return isAgent ? (
                    <button key={a.name} onClick={openAIChat} className="qa-card">{content}</button>
                  ) : (
                    <Link key={a.name} href={a.href} className="qa-card">{content}</Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
