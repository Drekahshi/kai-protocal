"use client";

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import BottomNav from '@/components/shared/BottomNav';
const AIChatOverlay = dynamic(() => import('@/components/ai/AIChatOverlay'), { ssr: false });
const GlobalVoiceAssistant = dynamic(() => import('@/components/GlobalVoiceAssistant'), { ssr: false });

const FULLSCREEN_ROUTES = ['/nuvari', '/ai', '/chat', '/voice'];
/* Exact matches only — '/kai' would otherwise prefix-match '/kai-bar' */
const FULLSCREEN_EXACT_ROUTES = ['/kai'];

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_ROUTES.some(r => pathname?.startsWith(r))
    || FULLSCREEN_EXACT_ROUTES.includes(pathname ?? '');

  if (isFullscreen) {
    return (
      <div style={{ width: '100%', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {children}
        <AIChatOverlay />
        <GlobalVoiceAssistant />
      </div>
    );
  }

  return (
    <>
      {/* Full-bleed shell — no max-width cap so desktop fills the screen */}
      <div style={{ width: '100%', minHeight: '100dvh', position: 'relative' }}>
        {children}
      </div>
      <BottomNav />
      <AIChatOverlay />
      <GlobalVoiceAssistant />
    </>
  );
}
