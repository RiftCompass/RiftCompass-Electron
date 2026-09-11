import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleRankSnapshot, type RankSnapshotOutcome } from "./rank-snapshot";

describe("scheduleRankSnapshot", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const delays = { first: 100, second: 500 };

  it("stops after the first attempt when the standing already moved", async () => {
    const request = vi.fn<(p: string, u: string) => Promise<RankSnapshotOutcome>>().mockResolvedValue("changed");
    scheduleRankSnapshot("euw1", "puuid", request, delays);
    await vi.advanceTimersByTimeAsync(600);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("euw1", "puuid");
  });

  it("retries once, at the second delay, when Riot had not caught up yet", async () => {
    const request = vi.fn<(p: string, u: string) => Promise<RankSnapshotOutcome>>().mockResolvedValue("unchanged");
    scheduleRankSnapshot("euw1", "puuid", request, delays);
    await vi.advanceTimersByTimeAsync(150);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does nothing more once cancelled (a new game started)", async () => {
    const request = vi.fn<(p: string, u: string) => Promise<RankSnapshotOutcome>>().mockResolvedValue("unchanged");
    const cancel = scheduleRankSnapshot("euw1", "puuid", request, delays);
    await vi.advanceTimersByTimeAsync(150);
    cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
