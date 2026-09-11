import { API_BASE_URL } from "../shared/api";

// Riot has no LP-history endpoint, only the current standing, so a
// player's LP graph on riftcompass.com is exactly the standings the
// server managed to capture (see the web repo's rank-snapshot.ts). This
// app knows the one moment a capture is guaranteed to add a point — the
// local player's game just ended — so it asks the server for a single
// League-V4 call then (POST /api/v1/rank-snapshot), instead of waiting for
// someone to open the profile page. League-V4 lags the end of a game by
// anything from seconds to a few minutes, so: first try after a short
// delay, and only if the standing hadn't moved yet, one more try later.
export const FIRST_ATTEMPT_DELAY_MS = 90_000;
export const SECOND_ATTEMPT_DELAY_MS = 5 * 60_000;

export type RankSnapshotOutcome = "changed" | "unchanged" | "failed";

export async function requestRankSnapshot(platform: string, puuid: string): Promise<RankSnapshotOutcome> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/rank-snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, puuid }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return "failed";
    const data = (await res.json()) as { changed?: boolean };
    return data.changed ? "changed" : "unchanged";
  } catch {
    return "failed";
  }
}

// Schedules the two attempts above for one finished game. Returns a
// cancel function: a new game starting (or the identity changing) before
// the second attempt fires makes that attempt pointless, since the next
// game's own end will schedule its own.
export function scheduleRankSnapshot(
  platform: string,
  puuid: string,
  request: (platform: string, puuid: string) => Promise<RankSnapshotOutcome> = requestRankSnapshot,
  delays: { first: number; second: number } = { first: FIRST_ATTEMPT_DELAY_MS, second: SECOND_ATTEMPT_DELAY_MS },
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  timer = setTimeout(async () => {
    if (cancelled) return;
    const outcome = await request(platform, puuid);
    if (cancelled || outcome === "changed") return;
    timer = setTimeout(() => {
      if (!cancelled) void request(platform, puuid);
    }, delays.second - delays.first);
  }, delays.first);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
