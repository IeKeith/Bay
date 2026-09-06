import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSpeechOptions {
  onTranscript: (text: string) => void;
  lang?: string;
  silenceTimeoutMs?: number;
}

export function useSpeech({
  onTranscript,
  lang = 'en-SG',
  silenceTimeoutMs = 1800,
}: UseSpeechOptions) {
  const [isListening, setIsListening] = useState(false);
  const [autoListen, setAutoListen] = useState(true);
  const [isSupported, setIsSupported] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');

  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const silenceTimerRef = useRef<any>(null);
  const accumulatedFinalRef = useRef('');
  const latestInterimRef = useRef('');
  const shouldListenRef = useRef(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const flushTranscript = useCallback(() => {
    clearSilenceTimer();
    const finalPart = accumulatedFinalRef.current.trim();
    const interimPart = latestInterimRef.current.trim();
    const fullTranscript = `${finalPart} ${interimPart}`.trim();

    accumulatedFinalRef.current = '';
    latestInterimRef.current = '';
    setInterimTranscript('');
    setLiveTranscript('');

    if (fullTranscript) {
      onTranscriptRef.current(fullTranscript);
    }
    return fullTranscript;
  }, [clearSilenceTimer]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
      shouldListenRef.current = true;
    };

    recognition.onresult = (event: any) => {
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        const text = item[0]?.transcript || '';
        if (item.isFinal) {
          accumulatedFinalRef.current = `${accumulatedFinalRef.current} ${text}`.trim();
        } else {
          currentInterim += text;
        }
      }

      latestInterimRef.current = currentInterim;
      setInterimTranscript(currentInterim);

      const combinedText = `${accumulatedFinalRef.current} ${currentInterim}`.trim();
      setLiveTranscript(combinedText);

      // Only schedule silence debounce if we actually have text
      if (combinedText) {
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          shouldListenRef.current = false;
          flushTranscript();
          try {
            recognition.stop();
          } catch (e) {}
        }, silenceTimeoutMs);
      }
    };

    recognition.onerror = (err: any) => {
      if (err.error !== 'no-speech') {
        console.warn('[STT] recognition error:', err.error);
      }
      if (err.error === 'aborted' || err.error === 'network') {
        clearSilenceTimer();
        flushTranscript();
        setIsListening(false);
        shouldListenRef.current = false;
      }
    };

    recognition.onend = () => {
      clearSilenceTimer();
      // If browser ended while user still intended to listen without any text
      if (shouldListenRef.current) {
        const flushed = flushTranscript();
        if (flushed) {
          shouldListenRef.current = false;
          setIsListening(false);
        } else {
          // Restart if still marked as shouldListen and no error
          try {
            recognition.start();
            return;
          } catch (e) {
            shouldListenRef.current = false;
            setIsListening(false);
          }
        }
      } else {
        flushTranscript();
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      clearSilenceTimer();
      shouldListenRef.current = false;
      try {
        recognition.stop();
      } catch (e) {}
    };
  }, [lang, silenceTimeoutMs, clearSilenceTimer, flushTranscript]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    clearSilenceTimer();
    accumulatedFinalRef.current = '';
    latestInterimRef.current = '';
    setInterimTranscript('');
    setLiveTranscript('');
    shouldListenRef.current = true;

    try {
      recognitionRef.current.start();
    } catch (e) {
      // Already running
    }
  }, [clearSilenceTimer]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    clearSilenceTimer();
    flushTranscript();

    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (e) {}
    setIsListening(false);
  }, [clearSilenceTimer, flushTranscript]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    autoListen,
    setAutoListen,
    isSupported,
    interimTranscript,
    liveTranscript,
    startListening,
    stopListening,
    toggleListening,
  };
}
