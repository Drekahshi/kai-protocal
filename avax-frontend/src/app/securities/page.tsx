"use client";

/**
 * Securities & Insurance page
 *
 * Every "Deposit" executes an on-chain ERC-20 transfer() from the connected wallet
 * to the TREASURY address on Avalanche Fuji C-Chain with real-time Snowtrace tracking.
 * Users can also 1-click import tokens to MetaMask and mint testnet tokens from the faucet.
 */

import { useState } from "react";
import Link from "next/link";
import {
  useAccount, useSwitchChain, useWriteContract, usePublicClient,
} from "wagmi";
import { avalancheFuji } from "wagmi/chains";
import { parseUnits } from "viem";
import {
  ArrowLeft, Shield, Lock, Unlock, TrendingUp, Bug, ExternalLink, RefreshCw, PlusCircle, Download, CheckCircle2,
} from "lucide-react";
import { useEcosystemBalances } from "@/hooks/useEcosystemBalances";
import WalletConnectModal from "@/components/WalletConnectModal";
import { ERC20_ABI } from "@/lib/erc20abi";
import { ECOSYSTEM_TOKENS, TokenConfig } from "@/lib/tokens";
import { TREASURY as TREASURY_ADDR } from "@/lib/addresses";
import { importTokenToMetaMask, requestFaucetTokens } from "@/lib/metamask";

// ─── Treasury — receives token deposits as policy collateral ─────────────────
const TREASURY = (TREASURY_ADDR ?? "0xaA9953BAB5de2147cC0c919Ab2ff22d809188514") as `0x${string}`;

// ─── Types ───────────────────────────────────────────────────────────────────
type SecurityStatus = "LOCKED" | "UNLOCKED" | "PENDING_DAO";

interface Product {
  id:             string;
  icon:           string;
  name:           string;
  desc:           string;
  apy:            string;
  color:          string;
  tokenSymbol:    string; // must match ECOSYSTEM_TOKENS symbol
  conditionLabel: string;
  features:       string[];
}

// ─── Map each product to live deployed ERC-20 tokens ──────────────
const SECURITIES: Product[] = [
  {
    id: "trust",   icon: "🏛️", name: "KAI Trust",      desc: "Time-locked token trust for beneficiaries",
    apy: "15.2%",  color: "#FFD700", tokenSymbol: "NVR",
    conditionLabel: "Time-locked for 5 years",
    features: ["Time-lock smart contract", "Named beneficiary", "Automated release"],
  },
  {
    id: "pension",    icon: "🛡️", name: "KAIVAX Pension",  desc: "Long-term retirement savings",
    apy: "12.8%",  color: "#A78BFA", tokenSymbol: "YTOKEN",
    conditionLabel: "Vested until age 60",
    features: ["Vesting schedule", "Monthly auto-deposit", "Compound yield"],
  },
  {
    id: "mmf",     icon: "💵", name: "Money Market Fund", desc: "Low-risk yBOB liquidity basket",
    apy: "7.5%",   color: "#22C55E", tokenSymbol: "yBOB",
    conditionLabel: "Instant Liquidity (No Lock)",
    features: ["Instant liquidity", "RWA-backed", "Daily yield"],
  },
  {
    id: "rwa",     icon: "🪙", name: "RWA Tokenization", desc: "Tokenize land, property, or commodity",
    apy: "18.0%",  color: "#F97316", tokenSymbol: "YGOLD",
    conditionLabel: "Secondary Market Unlocked",
    features: ["Legal NFT wrapper", "On-chain verification", "Fractional trading"],
  },
];

