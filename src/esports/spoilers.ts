import { useSyncExternalStore } from "react";

// Which series the player asked to see (esports-sin-spoilers.md, the
// owner's choice of 2026-09-27): every result is hidden until the eye next
// to that one series is pressed, per match and per machine, like the app's
// own settings. Same idea and same storage key as the web's
// src/lib/esports/spoilers.ts; here nothing is server rendered, so the
// screens simply read the set and draw the mask for everything else.

const STORAGE_KEY = "riftcompass:esports:revealed";
const CHANGE_EVENT = "riftcompass:esports:revealed";
// What 0.3.37 stored, with the opposite meaning: dropped on first read.
const OLD_KEY = "riftcompass:esports:hidden";

// The memory is the truth and storage its mirror: when storage refuses,
// the eye still works for the session, and nothing is remembered. Cleared
// on a "storage" event, which is another window of the app writing.
let memory: string[] | null = null;

export function readRevealedSeries(): string[] {
  if (memory) return memory;
  try {
    localStorage.removeItem(OLD_KEY);
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    memory = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    memory = [];
  }
  return memory;
}

export function setSeriesRevealed(id: string, revealed: boolean): void {
  const current = readRevealedSeries();
  const next = revealed ? (current.includes(id) ? current : [...current, id]) : current.filter((other) => other !== id);
  memory = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the change lasts the session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void): () => void {
  const fromOtherWindow = () => {
    memory = null;
    listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", fromOtherWindow);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", fromOtherWindow);
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
