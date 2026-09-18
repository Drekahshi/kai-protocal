'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface VoiceAgentOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onIntentDetected?: (commandText: string) => void;
  lang?: string;
  preferNativeGeminiSTT?: boolean;
}

export function useVoiceAgent(options: VoiceAgentOptions = {}) {
  const {
    lang = 'en-US',
    onTranscript,
    onIntentDetected,
    preferNativeGeminiSTT = false,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [volumeLevel, setVolumeLevel] = useState(0); // 0 to 100
  const [speechEnabled, setSpeechEnabled] = useState(true);

  // References
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Sound effects via Web Audio API
  const playSoundCue = useCallback((type: 'start' | 'stop' | 'success') => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'stop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {
      // AudioContext unavailable
    }
  }, []);

  // Transcribe recorded audio with server-side Gemini STT API
  const transcribeAudioBlob = useCallback(
    async (blob: Blob): Promise<string> => {
      try {
        setIsProcessing(true);
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');

        const res = await fetch('/api/voice/transcribe', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.warn('[Gemini STT] Transcription failed:', err);
          return '';
        }

        const data = await res.json();
        return data.text || '';
      } catch (err) {
        console.error('[Gemini STT] Network/Server error:', err);
        return '';
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  // Initialize browser SpeechRecognition if present
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        const activeText = final || interim;
        if (interim) {
          setInterimTranscript(interim);
          onTranscript?.(interim, false);
        }
        if (final) {
          setTranscript(final);
          setInterimTranscript('');
          onTranscript?.(final, true);
          onIntentDetected?.(final.trim());
        }

        // Auto-silence auto-stop timer (2.5s)
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (activeText.trim().length > 0 && isListening) {
            try {
              recognition.stop();
            } catch {}
          }
        }, 2500);
      };

      recognition.onerror = (event: any) => {
        console.warn('[VoiceAgent] WebSpeech recognition notice:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        playSoundCue('stop');
      };

      recognitionRef.current = recognition;
    }

    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [lang, onIntentDetected, onTranscript, playSoundCue, isListening]);

  // Clean up audio stream & analysis
  const cleanupAudio = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setVolumeLevel(0);
  }, []);

  // Start real-time microphone stream + MediaRecorder + Web Audio Visualizer
  const startListening = useCallback(async () => {
    try {
      if (synthRef.current && synthRef.current.speaking) {
        synthRef.current.cancel();
        setIsSpeaking(false);
      }

      setTranscript('');
      setInterimTranscript('');
      audioChunksRef.current = [];

      // Request microphone access for audio capture and decibel metering
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Setup Web Audio Analyser for real-time soundwave visualization
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioCtxRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          // Scale decibel average to 0 - 100 range
          const scaled = Math.min(100, Math.round((avg / 128) * 100 * 1.6));
          setVolumeLevel(scaled);
          animFrameRef.current = requestAnimationFrame(checkVolume);
        };
        animFrameRef.current = requestAnimationFrame(checkVolume);
      }

      // Initialize MediaRecorder to capture audio for Gemini Speech-to-Text
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        cleanupAudio();
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 1000) {
          // If native Gemini STT is preferred, or WebSpeech produced nothing
          const geminiText = await transcribeAudioBlob(audioBlob);
          if (geminiText) {
            setTranscript(geminiText);
            setInterimTranscript('');
            onTranscript?.(geminiText, true);
            onIntentDetected?.(geminiText.trim());
            playSoundCue('success');
          }
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;

      // Also trigger WebSpeech recognition if present for zero-latency local interim feedback
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {
          try {
            recognitionRef.current.abort();
            setTimeout(() => recognitionRef.current?.start(), 100);
          } catch {}
        }
      }

      setIsListening(true);
      playSoundCue('start');
    } catch (err) {
      console.warn('[VoiceAgent] Could not access microphone:', err);
      setIsListening(false);
      cleanupAudio();
    }
  }, [cleanupAudio, onIntentDetected, onTranscript, playSoundCue, transcribeAudioBlob]);

  // Stop recording and process
  const stopListening = useCallback(() => {
    setIsListening(false);
    playSoundCue('stop');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    } else {
      cleanupAudio();
    }
  }, [cleanupAudio, playSoundCue]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Text-To-Speech
  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!speechEnabled || typeof window === 'undefined' || !window.speechSynthesis) {
        onEnd?.();
        return;
      }

      window.speechSynthesis.cancel();

      // Clean markdown tags & emojis
      const cleanText = text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/[#*_\->`~]/g, '')
        .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
        .trim();

      if (!cleanText) {
        onEnd?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find(
          (v) =>
            (v.name.includes('Google') ||
              v.name.includes('Natural') ||
              v.name.includes('Samantha') ||
              v.name.includes('Karen')) &&
            v.lang.startsWith('en')
        ) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];

      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        onEnd?.();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        onEnd?.();
      };

      window.speechSynthesis.speak(utterance);
    },
    [speechEnabled]
  );

  const cancelSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  return {
    isListening,
    isProcessing,
    isSpeaking,
    transcript,
    interimTranscript,
    isSupported,
    volumeLevel,
    speechEnabled,
    setSpeechEnabled,
    startListening,
    stopListening,
    toggleListening,
    speak,
    cancelSpeech,
    playSoundCue,
  };
}
