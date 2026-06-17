"use client";

import { useEffect, useRef } from "react";
import { computeFrame } from "@/lib/visualizer/engine";
import { readSpectrum, setSmoothing, setRelease } from "@/lib/visualizer/audio";
import { canvas2dRenderer } from "@/lib/visualizer/renderers/canvas2d";
import {
  DEFAULT_PROFILES,
  type Profile,
  type VisualizerState,
} from "@/lib/visualizer/profile";
import { DEFAULT_GLOBALS, type GlobalConfig } from "@/lib/visualizer/config";

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function VoiceVisualizer({
  state,
  profiles = DEFAULT_PROFILES,
  config = DEFAULT_GLOBALS,
  width = 420,
  height = 320,
  className = "",
}: {
  state: VisualizerState;
  profiles?: Record<VisualizerState, Profile>;
  config?: GlobalConfig;
  width?: number;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // Push audio-feel knobs onto the analyser/envelope whenever they change.
  useEffect(() => {
    setSmoothing(config.smoothing);
  }, [config.smoothing]);
  useEffect(() => {
    setRelease(config.release);
  }, [config.release]);

  // Morph bookkeeping lives in refs so the RAF loop reads fresh values without
  // re-subscribing every frame.
  const fromState = useRef<VisualizerState>(state);
  const toState = useRef<VisualizerState>(state);
  const morphStart = useRef<number>(0);
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  // On state change, begin a new morph from wherever we are to the new state.
  useEffect(() => {
    if (state === toState.current) return;
    fromState.current = toState.current;
    toState.current = state;
    morphStart.current = (typeof performance !== "undefined" ? performance.now() : 0);
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const loop = (now: number) => {
      const p = profilesRef.current;
      const to = p[toState.current];
      const from = p[fromState.current];
      const dur = to.transitionMs || 1;
      const k = easeInOut(Math.min(1, Math.max(0, (now - morphStart.current) / dur)));

      const { level, bands, pitch } = readSpectrum();
      const frame = computeFrame({ from, to, k, level, bands, pitch, t: now / 1000, config: configRef.current });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvas.style.backdropFilter = frame.backdropBlur > 0 ? `blur(${frame.backdropBlur}px)` : "";
      canvas2dRenderer.draw(ctx, frame, width, height);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return (
    <div className={`flex justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        aria-hidden="true"
      />
    </div>
  );
}
