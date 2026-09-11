import { describe, expect, it } from "vitest";
import { computeSeasonPeaks } from "./rank-lp";

// Same cases as the web's rank-lp.test.ts (computeSeasonPeaks block) — the
// two copies must keep cutting seasons at the same place.
const row = (tier: string, rank: string, lp: number, wins: number, losses: number, day: number) => ({
  tier,
  rank,
  leaguePoints: lp,
  wins,
  losses,
  capturedAt: new Date(2026, 7, day).toISOString(),
});

describe("computeSeasonPeaks", () => {
  it("returns nothing without snapshots", () => {
    expect(computeSeasonPeaks([])).toEqual([]);
  });

  it("keeps the peak, not the latest standing, of a single season", () => {
    const peaks = computeSeasonPeaks([
      row("GOLD", "II", 40, 100, 90, 1),
      row("GOLD", "I", 75, 110, 95, 5),
      row("GOLD", "II", 10, 115, 105, 9),
    ]);
    expect(peaks).toHaveLength(1);
    expect(peaks[0]).toMatchObject({ tier: "GOLD", rank: "I", leaguePoints: 75, games: 220 });
    expect(peaks[0].from).toEqual(new Date(2026, 7, 1));
    expect(peaks[0].to).toEqual(new Date(2026, 7, 9));
  });

  it("splits seasons where the ranked game counter resets, newest first", () => {
    const peaks = computeSeasonPeaks([
      row("PLATINUM", "IV", 20, 200, 190, 1),
      row("PLATINUM", "III", 5, 205, 192, 3),
      row("SILVER", "I", 0, 3, 2, 10),
      row("GOLD", "IV", 30, 20, 15, 20),
    ]);
    expect(peaks.map((p) => `${p.tier} ${p.rank}`)).toEqual(["GOLD IV", "PLATINUM III"]);
    expect(peaks[0].games).toBe(35);
  });
});
