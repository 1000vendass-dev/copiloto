"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ordem de preferência: Chrome/Android grava webm/opus; iPhone (Safari) grava mp4/aac
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const MAX_SECONDS = 5 * 60;

/** Grava áudio do microfone com o MediaRecorder do navegador. */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef<((b: Blob | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não grava áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = chunks.current.length ? new Blob(chunks.current, { type: rec.mimeType || mimeType || "audio/webm" }) : null;
        done.current?.(blob);
        done.current = null;
      };
      recRef.current = rec;
      rec.start(250);
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) recRef.current?.stop();
        return s + 1;
      }), 1000);
    } catch {
      setError("Permita o uso do microfone para gravar.");
      cleanup();
    }
  }, [cleanup]);

  /** Para e devolve o áudio (null se nada foi gravado). */
  const stop = useCallback(() => new Promise<Blob | null>((resolve) => {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") { cleanup(); resolve(null); return; }
    done.current = (b) => { cleanup(); resolve(b); };
    rec.stop();
  }), [cleanup]);

  const cancel = useCallback(() => { void stop(); }, [stop]);

  return { recording, seconds, error, start, stop, cancel };
}

export const fmtSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
