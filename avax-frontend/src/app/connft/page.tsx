'use client';

/**
 * Conservation NFT Marketplace
 * NFTs are priced in yBOB (stable token).
 * Buying transfers yBOB from the connected wallet to the treasury via
 * a real ERC-20 transfer on Avalanche Fuji — visible on Snowtrace.
 *
 * yBOB address: from deployedAddresses.json
 * Treasury:     0xB13727161583e38185530755a1A96D00fcCae870
 */

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, Leaf, ShoppingCart, ExternalLink, RefreshCw, Mail, Check, Loader2, CreditCard } from 'lucide-react';
import { useAccount, useSwitchChain, useWriteContract, useReadContract, usePublicClient } from 'wagmi';
import { avalancheFuji } from 'wagmi/chains';
import { parseUnits, formatUnits, maxUint256 } from 'viem';
import WalletConnectModal from '@/components/WalletConnectModal';
import { ERC20_ABI } from '@/lib/erc20abi';
import { ECOSYSTEM_TOKENS } from '@/lib/tokens';
import { TREASURY as TREASURY_ADDR } from '@/lib/addresses';

// ─── Constants ────────────────────────────────────────────────────────────────
const TREASURY = (TREASURY_ADDR ?? '0xB13727161583e38185530755a1A96D00fcCae870') as `0x${string}`;
const YBOB_TOKEN = ECOSYSTEM_TOKENS.find(t => t.symbol === 'yBOB');
const YBOB_ADDR  = YBOB_TOKEN?.address as `0x${string}` | undefined;
const YBOB_DEC   = YBOB_TOKEN?.decimals ?? 18;
const ACCENT = '#10b981';
const LINE = 'rgba(255,255,255,0.08)';
const SURFACE = 'rgba(255,255,255,0.03)';
const MUTED = 'rgba(255,255,255,0.50)';
const DIM = 'rgba(255,255,255,0.35)';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── NFT data ─────────────────────────────────────────────────────────────────
const conservationData = {
  totalMinted: 105,
  nfts: Array.from({ length: 105 }, (_, i) => ({
    key: `nft${i + 1}`,
    serial: i + 1,
  })),
};

