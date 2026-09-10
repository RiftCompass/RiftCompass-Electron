import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { fetchChampionMap, toDDragonId, type ChampionInfo } from "../ddragon";
import { POOL_ROLES } from "../lib/champion-pool-builder";
import { type PersonalityRole } from "../lib/personality-test";
import { positionIconUrl } from "../lib/profile-analysis";
import { TIERS, TIER_COLORS, type Tier } from "../lib/tier-colors";
import { API_BASE_URL } from "../shared/api";
import { useI18n } from "../i18n";
import { COLORS, FONT_HEADING, cardStyle as makeCardStyle, pillStyle } from "../theme";

// Ported from the web app's /tools/meta-tier-list page and
// src/lib/crawler/meta-tier-list.ts's tierChampionsByWinrate — same
// percentile-based tiering (S = best-performing slice of what's been
// measured for that role SO FAR, not a fixed win-rate cutoff, since the
// crawler's dataset is still small and growing) against the same real data,
// fetched from riftcompass.com's public /api/v1/champion-winrates instead
// of the site's own DB directly.
interface ChampionWinrate {
  championName: string;
  role: string;
  patch: string;
  games: number;
  wins: number;
  winRate: number;
}

interface TieredWinrate extends ChampionWinrate {
  tier: Tier;
}

function tierByWinrate(entries: ChampionWinrate[]): TieredWinrate[] {
  const sorted = [...entries].sort((a, b) => b.winRate - a.winRate);
  const total = sorted.length;
  return sorted.map((entry, index) => {
    const tierIndex = Math.min(TIERS.length - 1, Math.floor((index / total) * TIERS.length));
    return { ...entry, tier: TIERS[tierIndex] };
  });
}

function groupByRole(winrates: ChampionWinrate[]): Record<string, TieredWinrate[]> {
  const byRole = new Map<string, ChampionWinrate[]>();
  for (const entry of winrates) {
    const list = byRole.get(entry.role) ?? [];
    list.push(entry);
    byRole.set(entry.role, list);
  }
  const result: Record<string, TieredWinrate[]> = {};
  for (const [role, entries] of byRole) result[role] = tierByWinrate(entries);
  return result;
}

const RANK_TIERS = ["CHALLENGER", "GRANDMASTER", "MASTER", "DIAMOND", "EMERALD", "PLATINUM", "GOLD", "SILVER", "BRONZE", "IRON"] as const;

