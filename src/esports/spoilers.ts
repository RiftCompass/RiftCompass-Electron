import { useSyncExternalStore } from "react";

// Which series the player asked to keep hidden (esports-sin-spoilers.md, the
// owner's choice of 2026-09-26): a set of series ids in localStorage, per
// match and per machine, like the app's own settings. Same idea as the
// web's src/lib/esports/spoilers.ts; here nothing is server rendered, so the
// screens simply read the set and draw the mask themselves.

const STORAGE_KEY = "riftcompass:esports:hidden";
const CHANGE_EVENT = "riftcompass:esports:hidden";

export function readHiddenSeries(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function setSeriesHidden(id: string, hidden: boolean): void {
  const current = readHiddenSeries();
  const next = hidden ? (current.includes(id) ? current : [...current, id]) : current.filter((other) => other !== id);
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
  return readHiddenSeries().join(" ");
}

/** The hidden series, live: any screen that draws a result reads this. */
export function useHiddenSeries(): Set<string> {
  const joined = useSyncExternalStore(subscribe, snapshot);
  return new Set(joined ? joined.split(" ") : []);
}
