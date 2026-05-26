import { initialState, type State } from "./state";

export const STORAGE_KEY = "learn-chinese:conversation:v1";

export function saveState(s: State): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function loadState(): State | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<State>;
    // Merge with initialState so older saved snapshots without newer fields
    // (mastery, introducedIds, etc.) get sensible defaults.
    return { ...initialState(), ...parsed };
  } catch {
    return null;
  }
}

export function clearState(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
