"use client";

import { Operation, OPERATIONS, KAI_ACCOUNT, OWNER_ACCOUNT } from "../../shared/operationSchemas";
import { TREASURY as TREASURY_FROM_LIB } from "@/lib/addresses";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { parseEther } from "viem";
import {
  Shield, Lock, Users, Search, Play, ChevronRight, TerminalSquare,
  Loader, ExternalLink, Code, FileText, Sparkles, X,
  Zap, BookOpen, History, Settings, Database,
  CheckCircle, XCircle, Plus, Briefcase,
  PiggyBank, Landmark, Wheat, Trees, HeartPulse, Building2, Droplet, Milk, Sprout, ScrollText,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
type ServiceSection =
  | "quick-start" | "insurance" | "trust" | "pension" | "my-policies"
  | "build-policy" | "templates" | "automation" | "execution" | "queries" | "admin";


interface ExecResult {
  id: string; opName: string; policyId: string;
  status: "queued" | "running" | "completed" | "failed";
  txId?: string; txHash?: string; explorerUrl?: string; avaxFee?: string; platformFee?: string; confirmedAt?: string;
  logs: string[]; startedAt: string; finishedAt?: string;
  payerAccount?: string;
}

type TermLine = { id: number; type: "cmd"|"info"|"success"|"warn"|"error"|"receipt"; text: string; link?: {label: string; url: string}; ts: string; };

const FUJI_CHAIN_ID = avalancheFuji.id;
const TREASURY_ADDRESS = (TREASURY_FROM_LIB ?? "0xB13727161583e38185530755a1A96D00fcCae870") as `0x${string}`;
const POLICY_FEE_AVAX = "0.0001";

// ═══════════════════════════════════════════════════════════
// OPERATIONS REGISTRY: full 70+ ops across 3 services
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// NAV SECTIONS
// ═══════════════════════════════════════════════════════════
const NAV: { id: ServiceSection; label: string; icon: React.ReactNode; color?: string }[] = [
  { id: "quick-start",  label: "Quick Start",         icon: <Zap size={15} />,        color: "#c9a24b" },
  { id: "build-policy", label: "Build Policy",         icon: <Shield size={15} />,     color: "#10b981" },
  { id: "insurance",    label: "Insurance Service",    icon: <Shield size={15} />,     color: "#3b82f6" },
  { id: "trust",        label: "Trust Service",        icon: <Users size={15} />,      color: "#f59e0b" },
  { id: "pension",      label: "Pension Service",      icon: <Lock size={15} />,       color: "#8b5cf6" },
  { id: "templates",    label: "Policy Templates",     icon: <BookOpen size={15} />,   color: "#22c55e" },
  { id: "automation",   label: "Automation Service",   icon: <Sparkles size={15} />,   color: "#a855f7" },
  { id: "execution",    label: "Execution History",    icon: <History size={15} />,    color: "#06b6d4" },
  { id: "queries",      label: "Queries",              icon: <Database size={15} /> },
  { id: "my-policies",  label: "My Policies",          icon: <Briefcase size={15} />,  color: "#f43f5e" },
  { id: "admin",        label: "Administration",       icon: <Settings size={15} /> },
];

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function KaiPlayground() {
  const { address } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const [activeSection, setActiveSection]   = useState<ServiceSection>("quick-start");
  const [activeTab, setActiveTab]           = useState<"transaction"|"query">("transaction");
  const [searchQuery, setSearchQuery]       = useState("");
  const [selectedOp, setSelectedOp]         = useState<Operation | null>(OPERATIONS[0]);
  const [formValues, setFormValues]         = useState<Record<string,any>>({});
  const [customParams, setCustomParams]     = useState<{key:string;value:string}[]>([]);
  const [isRunning, setIsRunning]           = useState(false);
  const [terminal, setTerminal]             = useState<TermLine[]>([]);
  const [execHistory, setExecHistory]       = useState<ExecResult[]>([]);
    const [policies, setPolicies]             = useState<any[]>([]);
  const [currentExec, setCurrentExec]       = useState<ExecResult|null>(null);
  const [rightTab, setRightTab]             = useState<"terminal"|"result"|"payload">("terminal");
  const [aiPrompt, setAiPrompt]             = useState("");
  const [aiDraft, setAiDraft]               = useState("");
  const [aiLoading, setAiLoading]           = useState(false);
  const [aiAvailable, setAiAvailable]       = useState<boolean | null>(null); // null = unchecked

  // Build-Policy state (unified from /policy page)
  const [bpTemplate, setBpTemplate]         = useState("pension");
  const [bpFields, setBpFields]             = useState<Record<string,string>>({});
  const [bpSubmitting, setBpSubmitting]     = useState(false);
  const [bpStatus, setBpStatus]             = useState("");
  const [bpTxUrl, setBpTxUrl]               = useState<string|null>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const lineId  = useRef(0);

  const log = useCallback((type: TermLine["type"], text: string, link?: TermLine["link"]) => {
    lineId.current++;
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setTerminal(prev => [...prev, { id: lineId.current, type, text, link, ts }]);
  }, []);

  // Scroll terminal to bottom
  const fetchPolicies = async () => {
      try {
        const res = await fetch("/api/policies");
        if (res.ok) {
          const data = await res.json();
          setPolicies(data.policies || []);
        }
      } catch (err) {}
    };

    useEffect(() => {
      fetchPolicies(); termRef.current?.scrollTo({ top: termRef.current.scrollHeight, behavior: "smooth" }); }, [terminal]);

  // Load op form defaults
  useEffect(() => {
    if (!selectedOp) return;
    const vals: Record<string,any> = {};
    // Apply template if available
    if (selectedOp.template) Object.assign(vals, selectedOp.template);
    // Apply field defaults (overriding only if not in template)
    selectedOp.fields.forEach(f => { if (!(f.key in vals)) vals[f.key] = f.default; });
    setFormValues(vals);
    setCustomParams([]);
  }, [selectedOp]);

  // Filtered ops for current section
  const filteredOps = useMemo(() => {
    let ops: Operation[] = [];
    if (activeSection === "quick-start")  ops = OPERATIONS.filter(o => o.category === "quick");
    else if (activeSection === "build-policy") return [];
    else if (activeSection === "templates") ops = OPERATIONS.filter(o => o.category === "template");
    else if (activeSection === "automation") ops = [];
    else if (activeSection === "queries") ops = OPERATIONS.filter(o => o.category === "query");
    else if (activeSection === "execution") return [];
    else if (activeSection === "admin") return [];
    else {
      ops = OPERATIONS.filter(o => o.service === activeSection && (o.category === activeTab || (activeTab === "transaction" && o.category === "quick")));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return ops.filter(o => o.name.toLowerCase().includes(q) || o.description.toLowerCase().includes(q));
    }
    return ops;
  }, [activeSection, activeTab, searchQuery]);

  const globalSearchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return OPERATIONS.filter(o => o.name.toLowerCase().includes(q) || o.description.toLowerCase().includes(q)).slice(0, 12);
  }, [searchQuery]);

  const accentColor = NAV.find(n => n.id === activeSection)?.color ?? "#c9a24b";

  const askPolicyAssistant = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiDraft("");
    try {
      // Quick health check first
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://127.0.0.1:8000";
      const health = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
      if (!health?.ok) {
        setAiAvailable(false);
        setAiDraft("AI assistant offline - start the agent server to enable suggestions.\nYour policy will still work without it.");
        return;
      }
      setAiAvailable(true);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Help configure this ${selectedOp?.name || "policy"}. Give concise, practical field recommendations for: ${aiPrompt}`,
          rag: true,
          stream: false,
        }),
      });
      const data = await response.json();
      setAiDraft(data.text || data.response || "No recommendation returned.");
    } catch {
      setAiDraft("AI assistant unavailable. Your policy works without it.");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Create Policy Flow ─────────────────────────────────
  const handleExecute = async () => {
    if (!selectedOp) return;
    setIsRunning(true);
    setRightTab("terminal");
    setMobilePanel("terminal");

    const owner = address || formValues.owner || formValues.settlor || formValues.memberAccount || OWNER_ACCOUNT;
    const exec: ExecResult = {
      id: `exec_${Math.random().toString(36).slice(2, 10)}`,
      opName: selectedOp.name,
      policyId: `pol_${Math.random().toString(36).slice(2, 10)}`,
      status: "running",
      logs: [],
      startedAt: new Date().toISOString(),
      payerAccount: owner,
      txHash: "",
    };
    setCurrentExec(exec);

    try {
      if (!address) throw new Error("Connect a wallet before creating a policy.");
      await switchChainAsync({ chainId: FUJI_CHAIN_ID });
      log("info", `[Policy] ${selectedOp.name} prepared for Avalanche Fuji Testnet`);
      log("info", `Treasury: ${TREASURY_ADDRESS}`);
      const txHash = await sendTransactionAsync({ to: TREASURY_ADDRESS, value: parseEther(POLICY_FEE_AVAX) });
      exec.txId = txHash;
      exec.txHash = txHash;
      exec.explorerUrl = `https://testnet.snowtrace.io/tx/${txHash}`;
      exec.avaxFee = `${POLICY_FEE_AVAX} AVAX`;
      exec.platformFee = `${POLICY_FEE_AVAX} AVAX`;
      const saved = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          serviceType: selectedOp.service,
          config: { operation: selectedOp.id, ...formValues, customParams },
          paymentAmount: Number(POLICY_FEE_AVAX),
          paymentTxHash: txHash,
        }),
      });
      if (!saved.ok) throw new Error("Policy backend could not save the transaction.");
      exec.status = "completed";
      exec.confirmedAt = new Date().toISOString();
      exec.finishedAt = new Date().toISOString();
      log("success", `[Policy] ${exec.policyId} registered after treasury payment`);
      log("info", `Transaction: ${txHash}`);
      setCurrentExec({ ...exec });
      setExecHistory(prev => [{ ...exec }, ...prev]);
      setRightTab("result");
    } catch (err: any) {
      log("error", `[Error] ${err.message}`);
      exec.status = "failed";
      exec.finishedAt = new Date().toISOString();
      setCurrentExec({ ...exec });
      setExecHistory(prev => [{ ...exec }, ...prev]);
    } finally {
      setIsRunning(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────
  useEffect(() => {
      if (activeSection === "my-policies") fetchPolicies();
    }, [activeSection]);

    const selectOp = (op: Operation) => {
    setSelectedOp(op);
    // auto-navigate to correct section
    if (op.category === "template") setActiveSection("templates");
    else if (op.category === "quick") setActiveSection("quick-start");
    else if (op.category === "query") setActiveSection("queries");
    else setActiveSection(op.service as ServiceSection);
    setMobilePanel("form");
  };

  const payload = {
    network: "testnet",
    serviceType: selectedOp?.service,
    operationId: selectedOp?.id,
    timestamp: new Date().toISOString(),
    parameters: {
      ...formValues,
      ...customParams.reduce((a,c) => { if (c.key.trim()) a[c.key] = c.value; return a; }, {} as Record<string,any>),
    },
  };

  // ── STATUS COLOR ──────────────────────────────────────
  const statusColor = (s?: ExecResult["status"]) =>
    s === "completed" ? "#22c55e" : s === "failed" ? "#ef4444" : s === "running" ? "#f59e0b" : "#60a5fa";

  // ── Mobile panel state (which of the 4 panels is visible) ──────────────────
  const [mobilePanel, setMobilePanel] = useState<"nav"|"ops"|"form"|"terminal">("nav");

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", background:"#080c09", color:"#fff", fontFamily:"'Inter',system-ui,sans-serif", overflow:"hidden" }}>

      {/* ── MOBILE TOP BAR (hidden on desktop) ─────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)", background:"#0b0f0c", flexShrink:0 }} className="mobile-topbar">
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:15, fontWeight:900, letterSpacing:"-0.5px" }}>
            <span style={{ color:"#10b981" }}>KAI</span>VAX
          </span>
          <span style={{ fontSize:8, background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.3)", color:"#10b981", borderRadius:4, padding:"1px 5px", textTransform:"uppercase", letterSpacing:"0.5px" }}>Policy</span>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {([
            { id:"nav",      label:"Menu",    icon:<Shield size={14}/> },
            { id:"ops",      label:"Ops",     icon:<Database size={14}/> },
            { id:"form",     label:"Config",  icon:<FileText size={14}/> },
            { id:"terminal", label:"Log",     icon:<TerminalSquare size={14}/> },
          ] as const).map(p => (
            <button key={p.id} onClick={() => setMobilePanel(p.id)} style={{
              display:"flex", flexDirection:"column", alignItems:"center", gap:2,
              padding:"5px 8px", borderRadius:8, border:"none", cursor:"pointer",
              background: mobilePanel===p.id ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
              color: mobilePanel===p.id ? "#10b981" : "rgba(255,255,255,0.38)",
            }}>
              {p.icon}
              <span style={{ fontSize:8, fontWeight:700, letterSpacing:0.3 }}>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", flex: 1, minHeight: 0, width:"100%" }}>

      {/* ── LEFT SIDEBAR ──────────────────────────────── */}
      <div style={{ width:"min(220px, 40vw)", flexShrink:0, borderRight:"1px solid rgba(255,255,255,0.07)", display:"flex", flexDirection:"column", background:"#0b0f0c" }} className={`panel-sidebar ${mobilePanel === "nav" ? "mobile-show" : "mobile-hide"}`}>
        
        {/* Logo (desktop only) */}
        <div style={{ padding:"16px 16px 12px", borderBottom:"1px solid rgba(255,255,255,0.06)" }} className="desktop-only">
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"16px", fontWeight:"900", letterSpacing:"-0.5px" }}>
              <span style={{ color:"#10b981" }}>KAI</span>VAX
            </span>
            <span style={{ fontSize:"9px", background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.3)", color:"#10b981", borderRadius:"4px", padding:"1px 5px", textTransform:"uppercase", letterSpacing:"0.5px" }}>Playground</span>
          </div>
          <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.25)", marginTop:"4px" }}>Policy Execution Engine</div>
        </div>

        {/* Global Search */}
        <div style={{ padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,0.05)", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"7px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:"6px", padding:"6px 10px" }}>
            <Search size={12} color="rgba(255,255,255,0.35)" />
            <input
              type="text"
              placeholder="Search operations…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ background:"none", border:"none", outline:"none", fontSize:"12px", color:"#fff", width:"100%", "::placeholder":{ color:"rgba(255,255,255,0.3)" } } as any}
            />
            {searchQuery && <button onClick={() => setSearchQuery("")} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", padding:0 }}><X size={11} /></button>}
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && globalSearchResults.length > 0 && (
            <div style={{ position:"absolute", top:"100%", left:"12px", right:"12px", background:"#131a14", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", zIndex:50, maxHeight:"260px", overflowY:"auto", boxShadow:"0 8px 24px rgba(0,0,0,0.5)" }}>
              {globalSearchResults.map(op => (
                <button key={op.id} onClick={() => { selectOp(op); setSearchQuery(""); }}
                  style={{ width:"100%", background:"none", border:"none", borderBottom:"1px solid rgba(255,255,255,0.05)", padding:"10px 12px", textAlign:"left", cursor:"pointer", display:"block" }}>
                  <div style={{ fontSize:"12px", color:"#fff", fontWeight:"500" }}>{op.name}</div>
                  <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.35)", marginTop:"2px" }}>{op.service} · {op.category}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nav Items */}
        <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
          {NAV.map(nav => {
            const isActive = activeSection === nav.id;
            const color    = nav.color ?? "rgba(255,255,255,0.5)";
            return (
              <button key={nav.id} onClick={() => { setActiveSection(nav.id); setSearchQuery(""); setMobilePanel("ops"); }}
                style={{ width:"100%", background: isActive ? `${color}12` : "transparent", border:`1px solid ${isActive ? color + "30" : "transparent"}`, borderRadius:"6px", padding:"8px 10px", textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px", color: isActive ? color : "rgba(255,255,255,0.45)", marginBottom:"2px", transition:"all 0.15s" }}>
                <span style={{ color: isActive ? color : "rgba(255,255,255,0.3)" }}>{nav.icon}</span>
                <span style={{ fontSize:"12px", fontWeight: isActive ? "600" : "400" }}>{nav.label}</span>
                {nav.id === "execution" && execHistory.length > 0 && (
                  <span style={{ marginLeft:"auto", background: isActive ? color+"30" : "rgba(255,255,255,0.1)", borderRadius:"20px", padding:"1px 6px", fontSize:"10px", color: isActive ? color : "rgba(255,255,255,0.4)" }}>{execHistory.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Testnet Status */}
        <div style={{ padding:"10px 12px", borderTop:"1px solid rgba(255,255,255,0.06)", fontSize:"10px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"5px", marginBottom:"4px", color:"rgba(255,255,255,0.4)" }}>
            <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#22c55e" }} />
            Avalanche Fuji Testnet
          </div>
          <div style={{ color:"rgba(255,255,255,0.2)" }}>Wallet connected · Treasury enabled</div>
        </div>
      </div>

      {/* ── CENTER: Op List ───────────────────────────── */}
      <div style={{ width:"260px", flexShrink:0, borderRight:"1px solid rgba(255,255,255,0.07)", display:"flex", flexDirection:"column", background:"#0c100d" }} className={`panel-ops ${mobilePanel === "ops" ? "mobile-show" : "mobile-hide"}`}>

        {/* Section Header */}
        <div style={{ padding:"12px 14px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"2px" }}>
            <span style={{ color: accentColor }}>{NAV.find(n => n.id === activeSection)?.icon}</span>
            <span style={{ fontSize:"13px", fontWeight:"700", color:"#fff" }}>{NAV.find(n => n.id === activeSection)?.label}</span>
          </div>
          <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.3)" }}>
            {activeSection === "insurance" ? "24 operations" : activeSection === "trust" ? "18 operations" : activeSection === "pension" ? "15 operations" : activeSection === "templates" ? "11 templates" : ""}
          </div>
        </div>

        {/* Transactions / Queries Tabs */}
        {["insurance","trust","pension","queries"].includes(activeSection) && (
          <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"0 14px" }}>
            {(["transaction","query"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ flex:1, background:"none", border:"none", borderBottom:`2px solid ${activeTab===tab ? accentColor : "transparent"}`, padding:"8px 0", fontSize:"11px", fontWeight: activeTab===tab ? "600" : "400", color: activeTab===tab ? accentColor : "rgba(255,255,255,0.35)", cursor:"pointer", textTransform:"capitalize", transition:"all 0.15s" }}>
                {tab === "transaction" ? "Transactions" : "Queries"}
              </button>
            ))}
          </div>
        )}

        {/* Operation List */}
        <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
          {activeSection === "build-policy" ? (
            <div style={{ padding:"10px" }}>
              <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:"10px" }}>Policy Types</div>
              {Object.entries(BP_TEMPLATES).map(([id, t]) => {
                const isActive = bpTemplate === id;
                const Icon = t.icon;
                return (
                  <button key={id} onClick={() => { setBpTemplate(id); setBpFields({}); setBpStatus(""); }}
                    style={{ width:"100%", background: isActive ? `${t.color}18` : "rgba(255,255,255,0.02)", border:`1px solid ${isActive ? t.color+"40" : "rgba(255,255,255,0.05)"}`, borderRadius:"6px", padding:"9px 11px", textAlign:"left", cursor:"pointer", marginBottom:"4px", display:"flex", alignItems:"center", gap:"8px", transition:"all 0.15s" }}>
                    <Icon size={14} color={isActive ? t.color : "rgba(255,255,255,0.4)"} />
                    <span style={{ fontSize:"12px", fontWeight:"600", color: isActive ? t.color : "#d4d4d4" }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          ) : activeSection === "execution" ? (
            <div>
              <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.5px", padding:"4px 6px 8px" }}>Execution History</div>
              {execHistory.length === 0 ? (
                <div style={{ padding:"20px 10px", textAlign:"center", color:"rgba(255,255,255,0.2)", fontSize:"12px" }}>No executions yet</div>
              ) : execHistory.map((ex, i) => (
                <button key={ex.id} onClick={() => { setCurrentExec(ex); setRightTab("result"); }}
                  style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"6px", padding:"10px", textAlign:"left", cursor:"pointer", marginBottom:"6px", display:"block" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"3px" }}>
                    <span style={{ fontSize:"11px", fontWeight:"600", color:"#fff" }}>#{execHistory.length - i} {ex.opName}</span>
                    <span style={{ fontSize:"10px", color: statusColor(ex.status), textTransform:"uppercase" }}>{ex.status}</span>
                  </div>
                  <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)", fontFamily:"monospace" }}>{ex.policyId || "Pending"}</div>
                </button>
              ))}
            </div>
          ) : activeSection === "automation" ? (
            <div style={{ padding:"20px 10px", textAlign:"center" }}>
              <Sparkles size={24} color="#a855f7" style={{ margin:"0 auto 8px" }} />
              <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.4)", marginBottom:"4px" }}>Automation Engine</div>
              <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.2)" }}>Event-driven policy triggers coming in v2</div>
            </div>
          ) : activeSection === "admin" ? (
            <div style={{ padding:"16px 10px" }}>
              {[["Network", "Avalanche Fuji Testnet"],["Treasury", TREASURY_ADDRESS],["Engine Wallet", KAI_ACCOUNT]].map(([k,v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color:"rgba(255,255,255,0.4)" }}>{k}</span>
                  <span style={{ color:"rgba(255,255,255,0.7)", fontFamily:"monospace" }}>{v}</span>
                </div>
              ))}
            </div>
          ) : activeSection === "my-policies" ? (
            <div style={{ padding:"10px" }}>
              <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:"8px" }}>Active Policies</div>
              {policies.length === 0 ? (
                <div style={{ padding:"20px 10px", textAlign:"center", color:"rgba(255,255,255,0.2)", fontSize:"12px" }}>No policies found</div>
              ) : policies.map(p => (
                <button key={p.policyId} onClick={() => {
                  setSelectedOp(null);
                  setRightTab("payload");
                  setCurrentExec(null);
                }}
                  style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"6px", padding:"10px", textAlign:"left", cursor:"pointer", marginBottom:"6px", display:"block" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"3px" }}>
                    <span style={{ fontSize:"11px", fontWeight:"600", color:"#fff" }}>{p.config?.policyTitle || p.config?.planTitle || p.config?.trustName || p.policyId}</span>
                    <span style={{ fontSize:"10px", color:"#22c55e", textTransform:"uppercase" }}>{p.status}</span>
                  </div>
                  <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)", fontFamily:"monospace" }}>{p.serviceType}</div>
                </button>
              ))}
            </div>
          ) : filteredOps.length === 0 ? (
            <div style={{ padding:"20px 10px", textAlign:"center", color:"rgba(255,255,255,0.2)", fontSize:"12px" }}>No operations found</div>
          ) : (
            filteredOps.map(op => {
              const isSelected = selectedOp?.id === op.id;
              return (
                <button key={op.id} onClick={() => selectOp(op)}
                  style={{ width:"100%", background: isSelected ? `${accentColor}18` : "rgba(255,255,255,0.02)", border:`1px solid ${isSelected ? accentColor+"40" : "rgba(255,255,255,0.05)"}`, borderRadius:"6px", padding:"10px 12px", textAlign:"left", cursor:"pointer", marginBottom:"4px", display:"flex", alignItems:"center", justifyContent:"space-between", transition:"all 0.15s" }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"2px" }}>
                      <span style={{ fontSize:"12px", fontWeight:"600", color: isSelected ? accentColor : "#d4d4d4" }}>{op.name}</span>
                      {op.badge && <span style={{ fontSize:"9px", background:`${accentColor}20`, color:accentColor, borderRadius:"3px", padding:"1px 5px" }}>{op.badge}</span>}
                    </div>
                    <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)" }}>
                      {op.category === "template" ? "Template" : op.fields.length + " params"}
                    </div>
                  </div>
                  <ChevronRight size={13} color={isSelected ? accentColor : "rgba(255,255,255,0.2)"} />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── CENTER: Config Form ───────────────────────── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, borderRight:"1px solid rgba(255,255,255,0.07)" }} className={`panel-form ${mobilePanel === "form" ? "mobile-show" : "mobile-hide"}`}>
        
        {/* Op Title + Execute button — stacks on narrow screens, see .op-header in <style> below */}
        <div className="op-header" style={{ padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.07)", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, background:"rgba(255,255,255,0.01)", flexShrink:0 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"3px", flexWrap:"wrap" }}>
              <span style={{ color: accentColor }}>{NAV.find(n => n.id === activeSection)?.icon}</span>
              <h2 style={{ margin:0, fontSize:"15px", fontWeight:"700" }}>{selectedOp?.name ?? "Select an Operation"}</h2>
              {selectedOp?.badge && <span style={{ fontSize:"10px", background:`${accentColor}20`, color:accentColor, borderRadius:"4px", padding:"2px 7px" }}>{selectedOp.badge}</span>}
            </div>
            <p style={{ margin:0, fontSize:"12px", color:"rgba(255,255,255,0.4)" }}>{selectedOp?.description ?? "Choose an operation from the left panel"}</p>
          </div>

          <div className="op-header-actions" style={{ display:"flex", gap:"10px", alignItems:"center", flexShrink:0 }}>
            {/* Tabs for form vs JSON */}
            <div style={{ display:"flex", background:"rgba(255,255,255,0.06)", borderRadius:"6px", padding:"2px" }}>
              {(["form","payload"] as const).map(t => (
                <button key={t} onClick={() => setRightTab(t as any)}
                  style={{ background: rightTab===t ? "rgba(255,255,255,0.12)" : "transparent", border:"none", cursor:"pointer", color: rightTab===t ? "#fff" : "rgba(255,255,255,0.4)", padding:"4px 10px", borderRadius:"4px", fontSize:"11px", display:"flex", alignItems:"center", gap:"4px" }}>
                  {t === "form" ? <><FileText size={11} /> Configure</> : <><Code size={11} /> Payload</>}
                </button>
              ))}
            </div>

            <button onClick={handleExecute} disabled={isRunning || !selectedOp}
              style={{ background: accentColor, color:"#fff", border:"none", borderRadius:"7px", padding:"9px 22px", fontSize:"13px", fontWeight:"700", cursor: isRunning ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", opacity: isRunning ? 0.7 : 1, transition:"opacity 0.2s", whiteSpace:"nowrap" }}>
              {isRunning ? <><Loader size={14} style={{ animation:"spin 1s linear infinite" }} /> Running…</> : <><Play size={14} /> Execute</>}
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px" }}>
          <div style={{ maxWidth:"520px", marginBottom:"18px", padding:"12px", background:"rgba(59,130,246,0.08)", border:"1px solid rgba(96,165,250,0.25)", borderRadius:"8px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"8px" }}>
              <Sparkles size={13} color="#60a5fa" />
              <span style={{ fontSize:"12px", fontWeight:"700", color:"#60a5fa" }}>Policy Assistant</span>
              <span style={{ fontSize:"9px", color:"rgba(255,255,255,0.25)", marginLeft:"auto" }}>
                {aiAvailable === false ? "● offline" : aiAvailable === true ? "● online" : "optional"}
              </span>
            </div>
            <div style={{ display:"flex", gap:"7px" }}>
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") askPolicyAssistant(); }} placeholder="Describe what you need. AI will suggest field values..."
                style={{ flex:1, background:"rgba(0,0,0,0.25)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"6px", padding:"8px 10px", fontSize:"12px", color:"#fff", outline:"none" }} />
              <button onClick={askPolicyAssistant} disabled={aiLoading || !aiPrompt.trim()} style={{ background: aiAvailable === false ? "rgba(255,255,255,0.08)" : "#2563eb", color:"#fff", border:"none", borderRadius:"6px", padding:"8px 12px", fontSize:"11px", cursor: aiLoading || !aiPrompt.trim() ? "not-allowed" : "pointer", opacity: aiLoading ? 0.6 : 1 }}>
                {aiLoading ? "Thinking…" : "Ask AI"}
              </button>
            </div>
            {aiDraft && <div style={{ whiteSpace:"pre-wrap", marginTop:"9px", fontSize:"11px", lineHeight:1.5, color: aiAvailable === false ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.7)" }}>{aiDraft}</div>}
          </div>
          {/* ── BUILD POLICY section takes over the form area ── */}
          {activeSection === "build-policy" ? (
            <BuildPolicyPanel
              templateId={bpTemplate}
              fields={bpFields}
              setFields={setBpFields}
              status={bpStatus}
              setStatus={setBpStatus}
              txUrl={bpTxUrl}
              setTxUrl={setBpTxUrl}
              submitting={bpSubmitting}
              setSubmitting={setBpSubmitting}
              address={address}
              sendTransactionAsync={sendTransactionAsync}
              switchChainAsync={switchChainAsync}
              policies={policies}
              refreshPolicies={fetchPolicies}
            />
          ) : rightTab === "payload" ? (
            <pre style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"8px", padding:"16px", fontFamily:"'JetBrains Mono',monospace", fontSize:"12px", color:"#60a5fa", lineHeight:"1.6", overflow:"auto", margin:0 }}>
              {JSON.stringify(payload, null, 2)}
            </pre>
          ) : (
            <div style={{ maxWidth:"520px", display:"grid", gap:"14px" }}>
              {selectedOp?.category === "template" ? (
                <div style={{ background:`${accentColor}12`, border:`1px solid ${accentColor}30`, borderRadius:"8px", padding:"14px 16px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"6px" }}>
                    <CheckCircle size={14} color={accentColor} />
                    <span style={{ fontSize:"12px", fontWeight:"600", color:accentColor }}>Template Auto-Configured</span>
                  </div>
                  <p style={{ margin:0, fontSize:"12px", color:"rgba(255,255,255,0.5)" }}>All fields have been pre-filled with {selectedOp.name} defaults. Review below and click Execute to deploy.</p>
                </div>
              ) : null}

              {selectedOp?.fields.map(field => (
                <div key={field.key}>
                  <label style={{ display:"block", fontSize:"12px", fontWeight:"500", color:"rgba(255,255,255,0.65)", marginBottom:"5px" }}>
                    {field.label}
                    {field.required && <span style={{ color:accentColor, marginLeft:"3px" }}>*</span>}
                  </label>

                  {field.type === "text" && (
                    <input type="text" value={formValues[field.key] ?? ""} onChange={e => setFormValues(p => ({...p,[field.key]:e.target.value}))}
                      style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"6px", padding:"8px 12px", fontSize:"13px", color:"#fff", outline:"none", boxSizing:"border-box" }} />
                  )}
                  {field.type === "number" && (
                    <input type="number" value={formValues[field.key] ?? 0} onChange={e => setFormValues(p => ({...p,[field.key]:parseFloat(e.target.value)}))}
                      style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"6px", padding:"8px 12px", fontSize:"13px", color:"#fff", outline:"none", boxSizing:"border-box" }} />
                  )}
                  {field.type === "select" && field.options && (
                    <select value={formValues[field.key] ?? field.default} onChange={e => setFormValues(p => ({...p,[field.key]:e.target.value}))}
                      style={{ width:"100%", background:"#111815", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"6px", padding:"8px 12px", fontSize:"13px", color:"#fff", outline:"none", boxSizing:"border-box" }}>
                      {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}
                  {field.type === "boolean" && (
                    <button type="button" onClick={() => setFormValues(p => ({...p,[field.key]:!p[field.key]}))}
                      style={{ background: formValues[field.key] ? `${accentColor}25` : "rgba(255,255,255,0.07)", border:`1px solid ${formValues[field.key] ? accentColor : "rgba(255,255,255,0.15)"}`, borderRadius:"20px", padding:"5px 16px", fontSize:"12px", color: formValues[field.key] ? accentColor : "rgba(255,255,255,0.4)", cursor:"pointer" }}>
                      {formValues[field.key] ? "✓ ENABLED" : "DISABLED"}
                    </button>
                  )}
                  {field.hint && <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)", marginTop:"3px" }}>{field.hint}</div>}
                </div>
              ))}

              {/* Custom Params */}
              {selectedOp && selectedOp.category !== "template" && (
                <div style={{ marginTop:"8px", paddingTop:"14px", borderTop:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
                    <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.5)" }}>Custom Policy Attributes</div>
                    <button onClick={() => setCustomParams(p => [...p, {key:`attr_${p.length+1}`, value:""}])}
                      style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"5px", padding:"4px 9px", fontSize:"11px", color:"rgba(255,255,255,0.5)", cursor:"pointer", display:"flex", alignItems:"center", gap:"4px" }}>
                      <Plus size={11} /> Add Attribute
                    </button>
                  </div>
                  {customParams.map((cp, i) => (
                    <div key={i} style={{ display:"flex", gap:"8px", marginBottom:"7px", alignItems:"center" }}>
                      <input type="text" placeholder="key" value={cp.key} onChange={e => setCustomParams(p => p.map((x,j) => j===i ? {...x,key:e.target.value} : x))}
                        style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"5px", padding:"6px 10px", fontSize:"11px", color:"#fff", outline:"none" }} />
                      <input type="text" placeholder="value" value={cp.value} onChange={e => setCustomParams(p => p.map((x,j) => j===i ? {...x,value:e.target.value} : x))}
                        style={{ flex:1, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"5px", padding:"6px 10px", fontSize:"11px", color:"#fff", outline:"none" }} />
                      <button onClick={() => setCustomParams(p => p.filter((_,j) => j!==i))} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer" }}><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fuji Policy Status — horizontally scrollable so the treasury address never gets clipped on narrow screens */}
        <div style={{ padding:"10px 20px", borderTop:"1px solid rgba(255,255,255,0.06)", background:"rgba(255,255,255,0.01)", display:"flex", gap:"16px", flexShrink:0, overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
          {[["Fuji","Avalanche testnet"],["Wallet","User-signed"],["Treasury",TREASURY_ADDRESS],["AI", aiAvailable === false ? "offline (optional)" : aiAvailable === true ? "online" : "optional"]].map(([k,v]) => (
            <div key={k} style={{ fontSize:"10px", display:"flex", flexDirection:"column", gap:"1px", flexShrink:0 }}>
              <span style={{ color:"rgba(255,255,255,0.5)", fontWeight:"600" }}>{k}</span>
              <span style={{ color:"rgba(255,255,255,0.25)", fontFamily: k === "Treasury" ? "monospace" : undefined }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      </div>
      {/* ── BOTTOM: Activity + Result ──────────────────── */}
      <div style={{ height:"min(280px, 35dvh)", flexShrink:0, display:"flex", flexDirection:"column", background:"#0a0e0b", borderTop:"1px solid rgba(255,255,255,0.1)" }} className={`panel-terminal ${mobilePanel === "terminal" ? "mobile-show" : "mobile-hide"}`}>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
          {(["terminal","result"] as const).map(t => (
            <button key={t} onClick={() => setRightTab(t)}
              style={{ flex:1, background:"none", border:"none", borderBottom:`2px solid ${rightTab===t ? accentColor : "transparent"}`, padding:"10px 8px", fontSize:"11px", fontWeight: rightTab===t ? "600" : "400", color: rightTab===t ? accentColor : "rgba(255,255,255,0.35)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"5px", transition:"all 0.15s" }}>
              {t === "terminal" ? <><TerminalSquare size={12} /> Activity</> : <><CheckCircle size={12} /> Result</>}
            </button>
          ))}
        </div>

        {rightTab === "terminal" ? (
          <div ref={termRef} style={{ flex:1, overflowY:"auto", padding:"12px 14px", fontFamily:"'JetBrains Mono',monospace", fontSize:"11px", lineHeight:"1.6" }}>
            <div style={{ color:"rgba(255,255,255,0.2)", marginBottom:"10px" }}>{"// KAI Policy Workspace · Avalanche Fuji"}</div>
            {terminal.length === 0 && <div style={{ color:"rgba(255,255,255,0.2)" }}>Select an operation and click Execute to begin.</div>}
            {terminal.map(l => (
              <div key={l.id} style={{ marginBottom:"3px", wordBreak:"break-all" }}>
                <span style={{ color:"rgba(255,255,255,0.2)", marginRight:"6px", fontSize:"10px" }}>{l.ts}</span>
                <span style={{ color: l.type==="cmd"?"#c9a24b":l.type==="success"?"#22c55e":l.type==="warn"?"#f59e0b":l.type==="error"?"#ef4444":l.type==="receipt"?"#60a5fa":"rgba(255,255,255,0.55)" }}>
                  {l.type==="cmd" && "$ "}
                  {l.text}
                </span>
                {l.link && (
                  <a href={l.link.url} target="_blank" rel="noopener noreferrer" style={{ color:"#60a5fa", textDecoration:"underline", marginLeft:"6px", fontSize:"11px" }}>
                    {l.link.label} <ExternalLink size={9} style={{ verticalAlign:"middle" }} />
                  </a>
                )}
              </div>
            ))}
            {isRunning && (
              <div style={{ color:"#a78bfa", display:"flex", alignItems:"center", gap:"6px", marginTop:"6px" }}>
                <Loader size={12} style={{ animation:"spin 1s linear infinite" }} /> Waiting for wallet confirmation…
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex:1, overflowY:"auto", padding:"14px" }}>
            {!currentExec ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:"rgba(255,255,255,0.2)", fontSize:"12px" }}>
                <CheckCircle size={28} color="rgba(255,255,255,0.1)" style={{ display:"block", margin:"0 auto 10px" }} />
                Execute an operation to see results here
              </div>
            ) : (
              <div style={{ display:"grid", gap:"10px" }}>
                {/* Status Banner */}
                <div style={{ background: `${statusColor(currentExec.status)}15`, border:`1px solid ${statusColor(currentExec.status)}40`, borderRadius:"8px", padding:"12px 14px", display:"flex", alignItems:"center", gap:"10px" }}>
                  {currentExec.status === "completed" ? <CheckCircle size={18} color="#22c55e" /> : currentExec.status === "failed" ? <XCircle size={18} color="#ef4444" /> : <Loader size={18} color="#f59e0b" style={{ animation:"spin 1s linear infinite" }} />}
                  <div>
                    <div style={{ fontSize:"13px", fontWeight:"700", color: statusColor(currentExec.status), textTransform:"uppercase" }}>{currentExec.status}</div>
                    <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.4)" }}>{currentExec.opName}</div>
                  </div>
                </div>

                {/* Fields Table */}
                {currentExec.explorerUrl && (
                  <a href={currentExec.explorerUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(59,130,246,0.1)", border:"1px solid rgba(59,130,246,0.25)", borderRadius:"7px", padding:"10px 14px", textDecoration:"none" }}>
                    <div>
                      <div style={{ fontSize:"12px", fontWeight:"600", color:"#60a5fa" }}>Open Fuji Transaction</div>
                      <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.35)" }}>View on Snowtrace</div>
                    </div>
                    <ExternalLink size={14} color="#60a5fa" />
                  </a>
                )}

                {[
                  ["ID",             currentExec.txId || currentExec.id],
                  ["Type",           "Crypto Transfer"],
                  ["Confirmed at",    currentExec.confirmedAt ? currentExec.confirmedAt.slice(0,19).replace("T"," ") : "Not confirmed yet"],
                  ["Transaction Hash", currentExec.txHash || "Pending"],
                  ["Network",         "Avalanche Fuji"],
                  ["Treasury",        TREASURY_ADDRESS],
                  ["Memo",           currentExec.opName],
                  ["Payer Account",  currentExec.payerAccount || "Not set"],
                  ["AVAX Fee",        currentExec.avaxFee || "Pending"],
                  ["Policy ID",      currentExec.policyId || "Pending"],
                  ["Treasury Payment", currentExec.platformFee || "Pending"],
                ].map(([k,v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color:"rgba(255,255,255,0.4)" }}>{k}</span>
                    <span style={{ color:"rgba(255,255,255,0.8)", fontFamily:"monospace" }}>{v}</span>
                  </div>
                ))}

              </div>
            )}
          </div>
        )}
      </div>

      {/* Spin animation + responsive layout */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Mobile: show only the active panel ── */
        @media (max-width: 767px) {
          .mobile-topbar { display: flex !important; }
          .desktop-only  { display: none !important; }

          /* Op header: title on its own row, tabs + Execute below it —
             fixes Execute being clipped off the right edge on narrow screens */
          .op-header { flex-direction: column !important; align-items: stretch !important; }
          .op-header-actions { justify-content: space-between !important; }

          /* Sidebar / ops panel become full-width when active */
          .panel-sidebar, .panel-ops {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            z-index: 20 !important;
            overflow-y: auto !important;
          }
          .panel-form {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            z-index: 20 !important;
            overflow-y: auto !important;
          }
          .panel-terminal {
            position: fixed !important;
            inset: 0 !important;
            height: 100dvh !important;
            width: 100% !important;
            z-index: 20 !important;
          }

          /* All panels hidden by default on mobile */
          .panel-sidebar.mobile-hide,
          .panel-ops.mobile-hide,
          .panel-form.mobile-hide,
          .panel-terminal.mobile-hide { display: none !important; }

          .panel-sidebar.mobile-show,
          .panel-ops.mobile-show,
          .panel-form.mobile-show,
          .panel-terminal.mobile-show { display: flex !important; flex-direction: column !important; }

          /* Account for the mobile topbar height */
          .panel-sidebar.mobile-show,
          .panel-ops.mobile-show,
          .panel-form.mobile-show,
          .panel-terminal.mobile-show {
            top: 52px !important;
          }
        }

        /* ── Desktop: hide mobile topbar, show all panels ── */
        @media (min-width: 768px) {
          .mobile-topbar  { display: none !important; }
          .desktop-only   { display: block !important; }
          .panel-sidebar  { display: flex !important; }
          .panel-ops      { display: flex !important; }
          .panel-form     { display: flex !important; }
          .panel-terminal { display: flex !important; }
          .mobile-hide, .mobile-show { /* reset: all visible */ }
        }
      `}</style>
    </div>
  );
}

// ─── SERVICE TEMPLATES for Build Policy (single source of truth: also
// drives the template picker list in the sidebar, so there is one place
// to add or edit a policy type) ────────────────────────────────────────
const BP_TEMPLATES: Record<string, {
  icon: React.ComponentType<{ size?: number; color?: string }>; label: string; color: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}> = {
  pension:  { icon: PiggyBank,  label:"KAIVAX Pension",    color:"#A78BFA",
    fields:[{key:"vestingYears",label:"Vesting period (years)",placeholder:"5",type:"number"},{key:"monthlyDeposit",label:"Monthly deposit (NVR)",placeholder:"100",type:"number"},{key:"beneficiary",label:"Beneficiary address",placeholder:"0x…"}]},
  trust:    { icon: Landmark,   label:"KAI Trust",          color:"#FFD700",
    fields:[{key:"lockYears",label:"Lock duration (years)",placeholder:"5",type:"number"},{key:"amount",label:"Trust amount (NVR)",placeholder:"1000",type:"number"},{key:"beneficiary",label:"Beneficiary address",placeholder:"0x…"}]},
  crop:     { icon: Wheat,      label:"Crop Insurance",     color:"#EAB308",
    fields:[{key:"cropType",label:"Crop type",placeholder:"Maize"},{key:"hectares",label:"Area (hectares)",placeholder:"10",type:"number"},{key:"season",label:"Season (YYYY)",placeholder:"2026",type:"number"}]},
  forest:   { icon: Trees,      label:"Forest Protection",  color:"#22C55E",
    fields:[{key:"forestId",label:"Forest ID / parcel",placeholder:"KE-001"},{key:"hectares",label:"Hectares covered",placeholder:"50",type:"number"},{key:"duration",label:"Coverage (months)",placeholder:"12",type:"number"}]},
  medical:  { icon: HeartPulse, label:"Medical Pool",       color:"#EF4444",
    fields:[{key:"members",label:"Pool members",placeholder:"100",type:"number"},{key:"coverageUsd",label:"Max coverage (USD)",placeholder:"500",type:"number"},{key:"duration",label:"Policy duration (mo)",placeholder:"12",type:"number"}]},
  rwa:      { icon: Building2,  label:"RWA Tokenization",  color:"#F97316",
    fields:[{key:"assetType",label:"Asset type",placeholder:"Land"},{key:"valuationUsd",label:"Valuation (USD)",placeholder:"10000",type:"number"},{key:"location",label:"Location / parcel ID",placeholder:"Nairobi, KE-042"}]},
  honey:    { icon: Droplet,    label:"Honey Reserve",      color:"#F59E0B",
    fields:[{key:"community",label:"Community name",placeholder:"Turkana Beekeepers"},{key:"kgTarget",label:"Target (kg)",placeholder:"500",type:"number"},{key:"season",label:"Harvest season",placeholder:"2026"}]},
  milk:     { icon: Milk,       label:"Pastoral Milk Pool", color:"#60A5FA",
    fields:[{key:"cooperative",label:"Co-op name",placeholder:"Maasai Dairy Coop"},{key:"litresDaily",label:"Daily litres",placeholder:"200",type:"number"},{key:"duration",label:"Duration (months)",placeholder:"6",type:"number"}]},
  seeds:    { icon: Sprout,     label:"Heritage Seed Bank",  color:"#86EFAC",
    fields:[{key:"variety",label:"Crop variety",placeholder:"Njahi Beans"},{key:"kgStored",label:"Kg to store",placeholder:"50",type:"number"},{key:"location",label:"Storage location",placeholder:"Meru, Kenya"}]},
  recipe:   { icon: ScrollText, label:"Recipe IP Vault",    color:"#F97316",
    fields:[{key:"recipeName",label:"Recipe / method name",placeholder:"Fermented Uji"},{key:"community",label:"Community owner",placeholder:"Luo Heritage Group"},{key:"licenseType",label:"License type",placeholder:"Community Commons"}]},
};

const POLICY_FEE_BP = "0.0001";
const TREASURY_BP: `0x${string}` = (TREASURY_FROM_LIB ?? "0xB13727161583e38185530755a1A96D00fcCae870");

// ─── BuildPolicyPanel component ───────────────────────────────────────────────
interface BPProps {
  templateId: string;
  fields: Record<string,string>;
  setFields: (v: Record<string,string>) => void;
  status: string;
  setStatus: (s: string) => void;
  txUrl: string | null;
  setTxUrl: (u: string|null) => void;
  submitting: boolean;
  setSubmitting: (b: boolean) => void;
  address?: `0x${string}`;
  sendTransactionAsync: (args: any) => Promise<`0x${string}`>;
  switchChainAsync: (args: any) => Promise<any>;
  policies: any[];
  refreshPolicies: () => void;
}

function BuildPolicyPanel({
  templateId, fields, setFields, status, setStatus,
  txUrl, setTxUrl, submitting, setSubmitting,
  address, sendTransactionAsync, switchChainAsync,
  policies, refreshPolicies,
}: BPProps) {
  const tmpl = BP_TEMPLATES[templateId];
  if (!tmpl) return null;

  const myPolicies = policies.filter(p => p.owner?.toLowerCase() === address?.toLowerCase());

  const handleCreate = async () => {
    if (!address) { setStatus("Connect your wallet first."); return; }
    const missing = tmpl.fields.find(f => !fields[f.key]?.trim());
    if (missing) { setStatus(`Fill in "${missing.label}"`); return; }

    setSubmitting(true); setStatus("Switching to Avalanche Fuji..."); setTxUrl(null);
    try {
      await switchChainAsync({ chainId: 43113 });
      setStatus(`Paying ${POLICY_FEE_BP} AVAX registration fee...`);
      const txHash = await sendTransactionAsync({ to: TREASURY_BP, value: parseEther(POLICY_FEE_BP) });
      setTxUrl(`https://testnet.snowtrace.io/tx/${txHash}`);
      setStatus("Saving policy...");
      const res = await fetch("/api/policies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: address, serviceType: templateId, config: fields,
          paymentAmount: Number(POLICY_FEE_BP), paymentTxHash: txHash }),
      });
      if (!res.ok) throw new Error("API error");
      const { policy } = await res.json();
      setStatus(`Policy ${policy.policyId} created on Fuji!`);
      setFields({});
      refreshPolicies();
    } catch (e: any) {
      setStatus(`${e.message?.slice(0, 100)}`);
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding:"20px", maxWidth:"620px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Header */}
      <div>
            <h2 style={{ margin:0, fontSize:16, fontWeight:800, color:"#fff" }}>Build a Policy</h2>
        <p style={{ margin:"4px 0 0", fontSize:11, color:"rgba(255,255,255,0.4)" }}>
          Create on-chain KAIVAX policies · {POLICY_FEE_BP} AVAX per registration · Fuji Snowtrace
        </p>
      </div>

      {/* Stats */}
      <div style={{ display:"flex", gap:8 }}>
        {[{label:"My Policies", val:myPolicies.length, c:"#10b981"},{label:"Total Policies", val:policies.length, c:"#A78BFA"},{label:"Fee", val:`${POLICY_FEE_BP} AVAX`, c:"#22C55E"}].map(s=>(
          <div key={s.label} style={{ flex:1, background:"rgba(255,255,255,0.04)", border:`1px solid ${s.c}25`, borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
            <p style={{ fontSize:16, fontWeight:900, color:s.c, margin:0 }}>{s.val}</p>
            <p style={{ fontSize:9, color:"rgba(255,255,255,0.35)", margin:"2px 0 0", fontWeight:700 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Dynamic fields */}
      <div style={{ background:"rgba(0,0,0,0.25)", border:`1px solid ${tmpl.color}30`, borderRadius:12, padding:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <tmpl.icon size={16} color={tmpl.color} />
          <span style={{ fontSize:14, fontWeight:800, color:tmpl.color }}>{tmpl.label}</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {tmpl.fields.map(f => (
            <div key={f.key}>
              <label style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.4)", display:"block", marginBottom:4, letterSpacing:0.5 }}>{f.label.toUpperCase()}</label>
              <input type={f.type ?? "text"} placeholder={f.placeholder} value={fields[f.key] ?? ""}
                onChange={e => setFields({...fields, [f.key]: e.target.value})}
                style={{ width:"100%", background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"9px 12px", fontSize:13, color:"#fff", outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      {status && (
        <div style={{ padding:"10px 14px", borderRadius:10, fontSize:11,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.2)", color:"#fff" }}>
          {status}
          {txUrl && <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft:8, color:"#60a5fa", display:"inline-flex", alignItems:"center", gap:4 }}>
            Snowtrace <ExternalLink size={11} />
          </a>}
        </div>
      )}

      {/* Submit */}
      <button onClick={handleCreate} disabled={submitting} style={{
        padding:"12px", borderRadius:10, border:"none", fontWeight:800, fontSize:14,
        background: submitting ? "rgba(255,255,255,0.08)" : `linear-gradient(135deg,${tmpl.color},${tmpl.color}bb)`,
        color: ["#FFD700","#EAB308","#22C55E","#86EFAC"].includes(tmpl.color) ? "#1B4332" : "#fff",
        cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1,
      }}>
        {submitting ? "Signing..." : `Create ${tmpl.label} - ${POLICY_FEE_BP} AVAX`}
      </button>

      {/* My recent policies */}
      {myPolicies.length > 0 && (
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", margin:"4px 0 8px", letterSpacing:1 }}>MY POLICIES ({myPolicies.length})</p>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {myPolicies.slice(0,5).map(p => {
              const t = BP_TEMPLATES[p.serviceType];
              return (
                <div key={p.policyId} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                  {t ? <t.icon size={16} color={t.color} /> : <Briefcase size={16} color="rgba(255,255,255,0.4)" />}
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:12, fontWeight:700, color:"#fff", margin:0 }}>{t?.label ?? p.serviceType}</p>
                    <p style={{ fontSize:10, fontFamily:"monospace", color:"rgba(255,255,255,0.3)", margin:"2px 0 0" }}>{p.policyId}</p>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:6,
                    background: p.status==="active" ? "rgba(34,197,94,0.12)" : "rgba(255,215,0,0.1)",
                    color: p.status==="active" ? "#22C55E" : "#FFD700",
                    border: `1px solid ${p.status==="active" ? "rgba(34,197,94,0.3)" : "rgba(255,215,0,0.25)"}` }}>
                    {p.status === "active" ? "● ACTIVE" : "○ DRAFT"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
