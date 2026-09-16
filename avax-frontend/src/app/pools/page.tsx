"use client";

/**
 * Pools page — real on-chain KaiPool / KaiAMM interactions on Avalanche Fuji.
 *
 * Three tabs:
 *   Swap      — swaps through KaiAMM router (real ERC-20 transfer on Fuji)
 *   Liquidity — add / remove liquidity from any KaiPool pair
 *   Info      — pool reserves, spot prices, LP balances
 *
 * The interactive bubble canvas + PoolDrawer remain for discovery.
 * Contract addresses from src/lib/defiAddresses.json.
 */

import React, { useState, useCallback } from "react";
import Link from "next/link";
import {
  useAccount, useSwitchChain, useWriteContract,
  useReadContracts, usePublicClient, useReadContract,
} from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import { ArrowDownUp, Droplets, BarChart3, ExternalLink, RefreshCw, ArrowLeft, TrendingUp, Wallet } from "lucide-react";
import WalletConnectModal from "@/components/WalletConnectModal";
import CryptoBubblesCanvas, { KAI_TOKENS } from "@/components/pools/CryptoBubblesCanvas";
import type { PoolToken } from "@/components/pools/CryptoBubblesCanvas";
import type { StakePosition } from "@/components/pools/PoolDrawer";
import PoolDrawer from "@/components/pools/PoolDrawer";
import PoolStatsCard from "@/components/pools/PoolStatsCard";
import { useAnimNumber } from "@/lib/useAnimNumber";
import { ECOSYSTEM_TOKENS } from "@/lib/tokens";
import { ERC20_ABI } from "@/lib/erc20abi";
import { POOL_ABI, AMM_ABI } from "@/lib/defiAbis";
import defiAddrs from "@/lib/defiAddresses.json";

// ─── Helpers ──────────────────────────────────────────────────────────────────
type Addr = `0x${string}`;

function tokenAddr(sym: string): Addr | null {
  return (ECOSYSTEM_TOKENS.find(t => t.symbol === sym)?.address ?? null) as Addr | null;
}
function tokenDec(sym: string): number {
  return ECOSYSTEM_TOKENS.find(t => t.symbol === sym)?.decimals ?? 18;
}
function tokenColor(sym: string): string {
  return ECOSYSTEM_TOKENS.find(t => t.symbol === sym)?.color ?? "#10b981";
}
function tokenEmoji(sym: string): string {
  return ECOSYSTEM_TOKENS.find(t => t.symbol === sym)?.emoji ?? "";
}

// ─── Pool definitions from defiAddresses.json ─────────────────────────────────
interface PoolDef { pair: string; address: string | null; tokenA: string | null; tokenB: string | null }
const POOLS: PoolDef[] = (defiAddrs.pools as PoolDef[]).length > 0
  ? (defiAddrs.pools as PoolDef[])
  : [
      { pair: "NVR/yBOB",    address: null, tokenA: tokenAddr("NVR"),    tokenB: tokenAddr("yBOB")   },
      { pair: "YTOKEN/YGOLD", address: null, tokenA: tokenAddr("YTOKEN"), tokenB: tokenAddr("YGOLD")  },
      { pair: "GAMI/CENTS",  address: null, tokenA: tokenAddr("GAMI"),   tokenB: tokenAddr("CENTS")  },
    ];

const AMM_ADDR = (defiAddrs.amm?.address ?? null) as Addr | null;
const EXPLORER = defiAddrs.explorerBase ?? "https://testnet.snowtrace.io";

// ─── Swap token list / pair metadata ─────────────────────────────────────────
const SWAP_TOKENS = ["NVR","yBOB","YTOKEN","YGOLD","GAMI","CENTS"];

/** Discovery metadata for on-chain pairs → bubble canvas tokens. */
const PAIR_TO_TOKEN: Record<string, { id: string; apy: number; tvl: number }> = {
  "NVR/yBOB":     { id: "nvr",    apy: 18.5, tvl: 1250000 },
  "YTOKEN/YGOLD": { id: "ytoken", apy: 14.8, tvl: 890000  },
  "GAMI/CENTS":   { id: "gami",   apy: 22.0, tvl: 450000  },
};

const TOTAL_TVL = POOLS.reduce((s, p) => s + (PAIR_TO_TOKEN[p.pair]?.tvl ?? 0), 0);
const AVG_APY = POOLS.length ? POOLS.reduce((s, p) => s + (PAIR_TO_TOKEN[p.pair]?.apy ?? 0), 0) / POOLS.length : 0;