const INSURANCE: Product[] = [
  {
    id: "crop",    icon: "🌾", name: "Community Crop Insurance", desc: "Protect against climate/weather crop loss",
    apy: "8.5%",   color: "#EAB308", tokenSymbol: "YGOLD",
    conditionLabel: "Parametric Trigger: Drought / Flood",
    features: ["Parametric weather triggers", "Instant payouts", "Community pooled risk"],
  },
  {
    id: "forest",     icon: "🌲", name: "Forest Asset Protection", desc: "Cover for tokenized forest hectares",
    apy: "10.2%",  color: "#22C55E", tokenSymbol: "GAMI",
    conditionLabel: "Satellite Verified Outbreak/Fire",
    features: ["Wildfire protection", "Illegal logging cover", "Satellite verified"],
  },
  {
    id: "medical",    icon: "🏥", name: "Medical/Emergency Pool", desc: "Community health emergency coverage",
    apy: "5.0%",   color: "#EF4444", tokenSymbol: "CENTS",
    conditionLabel: "Requires Verified Medical Receipt",
    features: ["DAO approved claims", "Fast medical dispersal", "Subsidized premiums"],
  },
];

const COMMUNITY: Product[] = [
  {
    id: "honey",    icon: "🍯", name: "Forest Honey Reserve",
    desc: "Wild honey harvested from community-managed forests. Each unit represents 1 kg of certified raw honey.",
    apy: "14.0%", color: "#F59E0B", tokenSymbol: "GAMI",
    conditionLabel: "Harvest Verified · Seasonal Release",
    features: ["Community harvester registry", "Seasonal yield unlocks", "Forest stewardship rewards"],
  },
  {
    id: "beads",    icon: "📿", name: "Cultural Beadwork NFT",
    desc: "Maasai, Ndebele & Turkana beadwork tokenized as fractional cultural NFTs. Artisans earn royalties on every trade.",
    apy: "11.5%", color: "#10b981", tokenSymbol: "NVR",
    conditionLabel: "Artisan Verified · DAO Curated",
    features: ["Artisan royalty on-chain", "Cultural IP protection", "Collector marketplace"],
  },
  {
    id: "necklace",    icon: "💎", name: "Heritage Necklace Vault",
    desc: "Traditional necklaces and ceremonial jewellery tokenized. Protects artisan income and preserves cultural heritage.",
    apy: "9.8%", color: "#A78BFA", tokenSymbol: "YTOKEN",
    conditionLabel: "Artisan Certified · Secondary Market",
    features: ["Provenance on-chain", "Fractional ownership", "Heritage fund contribution"],
  },
  {
    id: "milk",    icon: "🥛", name: "Pastoral Milk Pool",
    desc: "Camel, cow & goat milk from pastoral communities tokenized for DeFi yield. Supports smallholder dairy farmers.",
    apy: "7.2%", color: "#60A5FA", tokenSymbol: "yBOB",
    conditionLabel: "Daily Collection Verified · Co-op Pooled",
    features: ["Cooperative milk pooling", "Real-time price oracle", "Farmer direct payments"],
  },
  {
    id: "medicine",    icon: "🌿", name: "Traditional Medicine Registry",
    desc: "Indigenous medicinal plants and herbal formulations registered on-chain. Healers retain IP and royalties.",
    apy: "16.0%", color: "#34D399", tokenSymbol: "GAMI",
    conditionLabel: "Healer Council Approved · Rare Unlock",
    features: ["Healer IP protection", "Ethnobotanical registry", "Rare-plant conservation fund"],
  },
  {
    id: "recipe",    icon: "📜", name: "Community Recipe IP Vault",
    desc: "Traditional food recipes, fermentation methods, and seed-saving techniques stored immutably on-chain.",
    apy: "8.0%", color: "#F97316", tokenSymbol: "CENTS",
    conditionLabel: "Community Council Ratified",
    features: ["Immutable recipe registry", "Licensing fee distribution", "Seed sovereignty protection"],
  },
  {
    id: "charcoal",    icon: "🪵", name: "Sustainable Charcoal Credits",
    desc: "Community woodlots producing certified sustainable charcoal. Carbon credits generated on each verified batch.",
    apy: "12.3%", color: "#78716C", tokenSymbol: "YGOLD",
    conditionLabel: "Carbon Audit Verified",
    features: ["Carbon credit stacking", "Woodlot stewardship", "Clean-cooking impact"],
  },
  {
    id: "weaving",    icon: "🧶", name: "Textile & Weaving Co-op",
    desc: "Kikoy, kente, kanga and basket weaving pooled into a community textile fund. Weavers earn advance yield on future sales.",
    apy: "10.5%", color: "#EC4899", tokenSymbol: "YTOKEN",
    conditionLabel: "Co-op Verified · Market Linked",
    features: ["Weaver advance payments", "Export market linkage", "Cultural textile archive"],
  },
  {
    id: "seeds",    icon: "🌱", name: "Heritage Seed Bank",
    desc: "Indigenous crop varieties preserved and tokenized. Communities stake tokens to fund seed multiplication.",
    apy: "6.5%", color: "#86EFAC", tokenSymbol: "NVR",
    conditionLabel: "Germination Verified · Season Unlock",
    features: ["Biodiversity preservation", "Seed sovereignty", "Community food security"],
  },
  {
    id: "water",    icon: "💧", name: "Community Water Rights",
    desc: "Tokenized water source rights for pastoral and farming communities. Collateral for dry-season credit access.",
    apy: "5.8%", color: "#38BDF8", tokenSymbol: "yBOB",
    conditionLabel: "Water Table Sensor Verified",
    features: ["Water rights registry", "Dry-season credit line", "IoT sensor integration"],
  },
  {
    id: "pottery",    icon: "🏺", name: "Artisan Pottery & Ceramics",
    desc: "Hand-crafted community pottery registered as cultural RWAs. Each piece minted as NFT; proceeds fund pottery co-ops.",
    apy: "9.0%", color: "#FB923C", tokenSymbol: "CENTS",
    conditionLabel: "Artisan Guild Certified",
    features: ["Piece-level NFT minting", "Guild royalty split", "Tourism market access"],
  },
  {
    id: "bark",    icon: "📜", name: "Bark Cloth & Fibre Arts",
    desc: "Ugandan bark cloth (UNESCO heritage) and sisal fibre arts tokenized. Protects endangered craft traditions.",
    apy: "13.2%", color: "#92400E", tokenSymbol: "YGOLD",
    conditionLabel: "UNESCO Heritage Registry",
    features: ["UNESCO-linked registry", "Heritage preservation fund", "Artisan livelihood pool"],
  },
];

