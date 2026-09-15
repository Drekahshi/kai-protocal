'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Leaf, Zap, Loader2, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useSDGImpact } from '@/hooks/useSDGImpact';

const cardIcon: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--mine-surface-2)', color: 'var(--mine-text-2)',
};

export default function SDGImpactCard() {
  const {
    totalPoints,
    tier,
    badge,
    multiplier,
    nextTierPts,
    progressToNextTier,
    goals,
    availableActions,
    toast,
    logAction,
    loading,
  } = useSDGImpact();

  const [activeTab, setActiveTab] = useState<'goals' | 'earn'>('goals');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const handleClaim = async (actionId: string) => {
    if (submittingId) return;
    setSubmittingId(actionId);
    await logAction(actionId);
    setSubmittingId(null);
  };

  return (
    <div className="mine-card" style={{ padding: '20px', position: 'relative' }}>

      {/* Toast — same quiet pill used for the hero's claim confirmation */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', top: 14, left: 20, right: 20, zIndex: 5,
              padding: '8px 14px', borderRadius: 10, textAlign: 'center',
              background: 'var(--mine-surface-2)', boxShadow: 'inset 0 0 0 1px var(--mine-line)',
              color: 'var(--mine-text)', fontSize: 12, fontWeight: 600,
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={cardIcon}><Globe size={17} /></div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--mine-text)', margin: 0, letterSpacing: '-0.01em' }}>
              SDG impact &amp; effort
            </p>
            <p style={{ fontSize: 12, color: 'var(--mine-text-2)', margin: '2px 0 0' }}>
              Earn points for on-chain sustainability and community activities
            </p>
          </div>
        </div>
        <Link href="/sdg" className="mine-link" style={{ fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          Details <ArrowUpRight size={13} />
        </Link>
      </div>

      {/* Stats — same three-cell pattern as the Auto-Drop Agent panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { l: 'SDG effort score', v: `${totalPoints.toLocaleString()} pts` },
          { l: 'Impact tier',      v: `${badge} ${tier}` },
          { l: 'Airdrop bonus',    v: `${multiplier} multiplier` },
        ].map(s => (
          <div key={s.l} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--mine-surface-2)', minWidth: 0 }}>
            <p style={{ fontSize: 10.5, color: 'var(--mine-text-2)', margin: '0 0 5px' }}>{s.l}</p>
            <p className="mine-num" style={{ fontSize: 13, fontWeight: 500, color: 'var(--mine-text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Progress toward next tier */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mine-text-2)', marginBottom: 6 }}>
          <span>Next milestone: {nextTierPts} pts</span>
          <span className="mine-num">{progressToNextTier}% complete</span>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressToNextTier}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ height: '100%', borderRadius: 4, background: 'var(--mine-accent)' }}
          />
        </div>
      </div>

      {/* Tabs — plain, matching the launchpool "Open/Closed" tag language */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, borderBottom: '1px solid var(--mine-line)' }}>
        {[
          { id: 'goals' as const, label: 'UN SDG goals breakdown', icon: Leaf },
          { id: 'earn'  as const, label: 'Earn points',            icon: Zap },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 4px', marginBottom: -1,
              borderRadius: 0, border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--mine-accent)' : '2px solid transparent',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 600,
              color: activeTab === t.id ? 'var(--mine-text)' : 'var(--mine-text-2)',
              transition: 'color 0.15s ease',
            }}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Goals breakdown */}
      {activeTab === 'goals' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(135px,100%), 1fr))', gap: 8 }}>
          {goals.map((g) => (
            <div key={g.code} style={{ borderRadius: 12, padding: '10px 12px', background: 'var(--mine-surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--mine-text-2)' }}>{g.code}</span>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--mine-text)', lineHeight: 1.25 }}>
                {g.name}
              </p>
              <div style={{ paddingTop: 6, borderTop: '1px solid var(--mine-line)' }}>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--mine-text-2)' }}>{g.impactMetric}</p>
                <p className="mine-num" style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--mine-text)' }}>{g.impactValue}</p>
                <p className="mine-num" style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--mine-dim)' }}>
                  {g.points} pts ({g.actionsCount} actions)
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Actionable SDG tasks */}
      {activeTab === 'earn' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {availableActions.map((act) => (
            <div key={act.id} style={{
              borderRadius: 12, padding: '10px 12px',
              background: 'var(--mine-surface-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{ ...cardIcon, background: 'var(--mine-surface)', fontSize: 15 }}>{act.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--mine-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {act.title}
                    </p>
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--mine-text-2)', flexShrink: 0 }}>
                      SDG {act.sdgNumber}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--mine-text-2)', lineHeight: 1.25 }}>
                    {act.desc}
                  </p>
                </div>
              </div>

              <motion.button
                whileTap={submittingId === act.id ? {} : { scale: 0.96 }}
                onClick={() => handleClaim(act.id)}
                disabled={submittingId === act.id}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none',
                  cursor: submittingId === act.id ? 'not-allowed' : 'pointer',
                  background: 'var(--mine-accent)', color: '#fff',
                  fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  opacity: submittingId === act.id ? 0.6 : 1,
                }}
              >
                {submittingId === act.id ? <Loader2 size={12} className="animate-spin" /> : <>+{act.points} pts</>}
              </motion.button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
