"use client";
import Link from "next/link";
import {
  ArrowLeft, LayoutGrid, Coins, Rocket, Code2,
  ShieldCheck, BarChart3, Zap, Clock, ExternalLink,
} from "lucide-react";
import { useAccount } from "wagmi";

const TEMPLATES = [
  { icon: "", name: "Governance Token",  standard: "ERC-20",  apy: "15.2%", use: "DAO voting, fee burns",          ready: true  },
  { icon: "", name: "Stable Token",      standard: "ERC-20",  apy: "7.5%",  use: "Settlement, micro-payments",     ready: true  },
  { icon: "", name: "Yield ETF Token",   standard: "ERC-20",  apy: "14.8%", use: "Growth yield aggregation",       ready: true  },
  { icon: "", name: "RWA Asset Token",   standard: "ERC-20",  apy: "12.4%", use: "Gold-backed reserve asset",      ready: true  },
  { icon: "", name: "Rewards Token",     standard: "ERC-20",  apy: "22.0%", use: "Community incentives",           ready: true  },
  { icon: "", name: "Conservation NFT",  standard: "ERC-721", apy: "-",     use: "Biodiversity, carbon credits",   ready: false },
];

const SERVICES = [
  { icon: Code2,      label: "Contract Generator", desc: "AI writes & compiles Solidity",    href: "/ai",     color: "#10b981" },
  { icon: ShieldCheck,label: "Contract Auditor",   desc: "Security review by AI agent",     href: "/ai",     color: "#22c55e" },
  { icon: BarChart3,  label: "Tokenomics Model",   desc: "Supply, APY, distribution",       href: "/nuvari", color: "#3b82f6" },
  { icon: Zap,        label: "Deploy to Fuji",     desc: "One-click testnet deploy",        href: "/nuvari", color: "#f59e0b" },
];

export default function AvajazPage() {
  const { isConnected } = useAccount();

  return (
    <main style={{
      minHeight: "100dvh",
      background:
        "radial-gradient(ellipse 70% 40% at 80% 0%, rgba(139,92,246,0.07) 0%, transparent 65%)",
      color: "#f8f8fa",
      paddingBottom: 96,
    }}>

      {/* ── HERO ── */}
      <div style={{
        padding: "22px 18px 20px",
        borderBottom: "1px solid rgba(139,92,246,0.14)",
        background: "linear-gradient(180deg, rgba(139,92,246,0.06) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link href="/" style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.28)",
            display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
          }}>
            <ArrowLeft size={17} color="#8b5cf6" />
          </Link>

          <div style={{
            width: 46, height: 46, borderRadius: 15, flexShrink: 0,
            background: "linear-gradient(135deg, rgba(139,92,246,0.22) 0%, rgba(109,40,217,0.12) 100%)",
            border: "1px solid rgba(139,92,246,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(139,92,246,0.15)",
          }}>
            <LayoutGrid size={24} color="#8b5cf6" strokeWidth={1.8} />
          </div>

          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>Avajaz Dashboard</h1>
            <p style={{ fontSize: 10, color: "rgba(248,248,250,0.42)", margin: 0 }}>
              Token as a Service · Deploy · Manage · Earn
            </p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Templates",    value: "6",    icon: Coins,    color: "#8b5cf6" },
            { label: "Ready Now",    value: "5",    icon: Rocket,   color: "#22c55e" },
            { label: "Max APY",      value: "22%",  icon: BarChart3,color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{
              borderRadius: 16, padding: "13px 10px", textAlign: "center",
              background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(14,14,18,0.80) 100%)",
              border: `1px solid ${s.color}22`,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${s.color}40, transparent)` }} />
              <s.icon size={17} color={s.color} strokeWidth={1.8} style={{ margin: "0 auto 5px", display: "block" }} />
              <p style={{ fontSize: 17, fontWeight: 900, color: s.color, margin: "0 0 2px", letterSpacing: -0.5 }}>{s.value}</p>
              <p style={{ fontSize: 8, color: "rgba(248,248,250,0.35)", margin: 0, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "18px 18px 0" }}>

        {/* What is Avajaz */}
        <div style={{
          marginBottom: 24, padding: "14px 16px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(14,14,18,0.80) 100%)",
          border: "1px solid rgba(139,92,246,0.20)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.40), transparent)" }} />
          <p style={{ fontSize: 12, fontWeight: 800, color: "#a78bfa", margin: "0 0 7px", display: "flex", alignItems: "center", gap: 6 }}>
            <LayoutGrid size={14} /> What is Avajaz?
          </p>
          <p style={{ fontSize: 12, color: "rgba(248,248,250,0.60)", margin: 0, lineHeight: 1.6 }}>
            Deploy, manage and earn yield on ERC-20 tokens on Avalanche Fuji — no code needed. Choose a template, customise parameters, deploy in one click, and connect directly with KAI vaults and AMM pools.
          </p>
        </div>

        {/* Token Templates */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p className="label-caps">Token Templates</p>
            <Link href="/nuvari" style={{ fontSize: 10, color: "#8b5cf6", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
              Deploy <Rocket size={10} />
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TEMPLATES.map(t => (
              <div key={t.name} className="glass" style={{
                borderRadius: 16, padding: "13px 15px",
                display: "flex", alignItems: "center", gap: 13,
                opacity: t.ready ? 1 : 0.65,
              }}>
                <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1 }}>{t.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#f8f8fa", margin: 0 }}>{t.name}</p>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                      background: "rgba(255,255,255,0.06)", color: "rgba(248,248,250,0.40)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}>{t.standard}</span>
                  </div>
                  <p style={{ fontSize: 10, color: "rgba(248,248,250,0.40)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.use}</p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 900, color: t.apy !== "—" ? "#4ade80" : "rgba(248,248,250,0.25)", margin: "0 0 4px", letterSpacing: -0.3 }}>
                    {t.apy}
                  </p>
                  {t.ready ? (
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5, letterSpacing: 0.3,
                      background: "rgba(34,197,94,0.12)", color: "#4ade80",
                      border: "1px solid rgba(34,197,94,0.28)",
                    }}>Deploy</span>
                  ) : (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, letterSpacing: 0.3,
                      background: "rgba(255,255,255,0.04)", color: "rgba(248,248,250,0.28)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      display: "flex", alignItems: "center", gap: 3,
                    }}>
                      <Clock size={9} /> Soon
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="divider-green" style={{ marginBottom: 24 }} />

        {/* Developer Services */}
        <p className="label-caps" style={{ marginBottom: 12 }}>Developer Services</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {SERVICES.map(s => (
            <Link key={s.label} href={s.href} style={{ textDecoration: "none" }}>
              <div className="glass" style={{
                borderRadius: 16, padding: "16px 14px", height: "100%",
                borderColor: `${s.color}20`,
                background: `linear-gradient(135deg, ${s.color}07 0%, rgba(14,14,18,0.85) 100%)`,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, marginBottom: 10,
                  background: `${s.color}12`, border: `1px solid ${s.color}28`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <s.icon size={18} color={s.color} strokeWidth={1.8} />
                </div>
                <p style={{ fontSize: 12, fontWeight: 800, color: "#f8f8fa", margin: "0 0 5px", lineHeight: 1.3 }}>{s.label}</p>
                <p style={{ fontSize: 10, color: "rgba(248,248,250,0.42)", margin: 0, lineHeight: 1.4 }}>{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