const METADATA_MAP: Record<string, { name: string; price: number; desc: string }> = {
  nft1:  { name: 'Leopard Lookout',    price: 85,  desc: 'A young leopard peering over a rocky ledge at sunset.' },
  nft2:  { name: "Jaguar's Roar",      price: 250, desc: 'Close-up of a fierce jaguar baring its powerful fangs.' },
  nft3:  { name: 'Osprey Sentinel',    price: 120, desc: 'An osprey perched on a branch overlooking misty woodland.' },
  nft4:  { name: 'Savanna Trio',       price: 180, desc: 'Lilac-breasted roller, zebra, and cheetah of the African plains.' },
  nft5:  { name: 'Ghost Bird',         price: 300, desc: 'A long-tailed bird gliding through a dark misty forest.' },
  nft6:  { name: 'Lilac Roller',       price: 95,  desc: 'A vibrant lilac-breasted roller perched on a twig.' },
  nft7:  { name: 'Nilgai Guardian',    price: 145, desc: 'A nilgai antelope standing tall in golden grasslands.' },
  nft8:  { name: 'Langur Elder',       price: 210, desc: 'A gray langur sits in meditative stillness on a tree stump.' },
  nft9:  { name: 'African Twilight',   price: 350, desc: 'Sunset silhouettes of giraffe, antelope, and cheetah on the savanna.' },
  nft10: { name: 'Giraffe at Dusk',    price: 175, desc: 'A lone giraffe silhouetted against a deep orange sunset sky.' },
  nft11: { name: 'Elephant in Mist',   price: 420, desc: 'An elephant crossing a misty river at dawn.' },
  nft12: { name: 'Wetland Watcher',    price: 78,  desc: 'A wading bird scanning the marshlands for fish.' },
  nft13: { name: 'Hornbill Portrait',  price: 155, desc: 'A close-up study of a great hornbill in the canopy.' },
  nft14: { name: "Raptor's Gaze",      price: 198, desc: 'A bird of prey staring intently from its perch.' },
  nft15: { name: 'Eagle Hunter',       price: 225, desc: 'A majestic eagle surveying the landscape below.' },
  nft16: { name: 'Forest Canopy',      price: 110, desc: 'Sun filtering through layers of dense tropical canopy.' },
  nft17: { name: 'Kingfisher Dive',    price: 88,  desc: 'A kingfisher frozen mid-dive into crystal waters.' },
  nft18: { name: 'Tiger Eyes',         price: 475, desc: 'Intense golden eyes of a Bengal tiger in tall grass.' },
  nft19: { name: 'Flamingo Flock',     price: 135, desc: 'A flock of pink flamingos on a shallow soda lake.' },
  nft20: { name: 'Leopard at Rest',    price: 310, desc: 'A leopard reclining on a grassy hillside, watchful.' },
  nft21: { name: 'Monkey Kingdom',     price: 165, desc: 'Primates gathered in the heart of the jungle canopy.' },
  nft22: { name: 'Riverine Dawn',      price: 72,  desc: 'First light breaking over a calm conservation reserve river.' },
  nft23: { name: 'Wild Stallion',      price: 280, desc: 'A wild horse galloping across open grassland.' },
  nft24: { name: 'Parrot Paradise',    price: 92,  desc: 'A colorful parrot perched among tropical blossoms.' },
  nft25: { name: 'Coral Gardens',      price: 195, desc: 'Vibrant underwater coral reef teeming with life.' },
  nft26: { name: 'Bison Stampede',     price: 340, desc: 'A thundering herd of bison crossing the plains.' },
  nft27: { name: 'Elephant Matriarch', price: 390, desc: 'The eldest elephant leading her family to water.' },
  nft28: { name: 'Tusk Guardian',      price: 415, desc: 'An elephant protecting its young from predators.' },
  nft29: { name: 'Crane Dance',        price: 128, desc: 'Crowned cranes performing their courtship dance.' },
  nft30: { name: 'Elephant Caravan',   price: 500, desc: 'A herd of elephants marching across a stormy plain.' },
  nft40: { name: 'Rhino Charge',       price: 480, desc: 'A white rhino charging through the bush.' },
  nft46: { name: "Lion's Pride",       price: 550, desc: 'A majestic lion surrounded by his pride at rest.' },
  nft50: { name: 'Cheetah Sprint',     price: 395, desc: 'A cheetah at full speed chasing across the plains.' },
  nft68: { name: 'Sea Turtle',         price: 310, desc: 'A hawksbill sea turtle gliding through turquoise water.' },
  nft69: { name: 'Whale Breach',       price: 425, desc: 'A humpback whale breaching in the open ocean.' },
  nft75: { name: 'Snow Leopard',       price: 490, desc: 'The elusive snow leopard traversing a mountain ridge.' },
  nft81: { name: 'Mountain Gorilla',   price: 520, desc: 'A silverback gorilla in the misty volcanic highlands.' },
  nft100:{ name: 'Sacred Grove',       price: 400, desc: 'An ancient protected forest grove teeming with biodiversity.' },
  nft104:{ name: 'Tiger Prowl',        price: 510, desc: 'A Royal Bengal tiger prowling through dense bamboo.' },
};

const NFTS = conservationData.nfts.map((nft: { key: string; serial: number }) => {
  const meta = METADATA_MAP[nft.key] || {
    name: `Conservation NFT #${nft.serial}`,
    price: 150,
    desc: `Unique conservation asset. Serial: ${nft.serial}`,
  };
  return {
    id: nft.key,
    serial: nft.serial,
    name: meta.name,
    price: meta.price,        // price in yBOB (1 yBOB ≈ $1)
    img: `/nfts/${nft.key}.jpeg`,
    desc: meta.desc,
  };
});

const FILTERS = ['All', 'Under 100', '100-300', 'Rare 300+'];

