"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAnimNumber } from "@/lib/useAnimNumber";
import { formatTokenAmount } from "@/lib/tokens";
import { Zap, Activity } from "lucide-react";

/* ─── Deterministic-but-live sparkline ─────────────────────────────────── */
function buildPoints(base: number, t: number, n = 34): number[] {
  const seed = Math.round(Math.abs(Math.sin(base * 1e7)) * 1e6);
  const tt = t % 500;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const drift =
      Math.sin(i * 0.55 + seed) * 0.0018 +
      Math.sin(i * 1.31 + tt) * 0.0035 +
      Math.sin(i * 2.71 - tt * 0.62) * 0.0013 +
      (i / n) * 0.001;
    out.push(base * (1 + drift));
  }
  return out;
}

function LiveSparkline({ base, color }: { base: number; color: string }) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(performance.now() / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const W = 260;
  const H = 72;
  const pts = useMemo(() => buildPoints(base, now), [base, now]);
  const lo = base * 0.972;
  const hi = base * 1.028;
  const range = hi - lo || 1;

  const coords = pts.map((p, i) => ({
    x: (i / (pts.length - 1)) * W,
    y: H - ((p - lo) / range) * (H - 10) - 5,
  }));
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const last = coords[coords.length - 1];
  const lastVal = pts[pts.length - 1];
  const prevVal = pts[pts.length - 2] || lastVal;
  const up = lastVal >= prevVal;

  const id = useMemo(() => `spark-${color.replace("#", "")}`, [color]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height: H }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
        {up && <circle cx={last.x} cy={last.y} r={3} fill={color} style={{ filter: `drop-shadow(0 0 5px ${color})` }} />}
      </svg>
      <div className="absolute bottom-1 right-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(0,0,0,0.4)", color }}>
        {up ? "+" : ""}
        {((lastVal / prevVal - 1) * 100).toFixed(2)}%
      </div>
    </div>
  );
}

/* ─── Card ──────────────────────────────────────────────────────────────── */
interface PoolStatsCardProps {
  pair: string;
  symbolA: string;
  symbolB: string;
  colorA: string;
  colorB: string;
  apy: number;
  tvl: number;
  spot: number;
  reserveA: number;
  reserveB: number;
  deployed: boolean;
  staked: boolean;
  onOpen: () => void;
}

export default function PoolStatsCard(p: PoolStatsCardProps) {
  const tvl = useAnimNumber(p.tvl, 900);
  const spot = useAnimNumber(p.spot, 700);
  const totalRes = p.reserveA + p.reserveB || 1;
  const shareA = (p.reserveA / totalRes) * 100;

  return (
    <button
      onClick={p.onOpen}
      className="group fluid-card w-full text-left cursor-pointer p-0 overflow-hidden relative focus:outline-none"
      style={{ borderRadius: 20 }}
    >
      {/* soft color wash */}
      <div
        className="absolute inset-0 opacity-40 transition-opacity duration-300 group-hover:opacity-70 pointer-events-none"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, ${p.colorA}22, transparent 55%), radial-gradient(120% 90% at 100% 100%, ${p.colorB}22, transparent 55%)` }}
      />

      <div className="relative p-4 flex flex-col gap-3">
        {/* Row 1 — pair identity */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex -space-x-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white border border-white/15 shadow-lg" style={{ background: `linear-gradient(135deg, ${p.colorA}, ${p.colorA}88)` }}>
                {p.symbolA[0]}
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white border border-white/15 shadow-lg" style={{ background: `linear-gradient(135deg, ${p.colorB}, ${p.colorB}88)` }}>
                {p.symbolB[0]}
              </div>
            </div>
            <div>
              <p className="font-extrabold text-white text-sm leading-tight">{p.pair}</p>
              <p className="text-[10px] text-emerald-300 font-semibold flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${p.deployed ? "bg-[#34d399] animate-pulse" : "bg-orange-400"}`} />
                {p.deployed ? "Live on Fuji" : "Not deployed"}
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-black"
            style={{ color: p.colorA, borderColor: `${p.colorA}55`, background: `${p.colorA}14` }}
          >
            <Zap size={10} className={p.deployed ? "animate-pulse" : ""} />
            {p.apy.toFixed(1)}% APY
          </div>
        </div>

        {/* Row 2 — live sparkline */}
        <LiveSparkline base={Math.max(p.spot, 1e-9)} color={p.colorA} />

        {/* Row 3 — stats */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-0.5">TVL</p>
            <p className="text-lg font-black text-white font-mono tabular-nums leading-none">${formatTokenAmount(tvl, 2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Spot {p.symbolB}/{p.symbolA}</p>
            <p className="text-sm font-extrabold font-mono tabular-nums leading-none" style={{ color: p.colorA }}>
              {spot >= 1 ? spot.toFixed(4) : spot.toFixed(6)}
            </p>
          </div>
        </div>

        {/* Row 4 — reserve ratio bar */}
        <div>
          <div className="flex justify-between text-[9px] font-bold text-white/40 mb-1">
            <span>{p.symbolA} {shareA.toFixed(0)}%</span>
            <span>{p.symbolB} {(100 - shareA).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex">
            <div className="h-full transition-all duration-700" style={{ width: `${shareA}%`, background: `linear-gradient(90deg, ${p.colorA}, ${p.colorA}aa)` }} />
            <div className="h-full flex-1 transition-all duration-700" style={{ background: `linear-gradient(90deg, ${p.colorB}aa, ${p.colorB})` }} />
          </div>
        </div>

        {/* staked hint */}
        {p.staked && (
          <div className="absolute top-3 right-3">
            <Activity size={14} className="text-[#34d399] animate-pulse" />
          </div>
        )}
      </div>
    </button>
  );
}