// ─── Small animated stat chip ────────────────────────────────────────────────
function StatChip({ label, value, suffix = "", color = "#34d399", live = false, decimals = 0 }: {
  label: string; value: number; suffix?: string; color?: string; live?: boolean; decimals?: number;
}) {
  const v = useAnimNumber(value);
  return (
    <div className="glass rounded-xl px-3 py-2.5 min-w-0">
      <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {live && <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />}
        {label}
      </p>
      <p className="text-sm font-black font-mono tabular-nums truncate" style={{ color }}>
        {live ? suffix : `${v.toLocaleString(undefined, { maximumFractionDigits: decimals })}${suffix}`}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PoolsPage() {
  const { address, isConnected }  = useAccount();
  const { switchChainAsync }       = useSwitchChain();
  const { writeContractAsync }     = useWriteContract();
  const publicClient               = usePublicClient();

  const [showModal,        setShowModal]        = useState(false);
  const [activeTab,        setActiveTab]        = useState<"swap"|"liquidity"|"info">("swap");
  const [statusMsg,        setStatusMsg]        = useState("");
  const [txUrl,            setTxUrl]            = useState<string | null>(null);
  const [busy,             setBusy]             = useState(false);

  // Bubble canvas state (kept for discovery UX)
  const [selectedToken,    setSelectedToken]    = useState<PoolToken | null>(null);
  const [stakedPositions,  setStakedPositions]  = useState<Record<string, StakePosition>>({});

  // ── Swap state ────────────────────────────────────────────────────────────
  const [swapIn,    setSwapIn]    = useState("NVR");
  const [swapOut,   setSwapOut]   = useState("yBOB");
  const [swapAmt,   setSwapAmt]   = useState("");
  const [flipKey,   setFlipKey]   = useState(0);

  // ── Valid output tokens for each input (based on deployed pools) ──────────
  const validOutputTokens = (tokenIn: string): string[] => {
    const inAddr = tokenAddr(tokenIn);
    if (!inAddr) return [];
    return SWAP_TOKENS.filter(t => {
      if (t === tokenIn) return false;
      const outAddr = tokenAddr(t);
      if (!outAddr) return false;
      return POOLS.some(p =>
        (p.tokenA === inAddr && p.tokenB === outAddr) ||
        (p.tokenB === inAddr && p.tokenA === outAddr)
      );
    });
  };

  // When swapIn changes, auto-correct swapOut to a valid partner
  const handleSwapInChange = (newIn: string) => {
    setSwapIn(newIn);
    setSwapAmt("");
    const valid = validOutputTokens(newIn);
    if (valid.length > 0 && !valid.includes(swapOut)) {
      setSwapOut(valid[0]);
    }
  };

  const flipPair = () => {
    handleSwapInChange(swapOut);
    setSwapOut(swapIn);
    setSwapAmt("");
    setFlipKey(k => k + 1);
  };

  // ── Resolve which pool serves swapIn → swapOut ────────────────────────────
  const getRoutingPool = (tokenIn: string, tokenOut: string) => {
    const inAddr  = tokenAddr(tokenIn);
    const outAddr = tokenAddr(tokenOut);
    if (!inAddr || !outAddr) return null;
    return POOLS.find(p =>
      (p.tokenA === inAddr && p.tokenB === outAddr) ||
      (p.tokenB === inAddr && p.tokenA === outAddr)
    ) ?? null;
  };

  // ── Live quote: read getAmountOut from the pool contract ──────────────────
  const routingPool = getRoutingPool(swapIn, swapOut);
  const inAddr      = tokenAddr(swapIn);
  const amtWeiForQuote =
    swapAmt && parseFloat(swapAmt) > 0
      ? (() => { try { return parseUnits(swapAmt, tokenDec(swapIn)); } catch { return null; } })()
      : null;

  const { data: quoteRaw, isFetching: quoteFetching } = useReadContract(
    routingPool?.address && inAddr && amtWeiForQuote
      ? {
          address: routingPool.address as `0x${string}`,
          abi: POOL_ABI,
          functionName: "getAmountOut" as const,
          args: [inAddr, amtWeiForQuote],
          chainId: avalancheFuji.id,
          query: { enabled: true, staleTime: 3000 },
        }
      : {
          address: "0x0000000000000000000000000000000000000000" as `0x${string}`,
          abi: POOL_ABI,
          functionName: "getAmountOut" as const,
          args: ["0x0000000000000000000000000000000000000000" as `0x${string}`, 0n],
          query: { enabled: false },
        },
  );

  // Derive display values from the on-chain quote
  const quoteFormatted = quoteRaw
    ? parseFloat(formatUnits(quoteRaw as bigint, tokenDec(swapOut))).toFixed(6)
    : "";

  // Slippage guard (0.5%) — derived, no extra effect needed.
  const minOut = quoteRaw && quoteRaw !== 0n
    ? formatUnits(((quoteRaw as bigint) * 9950n) / 10000n, tokenDec(swapOut))
    : "0";

  // ── Liquidity state ───────────────────────────────────────────────────────
  const [liqPool,  setLiqPool]  = useState(POOLS[0]?.pair ?? "");
  const [liqAmtA,  setLiqAmtA]  = useState("");
  const [liqAmtB,  setLiqAmtB]  = useState("");
  const [liqMode,  setLiqMode]  = useState<"add"|"remove">("add");
  const [lpAmt,    setLpAmt]    = useState("");

  // ── Read pool reserves ────────────────────────────────────────────────────
  const poolContracts = POOLS.filter(p => p.address).flatMap(p => [
    { address: p.address as Addr, abi: POOL_ABI, functionName: "reserveA" as const, args: [] as const },
    { address: p.address as Addr, abi: POOL_ABI, functionName: "reserveB" as const, args: [] as const },
    { address: p.address as Addr, abi: POOL_ABI, functionName: "totalSupply" as const, args: [] as const },
  ]);
  const lpBalContracts = POOLS.filter(p => p.address && address).map(p => ({
    address: p.address as Addr, abi: POOL_ABI, functionName: "balanceOf" as const,
    args: [address ?? "0x0000000000000000000000000000000000000000" as Addr],
  }));

  const { data: poolData,  refetch: refetchPools } = useReadContracts({ contracts: poolContracts,   query: { enabled: true } });
  const { data: lpBalData, refetch: refetchLpBals} = useReadContracts({ contracts: lpBalContracts,  query: { enabled: !!address } });

  const handleRefresh = useCallback(async () => {
    await Promise.allSettled([refetchPools(), refetchLpBals()]);
  }, [refetchPools, refetchLpBals]);

  // Parse pool data: 3 values per pool (reserveA, reserveB, totalSupply)
  const poolInfo = POOLS.filter(p => p.address).map((p, i) => {
    const base = i * 3;
    return {
      pair:        p.pair,
      address:     p.address as Addr,
      tokenA:      p.tokenA as string,
      tokenB:      p.tokenB as string,
      reserveA:    (poolData?.[base]?.result   as bigint | undefined) ?? 0n,
      reserveB:    (poolData?.[base+1]?.result as bigint | undefined) ?? 0n,
      totalSupply: (poolData?.[base+2]?.result as bigint | undefined) ?? 0n,
      lpBal:       (lpBalData?.[i]?.result     as bigint | undefined) ?? 0n,
    };
  });

  // Derived market overview
  const deployedCount = POOLS.filter(p => p.address).length;

  const openDrawerForPair = (pair: string) => {
    const meta = PAIR_TO_TOKEN[pair];
    if (!meta) return;
    const tok = KAI_TOKENS.find(k => k.id === meta.id);
    if (tok) setSelectedToken(tok);
  };

  // ── Swap price intelligence (fee + impact from live reserves) ─────────────
  const swapInNum  = parseFloat(swapAmt) || 0;
  const swapOutNum = parseFloat(quoteFormatted) || 0;
  const routeInfo  = poolInfo.find(pi => pi.pair === routingPool?.pair);

  let priceImpact = 0;
  let feeEst      = 0;
  if (routeInfo && swapInNum > 0 && swapOutNum > 0) {
    const inResWei  = routingPool!.tokenA === inAddr ? routeInfo.reserveA : routeInfo.reserveB;
    const outResWei = routingPool!.tokenA === inAddr ? routeInfo.reserveB : routeInfo.reserveA;
    const rIn  = parseFloat(formatUnits(inResWei,  tokenDec(swapIn)));
    const rOut = parseFloat(formatUnits(outResWei, tokenDec(swapOut)));
    const ideal = rIn > 0 ? (swapInNum * rOut) / rIn : 0;
    if (ideal > 0) priceImpact = Math.max(0, (1 - swapOutNum / ideal) * 100);
    feeEst = swapOutNum * 0.003; // 0.3% pool fee
  }
  const impactColor = priceImpact > 1.5 ? "#F87171" : priceImpact > 0.5 ? "#FBBF24" : "#34d399";

  // ── Swap handler ──────────────────────────────────────────────────────────
  const handleSwap = async () => {
    if (!isConnected || !address) { setShowModal(true); return; }
    if (!AMM_ADDR) { setStatusMsg("AMM not deployed - run deploy-defi.ts first."); return; }
    const inAddr  = tokenAddr(swapIn);
    const outAddr = tokenAddr(swapOut);
    if (!inAddr || !outAddr) { setStatusMsg("Token address not found."); return; }
    const amt = parseFloat(swapAmt);
    if (!amt || amt <= 0) { setStatusMsg("Enter swap amount."); return; }

    const amtWei    = parseUnits(swapAmt, tokenDec(swapIn));
    const minOutWei = parseUnits(minOut || "0", tokenDec(swapOut));

    setBusy(true); setStatusMsg(""); setTxUrl(null);
    try {
      await switchChainAsync({ chainId: avalancheFuji.id });

      // Approve tokenIn to AMM
      setStatusMsg(`Approving ${swapIn} for AMM router...`);
      const appTx = await writeContractAsync({
        address: inAddr, abi: ERC20_ABI,
        functionName: "approve", args: [AMM_ADDR, maxUint256],
        chainId: avalancheFuji.id,
      });
      await publicClient?.waitForTransactionReceipt({ hash: appTx });

      // Swap
      setStatusMsg(`Swapping ${swapAmt} ${swapIn} -> ${swapOut}...`);
      const swapTx = await writeContractAsync({
        address: AMM_ADDR, abi: AMM_ABI,
        functionName: "swap",
        args: [inAddr, outAddr, amtWei, minOutWei],
        chainId: avalancheFuji.id,
      });
      setTxUrl(`${EXPLORER}/tx/${swapTx}`);
      setStatusMsg(`Swapped ${swapAmt} ${swapIn} -> ${swapOut}! Tx: ${swapTx.slice(0,14)}...`);
      setSwapAmt("");
      await handleRefresh();
    } catch (e: unknown) {
      setStatusMsg(`${e instanceof Error ? e.message.slice(0, 120) : "Swap failed"}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Add liquidity ─────────────────────────────────────────────────────────
  const handleAddLiquidity = async () => {
    if (!isConnected || !address) { setShowModal(true); return; }
    if (!AMM_ADDR) { setStatusMsg("AMM not deployed."); return; }
    const pool = POOLS.find(p => p.pair === liqPool);
    if (!pool?.tokenA || !pool?.tokenB) { setStatusMsg("Pool not deployed."); return; }
    const symA = SWAP_TOKENS.find(s => tokenAddr(s) === pool.tokenA) ?? "";
    const symB = SWAP_TOKENS.find(s => tokenAddr(s) === pool.tokenB) ?? "";
    const amtA = parseUnits(liqAmtA || "0", tokenDec(symA));
    const amtB = parseUnits(liqAmtB || "0", tokenDec(symB));
    if (amtA === 0n || amtB === 0n) { setStatusMsg("Enter both amounts."); return; }

    setBusy(true); setStatusMsg(""); setTxUrl(null);
    try {
      await switchChainAsync({ chainId: avalancheFuji.id });
      setStatusMsg(`Approving ${symA}...`);
      const a1 = await writeContractAsync({ address: pool.tokenA as Addr, abi: ERC20_ABI, functionName: "approve", args: [AMM_ADDR, maxUint256], chainId: avalancheFuji.id });
      await publicClient?.waitForTransactionReceipt({ hash: a1 });
      setStatusMsg(`Approving ${symB}...`);
      const a2 = await writeContractAsync({ address: pool.tokenB as Addr, abi: ERC20_ABI, functionName: "approve", args: [AMM_ADDR, maxUint256], chainId: avalancheFuji.id });
      await publicClient?.waitForTransactionReceipt({ hash: a2 });
      setStatusMsg(`Adding liquidity to ${liqPool} pool...`);
      const liqTx = await writeContractAsync({
        address: AMM_ADDR, abi: AMM_ABI, functionName: "addLiquidity",
        args: [pool.tokenA as Addr, pool.tokenB as Addr, amtA, amtB, 0n],
        chainId: avalancheFuji.id,
      });
      setTxUrl(`${EXPLORER}/tx/${liqTx}`);
      setStatusMsg(`Liquidity added to ${liqPool}! You received LP tokens.`);
      setLiqAmtA(""); setLiqAmtB("");
      await handleRefresh();
    } catch (e: unknown) {
      setStatusMsg(`${e instanceof Error ? e.message.slice(0, 120) : "Failed"}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Remove liquidity ──────────────────────────────────────────────────────
  const handleRemoveLiquidity = async () => {
    if (!isConnected || !address) { setShowModal(true); return; }
    if (!AMM_ADDR) { setStatusMsg("AMM not deployed."); return; }
    const pool = POOLS.find(p => p.pair === liqPool);
    if (!pool?.address) { setStatusMsg("Pool not deployed."); return; }
    const lpWei = parseUnits(lpAmt || "0", 18);
    if (lpWei === 0n) { setStatusMsg("Enter LP amount."); return; }

    setBusy(true); setStatusMsg(""); setTxUrl(null);
    try {
      await switchChainAsync({ chainId: avalancheFuji.id });
      setStatusMsg("Approving LP tokens...");
      const a1 = await writeContractAsync({ address: pool.address as Addr, abi: POOL_ABI, functionName: "approve", args: [AMM_ADDR, maxUint256], chainId: avalancheFuji.id });
      await publicClient?.waitForTransactionReceipt({ hash: a1 });
      setStatusMsg(`Removing ${lpAmt} LP from ${liqPool}...`);
      const remTx = await writeContractAsync({
        address: AMM_ADDR, abi: AMM_ABI, functionName: "removeLiquidity",
        args: [pool.tokenA as Addr, pool.tokenB as Addr, lpWei, 0n, 0n],
        chainId: avalancheFuji.id,
      });
      setTxUrl(`${EXPLORER}/tx/${remTx}`);
      setStatusMsg(`Removed liquidity from ${liqPool}!`);
      setLpAmt("");
      await handleRefresh();
    } catch (e: unknown) {
      setStatusMsg(`${e instanceof Error ? e.message.slice(0, 120) : "Failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const isNotDeployed = !defiAddrs.deployedAt;

  return (
    <main className="p-4 pt-6 pb-28 flex flex-col gap-5 relative max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", flexShrink: 0 }}>
          <ArrowLeft size={18} color="#10b981" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-white m-0">KAI Pools & AMM</h1>
          <p className="text-xs text-white/45 mt-0.5">x*y=k AMM · Real ERC-20 swaps · Fuji C-Chain</p>
        </div>
        <button onClick={handleRefresh} className="p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-all active:scale-90" aria-label="Refresh pool data">
          <RefreshCw size={15} color="#10b981" className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Market overview strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip label="Platform TVL" value={TOTAL_TVL} suffix="" color="#34d399" />
        <StatChip label="Active Pools" value={deployedCount} suffix={`/${POOLS.length}`} color="#A78BFA" decimals={0} />
        <StatChip label="Avg APY" value={AVG_APY} suffix="%" color="#FBBF24" decimals={1} />
        <StatChip label="Live" value={0} suffix="Fuji C-Chain" color="#22D3EE" live />
      </div>

      {/* Not deployed warning */}
      {isNotDeployed && (
        <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 14, padding: "14px 16px", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          <strong style={{ color: "#F97316" }}>Pools not deployed yet.</strong>&nbsp;
          <code style={{ fontSize: 11, color: "#fbbf24" }}>npx hardhat run scripts/deploy-defi.ts --network fuji</code>
        </div>
      )}

      {/* Status */}
      {statusMsg && (
        <div style={{           background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", padding: "12px 14px", borderRadius: 12, fontSize: 12, color: "#fff" }}>
          {statusMsg}
          {txUrl && <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: "#60a5fa", display: "inline-flex", alignItems: "center", gap: 4 }}>Snowtrace <ExternalLink size={11} /></a>}
        </div>
      )}

      {/* Live pool overview cards (click to open pool drawer) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-white/80 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={14} className="text-[#34d399]" /> Live Pool Overview
          </h2>
          <span className="text-[10px] font-mono text-white/40 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" /> auto-refresh on-chain
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {POOLS.map(p => {
            const info = poolInfo.find(pi => pi.pair === p.pair);
            const meta = PAIR_TO_TOKEN[p.pair];
            const symA = SWAP_TOKENS.find(s => tokenAddr(s) === p.tokenA) ?? p.pair.split("/")[0];
            const symB = SWAP_TOKENS.find(s => tokenAddr(s) === p.tokenB) ?? p.pair.split("/")[1];
            const rA   = info ? parseFloat(formatUnits(info.reserveA, tokenDec(symA))) : 0;
            const rB   = info ? parseFloat(formatUnits(info.reserveB, tokenDec(symB))) : 0;
            const spot = rA * rB > 0 ? rB / rA : 1;
            return (
              <PoolStatsCard
                key={p.pair}
                pair={p.pair}
                symbolA={symA}
                symbolB={symB}
                colorA={tokenColor(symA)}
                colorB={tokenColor(symB)}
                apy={meta?.apy ?? 0}
                tvl={meta?.tvl ?? 0}
                spot={spot}
                reserveA={rA}
                reserveB={rB}
                deployed={!!p.address}
                staked={!!(meta && stakedPositions[meta.id])}
                onOpen={() => openDrawerForPair(p.pair)}
              />
            );
          })}
        </div>
      </section>

      {/* Bubble canvas */}
      <CryptoBubblesCanvas onSelectPool={setSelectedToken} stakedPositions={stakedPositions} />

      {/* Tab bar */}
      <div className="flex gap-2 bg-black/20 p-1 rounded-xl">
        {([["swap", "Swap", ArrowDownUp], ["liquidity", "Liquidity", Droplets], ["info", "Info", BarChart3]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => { setActiveTab(id); setStatusMsg(""); setTxUrl(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === id ? "bg-[#10b981] text-white shadow-lg shadow-[#10b981]/30" : "text-white/50 hover:text-white"}`}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* ── SWAP TAB ── */}
      {activeTab === "swap" && (
        <div className="glass rounded-2xl p-5" style={{ border: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Swap Tokens via KaiAMM</p>
            {routingPool?.address && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#34d399]/30 bg-[#34d399]/10 px-2.5 py-1 text-[10px] font-bold text-[#34d399]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
                routed via {routingPool.pair}
              </span>
            )}
          </div>

          {/* Token In */}
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 14, padding: "12px 16px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 4 }}>
            <div className="flex justify-between mb-2">
              <span className="text-xs font-bold text-white/40 uppercase tracking-wide">You Pay</span>
              <span className="text-xs text-white/30">Available pools: NVR-yBOB · YTOKEN-YGOLD · GAMI-CENTS</span>
            </div>
            <div className="flex items-center gap-3">
              <input type="number" value={swapAmt} onChange={e => setSwapAmt(e.target.value)} placeholder="0.00"
                style={{ background: "transparent", border: "none", outline: "none", fontSize: 28, fontWeight: 900, color: "#fff", flex: 1, fontFamily: "inherit" }} />
              <select value={swapIn} onChange={e => handleSwapInChange(e.target.value)}
                style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {SWAP_TOKENS.filter(s => validOutputTokens(s).length > 0).map(s => <option key={s} value={s}>{tokenEmoji(s)} {s}</option>)}
              </select>
            </div>
          </div>

          {/* Flip */}
          <div className="flex justify-center my-1">
            <button onClick={flipPair}
              style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#10b981,#064e3b)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(16,185,129,0.35)" }}>
              <span key={flipKey} className="flip-inline">
                <ArrowDownUp size={15} color="#fff" />
              </span>
            </button>
          </div>

          {/* Token Out — live on-chain quote */}
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 14, padding: "12px 16px", border: `1px solid ${quoteFormatted ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.06)"}`, marginBottom: 8, transition: "border-color 0.3s" }}>
            <div className="flex justify-between mb-2">
              <span className="text-xs font-bold text-white/40 uppercase tracking-wide">You Receive</span>
              <span style={{ fontSize: 10, color: quoteFetching ? "#f59e0b" : quoteFormatted ? "#22C55E" : "rgba(255,255,255,0.3)", fontWeight: 700 }}>
                {quoteFetching ? "fetching..." : routingPool ? `via ${routingPool.pair} pool` : swapAmt ? "no pool for this pair" : "enter amount"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Display-only quoted output */}
              <div key={`${quoteFormatted ?? "empty"}-${quoteFetching}`} className="quote-pop" style={{ flex: 1, fontSize: 28, fontWeight: 900, color: quoteFormatted ? "#fff" : "rgba(255,255,255,0.2)", fontFamily: "inherit", minHeight: 40, display: "flex", alignItems: "center" }}>
                {quoteFetching ? (
                  <span style={{ fontSize: 16, color: "#f59e0b" }}>calculating...</span>
                ) : quoteFormatted ? (
                  quoteFormatted
                ) : (
                  <span style={{ fontSize: 16 }}>-</span>
                )}
              </div>
              <select value={swapOut} onChange={e => { setSwapOut(e.target.value); setSwapAmt(""); }}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {validOutputTokens(swapIn).map(s => <option key={s} value={s}>{tokenEmoji(s)} {s}</option>)}
              </select>
            </div>
          </div>

          {/* Smart swap breakdown */}
          {quoteFormatted && !quoteFetching && swapInNum > 0 && (
            <div className="rounded-xl bg-black/20 border border-white/5 px-3 py-2.5 mb-3" style={{ fontSize: 11 }}>
              <div className="flex justify-between mb-1.5">
                <span className="text-white/40">Rate</span>
                <span className="font-bold text-white">1 {swapIn} ≈ {(swapOutNum / swapInNum).toFixed(6)} {swapOut}</span>
              </div>
              <div className="flex justify-between mb-1.5">
                <span className="text-white/40">Inverse</span>
                <span className="font-bold text-white/80">1 {swapOut} ≈ {(swapInNum / swapOutNum).toFixed(6)} {swapIn}</span>
              </div>
              <div className="flex justify-between mb-1.5">
                <span className="text-white/40">AMM fee (0.3%)</span>
                <span className="font-bold text-white/80">{feeEst.toFixed(6)} {swapOut}</span>
              </div>
              <div className="flex justify-between mb-1.5">
                <span className="text-white/40">Price impact</span>
                <span className="font-bold" style={{ color: impactColor }}>
                  {priceImpact > 1.5 ? "⚠ high" : priceImpact > 0.5 ? "!" : ""} {priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Min received</span>
                <span className="font-bold text-[#34d399]">{minOut} {swapOut} <span className="text-white/30">(0.5% slip)</span></span>
              </div>
              {priceImpact > 1.5 && swapOutNum > 0 && (
                <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/25 px-2.5 py-1.5 text-red-300 font-semibold">
                  Large order for this pool depth — consider splitting to reduce slippage.
                </div>
              )}
            </div>
          )}

          {/* No pool warning */}
          {swapAmt && parseFloat(swapAmt) > 0 && !routingPool && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)", fontSize: 11, color: "#F97316", marginBottom: 8 }}>
              {`No liquidity pool exists for ${swapIn} -> ${swapOut}. Try NVR-yBOB, YTOKEN-YGOLD, or GAMI-CENTS.`}
            </div>
          )}

          <button onClick={handleSwap} disabled={busy || !swapAmt || !AMM_ADDR || !quoteFormatted || !routingPool} style={{
            width: "100%", padding: "13px", borderRadius: 12, border: "none", fontWeight: 800, fontSize: 14,
            background: busy || !swapAmt || !AMM_ADDR || !quoteFormatted || !routingPool
              ? "rgba(255,255,255,0.08)"
              : "linear-gradient(135deg,#10b981,#064e3b)",
            color: "#fff",
            cursor: busy || !swapAmt || !AMM_ADDR || !quoteFormatted || !routingPool ? "not-allowed" : "pointer",
            opacity: busy || !swapAmt ? 0.6 : 1,
            boxShadow: !busy && swapAmt && AMM_ADDR && quoteFormatted && routingPool ? "0 6px 24px rgba(16,185,129,0.35)" : "none",
          }}>
            {busy ? "Signing..."
              : !AMM_ADDR ? "Deploy AMM first"
              : !swapAmt ? "Enter an amount"
              : !routingPool ? "No pool for this pair"
              : quoteFetching ? "Fetching quote..."
              : `Swap ${swapAmt} ${swapIn} -> ${quoteFormatted} ${swapOut}`}
          </button>
          {!isConnected && (
            <button onClick={() => setShowModal(true)} className="mt-2 w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-1.5">
              <Wallet size={13} /> Connect wallet to swap
            </button>
          )}
        </div>
      )}

      {/* ── LIQUIDITY TAB ── */}
      {activeTab === "liquidity" && (
        <div className="glass rounded-2xl p-5" style={{ border: "1px solid rgba(52,211,153,0.2)" }}>
          <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-4">Manage Liquidity</p>

          {/* Pool selector */}
          <div style={{ marginBottom: 14 }}>
            <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-2">Pool</label>
            <select value={liqPool} onChange={e => { setLiqPool(e.target.value); setLiqAmtA(""); setLiqAmtB(""); setLpAmt(""); }}
              style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontWeight: 700 }}>
              {POOLS.map(p => <option key={p.pair} value={p.pair}>{p.pair} {p.address ? "" : "(not deployed)"}</option>)}
            </select>
          </div>

          {/* Add / Remove toggle */}
          <div className="flex gap-2 bg-black/20 p-1 rounded-xl mb-4">
            {(["add","remove"] as const).map(m => (
              <button key={m} onClick={() => setLiqMode(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${liqMode === m ? "bg-[#34d399] text-[#1B4332] shadow-lg shadow-[#34d399]/25" : "text-white/50"}`}>
                {m === "add" ? "Add Liquidity" : "Remove Liquidity"}
              </button>
            ))}
          </div>

          {liqMode === "add" ? (
            <>
              {(["A","B"] as const).map((side) => {
                const pool = POOLS.find(p => p.pair === liqPool);
                const sym  = side === "A"
                  ? SWAP_TOKENS.find(s => tokenAddr(s) === pool?.tokenA) ?? liqPool.split("/")[0]
                  : SWAP_TOKENS.find(s => tokenAddr(s) === pool?.tokenB) ?? liqPool.split("/")[1];
                const val  = side === "A" ? liqAmtA : liqAmtB;
                const set  = side === "A" ? setLiqAmtA : setLiqAmtB;
                const info = poolInfo.find(pi => pi.pair === liqPool);
                const poolBal = info
                  ? parseFloat(formatUnits(side === "A" ? info.reserveA : info.reserveB, tokenDec(sym)))
                  : 0;
                return (
                  <div key={side} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "8px 14px 10px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-bold text-white/40">{sym}</span>
                      <button onClick={() => set(poolBal ? String(poolBal) : "")} className="text-[10px] font-bold text-[#34d399] bg-transparent border-0 cursor-pointer hover:underline">
                        DEPTH {poolBal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </button>
                    </div>
                    <input type="number" value={val} onChange={e => set(e.target.value)} placeholder="0.00"
                      style={{ background: "transparent", border: "none", outline: "none", fontSize: 20, fontWeight: 800, color: "#fff", width: "100%", fontFamily: "inherit" }} />
                  </div>
                );
              })}
              <button onClick={handleAddLiquidity} disabled={busy || !liqAmtA || !liqAmtB || !AMM_ADDR} style={{
                width: "100%", padding: 12, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 14,
                background: busy || !liqAmtA || !liqAmtB ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#34d399,#059669)",
                color: "#1B4332", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
                boxShadow: !busy && liqAmtA && liqAmtB ? "0 6px 24px rgba(52,211,153,0.3)" : "none",
              }}>
                {busy ? "Signing..." : "Add Liquidity"}
              </button>
            </>
          ) : (
            <>
              {(() => {
                const pool = POOLS.find(p => p.pair === liqPool);
                const info = poolInfo.find(p => p.pair === liqPool);
                const lpB  = info?.lpBal ?? 0n;
                return (
                  <div>
                    <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-bold text-white/40">LP TOKENS TO BURN</span>
                        <button onClick={() => setLpAmt(formatUnits(lpB, 18))} className="text-xs text-[#34d399] font-bold bg-transparent border-0 cursor-pointer">
                          MAX {parseFloat(formatUnits(lpB, 18)).toFixed(4)}
                        </button>
                      </div>
                      <input type="number" value={lpAmt} onChange={e => setLpAmt(e.target.value)} placeholder="0.00"
                        style={{ background: "transparent", border: "none", outline: "none", fontSize: 20, fontWeight: 800, color: "#fff", width: "100%", fontFamily: "inherit" }} />
                    </div>
                    <button onClick={handleRemoveLiquidity} disabled={busy || !lpAmt || !pool?.address} style={{
                      width: "100%", padding: 12, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 14,
                      background: busy || !lpAmt ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#F97316,#ea580c)",
                      color: "#fff", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
                      boxShadow: !busy && lpAmt ? "0 6px 24px rgba(249,115,22,0.3)" : "none",
                    }}>
                      {busy ? "Signing..." : "Remove Liquidity"}
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── INFO TAB ── */}
      {activeTab === "info" && (
        <div className="flex flex-col gap-3">
          {POOLS.map(p => {
            const info = poolInfo.find(pi => pi.pair === p.pair);
            const meta = PAIR_TO_TOKEN[p.pair];
            const symA = SWAP_TOKENS.find(s => tokenAddr(s) === p.tokenA) ?? p.pair.split("/")[0];
            const symB = SWAP_TOKENS.find(s => tokenAddr(s) === p.tokenB) ?? p.pair.split("/")[1];
            const rA   = info?.reserveA ?? 0n;
            const rB   = info?.reserveB ?? 0n;
            const lp   = info?.totalSupply ?? 0n;
            const myLp = info?.lpBal ?? 0n;
            const share = lp > 0n ? (Number(myLp) / Number(lp)) * 100 : 0;
            const dailyYield = meta && lp > 0n ? (Number(myLp) / Number(lp)) * (meta.apy / 100) * meta.tvl / 365 : 0;
            const myLpFmt = parseFloat(formatUnits(myLp, 18));
            return (
              <div key={p.pair} className="glass rounded-2xl" style={{ padding: "14px 16px", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-white">{p.pair}</span>
                  {p.address ? (
                    <a href={`${EXPLORER}/address/${p.address}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: "#60a5fa", display: "flex", alignItems: "center", gap: 3 }}>
                      {(p.address as string).slice(0,10)}... <ExternalLink size={10} />
                    </a>
                  ) : <span className="text-xs text-orange-400">Not deployed</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: `Reserve ${symA}`, val: parseFloat(formatUnits(rA, tokenDec(symA))).toLocaleString(undefined, { maximumFractionDigits: 4 }), color: tokenColor(symA) },
                    { label: `Reserve ${symB}`, val: parseFloat(formatUnits(rB, tokenDec(symB))).toLocaleString(undefined, { maximumFractionDigits: 4 }), color: tokenColor(symB) },
                    { label: "LP Supply",        val: parseFloat(formatUnits(lp, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }), color: "#A78BFA" },
                    { label: "My LP",            val: myLpFmt.toLocaleString(undefined, { maximumFractionDigits: 4 }), color: "#22C55E" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px" }}>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "0 0 3px", fontWeight: 700, letterSpacing: 0.5 }}>{s.label.toUpperCase()}</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
                    </div>
                  ))}
                  {[
                    { label: "Your Share", val: `${share.toFixed(3)}%`, color: "#D8B4FE" },
                    { label: "Est. Daily Yield", val: dailyYield > 0 ? `$${dailyYield.toFixed(2)}` : "-", color: "#34d399" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px", border: "1px solid rgba(16,185,129,0.12)" }}>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: "0 0 3px", fontWeight: 700, letterSpacing: 0.5 }}>{s.label.toUpperCase()}</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {AMM_ADDR && (
            <a href={`${EXPLORER}/address/${AMM_ADDR}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: "#60a5fa", display: "flex", alignItems: "center", gap: 4, justifyContent: "center", padding: 8 }}>
              KaiAMM Factory: {AMM_ADDR} <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {/* Pool drawer (legacy simulator — keeping for UX) */}
      <PoolDrawer
        token={selectedToken}
        onClose={() => setSelectedToken(null)}
        stakedPositions={stakedPositions}
        onStakeUpdate={(id, pos) =>
          setStakedPositions(prev => pos ? { ...prev, [id]: pos } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)))
        }
      />

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}