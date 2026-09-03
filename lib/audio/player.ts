"use client";
/**
 * One persistent <audio> element for all TTS playback.
 *
 * Mobile Safari (and Chrome on Android to a lesser degree) only lets a media
 * element start playing inside a user gesture. The first question plays
 * because "Start" is a tap; every later question arrives after async STT /
 * LLM / TTS fetches, well outside any gesture, so a fresh `new Audio(url)`
 * is silently blocked. The escape hatch browsers provide: an element that
 * has ALREADY played during a gesture may be re-used programmatically.
 * So we create one element, "unlock" it with a silent clip on the first
 * gesture anywhere on the page, and swap its `src` for every phrase.
 */

// 0.05s of silence — tiny WAV so unlocking never touches the network.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

let el: HTMLAudioElement | null = null;
let unlocked = false;

export function getPlayer(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!el) {
    el = new Audio();
    el.preload = "auto";
    // iOS: keep playback inline rather than hijacking into the fullscreen player.
    el.setAttribute("playsinline", "");
  }
  return el;
}

export function isUnlocked(): boolean {
  return unlocked;
}

/** Call from a user gesture (pointerdown/keydown). Idempotent. */
export function unlockPlayer(): void {
  const a = getPlayer();
  if (!a || unlocked) return;
  unlocked = true;
  a.src = SILENT_WAV;
  const p = a.play();
  if (p && typeof p.then === "function") {
    p.then(() => a.pause()).catch(() => { unlocked = false; }); // not a real gesture — retry next time
  }
}

/** Hook the first gesture on the page to unlock. Returns a cleanup. */
export function installUnlockOnGesture(target: Window = window): () => void {
  const onGesture = () => {
    unlockPlayer();
    if (unlocked) remove();
  };
  const remove = () => {
    target.removeEventListener("pointerdown", onGesture);
    target.removeEventListener("keydown", onGesture);
    target.removeEventListener("touchend", onGesture);
  };
  target.addEventListener("pointerdown", onGesture);
  target.addEventListener("keydown", onGesture);
  target.addEventListener("touchend", onGesture);
  return remove;
}

/** Play a URL on the shared element; resolves when playback ends (or fails,
 *  or is superseded by a newer play call). */
export function playOnPlayer(
  url: string,
  hooks?: { onStart?: (el: HTMLAudioElement) => void; onFinish?: (el: HTMLAudioElement) => void },
): Promise<void> {
  const a = getPlayer();
  if (!a) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      a.removeEventListener("ended", finish);
      a.removeEventListener("error", finish);
      a.removeEventListener("emptied", finish);
      hooks?.onFinish?.(a);
      resolve();
    };
    a.addEventListener("ended", finish);
    a.addEventListener("error", finish);
    // A newer play() swaps src → "emptied" fires → this one resolves.
    a.addEventListener("emptied", finish);
    a.src = url;
    hooks?.onStart?.(a);
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(finish);
  });
}

/** Test hook. */
export function _resetPlayerForTests(): void {
  el = null;
  unlocked = false;
}