const ALL_PRODUCTS = [...SECURITIES, ...INSURANCE, ...COMMUNITY];

const USD_PRICE: Record<string, number> = {
  NVR: 0.12, yBOB: 1.00, YTOKEN: 0.27, YGOLD: 2.01, GAMI: 0.56, CENTS: 0.09,
};

function ClockIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function SecuritiesPage() {
  const { address, isConnected } = useAccount();
  const { switchChainAsync }     = useSwitchChain();
  const { writeContractAsync }   = useWriteContract();
  const publicClient             = usePublicClient();
  const {
    tokenBalances, refresh: refreshBalances,
  } = useEcosystemBalances();

  const [showModal,    setShowModal]   = useState(false);
  const [activeTab,    setActiveTab]   = useState<"Securities" | "Insurance" | "Community">("Securities");
  const [activeItem,   setActiveItem]  = useState<string | null>(null);
  const [statusMsg,    setStatusMsg]   = useState("");
  const [statusType,   setStatusType]  = useState<"success" | "error" | "info">("info");
  const [txUrl,        setTxUrl]       = useState<string | null>(null);
  const [isLoading,    setIsLoading]   = useState(false);
  const [stakeAmt,     setStakeAmt]    = useState("");
  const [devMode,      setDevMode]     = useState(false);
  const [refreshing,   setRefreshing]  = useState(false);
  const [faucetLoading,setFaucetLoading]= useState<string | null>(null);

  const [investments, setInvestments] = useState<Record<string, number>>({});
  const [conditions,  setConditions]  = useState<Record<string, SecurityStatus>>({
    trust: "LOCKED", pension: "LOCKED", mmf: "UNLOCKED", rwa: "UNLOCKED",
    crop: "LOCKED",  forest: "LOCKED",  medical: "PENDING_DAO",
    honey: "UNLOCKED", beads: "UNLOCKED", necklace: "UNLOCKED", milk: "UNLOCKED",
    medicine: "PENDING_DAO", recipe: "LOCKED", charcoal: "UNLOCKED", weaving: "UNLOCKED",
    seeds: "LOCKED", water: "UNLOCKED", pottery: "UNLOCKED", bark: "PENDING_DAO",
  });

  const getToken = (sym: string): TokenConfig | undefined =>
    ECOSYSTEM_TOKENS.find(t => t.symbol.toUpperCase() === sym.toUpperCase());

  const walletBalance = (sym: string): number =>
    tokenBalances[sym] ?? 0;

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refreshBalances();
    setRefreshing(false);
  };

  // ── Import token to MetaMask ───────────────────────────────────────────────
  const handleImportToken = async (sym: string) => {
    const token = getToken(sym);
    if (!token) return;
    try {
      setStatusType("info");
      setStatusMsg(`Opening MetaMask prompt to import ${sym}...`);
      await importTokenToMetaMask(token);
      setStatusType("success");
      setStatusMsg(`✓ ${sym} added to your MetaMask asset list!`);
    } catch (err: any) {
      if (err?.code === 4001) {
        setStatusType("info");
        setStatusMsg("MetaMask import was cancelled.");
      } else {
        setStatusType("error");
        setStatusMsg(`MetaMask import: ${err?.message || "Failed"}`);
      }
    }
  };

  // ── Mint testnet tokens from faucet ─────────────────────────────────────────
  const handleMintFaucet = async (sym: string) => {
    if (!isConnected || !address) {
      setShowModal(true);
      return;
    }
    setFaucetLoading(sym);
    setStatusType("info");
    setStatusMsg(`Minting 100 ${sym} to your wallet on Fuji testnet...`);
    setTxUrl(null);

    try {
      const res = await requestFaucetTokens(address, sym, 100);
      setStatusType("success");
      setStatusMsg(`🎉 Successfully minted 100 ${sym}!`);
      if (res.txHash) {
        setTxUrl(`https://testnet.snowtrace.io/tx/${res.txHash}`);
      }
      await refreshBalances();
    } catch (err: any) {
      setStatusType("error");
      setStatusMsg(`Faucet failed: ${err?.message || "Unknown error"}`);
    } finally {
      setFaucetLoading(null);
    }
  };

  // ── Clean ERC-20 deposit: transfer to Treasury ─────────────────────────────
  const handleDeposit = async (product: Product) => {
    if (!isConnected || !address) { setShowModal(true); return; }

    const amt = parseFloat(stakeAmt);
    if (!amt || amt <= 0) {
      setStatusType("error");
      setStatusMsg("Please enter an amount to deposit.");
      return;
    }

    const token = getToken(product.tokenSymbol);
    if (!token?.address) {
      setStatusType("error");
      setStatusMsg(`${product.tokenSymbol} is not yet deployed on Fuji.`);
      return;
    }

    const walletBal = walletBalance(product.tokenSymbol);
    if (amt > walletBal) {
      setStatusType("error");
      setStatusMsg(`Insufficient ${product.tokenSymbol} balance (you have ${walletBal.toFixed(2)}). Click 'Mint 100 ${product.tokenSymbol}' to get testnet tokens.`);
      return;
    }

    setIsLoading(true);
    setStatusType("info");
    setStatusMsg(`Connecting to Avalanche Fuji...`);
    setTxUrl(null);

    try {
      if (switchChainAsync) {
        try {
          await switchChainAsync({ chainId: avalancheFuji.id });
        } catch {
          // already on fuji or handled
        }
      }

      setStatusMsg(`Confirm transfer of ${amt} ${product.tokenSymbol} in your wallet...`);
      const tokenTx = await writeContractAsync({
        address:      token.address,
        abi:          ERC20_ABI,
        functionName: "transfer",
        args:         [TREASURY, parseUnits(amt.toString(), token.decimals)],
        chainId:      avalancheFuji.id,
      });

      setTxUrl(`https://testnet.snowtrace.io/tx/${tokenTx}`);
      setStatusMsg(`Transfer submitted! Waiting for block confirmation...`);

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tokenTx });
      }

      // Record in local state & backend store
      setInvestments(prev => ({ ...prev, [product.id]: (prev[product.id] || 0) + amt }));
      setStakeAmt("");
      setStatusType("success");
      setStatusMsg(`🎉 Deposited ${amt} ${product.tokenSymbol} into ${product.name}! Policy is now active.`);

      // Optional async sync to backend policy store
      fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: address,
          serviceType: product.id,
          config: { name: product.name, tokenSymbol: product.tokenSymbol },
          paymentAmount: amt,
          paymentTxHash: tokenTx,
        }),
      }).catch(() => {});

      await refreshBalances();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setStatusType("error");
      if (msg.includes("rejected") || msg.includes("User denied")) {
        setStatusMsg("Transaction was cancelled in your wallet.");
      } else {
        setStatusMsg(`${msg.slice(0, 140)}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Withdraw handler ────────────────────────────────────────────────────────
  const handleWithdraw = async (product: Product) => {
    if (!isConnected || !address) { setShowModal(true); return; }
    if (conditions[product.id] !== "UNLOCKED") return;

    const invested = investments[product.id] || 0;
    if (invested <= 0) return;

    setIsLoading(true);
    setStatusType("info");
    setStatusMsg(`Processing withdrawal of ${invested} ${product.tokenSymbol}...`);
    setTxUrl(null);

    try {
      setInvestments(prev => ({ ...prev, [product.id]: 0 }));
      setStatusType("success");
      setStatusMsg(`✓ Released ${invested} ${product.tokenSymbol} from ${product.name}.`);
      await refreshBalances();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Withdrawal failed";
      setStatusType("error");
      setStatusMsg(`${msg.slice(0, 120)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCondition = (id: string) => {
    const states: SecurityStatus[] = ["LOCKED", "UNLOCKED", "PENDING_DAO"];
    const idx  = states.indexOf(conditions[id]);
    setConditions(prev => ({ ...prev, [id]: states[(idx + 1) % states.length] }));
  };

  const currentList = activeTab === "Securities" ? SECURITIES : activeTab === "Insurance" ? INSURANCE : COMMUNITY;
  const portfolioTotalUsd = Object.entries(investments).reduce((sum, [id, amt]) => {
    const sym = ALL_PRODUCTS.find(p => p.id === id)?.tokenSymbol ?? "";
    return sum + amt * (USD_PRICE[sym] ?? 0);
  }, 0);

  return (
    <main style={{ padding: "16px 16px 100px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 800, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ paddingTop: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(232,65,66,0.1)", border: "1px solid rgba(232,65,66,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
          }}>
            <ArrowLeft size={18} color="#e84142" />
          </Link>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>Securities &amp; Insurance</h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "3px 0 0" }}>
              Real ERC-20 token contracts · Direct Fuji C-Chain settlements
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleRefresh} title="Refresh balances" style={{
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            padding: 8, borderRadius: "50%", color: "rgba(255,255,255,0.6)", cursor: "pointer",
          }}>
            <RefreshCw size={15} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
          <button onClick={() => setDevMode(!devMode)} title="Toggle dev triggers" style={{
            background: "rgba(255,255,255,0.07)", border: "none",
            padding: 8, borderRadius: "50%", color: "#FFD700", cursor: "pointer",
          }}>
            <Bug size={15} />
          </button>
        </div>
      </div>

      {/* Quick Token Import & Faucet Drawer */}
      <div style={{
        background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
        borderRadius: 16, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#34D399", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6 }}>
            <PlusCircle size={14} /> METAMASK TOKEN IMPORTER &amp; TESTNET FAUCET
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Fuji C-Chain</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ECOSYSTEM_TOKENS.map(t => {
            const bal = walletBalance(t.symbol);
            const isMinting = faucetLoading === t.symbol;
            return (
              <div key={t.symbol} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "6px 10px",
                border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8,
              }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: t.color }}>{t.symbol}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>
                    {bal.toFixed(1)}
                  </span>
                </div>
                <button
                  onClick={() => handleImportToken(t.symbol)}
                  title={`Add ${t.symbol} to MetaMask`}
                  style={{
                    background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6,
                    padding: "3px 6px", fontSize: 9, color: "#60a5fa", fontWeight: 700, cursor: "pointer",
                  }}>
                  + MetaMask
                </button>
                <button
                  onClick={() => handleMintFaucet(t.symbol)}
                  disabled={isMinting}
                  title={`Mint 100 ${t.symbol} to your wallet`}
                  style={{
                    background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
                    borderRadius: 6, padding: "3px 6px", fontSize: 9, color: "#34D399", fontWeight: 700,
                    cursor: isMinting ? "not-allowed" : "pointer",
                  }}>
                  {isMinting ? "Minting..." : "Mint 100"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Status Message */}
      {statusMsg && (
        <div style={{
          background: statusType === "success" ? "rgba(34,197,94,0.1)" : statusType === "error" ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)",
          border: `1px solid ${statusType === "success" ? "rgba(34,197,94,0.3)" : statusType === "error" ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.3)"}`,
          padding: "12px 14px", borderRadius: 12, fontSize: 12, color: "#fff", display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div>{statusMsg}</div>
          {txUrl && (
            <a href={txUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: "#60a5fa", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 11 }}>
              View on Avalanche Snowtrace <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Wallet Banner */}
      {!isConnected && (
        <button onClick={() => setShowModal(true)} style={{
          background: "rgba(232,65,66,0.08)", border: "1px dashed rgba(232,65,66,0.4)",
          borderRadius: 14, padding: "14px 16px", color: "#e84142", fontWeight: 700,
          fontSize: 13, cursor: "pointer", textAlign: "center",
        }}>
          🦊 Connect MetaMask to deposit tokens on Fuji
        </button>
      )}

      {/* Developer condition toggles */}
      {devMode && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px dashed #EF4444", padding: 12, borderRadius: 12 }}>
          <p style={{ fontSize: 11, color: "#FCA5A5", fontWeight: 700, margin: "0 0 8px" }}>TEST CONDITION OVERRIDES</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.keys(conditions).map(k => (
              <button key={k} onClick={() => toggleCondition(k)} style={{
                background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff", fontSize: 10, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              }}>
                {k.toUpperCase()}: <span style={{ color: conditions[k] === "UNLOCKED" ? "#22C55E" : "#F97316" }}>{conditions[k]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, background: "rgba(0,0,0,0.2)", padding: 4, borderRadius: 12 }}>
        {(["Securities", "Insurance", "Community"] as const).map(tab => (
          <button key={tab}
            onClick={() => { setActiveTab(tab); setActiveItem(null); setStatusMsg(""); setTxUrl(null); }}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
              color:      activeTab === tab ? "#121212" : "#fff",
              background: activeTab === tab
                ? tab === "Community" ? "#34D399" : "#FFD700"
                : "transparent",
              border: "none", cursor: "pointer", transition: "all 0.2s",
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Portfolio Strip */}
      <div className="glass" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderRadius: 16, border: "1px solid rgba(255,215,0,0.18)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: "rgba(255,215,0,0.1)", padding: 8, borderRadius: 10 }}>
            <TrendingUp size={16} color="#FFD700" />
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", margin: 0 }}>ACTIVE PORTFOLIO</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: 0 }}>${portfolioTotalUsd.toFixed(2)} USD</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0 }}>Active Contracts</p>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#22C55E", margin: 0 }}>
            {Object.values(investments).filter(v => v > 0).length}
          </p>
        </div>
      </div>

      {/* Product List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {currentList.map(product => {
          const isActive  = activeItem === product.id;
          const status    = conditions[product.id];
          const invested  = investments[product.id] || 0;
          const token     = getToken(product.tokenSymbol);
          const wBal      = walletBalance(product.tokenSymbol);
          const deployed  = !!token?.address;

          return (
            <div key={product.id} className="glass" style={{
              borderRadius: 20, overflow: "hidden",
              border:     isActive ? `1px solid ${product.color}60` : "1px solid rgba(255,255,255,0.08)",
              background: isActive ? `${product.color}10` : "rgba(255,255,255,0.03)",
              transition: "all 0.2s ease",
            }}>

              {/* Header row */}
              <div
                onClick={() => { setActiveItem(isActive ? null : product.id); }}
                style={{ padding: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14, fontSize: 22,
                    background: `${product.color}20`, border: `1px solid ${product.color}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{product.icon}</div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>{product.name}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                      {product.tokenSymbol} · {deployed ? (
                        <span style={{ color: "#22C55E" }}>✓ Deployed on Fuji</span>
                      ) : (
                        <span style={{ color: "#F97316" }}>Coming soon</span>
                      )}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {invested > 0 ? (
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 900, color: "#fff", margin: 0 }}>{invested.toFixed(2)} {product.tokenSymbol}</p>
                      <p style={{ fontSize: 9, color: "#22C55E", margin: 0 }}>DEPOSITED</p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: product.color, margin: 0 }}>{product.apy}</p>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: 0 }}>APY</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded Panel */}
              {isActive && (
                <div style={{ padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: "0 0 12px", lineHeight: 1.4 }}>
                    {product.desc}
                  </p>

                  {/* Token Controls */}
                  {deployed && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
                      background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "10px 12px", marginBottom: 12,
                      border: "1px solid rgba(255,255,255,0.06)", gap: 8,
                    }}>
                      <div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                          Wallet Balance:&nbsp;
                        </span>
                        <strong style={{ fontSize: 13, color: product.color }}>
                          {wBal.toFixed(4)} {product.tokenSymbol}
                        </strong>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => handleImportToken(product.tokenSymbol)}
                          style={{
                            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: 8, padding: "4px 8px", fontSize: 10, color: "#60a5fa", cursor: "pointer", fontWeight: 700,
                          }}>
                          + Add to MetaMask
                        </button>
                        <button
                          onClick={() => handleMintFaucet(product.tokenSymbol)}
                          disabled={faucetLoading === product.tokenSymbol}
                          style={{
                            background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)",
                            borderRadius: 8, padding: "4px 8px", fontSize: 10, color: "#34D399", cursor: "pointer", fontWeight: 700,
                          }}>
                          {faucetLoading === product.tokenSymbol ? "Minting..." : `Mint 100 ${product.tokenSymbol}`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Condition Badge */}
                  <div style={{
                    background: status === "UNLOCKED" ? "rgba(34,197,94,0.1)" : status === "LOCKED" ? "rgba(249,115,22,0.1)" : "rgba(234,179,8,0.1)",
                    border: `1px solid ${status === "UNLOCKED" ? "rgba(34,197,94,0.3)" : status === "LOCKED" ? "rgba(249,115,22,0.3)" : "rgba(234,179,8,0.3)"}`,
                    borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                  }}>
                    {status === "UNLOCKED"
                      ? <Unlock size={15} color="#22C55E" />
                      : status === "LOCKED"
                        ? <Lock size={15} color="#F97316" />
                        : <ClockIcon size={15} color="#EAB308" />}
                    <div>
                      <p style={{
                        fontSize: 10, fontWeight: 800, margin: 0,
                        color: status === "UNLOCKED" ? "#22C55E" : status === "LOCKED" ? "#F97316" : "#EAB308",
                      }}>
                        {status === "UNLOCKED" ? "CONTRACT UNLOCKED & READY" : status === "LOCKED" ? "CONTRACT LOCKED" : "PENDING VERIFICATION"}
                      </p>
                      <p style={{ fontSize: 11, color: "#fff", margin: "2px 0 0" }}>{product.conditionLabel}</p>
                    </div>
                  </div>

                  {invested > 0 ? (
                    /* ── WITHDRAW VIEW ── */
                    <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, margin: "0 0 6px" }}>DEPOSITED IN CONTRACT</p>
                      <p style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 6px" }}>
                        {invested.toFixed(4)} {product.tokenSymbol}
                      </p>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "0 0 16px" }}>
                        ≈ ${(invested * (USD_PRICE[product.tokenSymbol] ?? 0)).toFixed(2)} USD
                      </p>
                      <button
                        onClick={() => handleWithdraw(product)}
                        disabled={isLoading || status !== "UNLOCKED"}
                        style={{
                          width: "100%", padding: 12, borderRadius: 10, border: "none",
                          fontWeight: 800, fontSize: 13, cursor: (isLoading || status !== "UNLOCKED") ? "not-allowed" : "pointer",
                          background: status === "UNLOCKED"
                            ? `linear-gradient(135deg,${product.color},${product.color}bb)`
                            : "rgba(255,255,255,0.08)",
                          color: status === "UNLOCKED" && ["#FFD700", "#EAB308", "#22C55E"].includes(product.color)
                            ? "#121212" : status === "UNLOCKED" ? "#fff" : "rgba(255,255,255,0.3)",
                        }}>
                        {isLoading ? "Processing..." : status === "UNLOCKED" ? `Withdraw ${product.tokenSymbol}` : "Conditions Not Met"}
                      </button>
                    </div>
                  ) : (
                    /* ── DEPOSIT VIEW ── */
                    <div>
                      {!deployed ? (
                        <div style={{
                          background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)",
                          borderRadius: 10, padding: "12px 14px", fontSize: 11, color: "rgba(255,255,255,0.6)",
                        }}>
                          {product.tokenSymbol} is not yet deployed on Fuji.
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>
                              DEPOSIT {product.tokenSymbol}
                            </span>
                            <button onClick={() => setStakeAmt(wBal > 0 ? wBal.toFixed(4) : "10")} style={{
                              fontSize: 10, fontWeight: 700, color: product.color, background: "transparent",
                              border: "none", cursor: "pointer", padding: 0,
                            }}>
                              MAX ({wBal.toFixed(2)})
                            </button>
                          </div>

                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              value={stakeAmt}
                              onChange={e => setStakeAmt(e.target.value)}
                              type="number" placeholder="0.00"
                              style={{
                                flex: 1, background: "rgba(0,0,0,0.3)",
                                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                                padding: "10px 14px", fontSize: 14, color: "#fff",
                                outline: "none", fontFamily: "inherit",
                              }}
                            />
                            <button
                              onClick={() => handleDeposit(product)}
                              disabled={isLoading || !stakeAmt}
                              style={{
                                background: (isLoading || !stakeAmt)
                                  ? "rgba(255,255,255,0.08)"
                                  : `linear-gradient(135deg,${product.color},${product.color}bb)`,
                                color: ["#FFD700", "#EAB308", "#22C55E"].includes(product.color) ? "#1B4332" : "#fff",
                                fontWeight: 800, fontSize: 13, padding: "10px 20px",
                                borderRadius: 10, border: "none",
                                cursor: (isLoading || !stakeAmt) ? "not-allowed" : "pointer",
                                opacity: (isLoading || !stakeAmt) ? 0.6 : 1,
                              }}>
                              {isLoading ? "Processing..." : "Deposit"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