export default function CoNNFTMarketplace() {
  const { isConnected, address }  = useAccount();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const connected = mounted && isConnected;
  const { switchChainAsync }      = useSwitchChain();
  const { writeContractAsync }    = useWriteContract();
  const publicClient              = usePublicClient();

  const [showModal,    setShowModal]   = useState(false);
  const [statusMsg,    setStatusMsg]   = useState('');
  const [txUrl,        setTxUrl]       = useState<string | null>(null);
  const [isLoading,    setIsLoading]   = useState<string | null>(null);
  const [purchased,    setPurchased]   = useState<string[]>([]);
  const [activeFilter, setActiveFilter]= useState('All');
  const [cart]                         = useState<string[]>([]);

  // ── Paystack state ──────────────────────────────────────────────────────
  const [payEmail, setPayEmail] = useState('');
  const [payBusy,  setPayBusy]  = useState(false);
  const [payNft,   setPayNft]   = useState<typeof NFTS[0] | null>(null);
  const emailValid = EMAIL_RE.test(payEmail);

  // ── Live yBOB balance ─────────────────────────────────────────────────────
  const { data: yBobBalRaw, refetch: refetchBal } = useReadContract(
    YBOB_ADDR && address
      ? {
          address: YBOB_ADDR,
          abi: ERC20_ABI,
          functionName: 'balanceOf' as const,
          args: [address],
          query: { enabled: true },
        }
      : { address: '0x0' as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf' as const, args: ['0x0' as `0x${string}`], query: { enabled: false } },
  );
  const yBobBal = yBobBalRaw ? parseFloat(formatUnits(yBobBalRaw as bigint, YBOB_DEC)) : null;

  // ── Buy handler: real yBOB transfer ──────────────────────────────────────
  const handleBuy = async (nft: typeof NFTS[0]) => {
    if (!isConnected || !address) { setShowModal(true); return; }
    if (!YBOB_ADDR) {
      setStatusMsg('yBOB token not deployed. Run deploy.ts first.');
      return;
    }

    const priceWei = parseUnits(nft.price.toString(), YBOB_DEC);

    // Check balance
    if (yBobBal !== null && yBobBal < nft.price) {
      setStatusMsg(`Insufficient yBOB balance. You have ${yBobBal.toFixed(2)} yBOB, need ${nft.price} yBOB.`);
      return;
    }

    setIsLoading(nft.id);
    setStatusMsg(`Preparing purchase of ${nft.name} for ${nft.price} yBOB...`);
    setTxUrl(null);

    try {
      await switchChainAsync({ chainId: avalancheFuji.id });

      // Step 1: Approve treasury to spend yBOB
      setStatusMsg(`Approving ${nft.price} yBOB...`);
      const approveTx = await writeContractAsync({
        address: YBOB_ADDR,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TREASURY, maxUint256],
        chainId: avalancheFuji.id,
      });
      setStatusMsg('Waiting for approval...');
      await publicClient?.waitForTransactionReceipt({ hash: approveTx });

      // Step 2: Transfer yBOB to treasury
      setStatusMsg(`Transferring ${nft.price} yBOB for ${nft.name}...`);
      const transferTx = await writeContractAsync({
        address: YBOB_ADDR,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [TREASURY, priceWei],
        chainId: avalancheFuji.id,
      });

      setTxUrl(`https://testnet.snowtrace.io/tx/${transferTx}`);
      setStatusMsg(`Purchased ${nft.name} for ${nft.price} yBOB!`);
      setPurchased(prev => [...prev, nft.id]);
      await refetchBal();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 120) : 'Transaction failed';
      setStatusMsg(`${msg}`);
    } finally {
      setIsLoading(null);
    }
  };

  // ── Paystack buy handler ──────────────────────────────────────────────────
  const handlePaystackBuy = async (nft: typeof NFTS[0]) => {
    if (!emailValid) {
      setStatusMsg('Enter a valid email to pay with Paystack.');
      return;
    }
    setPayBusy(true);
    setPayNft(nft);
    setStatusMsg(`Opening Paystack checkout for ${nft.name}...`);
    setTxUrl(null);
    try {
      const reference = `NFT-${nft.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await fetch('/api/paystack/initiate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:     payEmail,
          priceUsd:  nft.price,
          reference,
          nftId:     nft.id,
          nftName:   nft.name,
          wallet:    address,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Paystack initiate failed');

      window.open(data.authorizationUrl, '_blank');
      setStatusMsg(`Complete payment in the Paystack tab — KES ${data.amountKes?.toLocaleString?.() ?? ''} (${nft.price} yBOB). Ref: ${data.reference}`);

      // Poll /api/paystack/verify every 5s for up to 90s
      let attempts = 0;
      const id = setInterval(async () => {
        attempts++;
        try {
          const r    = await fetch(`/api/paystack/verify?reference=${data.reference}`);
          const poll = await r.json();
          if (poll.status === 'success') {
            clearInterval(id);
            setPurchased(prev => [...prev, nft.id]);
            setStatusMsg(`Paystack payment confirmed! Paid KES ${poll.amountKes?.toLocaleString?.()}. Ref: ${poll.reference}`);
            setPayNft(null);
          } else if (poll.status === 'failed' || poll.status === 'abandoned') {
            clearInterval(id);
            setStatusMsg(`Paystack payment ${poll.status}.`);
            setPayNft(null);
          } else if (attempts >= 18) {
            clearInterval(id);
            setStatusMsg('Check your email for Paystack confirmation and transaction receipt.');
            setPayNft(null);
          }
        } catch { /* ignore polling errors */ }
      }, 5000);
    } catch (e: unknown) {
      setStatusMsg(`${e instanceof Error ? e.message : 'Paystack error'}`);
      setPayNft(null);
    } finally {
      setPayBusy(false);
    }
  };

  const filteredNFTs = NFTS.filter((n: typeof NFTS[0]) => {
    if (activeFilter === 'Under 100')  return n.price < 100;
    if (activeFilter === '100-300')    return n.price >= 100 && n.price <= 300;
    if (activeFilter === 'Rare 300+')  return n.price > 300;
    return true;
  });

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '0 16px 80px' }}>

      {/* Header */}
      <div style={{ paddingTop: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/" style={{ color: DIM, display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={20} />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#fff' }}>Conservation NFTs</h1>
          <p style={{ fontSize: 13, color: MUTED, margin: '2px 0 0' }}>
            Buy real conservation artwork with yBOB or Paystack on Avalanche Fuji.
          </p>
        </div>
        <button onClick={() => refetchBal()} title="Refresh balance" style={{ background: 'transparent', border: `1px solid ${LINE}`, borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <RefreshCw size={15} color={MUTED} />
        </button>
        {cart.length > 0 && (
          <div style={{ position: 'relative' }}>
            <ShoppingCart size={20} color={ACCENT} />
            <span style={{ position: 'absolute', top: -6, right: -6, background: ACCENT, color: '#04140f', fontSize: 9, fontWeight: 900, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cart.length}</span>
          </div>
        )}
      </div>

      {!YBOB_ADDR && (
        <p style={{ marginTop: 16, fontSize: 12, color: '#fbbf24' }}>
          yBOB not deployed — run <code>deploy.ts --network fuji</code> first.
        </p>
      )}

      {/* Account panel — connection, balance, and stats in one place */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${LINE}` }}>
        {connected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, fontFamily: 'monospace' }}>
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </p>
              <p style={{ fontSize: 12, color: MUTED, margin: '2px 0 0' }}>
                {yBobBal !== null ? `${yBobBal.toFixed(2)} yBOB available` : 'Loading balance…'}
              </p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: ACCENT }}>● Connected</span>
          </div>
        ) : (
          <button onClick={() => setShowModal(true)} style={{
            width: '100%', padding: '12px', borderRadius: 10, textAlign: 'center', marginBottom: 14,
            border: 'none', cursor: 'pointer', background: ACCENT, color: '#04140f', fontSize: 14, fontWeight: 700,
          }}>
            Connect wallet to buy with yBOB
          </button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[
            { label: 'Listed',    value: `${NFTS.length}` },
            { label: 'Purchased', value: `${purchased.length}` },
            { label: 'yBOB rate', value: '≈ $1.00' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 2px' }}>{s.value}</p>
              <p style={{ fontSize: 10.5, color: MUTED, margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      {statusMsg && (
        <div style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13, color: '#fff',
          background: SURFACE, border: `1px solid ${LINE}`,
          position: 'sticky', top: 12, zIndex: 10,
        }}>
          {statusMsg}
          {txUrl && (
            <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: ACCENT, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
              View on Snowtrace <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {/* Paystack email input */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${LINE}` }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Mail size={14} color={ACCENT} /> Prefer card, bank, or M-Pesa via Paystack?
        </p>
        <p style={{ fontSize: 12, color: MUTED, margin: '0 0 10px' }}>
          Enter your email once, then tap "Pay with Paystack" on any NFT below. Rate: 1 yBOB ≈ KES 130.
        </p>
        <input
          type="email"
          placeholder="you@email.com"
          value={payEmail}
          onChange={e => setPayEmail(e.target.value)}
          style={{ width: '100%', maxWidth: 280, background: 'transparent', border: `1px solid ${payEmail && !emailValid ? '#f87171' : LINE}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
        />
      </div>

      {/* Filters */}
      <div style={{ marginTop: 20, display: 'flex', gap: 20, overflowX: 'auto', borderBottom: `1px solid ${LINE}` }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            style={{
              flexShrink: 0, padding: '8px 0', marginBottom: -1, background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              border: 'none', borderBottom: activeFilter === f ? `2px solid ${ACCENT}` : '2px solid transparent',
              color: activeFilter === f ? '#fff' : MUTED, fontSize: 13, fontWeight: 600,
            }}>
            {f}
          </button>
        ))}
      </div>

      {/* NFT Grid */}
      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
        {filteredNFTs.map(nft => {
          const owned = purchased.includes(nft.id);
          const buying = isLoading === nft.id;
          const paying = payBusy && payNft?.id === nft.id;
          const short = yBobBal !== null && yBobBal < nft.price;

          return (
            <div key={nft.id} style={{
              borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              border: `1px solid ${owned ? 'rgba(16,185,129,0.4)' : LINE}`,
              background: SURFACE,
            }}>
              {/* Image */}
              <div style={{ width: '100%', aspectRatio: '1/1', position: 'relative', background: 'rgba(0,0,0,0.2)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={nft.img} alt={nft.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: owned ? 0.6 : 1 }} />
                <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.65)', padding: '3px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Leaf size={11} color={ACCENT} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>#{nft.serial}</span>
                </span>
                {owned && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,20,15,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: ACCENT, color: '#04140f', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 999 }}>
                      <Check size={14} /> Owned
                    </span>
                  </div>
                )}
                {(buying || paying) && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={26} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 3px', lineHeight: 1.25 }}>{nft.name}</h3>
                  <p style={{ fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.35 }}>{nft.desc}</p>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{nft.price}</span>
                  <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>yBOB</span>
                </div>

                {owned ? null : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      onClick={() => handleBuy(nft)}
                      disabled={isLoading !== null || payBusy}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: ACCENT, border: 'none', color: '#04140f', padding: '10px 12px', borderRadius: 9,
                        fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                        cursor: isLoading !== null ? 'not-allowed' : 'pointer',
                        opacity: isLoading !== null && !buying ? 0.5 : 1,
                      }}>
                      {buying ? 'Buying…' : 'Buy with yBOB'}
                    </button>
                    <button
                      onClick={() => handlePaystackBuy(nft)}
                      disabled={payBusy || isLoading !== null || !emailValid}
                      title={emailValid ? 'Buy with Paystack' : 'Enter your email above first'}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: 'transparent', border: `1px solid ${LINE}`, color: emailValid ? '#fff' : DIM,
                        padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                        cursor: (!emailValid || payBusy) ? 'not-allowed' : 'pointer',
                        opacity: emailValid ? 1 : 0.6,
                      }}>
                      <CreditCard size={13} /> {paying ? 'Opening…' : 'Pay with Paystack'}
                    </button>
                  </div>
                )}

                {!owned && short && (
                  <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>Need {Math.ceil(nft.price - (yBobBal ?? 0))} more yBOB, or use Paystack above.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
