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

import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, Leaf, ShoppingCart, ExternalLink, RefreshCw, Phone } from 'lucide-react';
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

// ─── NFT data ─────────────────────────────────────────────────────────────────
const conservationData = {
  contractAddress: '0x0000000000000000000000000000000000000000',
  explorerUrl: 'https://testnet.snowtrace.io',
  totalMinted: 105,
  nfts: Array.from({ length: 105 }, (_, i) => ({
    key: `nft${i + 1}`,
    serial: i + 1,
    explorerUrl: 'https://testnet.snowtrace.io',
    cid: '',
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

const NFTS = conservationData.nfts.map((nft: { key: string; serial: number; explorerUrl: string; cid: string }) => {
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
    explorerUrl: nft.explorerUrl,
  };
});

const FILTERS = ['All', 'Under 100', '100-300', 'Rare 300+'];

export default function CoNNFTMarketplace() {
  const { isConnected, address }  = useAccount();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const { switchChainAsync }      = useSwitchChain();
  const { writeContractAsync }    = useWriteContract();
  const publicClient              = usePublicClient();

  const [showModal,    setShowModal]   = useState(false);
  const [statusMsg,    setStatusMsg]   = useState('');
  const [txUrl,        setTxUrl]       = useState<string | null>(null);
  const [isLoading,    setIsLoading]   = useState<string | null>(null);
  const [purchased,    setPurchased]   = useState<string[]>([]);
  const [activeFilter, setActiveFilter]= useState('All');
  const [cart,         setCart]        = useState<string[]>([]);
  const [refreshKey,   setRefreshKey]  = useState(0);

  // ── M-Pesa state ─────────────────────────────────────────────────────────
  const [mpesaPhone,   setMpesaPhone]  = useState('');
  const [mpesaNft,     setMpesaNft]    = useState<typeof NFTS[0] | null>(null);
  const [mpesaLoading, setMpesaLoading]= useState(false);
  const [mpesaCheckout,setMpesaCheckout]=useState<string | null>(null); // polling id

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

  // ── M-Pesa STK Push handler ───────────────────────────────────────────────
  const handleMpesaBuy = async (nft: typeof NFTS[0]) => {
    const clean = mpesaPhone.replace(/\D/g, '');
    if (!/^254[17]\d{8}$/.test(clean)) {
      setStatusMsg('Enter a valid M-Pesa number: 2547XXXXXXXX or 2541XXXXXXXX');
      return;
    }
    setMpesaLoading(true);
    setStatusMsg(`Sending KES prompt to ${clean}...`);
    setTxUrl(null);
    try {
      const res = await fetch('/api/mpesa/stk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, nftId: nft.id, nftName: nft.name, priceYbob: nft.price }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'STK push failed');
      setMpesaCheckout(data.checkoutRequestId);
      setMpesaNft(nft);
      setStatusMsg(`${data.message ?? `Check your phone - enter M-Pesa PIN for KES ${data.amountKes}`}`);
    } catch (e: unknown) {
      setStatusMsg(`${e instanceof Error ? e.message : 'M-Pesa error'}`);
    } finally {
      setMpesaLoading(false);
    }
  };

  // ── Poll callback status after STK Push ───────────────────────────────────
  useEffect(() => {
    if (!mpesaCheckout || !mpesaNft) return;
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      try {
        const res  = await fetch(`/api/mpesa/callback?checkoutRequestId=${mpesaCheckout}`);
        const data = await res.json();
        if (data.status === 'success') {
          clearInterval(id);
          setPurchased(prev => [...prev, mpesaNft.id]);
          setStatusMsg(`M-Pesa payment confirmed! Receipt: ${data.mpesaReceiptNumber ?? 'N/A'}`);
          setMpesaCheckout(null);
          setMpesaNft(null);
        } else if (data.status === 'failed') {
          clearInterval(id);
          setStatusMsg(`M-Pesa payment failed: ${data.resultDesc}`);
          setMpesaCheckout(null);
        } else if (attempts >= 12) {
          // 12 × 5s = 60s timeout — query Safaricom directly as fallback
          clearInterval(id);
          const qRes  = await fetch('/api/mpesa/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkoutRequestId: mpesaCheckout }) });
          const qData = await qRes.json();
          if (qData.success) {
            setPurchased(prev => [...prev, mpesaNft.id]);
            setStatusMsg('M-Pesa payment confirmed (via direct query)');
          } else {
            setStatusMsg(`Payment status: ${qData.resultDesc ?? 'unknown - check M-Pesa SMS'}`);
          }
          setMpesaCheckout(null);
          setMpesaNft(null);
        }
      } catch { /* ignore polling errors */ }
    }, 5000);
    return () => clearInterval(id);
  }, [mpesaCheckout, mpesaNft]);

  const filteredNFTs = NFTS.filter((n: typeof NFTS[0]) => {
    if (activeFilter === 'Under 100')  return n.price < 100;
    if (activeFilter === '100-300')    return n.price >= 100 && n.price <= 300;
    if (activeFilter === 'Rare 300+')  return n.price > 300;
    return true;
  });

  return (
    <main style={{ paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ padding: '20px 16px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link href="/" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          <ArrowLeft color="#10b981" size={20} />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#10b981' }}>NFT Mkt Exchange</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            Conservation NFTs · Pay with yBOB · Avalanche Fuji
          </p>
        </div>
        <button onClick={() => refetchBal()} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
          <RefreshCw size={15} color="#10b981" />
        </button>
        {cart.length > 0 && (
          <div style={{ position: 'relative' }}>
            <ShoppingCart size={22} color="#10b981" />
            <span style={{ position: 'absolute', top: -6, right: -6, background: '#10b981', color: '#fff', fontSize: 9, fontWeight: 900, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cart.length}</span>
          </div>
        )}
      </div>

      {/* yBOB not deployed warning */}
      {!YBOB_ADDR && (
        <div style={{ margin: '12px 16px 0', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 12, padding: '10px 14px', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          <strong style={{ color: '#F97316' }}>yBOB not deployed.</strong> Run <code style={{ color: '#fbbf24' }}>deploy.ts --network fuji</code> first.
        </div>
      )}

      {/* Payment method badge */}
      <div style={{ margin: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)' }}>
        <span style={{ fontSize: 18 }}></span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', margin: 0 }}>Payment: yBOB Stable Token</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            {mounted && yBobBal !== null ? `Your balance: ${yBobBal.toFixed(4)} yBOB` : mounted && isConnected ? 'Loading balance...' : 'Connect wallet to see balance'}
          </p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
          1 yBOB ≈ $1
        </span>
      </div>

      {/* Contract Address */}
      <div style={{ margin: '10px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', margin: '0 0 1px', fontWeight: 700 }}>COLLECTION CONTRACT</p>
          <p style={{ fontSize: 12, color: '#fff', fontWeight: 700, fontFamily: 'monospace', margin: 0 }}>{conservationData.contractAddress}</p>
        </div>
        <a href={conservationData.explorerUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#10b981', fontWeight: 800, textDecoration: 'none' }}>
          Snowtrace <ExternalLink size={12} />
        </a>
      </div>

      {/* Stats */}
      <div style={{ margin: '10px 16px 0', padding: '12px 16px', borderRadius: 14, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', display: 'flex', gap: 20 }}>
        {[
          { label: 'Total Minted', value: `${conservationData.totalMinted}` },
          { label: 'Listed',       value: `${NFTS.length}` },
          { label: 'Purchased',    value: `${purchased.length}` },
        ].map(s => (
          <div key={s.label} style={{ flex: 1 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '0 0 2px', fontWeight: 700 }}>{s.label}</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: '#10b981', margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Status */}
      {statusMsg && (
        <div style={{
          margin: '12px 16px 0',
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          padding: '10px 14px', borderRadius: 12, fontSize: 12, color: '#fff', textAlign: 'center',
          position: 'sticky', top: 16, zIndex: 10,
        }}>
          {statusMsg}
          {txUrl && (
            <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              Snowtrace <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {/* Wallet status */}
      <div style={{ margin: '12px 16px 0' }}>
        {mounted && isConnected ? (
          <div className="glass" style={{ padding: '10px 14px', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(34,197,94,0.3)' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Connected</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#22C55E', fontFamily: 'monospace' }}>{address?.slice(0, 8)}...{address?.slice(-6)}</span>
          </div>
        ) : (
          <button onClick={() => setShowModal(true)} className="glass" style={{ width: '100%', padding: '12px', borderRadius: 12, textAlign: 'center', border: '1px dashed rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.05)', color: '#10b981', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Connect Wallet to buy NFTs with yBOB
          </button>
        )}
      </div>

      {/* M-Pesa phone input */}
      <div style={{ margin: '10px 16px 0', padding: '12px 14px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Phone size={13} /> Pay with M-Pesa (optional)
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="tel"
            placeholder="2547XXXXXXXX"
            value={mpesaPhone}
            onChange={e => setMpesaPhone(e.target.value.replace(/[^\d+]/g, ''))}
            style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'monospace' }}
          />
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
            Enter to pay<br />in KES via STK
          </div>
        </div>
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '5px 0 0' }}>
          Rate: 1 yBOB ≈ KES 130 · STK push sent to your phone
        </p>
      </div>

      {/* Filters */}
      <div style={{ margin: '12px 16px 0', display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 999, border: '1px solid', cursor: 'pointer', fontWeight: 700, fontSize: 11, transition: 'all 0.2s',
              background: activeFilter === f ? 'linear-gradient(135deg,#10b981,#064e3b)' : 'rgba(255,255,255,0.04)',
              borderColor: activeFilter === f ? '#10b981' : 'rgba(255,255,255,0.1)',
              color: activeFilter === f ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>
            {f}
          </button>
        ))}
      </div>

      {/* NFT Grid */}
      <div style={{ padding: '16px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {filteredNFTs.map(nft => (
          <div key={nft.id} className="glass" style={{
            borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column',
            border: purchased.includes(nft.id)
              ? '1px solid rgba(34,197,94,0.5)'
              : cart.includes(nft.id)
                ? '1px solid rgba(16,185,129,0.4)'
                : '1px solid rgba(255,255,255,0.08)',
            transition: 'border-color 0.2s',
          }}>
            {/* Image */}
            <div style={{ width: '100%', aspectRatio: '1/1', position: 'relative', background: 'rgba(0,0,0,0.2)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nft.img} alt={nft.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: purchased.includes(nft.id) ? 0.7 : 1 }} />
              <a href={nft.explorerUrl} target="_blank" rel="noreferrer" style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: '4px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Leaf size={11} color="#22C55E" />
                <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>#{nft.serial}</span>
                <ExternalLink size={10} color="#fff" style={{ opacity: 0.7 }} />
              </a>
              {purchased.includes(nft.id) && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}></div>
              )}
              {isLoading === nft.id && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}></div>
              )}
            </div>

            {/* Info */}
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.2 }}>{nft.name}</h3>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.3, height: 22, overflow: 'hidden' }}>{nft.desc}</p>

              {/* Price + buy */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#60a5fa' }}>{nft.price}</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 3, fontWeight: 700 }}>yBOB</span>
                </div>

                {purchased.includes(nft.id) ? (
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#22C55E', padding: '3px 7px', background: 'rgba(34,197,94,0.1)', borderRadius: 6 }}>Owned</span>
                ) : (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {/* yBOB buy */}
                    <button
                      onClick={() => handleBuy(nft)}
                      disabled={isLoading !== null || mpesaLoading}
                      title="Buy with yBOB token"
                      style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.35)', color: '#60a5fa', padding: '5px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: isLoading !== null ? 'not-allowed' : 'pointer' }}>
                      {isLoading === nft.id ? '...' : ''}
                    </button>
                    {/* M-Pesa buy */}
                    <button
                      onClick={() => handleMpesaBuy(nft)}
                      disabled={mpesaLoading || isLoading !== null || !mpesaPhone.replace(/\D/g,'').match(/^254[17]\d{8}$/)}
                      title={mpesaPhone ? 'Buy with M-Pesa' : 'Enter M-Pesa number above first'}
                      style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#22C55E', padding: '5px 8px', borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: (!mpesaPhone || mpesaLoading) ? 'not-allowed' : 'pointer', opacity: !mpesaPhone.replace(/\D/g,'').match(/^254[17]\d{8}$/) ? 0.4 : 1 }}>
                      {mpesaLoading && mpesaNft?.id === nft.id ? '...' : 'M-Pesa'}
                    </button>
                  </div>
                )}
              </div>

              {/* Show insufficient balance warning per card */}
              {mounted && isConnected && yBobBal !== null && yBobBal < nft.price && !purchased.includes(nft.id) && (
                <p style={{ fontSize: 9, color: '#f87171', margin: 0, textAlign: 'right' }}>Need {nft.price - Math.floor(yBobBal)} more yBOB</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && <WalletConnectModal onClose={() => setShowModal(false)} />}
    </main>
  );
}
