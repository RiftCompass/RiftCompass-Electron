import { useEffect, useMemo, useState } from "react";
import { ChampionCombobox } from "../ChampionCombobox";
import { fetchChampionMap, toDDragonId, type ChampionInfo } from "../ddragon";
import { POOL_ROLES } from "../lib/champion-pool-builder";
import { primaryRoleOf } from "../lib/champion-roles";
import { type PersonalityRole } from "../lib/personality-test";
import { positionIconUrl } from "../lib/profile-analysis";
import { API_BASE_URL } from "../shared/api";
import { useI18n } from "../i18n";
import { useOpenTool, useRequestedChampion } from "../tool-navigation";
import { COLORS, FONT_HEADING, cardStyle as makeCardStyle, pillStyle } from "../theme";
import { LoadError } from "./LoadError";
import { DataQualityNote, type DataQuality } from "../DataQualityNote";

// Ported from the web's /tools/matchups: one champion in one position seen
// from both sides, straight from /api/v1/champion-matchups. Left, how the
// champion does against each lane opponent; right, who does best against
// it. Rows under the API's `minGames` are listed apart and not ranked.
const RANK_TIERS = ["CHALLENGER", "GRANDMASTER", "MASTER", "DIAMOND", "EMERALD", "PLATINUM", "GOLD", "SILVER", "BRONZE", "IRON"] as const;

interface MatchupRow {
  championName: string;
  games: number;
  winRate: number;
}

interface MatchupsResponse {
  dataPatches: string[];
  minGames: number;
  asChampion: MatchupRow[];
  againstChampion: MatchupRow[];
  dataQuality?: DataQuality;
}

const cardStyle = makeCardStyle({ borderRadius: 12, padding: 16 });

