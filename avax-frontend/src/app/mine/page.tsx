'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import WalletConnectModal from '@/components/WalletConnectModal';
import { useKaivaxStore } from '@/store/useKaivaxStore';
import {
  ArrowLeft, CheckCircle, Clock, Coins, Gift,
  Layers, Sparkles, Star, Timer, TrendingUp,
  UserPlus, Zap,
} from 'lucide-react';
import SDGImpactCard from '@/components/SDGImpactCard';

const POOLS = [
  { name:'AVAX Alpha Miners', spots:'247/500', pct:49, open:true,  reward:500,  unit:'NVR' },
  { name:'NVR Launch Pool',   spots:'89/200',  pct:45, open:true,  reward:1000, unit:'NVR' },
  { name:'Core Wallet Promo', spots:'500/500', pct:100,open:false, reward:200,  unit:'NVR' },
];

const TOKEN_DROPS = [
  { symbol:'NVR',    name:'Nuvari Token',  reward:10, unit:'NVR',    color:'#E84142' },
  { symbol:'YBOB',   name:'Stablecoin',    reward:2,  unit:'YBOB',   color:'#22c55e' },
  { symbol:'YTOKEN', name:'Yield Token',   reward:1,  unit:'YTOKEN', color:'#60a5fa' },
  { symbol:'GAMI',   name:'Community',     reward:5,  unit:'GAMI',   color:'#f59e0b' },
];

const TASKS = [
  { id:'checkin',   title:'Daily check-in',  desc:'Open the app today',       reward:5,    unit:'NVR',    color:'#E84142' },
  { id:'policy',    title:'Explore policy',  desc:'Open any policy template', reward:2,    unit:'YBOB',   color:'#22c55e' },
  { id:'agent',     title:'Ask KAI agent',   desc:'Chat with KAI once',       reward:1,    unit:'GAMI',   color:'#f59e0b' },
  { id:'community', title:'Join community',  desc:'Follow ecosystem updates', reward:1,    unit:'YTOKEN', color:'#60a5fa' },
];

const h2: React.CSSProperties = { fontSize:15, fontWeight:600, color:'var(--mine-text)', margin:0, letterSpacing:'-0.01em' };
const sub: React.CSSProperties = { fontSize:13, color:'var(--mine-text-2)', margin:'3px 0 0' };
const cardIcon: React.CSSProperties = {
  width:36, height:36, borderRadius:10, flexShrink:0,
  display:'flex', alignItems:'center', justifyContent:'center',
  background:'var(--mine-surface-2)', color:'var(--mine-text-2)',
};
const W: React.CSSProperties = { width:'100%', maxWidth:1280, margin:'0 auto', padding:'0 40px' };

