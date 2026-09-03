"use client";
import { useEffect, useRef } from "react";

/**
 * Horizontal answer-window bar. Fills over `durationMs`; fires `onTimeout`
 * once when full.
 *
 * `paused` freezes both the countdown and the CSS fill (holding the mic, AI
 * busy) and RESUMES from the remaining time — pressing space never costs the
 * learner their window. Only `resetKey` (a new AI question) or an
 * inactive→active cycle restarts the full duration. Renders nothing inactive.
 */
export function TimerBar({
  active,
  paused = false,
  durationMs,
  onTimeout,
  resetKey,
}: {
  active: boolean;
  paused?: boolean;
  durationMs: number;
  onTimeout: () => void;
  resetKey: number | string;
}) {
  // Keep the latest callback without re-arming the timer on every render.
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  // Remaining time survives pause/resume; a new window resets it.
  const remainingRef = useRef(durationMs);
  useEffect(() => {
    remainingRef.current = durationMs;
  }, [resetKey, active, durationMs]);

  useEffect(() => {
    if (!active || paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onTimeoutRef.current(), remainingRef.current);
    return () => {
      clearTimeout(timer);
      // Bank the elapsed slice so a resume continues where we stopped.
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [active, paused, resetKey, durationMs]);

  if (!active) return null;

  return (
    <div
      role="timer"
      aria-label="time remaining to answer"
      className="h-1.5 w-full rounded-full bg-ink-soft/10 overflow-hidden"
    >
      <div
        key={String(resetKey)}
        className="h-full rounded-full bg-terracotta/70"
        style={{
          width: "0%",
          animation: `timerbar-fill ${durationMs}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </div>
  );
}
