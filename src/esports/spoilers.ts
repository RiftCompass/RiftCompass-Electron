import { useSyncExternalStore } from "react";

// Which series the player asked to see (esports-sin-spoilers.md, the
// owner's choice of 2026-09-27): every result is hidden until the eye next
// to that one series is pressed, per match and per machine, like the app's
// own settings. Same idea and same storage key as the web's
// src/lib/esports/spoilers.ts; here nothing is server rendered, so the
// screens simply read the set and draw the mask for everything else.

const STORAGE_KEY = "riftcompass:esports:revealed";
const CHANGE_EVENT = "riftcompass:esports:revealed";

export function readRevealedSeries(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function setSeriesRevealed(id: string, revealed: boolean): void {
  const current = readRevealedSeries();
  const next = revealed ? (current.includes(id) ? current : [...current, id]) : current.filter((other) => other !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the change lasts the session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

// A joined string as the snapshot: useSyncExternalStore wants equal values
// between reads when nothing changed, which a fresh array never is.
function snapshot(): string {
  return readRevealedSeries().join(" ");
}

/** The revealed series, live: any screen that draws a result reads this. */
export function useRevealedSeries(): Set<string> {
  const joined = useSyncExternalStore(subscribe, snapshot);
  return new Set(joined ? joined.split(" ") : []);
}