export function MetaTierList() {
  const { t } = useI18n();
  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [rank, setRank] = useState<(typeof RANK_TIERS)[number]>("CHALLENGER");
  const [winrates, setWinrates] = useState<ChampionWinrate[] | null>(null);
  // Which patch the data actually comes from: the API falls back to the
  // newest patch with enough samples while the current one fills up.
  const [dataPatch, setDataPatch] = useState<{ patch: string; latestPatch: string } | null>(null);

  useEffect(() => {
    fetchChampionMap().then((m) => setChampions(Object.values(m.byInternalId)));
  }, []);

  useEffect(() => {
    setWinrates(null);
    setDataPatch(null);
    const url = `${API_BASE_URL}/api/v1/champion-winrates?rank=${rank}`;
    fetch(url)
      .then((r) => r.json())
      .then((data: { winrates: ChampionWinrate[]; patch?: string; latestPatch?: string }) => {
        setWinrates(data.winrates);
        if (data.patch && data.latestPatch) setDataPatch({ patch: data.patch, latestPatch: data.latestPatch });
      })
      .catch(() => setWinrates([]));
  }, [rank]);

  const championByInternalId = useMemo(() => new Map(champions.map((c) => [c.internalId, c])), [champions]);
  const byRole = useMemo(() => (winrates ? groupByRole(winrates) : {}), [winrates]);

  // The search highlights instead of filtering: hiding the rest would throw
  // away the answer it exists to give, which is which tier of which role the
  // champion landed in. Matched against the Data Dragon display name because
  // that's what the chips show; the crawler's own spelling ("FiddleSticks")
  // never reaches the screen.
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const displayName = (championName: string) =>
    championByInternalId.get(toDDragonId(championName))?.name ?? championName;
  const matchCount = winrates
    ? new Set(
        winrates
          .map((entry) => displayName(entry.championName))
          .filter((name) => trimmedSearch && name.toLowerCase().includes(trimmedSearch)),
      ).size
    : 0;

  // The five role cards run well past one screen, so the first match is
  // scrolled into view: a chip glowing below the fold is a chip nobody sees.
  // Centred rather than "nearest" (which lands it flush against the edge,
  // clipping a chip that's scaled up and glowing) and only when it's actually
  // off screen, so typing one more letter doesn't yank a chip that was
  // already in front of the user.
  useEffect(() => {
    if (!trimmedSearch) return;
    const chip = document.querySelector("[data-champion-match]");
    if (!chip) return;
    const { top, bottom } = chip.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) chip.scrollIntoView({ block: "center" });
  }, [trimmedSearch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Only methodologyNote, not intro — the tool header above this
          component (MainView.tsx's ToolsIndex.metaTierList.description)
          already says "real win rate from RiftCompass's own tracked
          matches"; MetaTierList.intro repeats that near-verbatim. The
          genuinely new information web's intro+methodologyNote pair adds
          is the S/D-are-relative-percentiles explanation, which is what
          methodologyNote alone covers. */}
      <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>{t("MetaTierList.methodologyNote")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {RANK_TIERS.map((r) => (
          <button key={r} onClick={() => setRank(r)} style={pillStyle(rank === r, "compact")}>
            {t(`MetaTierList.rankTiers.${r}`)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative", width: 200 }}>
          <MagnifyingGlass
            size={13}
            color={COLORS.muted}
            style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Common.searchChampion")}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              borderBottom: `1px solid ${COLORS.cardBorder}`,
              color: COLORS.text,
              fontSize: 13,
              padding: "4px 4px 4px 22px",
            }}
          />
        </div>
        {trimmedSearch && matchCount === 0 ? (
          <span style={{ fontSize: 13, color: COLORS.muted }}>{t("MetaTierList.noMatches")}</span>
        ) : null}
      </div>

      {dataPatch && winrates && winrates.length > 0 && dataPatch.patch !== dataPatch.latestPatch ? (
        <p style={{ fontSize: 13, color: COLORS.gold, margin: 0 }}>
          {t("MetaTierList.dataFromPatch", { patch: dataPatch.patch, current: dataPatch.latestPatch })}
        </p>
      ) : null}

      {winrates === null ? (
        <p style={{ fontSize: 13, color: COLORS.muted }}>…</p>
      ) : (
        // flex+wrap+center instead of a CSS grid: with 5 role cards a
        // grid's incomplete last row (3 then 2) sticks to the left because
        // grid tracks are shared across every row — flexbox wrap centers
        // each row's own items as a group, so 3-then-2 both end up
        // centered.
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16 }}>
          {(POOL_ROLES as PersonalityRole[]).map((role) => {
            const entries = byRole[role] ?? [];
            return (
              <div key={role} style={{ ...cardStyle, flex: "1 1 420px", maxWidth: 560 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <h2 style={{ fontFamily: FONT_HEADING, fontSize: 16, fontWeight: 400, margin: 0 }}>
                    {t(`Profile.positions.${role.toLowerCase()}`)}
                  </h2>
                  {(() => {
                    const roleIcon = positionIconUrl(role);
                    return roleIcon ? <img src={roleIcon} alt="" style={{ width: 20, height: 20, opacity: 0.8 }} /> : null;
                  })()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
                  {entries.length === 0 ? (
                    <p style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>{t("MetaTierList.noDataForRole")}</p>
                  ) : (
                    TIERS.filter((tier) => entries.some((e) => e.tier === tier)).map((tier, tierIdx) => {
                      const inTier = entries.filter((e) => e.tier === tier);
                      return (
                        <div
                          key={tier}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 0",
                            borderTop: tierIdx > 0 ? `1px solid ${COLORS.cardBorder}` : "none",
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 7,
                              fontSize: 14,
                              fontWeight: 700,
                              background: TIER_COLORS[tier],
                              color: COLORS.text,
                            }}
                          >
                            {tier}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {inTier.map((entry) => {
                              const champ = championByInternalId.get(toDDragonId(entry.championName));
                              const tooltip = t("MetaTierList.chipTooltip", { rate: Math.round(entry.winRate * 100), games: entry.games });
                              const name = champ?.name ?? entry.championName;
                              const matched = trimmedSearch !== "" && name.toLowerCase().includes(trimmedSearch);
                              const dimmed = trimmedSearch !== "" && !matched;
                              return (
                                <div
                                  key={entry.championName}
                                  title={champ ? `${champ.name}: ${tooltip}` : tooltip}
                                  data-champion-match={matched ? "" : undefined}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 3,
                                    transform: matched ? "scale(1.15)" : undefined,
                                    opacity: dimmed ? 0.3 : undefined,
                                    filter: dimmed ? "grayscale(1)" : undefined,
                                    transition: "transform 150ms, opacity 150ms, filter 150ms",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 36,
                                      height: 36,
                                      borderRadius: 7,
                                      overflow: "hidden",
                                      border: `1px solid ${matched ? COLORS.rose : COLORS.cardBorder}`,
                                      boxShadow: matched ? `0 0 0 1px ${COLORS.rose}, 0 0 18px ${COLORS.rose}` : undefined,
                                      filter: matched ? "brightness(1.1)" : undefined,
                                    }}
                                  >
                                    {champ ? (
                                      <img src={champ.iconUrl} alt={champ.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    ) : null}
                                  </div>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      lineHeight: 1,
                                      color: entry.winRate >= 0.53 ? COLORS.gold : COLORS.muted,
                                    }}
                                  >
                                    {Math.round(entry.winRate * 100)}%
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const cardStyle = makeCardStyle({ padding: 20 });
