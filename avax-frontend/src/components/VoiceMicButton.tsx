'use client';

import { useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, Loader2 } from 'lucide-react';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';

interface VoiceMicButtonProps {
  onCommand: (text: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showVoiceToggle?: boolean;
  className?: string;
}

export default function VoiceMicButton({
  onCommand,
  disabled = false,
  size = 'md',
  showVoiceToggle = true,
  className = '',
}: VoiceMicButtonProps) {
  const [liveText, setLiveText] = useState('');

  const {
    isListening,
    isProcessing,
    isSpeaking,
    interimTranscript,
    isSupported,
    volumeLevel,
    speechEnabled,
    setSpeechEnabled,
    toggleListening,
    stopListening,
  } = useVoiceAgent({
    onTranscript: (text) => {
      setLiveText(text);
    },
    onIntentDetected: (finalText) => {
      setLiveText(finalText);
      onCommand(finalText);
      setTimeout(() => setLiveText(''), 2500);
    },
  });

  const buttonSize = size === 'sm' ? 36 : size === 'lg' ? 52 : 44;
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;

  if (!isSupported) {
    return null;
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }} className={className}>
      {/* Live Speech Feedback Tooltip */}
      {(isListening || isProcessing || liveText) && (
        <div
          style={{
            position: 'absolute',
            bottom: buttonSize + 12,
            right: 0,
            background: 'rgba(8,12,10,0.95)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(52,211,153,0.4)',
            borderRadius: 12,
            padding: '8px 12px',
            boxShadow: '0 8px 32px rgba(16,185,129,0.3), 0 0 0 1px rgba(255,255,255,0.06)',
            zIndex: 50,
            minWidth: 180,
            maxWidth: 280,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isListening ? '#34d399' : isProcessing ? '#f59e0b' : '#10b981',
                  boxShadow: isListening ? '0 0 8px #34d399' : 'none',
                  animation: isListening || isProcessing ? 'pulse 1s infinite' : 'none',
                }}
              />
              <span style={{ fontSize: 10, fontWeight: 800, color: isProcessing ? '#f59e0b' : '#34d399', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {isProcessing ? 'Transcribing…' : isListening ? 'Listening…' : 'Heard'}
              </span>
            </div>

            {/* Simulated Live Audio Equalizer Waveform */}
            {isListening && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 12 }}>
                {[1, 2, 3, 4, 5].map((i) => {
                  const height = Math.max(3, Math.min(12, (volumeLevel / 100) * 14 * (i % 2 === 0 ? 0.7 : 1.2)));
                  return (
                    <span
                      key={i}
                      style={{
                        width: 2.5,
                        height,
                        borderRadius: 2,
                        background: '#34d399',
                        transition: 'height 0.08s ease',
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <p style={{ margin: 0, fontSize: 12, color: '#fff', fontWeight: 500, lineHeight: 1.4, wordBreak: 'break-word' }}>
            {isProcessing ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Processing voice audio with Gemini…
              </span>
            ) : (
              interimTranscript || liveText || 'Speak your command… (e.g. "What is NVR?", "Show vaults")'
            )}
          </p>
        </div>
      )}

      {/* Main Microphone Button */}
      <button
        type="button"
        onClick={toggleListening}
        disabled={disabled || isProcessing}
        title={isListening ? 'Stop listening' : 'Speak with KAI Gemini Agent'}
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: '50%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
          background: isListening
            ? 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #047857 100%)'
            : isProcessing
            ? 'rgba(245,158,11,0.15)'
            : 'rgba(16,185,129,0.12)',
          border: isListening
            ? '2px solid #6ee7b7'
            : isProcessing
            ? '1px solid rgba(245,158,11,0.5)'
            : '1px solid rgba(16,185,129,0.3)',
          boxShadow: isListening
            ? '0 0 24px rgba(16,185,129,0.8), 0 0 6px rgba(255,255,255,0.5)'
            : '0 2px 8px rgba(0,0,0,0.2)',
          color: isListening ? '#ffffff' : isProcessing ? '#f59e0b' : '#34d399',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          flexShrink: 0,
        }}
      >
        {/* Pulsing Ripple Rings when listening */}
        {isListening && (
          <>
            <span
              style={{
                position: 'absolute',
                inset: -6,
                borderRadius: '50%',
                border: '2px solid rgba(52,211,153,0.6)',
                animation: 'pulse 1.4s ease-out infinite',
                pointerEvents: 'none',
              }}
            />
            <span
              style={{
                position: 'absolute',
                inset: -12,
                borderRadius: '50%',
                border: '2px solid rgba(52,211,153,0.3)',
                animation: 'pulse 1.4s 0.4s ease-out infinite',
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {isProcessing ? (
          <Loader2 size={iconSize} color="#f59e0b" style={{ animation: 'spin 1s linear infinite' }} />
        ) : isListening ? (
          <Mic size={iconSize} color="#fff" strokeWidth={2.4} />
        ) : (
          <Mic size={iconSize} color="#34d399" strokeWidth={2} />
        )}
      </button>

      {/* Voice TTS Toggle (optional) */}
      {showVoiceToggle && (
        <button
          type="button"
          onClick={() => setSpeechEnabled(!speechEnabled)}
          title={speechEnabled ? 'Agent voice reply is ON' : 'Agent voice reply is OFF'}
          style={{
            width: buttonSize * 0.72,
            height: buttonSize * 0.72,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: speechEnabled ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.04)',
            border: speechEnabled ? '1px solid rgba(16,185,129,0.35)' : '1px solid rgba(255,255,255,0.1)',
            color: speechEnabled ? '#34d399' : 'rgba(255,255,255,0.3)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
        >
          {speechEnabled ? <Volume2 size={iconSize * 0.75} /> : <VolumeX size={iconSize * 0.75} />}
        </button>
      )}
    </div>
  );
}