export function Matchups() {
  const { t } = useI18n();
  const openTool = useOpenTool();
  const requested = useRequestedChampion();
  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [champion, setChampion] = useState<ChampionInfo | null>(null);
  const [role, setRole] = useState<PersonalityRole | null>(null);
  const [rank, setRank] = useState<(typeof RANK_TIERS)[number]>("CHALLENGER");
  const [data, setData] = useState<MatchupsResponse | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    fetchChampionMap()
      .then((m) => setChampions(Object.values(m.byInternalId)))
      .catch(() => setChampions([]));
  }, []);

  // Opened from another tool on a champion (Champion Builds, Meta Tier
  // List): start on that champion, position and rank instead of empty.
  useEffect(() => {
    if (!requested || champions.length === 0) return;
    const match = champions.find((c) => c.internalId === requested.championInternalId);
    if (!match) return;
    setChampion(match);
    if (requested.role && (POOL_ROLES as readonly string[]).includes(requested.role)) setRole(requested.role as PersonalityRole);
    if (requested.rank && (RANK_TIERS as readonly string[]).includes(requested.rank)) setRank(requested.rank as (typeof RANK_TIERS)[number]);
  }, [requested, champions]);

  // Without an explicit position, the champion's usual one (same rule as
  // the web page), so picking a champion already shows something.
  const effectiveRole: PersonalityRole | null = role ?? (champion ? ((primaryRoleOf(champion.internalId) as PersonalityRole | null) ?? "MIDDLE") : null);

  useEffect(() => {
    if (!champion || !effectiveRole) return;
    let cancelled = false;
    setData(null);
    setLoadStatus("loading");
    const url = `${API_BASE_URL}/api/v1/champion-matchups?champion=${encodeURIComponent(champion.internalId)}&role=${effectiveRole}&rank=${rank}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: MatchupsResponse) => {
        if (cancelled) return;
        setData(body);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [champion, effectiveRole, rank, loadAttempt]);

  const championByInternalId = useMemo(() => new Map(champions.map((c) => [c.internalId, c])), [champions]);
  const lookup = (crawlerName: string) => championByInternalId.get(toDDragonId(crawlerName));

  const table = (rows: MatchupRow[], titleKey: "asChampionTitle" | "againstChampionTitle") => {
    const minGames = data?.minGames ?? 20;
    const solid = rows.filter((r) => r.games >= minGames).sort((a, b) => b.winRate - a.winRate || b.games - a.games);
    const thin = rows.filter((r) => r.games < minGames).sort((a, b) => b.games - a.games);
    return (
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8, flex: "1 1 320px", minWidth: 0 }}>
        <h2 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 400, margin: 0 }}>
          {t(`Matchups.${titleKey}`, { champion: champion?.name ?? "" })}
        </h2>
        {solid.length === 0 && thin.length === 0 ? (
          <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>{t("Matchups.noData")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {solid.map((row) => {
              const info = lookup(row.championName);
              const good = row.winRate >= 0.5;
              return (
                <div
                  key={row.championName}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${COLORS.cardBorder}` }}
                >
                  {info ? (
                    <img src={info.iconUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 28, height: 28, borderRadius: 6, background: `${COLORS.muted}33`, flexShrink: 0 }} />
                  )}
                  <button
                    onClick={info ? () => setChampion(info) : undefined}
                    style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", color: COLORS.text, fontSize: 13, cursor: info ? "pointer" : "default", padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {info?.name ?? row.championName}
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: good ? COLORS.good : COLORS.bad }}>{Math.round(row.winRate * 100)}%</span>
                  <span style={{ fontSize: 11, color: COLORS.muted, width: 70, textAlign: "right" }}>
                    {t("Matchups.games", { games: row.games })}
                  </span>
                </div>
              );
            })}
            {thin.length > 0 ? (
              <p style={{ fontSize: 11, color: COLORS.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
                {t("Matchups.thinSample", { min: minGames })}{" "}
                {thin.map((row, i) => `${i > 0 ? ", " : ""}${lookup(row.championName)?.name ?? row.championName} (${row.games})`).join("")}
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>{t("Matchups.methodologyNote", { min: data?.minGames ?? 20 })}</p>

      <div style={{ maxWidth: 320 }}>
        <ChampionCombobox
          champions={champions}
          value={champion}
          onChange={(c) => {
            setChampion(c);
            setRole(null);
          }}
          placeholder={t("Matchups.championPlaceholder")}
          noResultsLabel={t("Matchups.noChampionMatches")}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(POOL_ROLES as PersonalityRole[]).map((r) => {
          const iconUrl = positionIconUrl(r);
          return (
            <button key={r} onClick={() => setRole(r)} style={{ ...pillStyle(effectiveRole === r, "compact"), display: "flex", alignItems: "center", gap: 6 }}>
              {iconUrl ? <img src={iconUrl} alt="" style={{ width: 14, height: 14 }} /> : null}
              {t(`Profile.positions.${r.toLowerCase()}`)}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: COLORS.muted }}>{t("Matchups.rank")}</span>
        {RANK_TIERS.map((r) => (
          <button key={r} onClick={() => setRank(r)} style={pillStyle(rank === r, "compact")}>
            {t(`MetaTierList.rankTiers.${r}`)}
          </button>
        ))}
      </div>

      {!champion || !effectiveRole ? (
        <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>{t("Matchups.pickChampion")}</p>
      ) : loadStatus === "error" ? (
        <LoadError onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : data === null ? (
        <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>{t("ProfileSearch.loading")}</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <img src={champion.iconUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: FONT_HEADING, fontSize: 17 }}>
                {champion.name} · {t(`Profile.positions.${effectiveRole.toLowerCase()}`)}
              </span>
              <span style={{ fontSize: 12, color: COLORS.muted }}>
                {t("ChampionBuilds.popularBuildSource", { patch: data.dataPatches.join(" + ") })}
                {openTool ? (
                  <>
                    {" · "}
                    <button
                      onClick={() => openTool({ toolId: "championBuilds", championInternalId: champion.internalId, role: effectiveRole, rank })}
                      style={{ background: "none", border: "none", color: COLORS.rose, fontSize: 12, cursor: "pointer", padding: 0 }}
                    >
                      {t("Matchups.openChampionBuilds")}
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {table(data.asChampion, "asChampionTitle")}
            {table(data.againstChampion, "againstChampionTitle")}
          </div>
          <DataQualityNote quality={data.dataQuality} patches={data.dataPatches} />
        </>
      )}
    </div>
  );
}