/* Numbers that visibly count up when they change feel alive, not just swapped */
function useCountUp(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

/* Flat, neutral progress bar — no token colour, no glow. */
function Bar({ v, max }: { v:number; max:number }) {
  return (
    <div style={{ height:4, borderRadius:4, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(v/max*100,100)}%` }}
        transition={{ duration:0.9, ease:'easeOut' }}
        style={{ height:'100%', borderRadius:4, background:'var(--mine-text-2)' }} />
    </div>
  );
}

export default function MinePage() {
  const { isConnected } = useAccount();
  const setTokenBalance = useKaivaxStore(s => s.setTokenBalance);

  const [showModal,  setShowModal]  = useState(false);
  const [claimed,    setClaimed]    = useState(false);
  const [claiming,   setClaiming]   = useState(false);
  const [countdown,  setCountdown]  = useState(86400);
  const [joinedWait, setJoinedWait] = useState(false);
  const [showMint,   setShowMint]   = useState(false);
  const [minted,     setMinted]     = useState<string|null>(null);
  const [mintName,   setMintName]   = useState('');
  const [mintSym,    setMintSym]    = useState('');
  const [mintSupply, setMintSupply] = useState('');
  const [doneTasks,  setDoneTasks]  = useState<string[]>([]);
  const [taskMsg,    setTaskMsg]    = useState('');
  const [agentOn,    setAgentOn]    = useState(false);
  const [activePool, setActivePool] = useState<number|null>(null);
  const [heroMsg,    setHeroMsg]    = useState('');
  const [minedAmount,setMinedAmount]= useState(0);

  useEffect(() => {
    const id = setInterval(() => setCountdown(c => Math.max(0,c-1)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!agentOn) return;
    const id = setInterval(() => setMinedAmount(m => m + 0.003), 1000);
    return () => clearInterval(id);
  }, [agentOn]);

  const pts = doneTasks.length * 5 + (claimed ? 10 : 0);
  const displayPts = useCountUp(pts);
  /* Streak stays honest: it starts at 0 and only ticks once you engage. */
  const streak = claimed || doneTasks.length > 0 ? 1 : 0;

  const fmt = (s:number) => {
    const h   = Math.floor(s/3600).toString().padStart(2,'0');
    const m   = Math.floor((s%3600)/60).toString().padStart(2,'0');
    const sec = (s%60).toString().padStart(2,'0');
    return `${h}:${m}:${sec}`;
  };

  const claim = async () => {
    if (!isConnected) { setShowModal(true); return; }
    setClaiming(true);
    await new Promise(r => setTimeout(r,1400));
    setTokenBalance('nvr', useKaivaxStore.getState().balances.nvr + 10);
    setClaimed(true); setClaiming(false);
    setHeroMsg('10 NVR added to your wallet.');
    setTimeout(() => setHeroMsg(''), 4000);
  };

  const doTask = (id:string, reward:number, unit:string) => {
    if (!isConnected) { setShowModal(true); return; }
    if (doneTasks.includes(id)) return;
    const k = unit.toLowerCase() as 'nvr'|'ybob'|'ytoken'|'gami';
    setTokenBalance(k, useKaivaxStore.getState().balances[k] + reward);
    setDoneTasks(t => [...t, id]);
    setTaskMsg(`+${reward} ${unit} added to wallet`);
    setTimeout(() => setTaskMsg(''), 3000);
  };

  const mintToken = () => {
    if (!mintName||!mintSym||!mintSupply) return;
    setMinted(`0x${Math.random().toString(16).slice(2,12).toUpperCase()}`);
  };

  return (
    <main style={{ minHeight:'100dvh', backgroundColor:'var(--mine-bg)', color:'var(--mine-text)', fontFamily:'var(--font-sans)', position:'relative', paddingBottom:88 }}>
      <div style={{ ...W, paddingTop:28 }}>
        <Link href="/" style={{ display:'inline-flex', alignItems:'center', gap:8, textDecoration:'none', color:'var(--mine-dim)', fontSize:13, marginBottom:36, transition:'color 0.15s ease' }}
          onMouseEnter={e => (e.currentTarget.style.color='var(--mine-text)')}
          onMouseLeave={e => (e.currentTarget.style.color='var(--mine-dim)')}>
          <ArrowLeft size={14}/> Back to Home
        </Link>

        {/* HERO — centred, flat. The claim action is the one loud thing on the page. */}
        <div style={{ textAlign:'center', maxWidth:640, margin:'0 auto' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:20 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--mine-accent)', animation:'pulse-dot 2s ease-in-out infinite' }} />
            <span style={{ fontSize:11.5, fontWeight:600, color:'var(--mine-text-2)', letterSpacing:0.2 }}>Live rewards · Fuji testnet</span>
          </div>

          <h1 style={{ fontSize:'clamp(30px,4vw,44px)', fontWeight:700, letterSpacing:'-1px', lineHeight:1.1, color:'var(--mine-text)', margin:'0 0 14px' }}>
            Claim <span className="mine-num" style={{ color:'var(--mine-accent)', fontWeight:700 }}>10 NVR</span> daily
          </h1>
          <p style={{ fontSize:16, lineHeight:1.65, color:'var(--mine-text-2)', margin:'0 auto', maxWidth:460 }}>
            Complete tasks to earn <span className="mine-hl">Kai Bar points</span> toward the <span className="mine-hl">KAI airdrop</span>.
          </p>

          <p className="mine-num" style={{ marginTop:18, fontSize:14, fontWeight:500, color:'var(--mine-text)' }}>
            {displayPts} pts&ensp;·&ensp;{streak}-day streak&ensp;·&ensp;{doneTasks.length}/{TASKS.length} today
          </p>

          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:26 }}>
            <motion.button
              whileHover={claimed||claiming?{}:{ scale:1.02 }}
              whileTap={claimed||claiming?{}:{ scale:0.98 }}
              onClick={claim} disabled={claimed||claiming}
              style={{
                display:'inline-flex', alignItems:'center', gap:10,
                padding:'16px 34px', borderRadius:12, border:'none',
                cursor: claimed||claiming?'default':'pointer',
                background: claimed?'var(--mine-surface-2)':'var(--mine-accent)',
                color: claimed?'var(--mine-text-2)':'#fff',
                fontSize:16, fontWeight:700, letterSpacing:'-0.01em',
                boxShadow: claimed?'inset 0 0 0 1px var(--mine-line)':'none',
                transition:'background 0.2s',
              }}>
              {claiming
                ? <><Clock size={18} style={{ animation:'spin 1s linear infinite' }}/> Processing…</>
                : claimed
                  ? <><CheckCircle size={18}/> Claimed · next in <span className="mine-num">{fmt(countdown)}</span></>
                  : <><Gift size={18}/> Claim 10 NVR</>
              }
            </motion.button>
            <span style={{ width:1, height:22, background:'var(--mine-line)' }} />
            <Link href="/kai-bar" className="mine-link" style={{ fontSize:14, fontWeight:500, padding:'6px 8px' }}>
              View Kai Bar →
            </Link>
          </div>

          <AnimatePresence>
            {heroMsg && (
              <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                style={{ margin:'16px auto 0', display:'inline-flex', alignItems:'center', gap:8, padding:'7px 16px', borderRadius:999,
                  background:'var(--mine-surface-2)', boxShadow:'inset 0 0 0 1px var(--mine-line)', color:'var(--mine-text-2)', fontSize:13 }}>
                <CheckCircle size={13} style={{ color:'var(--mine-accent)' }}/> {heroMsg}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="airdrop-main-grid" style={{ ...W, marginTop:44, display:'grid', gridTemplateColumns:'1fr 1fr', gap:28, alignItems:'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display:'flex', flexDirection:'column', gap:28, minWidth:0 }}>

          {/* TOKEN DROPS */}
          <section>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <h2 style={h2}>Ecosystem token drops</h2>
                <p style={sub}>Rotating rewards for active members</p>
              </div>
              <span style={{ fontSize:11.5, color:'var(--mine-text-2)', fontWeight:500 }}>4 tokens</span>
            </div>
            <div className="airdrop-token-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {TOKEN_DROPS.map(t => (
                <motion.div key={t.symbol} whileHover={{ y:-2 }}
                  style={{ padding:'18px 16px', background:'var(--mine-surface)', border:'1px solid var(--mine-line)', borderRadius:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:t.color, flexShrink:0 }} />
                    <div>
                      <p style={{ fontSize:13, fontWeight:700, color:'var(--mine-text)', margin:0 }}>{t.symbol}</p>
<p style={{ fontSize:11.5, color:'var(--mine-text-2)', margin:'1px 0 0' }}>{t.name}</p>
                  </div>
                </div>
                <p className="mine-num" style={{ fontSize:22, fontWeight:500, color:'var(--mine-text)', margin:'0 0 5px' }}>
                  {t.reward.toLocaleString()}<span style={{ fontSize:12.5, color:'var(--mine-text-2)', fontWeight:400, marginLeft:6 }}>{t.unit}</span>
                </p>
                  <p style={{ fontSize:11, color:'var(--mine-text-2)', fontWeight:600, margin:0 }}>Per claim cycle</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* LAUNCHPOOLS */}
          <section>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <h2 style={h2}>Active launchpools</h2>
                <p style={sub}>Join early for maximum rewards</p>
              </div>
              <span style={{ fontSize:11, color:'var(--mine-text-2)', fontWeight:500 }}>{POOLS.filter(p=>p.open).length} open</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {POOLS.map((p,i) => (
                <motion.div key={i}
                  whileHover={{ x:2 }}
                  onClick={() => setActivePool(activePool===i?null:i)}
                  style={{ padding:'16px 18px', cursor:'pointer', background:'var(--mine-surface)', border:'1px solid var(--mine-line)', borderRadius:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={cardIcon}><Layers size={17} /></div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <p style={{ fontSize:13.5, fontWeight:600, color:'var(--mine-text)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</p>
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:999, background:'var(--mine-surface-2)', color:'var(--mine-text-2)', boxShadow:'inset 0 0 0 1px var(--mine-line)', flexShrink:0 }}>
                          {p.open ? 'Open' : 'Closed'}
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:14, alignItems:'center', margin:'5px 0 8px' }}>
                        <span className="mine-num" style={{ fontSize:12, color:'var(--mine-text-2)' }}>{p.spots}&nbsp;joined</span>
                        <span className="mine-num" style={{ fontSize:12, fontWeight:500, color:'var(--mine-text)' }}>{p.reward.toLocaleString()}&nbsp;{p.unit}</span>
                      </div>
                      <Bar v={p.pct} max={100} />
                    </div>
                    <motion.button
                      whileHover={p.open?{ borderColor:'rgba(255,255,255,0.28)', color:'var(--mine-text)' }:{}}
                      whileTap={p.open?{ scale:0.97 }:{}}
                      disabled={!p.open}
                      onClick={e => { e.stopPropagation(); if(!isConnected) setShowModal(true); }}
                      className="mine-btn-outline"
                      style={{ padding:'7px 18px', borderRadius:8, fontSize:12, fontWeight:600, flexShrink:0, fontFamily:'inherit' }}>
                      {p.open ? 'Join' : 'Closed'}
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* AUTO-DROP AGENT */}
          <section>
            <div className="mine-card" style={{ padding:'20px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={cardIcon}><Zap size={16} /></div>
                  <div>
                    <p style={{ fontSize:14, fontWeight:600, color:'var(--mine-text)', margin:0 }}>Auto-Drop Agent</p>
                    <p style={{ fontSize:12, color:'var(--mine-text-2)', margin:'2px 0 0' }}>Mines <span className="mine-hl">NVR</span> while you&apos;re away</p>
                  </div>
                </div>
                <motion.button whileTap={{ scale:0.94 }}
                  onClick={() => { if (!isConnected) setShowModal(true); else setAgentOn(v=>!v); }}
                  aria-pressed={agentOn}
                  style={{ width:52, height:28, borderRadius:14, border:'none', cursor:'pointer', position:'relative', background:agentOn?'var(--mine-accent)':'var(--mine-surface-2)', boxShadow:'inset 0 0 0 1px var(--mine-line)', transition:'background 0.28s' }}>
                  <motion.div animate={{ left:agentOn?26:3 }} transition={{ type:'spring', stiffness:500, damping:30 }}
                    style={{ width:22, height:22, borderRadius:'50%', background:'#fff', position:'absolute', top:3, boxShadow:'0 1px 4px rgba(0,0,0,0.4)' }} />
                </motion.button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {[
                  { l:'Mining rate', v:agentOn?'0.003/s':'0.000/s' },
                  { l:'Total mined',  v:`${minedAmount.toFixed(3)} NVR` },
                  { l:'Status',       v:agentOn?'Active':'Idle' },
                ].map(s => (
                  <div key={s.l} style={{ padding:'12px 14px', borderRadius:10, background:'var(--mine-surface-2)', minWidth:0 }}>
                    <p style={{ fontSize:10.5, color:'var(--mine-text-2)', margin:'0 0 5px' }}>{s.l}</p>
                    <p className="mine-num" style={{ fontSize:14, fontWeight:500, color:'var(--mine-text)', margin:0, lineHeight:1.3 }}>{s.v}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display:'flex', flexDirection:'column', gap:28, minWidth:0 }}>

          {/* DAILY TASKS */}
          <section>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <h2 style={h2}>Today&apos;s tasks</h2>
                <p style={sub}>Complete all four for the daily drop</p>
              </div>
              <AnimatePresence>
                {taskMsg && (
                  <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                    style={{ fontSize:11.5, color:'var(--mine-text-2)', boxShadow:'inset 0 0 0 1px var(--mine-line)', background:'var(--mine-surface-2)', padding:'5px 12px', borderRadius:999 }}>
                    {taskMsg}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mine-card" style={{ padding:'14px 16px', marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:11, color:'var(--mine-text-2)' }}>Progress</span>
                <span className="mine-num" style={{ fontSize:11, color:'var(--mine-text)' }}>{doneTasks.length}/{TASKS.length}</span>
              </div>
              <Bar v={doneTasks.length} max={TASKS.length} />
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {TASKS.map((task,i) => {
                const done = doneTasks.includes(task.id);
                return (
                  <motion.button key={task.id}
                    initial={{ opacity:0, x:10 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.05+i*0.04 }}
                    whileHover={done?{}:{ borderColor:'rgba(255,255,255,0.24)' }}
                    onClick={() => doTask(task.id, task.reward, task.unit)} disabled={done}
                    style={{ textAlign:'left', display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:12, cursor:done?'default':'pointer', background:done?'var(--mine-surface-2)':'var(--mine-surface)', border:'1px solid var(--mine-line)', color:'var(--mine-text)', opacity:done?0.72:1, fontFamily:'inherit', transition:'border-color 0.15s' }}>
                    <div style={{ width:34, height:34, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--mine-surface-2)', color:done?'var(--mine-dim)':'var(--mine-text-2)' }}>
                      {done ? <CheckCircle size={16} style={{ color:'var(--mine-accent)' }}/> : <TaskIcon id={task.id}/>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13.5, fontWeight:600, color:done?'var(--mine-dim)':'var(--mine-text)', margin:0 }}>{task.title}</p>
                      <p style={{ fontSize:11, color:done?'var(--mine-dim)':'var(--mine-dim)', margin:'2px 0 0' }}>{done ? 'Completed today' : task.desc}</p>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:done?'transparent':task.color }} />
                      {!done && <span className="mine-num" style={{ fontSize:13, fontWeight:500, color:'var(--mine-text)' }}>+{task.reward}&nbsp;{task.unit}</span>}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* EARLY ACCESS + MINT */}
          <div className="airdrop-side-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

            {/* EARLY ACCESS */}
            <div className="mine-card" style={{ padding:'18px' }}>
              <Star size={16} style={{ color:'var(--mine-text-2)', marginBottom:10 }} />
              <p style={{ fontSize:14, fontWeight:600, color:'var(--mine-text)', margin:'0 0 5px' }}>Early access</p>
              <p style={{ fontSize:12.5, color:'var(--mine-text-2)', margin:'0 0 14px', lineHeight:1.5 }}>
                Higher reward tiers at launch.
              </p>
              <AnimatePresence mode="wait">
                {!joinedWait ? (
                  <motion.button key="join" whileTap={{ scale:0.97 }}
                    onClick={() => setJoinedWait(true)}
                    className="mine-btn-outline"
                    style={{ width:'100%', fontWeight:600, fontSize:12.5, padding:'10px', borderRadius:10, fontFamily:'inherit' }}>
                    Join waitlist
                  </motion.button>
                ) : (
                  <motion.div key="done" initial={{ opacity:0 }} animate={{ opacity:1 }}
                    style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 12px', borderRadius:10, background:'var(--mine-surface-2)', boxShadow:'inset 0 0 0 1px var(--mine-line)', color:'var(--mine-text-2)', fontWeight:600, fontSize:12.5 }}>
                    <CheckCircle size={14} style={{ color:'var(--mine-accent)' }}/> You&apos;re on the list.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* MINT TOKEN — quiet entry point; the form opens on request */}
            <div className="mine-card" style={{ padding:'18px' }}>
              <TrendingUp size={16} style={{ color:'var(--mine-text-2)', marginBottom:10 }} />
              <p style={{ fontSize:14, fontWeight:600, color:'var(--mine-text)', margin:'0 0 5px' }}>Mint a token</p>
              <p style={{ fontSize:12.5, color:'var(--mine-text-2)', margin:'0 0 14px', lineHeight:1.5 }}>
                Deploy your own ERC-20 on Fuji.
              </p>
              <AnimatePresence mode="wait">
                {!minted ? (
                  <motion.div key="inner" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
                    {showMint ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {[
                          { v:mintName,   s:setMintName,   p:'Token name',  t:'text'   },
                          { v:mintSym,    s:setMintSym,    p:'Symbol (TKN)', t:'text'   },
                          { v:mintSupply, s:setMintSupply, p:'Total supply', t:'number' },
                        ].map(({ v,s,p,t }) => (
                          <input key={p} value={v} onChange={e => s(e.target.value)} placeholder={p} type={t}
                            style={{ background:'var(--mine-surface-2)', border:'1px solid var(--mine-line)', borderRadius:10, padding:'9px 12px', fontSize:12.5, color:'var(--mine-text)', outline:'none', fontFamily:'inherit', width:'100%', boxSizing:'border-box', transition:'border-color 0.15s' }}
                            onFocus={e => (e.target.style.borderColor='rgba(255,255,255,0.35)')}
                            onBlur={e  => (e.target.style.borderColor='var(--mine-line)')}
                          />
                        ))}
                        <motion.button onClick={mintToken}
                          disabled={!(mintName&&mintSym&&mintSupply)}
                          whileTap={(mintName&&mintSym&&mintSupply)?{ scale:0.97 }:{}}
                          className="mine-btn-quiet"
                          style={{ fontWeight:600, fontSize:12.5, padding:'10px', borderRadius:10, fontFamily:'inherit', opacity:(mintName&&mintSym&&mintSupply)?1:0.5 }}>
                          Deploy on Fuji
                        </motion.button>
                      </div>
                    ) : (
                      <button onClick={() => setShowMint(true)} className="mine-link"
                        style={{ background:'none', border:'none', padding:0, font:'inherit', fontSize:12.5 }}>
                        Deploy on Fuji →
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="success" initial={{ opacity:0 }} animate={{ opacity:1 }}
                    style={{ textAlign:'center', padding:'4px 0' }}>
                    <p style={{ fontSize:12.5, fontWeight:600, color:'var(--mine-text)', margin:'0 0 6px' }}>Token deployed</p>
                    <p className="mine-num" style={{ fontSize:10.5, color:'var(--mine-dim)', margin:'0 0 10px', wordBreak:'break-all', background:'var(--mine-surface-2)', padding:'6px 8px', borderRadius:8 }}>{minted}</p>
                    <button onClick={() => { setMinted(null); setShowMint(false); setMintName(''); setMintSym(''); setMintSupply(''); }}
                      className="mine-link" style={{ fontSize:11, background:'none', border:'none', padding:0, font:'inherit' }}>
                      Deploy another
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* SDG IMPACT & EFFORT SCORE */}
          <motion.div initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.25 }} style={{ marginBottom: 20 }}>
            <SDGImpactCard />
          </motion.div>

          {/* COUNTDOWN */}
          <div className="mine-card" style={{ padding:'18px 20px', display:'flex', alignItems:'center', gap:18 }}>
            <div style={cardIcon}><Timer size={19} /></div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:12, color:'var(--mine-text-2)', margin:'0 0 4px', lineHeight:1.35 }}>
                {claimed ? 'Next claim available in' : 'Daily claim resets in'}
              </p>
              <p className="mine-num" style={{ fontSize:26, fontWeight:500, color:'var(--mine-text)', margin:0, letterSpacing:1 }}>
                {fmt(countdown)}
              </p>
            </div>
            <div style={{ width:1, height:34, background:'var(--mine-line)', flexShrink:0 }} />
            <div style={{ minWidth:86, flexShrink:0 }}>
              <p style={{ fontSize:11.5, color:'var(--mine-text-2)', margin:'0 0 4px' }}>Streak</p>
              <p className="mine-num" style={{ fontSize:17, fontWeight:500, color:'var(--mine-text)', margin:0 }}>
                {streak} {streak === 1 ? 'day' : 'days'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}

/* Neutral icon per task type — colour stays off the chrome. */
function TaskIcon({ id }: { id:string }) {
  const common = { size:16 };
  switch (id) {
    case 'checkin':   return <Gift {...common}/>;
    case 'policy':    return <Sparkles {...common}/>;
    case 'community': return <UserPlus {...common}/>;
    default:          return <Coins {...common}/>;
  }
}