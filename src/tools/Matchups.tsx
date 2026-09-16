import { useEffect, useMemo, useState } from "react";
import { ChampionCombobox } from "../ChampionCombobox";
import { fetchChampionMap, fetchLatestVersion, toDDragonId, type ChampionInfo } from "../ddragon";
import { POOL_ROLES } from "../lib/champion-pool-builder";
import { primaryRoleOf } from "../lib/champion-roles";
import { type PersonalityRole } from "../lib/personality-test";
import { formatPercent, positionIconUrl } from "../lib/profile-analysis";
import { API_BASE_URL } from "../shared/api";
import { useI18n } from "../i18n";
import { useOpenTool, useRequestedChampion } from "../tool-navigation";
import { COLORS, FONT_HEADING, cardStyle as makeCardStyle, pillStyle } from "../theme";
import { LoadError } from "./LoadError";
import { apiGet } from "../lib/api-fetch";
import { DataQualityNote, type DataQuality } from "../DataQualityNote";
import { MatchupCard } from "./MatchupCard";

// Ported from the web's /tools/matchups: one champion in one position seen
// from both sides, straight from /api/v1/champion-matchups. Left, how the
// champion does against each lane opponent; right, who does best against
// it. Rows under the API's `minGames` are listed apart and not ranked.
const RANK_TIERS = ["CHALLENGER", "GRANDMASTER", "MASTER", "DIAMOND", "EMERALD", "PLATINUM", "GOLD", "SILVER", "BRONZE", "IRON"] as const;

interface MatchupRow {
  championName: string;
  games: number;
  wins: number;
  winRate: number;
}

type MatchupSort = "winrate" | "games";

// Mismo tablero que la web (src/components/tools/matchup-board.tsx): cuatro
// tonos de winrate, barra con la marca del 50 %, resumen de la linea y
// orden conmutable. Un cambio alli se replica aqui.
function winRateTone(winRate: number): "good" | "goodMild" | "badMild" | "bad" {
  if (winRate >= 0.55) return "good";
  if (winRate >= 0.5) return "goodMild";
  if (winRate >= 0.45) return "badMild";
  return "bad";
}

function sortRows(rows: MatchupRow[], sort: MatchupSort): MatchupRow[] {
  return [...rows].sort((a, b) =>
    sort === "games" ? b.games - a.games || b.winRate - a.winRate : b.winRate - a.winRate || b.games - a.games,
  );
}

function WinRateBar({ winRate }: { winRate: number }) {
  return (
    <div style={{ position: "relative", height: 6, width: "100%", borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "clip" }} aria-hidden="true">
      <div style={{ height: "100%", borderRadius: 999, width: `${Math.round(winRate * 100)}%`, background: COLORS[winRateTone(winRate)] }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(247,243,245,0.5)" }} />
    </div>
  );
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
  const { t, locale } = useI18n();
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const openTool = useOpenTool();
  const requested = useRequestedChampion();
  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [champion, setChampion] = useState<ChampionInfo | null>(null);
  const [role, setRole] = useState<PersonalityRole | null>(null);
  const [rank, setRank] = useState<(typeof RANK_TIERS)[number]>("CHALLENGER");
  const [data, setData] = useState<MatchupsResponse | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sort, setSort] = useState<MatchupSort>("winrate");
  // La ficha de un matchup concreto (fase A de matchups-v2.md): el rival
  // pulsado en el tablero. Se cierra al cambiar de campeón, posición o rango.
  const [vs, setVs] = useState<ChampionInfo | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    fetchChampionMap()
      .then((m) => setChampions(Object.values(m.byInternalId)))
      .catch(() => setChampions([]));
    fetchLatestVersion().then(setVersion).catch(() => setVersion(""));
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
    setLoadError(null);
    apiGet<MatchupsResponse>(url)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setLoadStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err);
        setLoadStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [champion, effectiveRole, rank, loadAttempt]);

  const championByInternalId = useMemo(() => new Map(champions.map((c) => [c.internalId, c])), [champions]);
  const lookup = (crawlerName: string) => championByInternalId.get(toDDragonId(crawlerName));

  const minGames = data?.minGames ?? 20;
  const solid = (rows: MatchupRow[]) => sortRows(rows.filter((r) => r.games >= minGames), sort);
  const thin = (rows: MatchupRow[]) => sortRows(rows.filter((r) => r.games < minGames), "games");
  const nameOf = (row: MatchupRow) => lookup(row.championName)?.name ?? row.championName;
  const pick = (row: MatchupRow) => {
    const info = lookup(row.championName);
    if (info) setVs(info);
  };

  const chip = (row: MatchupRow) => {
    const info = lookup(row.championName);
    return (
      <button
        key={row.championName}
        onClick={() => pick(row)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px 3px 3px",
          borderRadius: 999,
          border: `1px solid ${COLORS.cardBorder}`,
          background: "rgba(255,255,255,0.03)",
          color: COLORS.text,
          fontSize: 12,
          cursor: info ? "pointer" : "default",
        }}
      >
        {info ? <img src={info.iconUrl} alt="" style={{ width: 22, height: 22, borderRadius: 999 }} /> : null}
        <span style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(row)}</span>
        <span style={{ fontWeight: 700, color: COLORS[winRateTone(row.winRate)] }}>{formatPercent(locale, row.winRate)}</span>
      </button>
    );
  };

  const list = (rows: MatchupRow[], thinRows: MatchupRow[]) => {
    if (rows.length === 0 && thinRows.length === 0) {
      return <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>{t("Matchups.noData")}</p>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((row, i) => {
              const info = lookup(row.championName);
              const tone = winRateTone(row.winRate);
              return (
                <div
                  key={row.championName}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "20px 32px minmax(0,1fr) 48px 72px",
                    alignItems: "center",
                    columnGap: 8,
                    padding: "8px 0",
                    borderBottom: i < rows.length - 1 ? `1px solid ${COLORS.cardBorder}` : "none",
                  }}
                >
                  <span style={{ fontSize: 11, color: `${COLORS.muted}b3`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  {info ? (
                    <img src={info.iconUrl} alt="" style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${COLORS.cardBorder}` }} />
                  ) : (
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: `${COLORS.muted}33` }} />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <button
                      onClick={info ? () => pick(row) : undefined}
                      style={{ textAlign: "left", background: "none", border: "none", color: COLORS.text, fontSize: 13, lineHeight: 1.2, cursor: info ? "pointer" : "default", padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {nameOf(row)}
                    </button>
                    <WinRateBar winRate={row.winRate} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, textAlign: "right", color: COLORS[tone], fontVariantNumeric: "tabular-nums" }}>{formatPercent(locale, row.winRate)}</span>
                  <span style={{ fontSize: 11, color: COLORS.muted, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t("Matchups.games", { games: nf.format(row.games) })}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        {thinRows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: 11, color: COLORS.muted, margin: 0 }}>{t("Matchups.thinSample", { min: minGames })}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {thinRows.map((row) => {
                const info = lookup(row.championName);
                return (
                  <button
                    key={row.championName}
                    onClick={info ? () => pick(row) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px 2px 2px", borderRadius: 999, border: `1px solid ${COLORS.cardBorder}`, background: "transparent", color: COLORS.muted, fontSize: 11, cursor: info ? "pointer" : "default" }}
                  >
                    {info ? <img src={info.iconUrl} alt="" style={{ width: 18, height: 18, borderRadius: 999, opacity: 0.7 }} /> : null}
                    {nameOf(row)}
                    <span style={{ opacity: 0.7 }}>{row.games}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const column = (rows: MatchupRow[], titleKey: "asChampionTitle" | "againstChampionTitle", hintKey: "asChampionHint" | "againstChampionHint") => (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12, flex: "1 1 320px", minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <h2 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 400, margin: 0 }}>{t(`Matchups.${titleKey}`, { champion: champion?.name ?? "" })}</h2>
        <p style={{ fontSize: 11, color: COLORS.muted, margin: 0 }}>{t(`Matchups.${hintKey}`, { champion: champion?.name ?? "" })}</p>
      </div>
      {list(solid(rows), thin(rows))}
    </div>
  );

  // Resumen de la linea: winrate global (todas las filas, es un agregado) y
  // los matchups mas comodos y mas dificiles entre los que tienen muestra.
  const summaryGames = data ? data.asChampion.reduce((sum, r) => sum + r.games, 0) : 0;
  const summaryWins = data ? data.asChampion.reduce((sum, r) => sum + r.wins, 0) : 0;
  const summaryWinRate = summaryGames > 0 ? summaryWins / summaryGames : null;
  const solidAs = data ? sortRows(data.asChampion.filter((r) => r.games >= minGames), "winrate") : [];
  const best = solidAs.filter((r) => r.winRate >= 0.5).slice(0, 4);
  const worst = [...solidAs].reverse().filter((r) => r.winRate < 0.5).slice(0, 4);
  const labelStyle = { fontSize: 11, color: COLORS.muted, textTransform: "uppercase" as const, letterSpacing: "0.04em" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>{t("Matchups.methodologyNote", { min: data?.minGames ?? 20 })}</p>

      <div style={{ maxWidth: 320 }}>
        <ChampionCombobox
          champions={champions}
          value={champion}
          // La posición elegida se conserva al cambiar de campeón, como en
          // la web y como al pulsar un rival del tablero (ronda 21). Tampoco
          // se suelta al vaciar el selector: en este combobox cambiar de
          // campeón pasa siempre por vaciarlo primero.
          onChange={(c) => {
            setChampion(c);
            setVs(null);
          }}
          placeholder={t("Matchups.championPlaceholder")}
          noResultsLabel={t("Matchups.noChampionMatches")}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(POOL_ROLES as PersonalityRole[]).map((r) => {
          const iconUrl = positionIconUrl(r);
          return (
            <button key={r} onClick={() => { setRole(r); setVs(null); }} aria-pressed={effectiveRole === r} style={{ ...pillStyle(effectiveRole === r, "compact"), display: "flex", alignItems: "center", gap: 6 }}>
              {iconUrl ? <img src={iconUrl} alt="" style={{ width: 14, height: 14 }} /> : null}
              {t(`Profile.positions.${r.toLowerCase()}`)}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: COLORS.muted }}>{t("Matchups.rank")}</span>
        {RANK_TIERS.map((r) => (
          <button key={r} onClick={() => { setRank(r); setVs(null); }} aria-pressed={rank === r} style={pillStyle(rank === r, "compact")}>
            {t(`MetaTierList.rankTiers.${r}`)}
          </button>
        ))}
      </div>

      {!champion || !effectiveRole ? (
        <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>{t("Matchups.pickChampion")}</p>
      ) : loadStatus === "error" ? (
        <LoadError error={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
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
          {vs && effectiveRole ? (
            <MatchupCard
              champion={champion}
              enemy={vs}
              role={effectiveRole}
              rank={rank}
              version={version}
              onClose={() => setVs(null)}
              onSwap={() => {
                setChampion(vs);
                setVs(champion);
              }}
              onOpenEnemyBuilds={
                openTool ? () => openTool({ toolId: "championBuilds", championInternalId: vs.internalId, role: effectiveRole, rank }) : undefined
              }
            />
          ) : null}
          <div style={{ ...cardStyle, display: "flex", flexWrap: "wrap", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200, paddingRight: 20, borderRight: `1px solid ${COLORS.cardBorder}` }}>
              <span style={labelStyle}>{t("Matchups.laneWinrate")}</span>
              <span style={{ fontFamily: FONT_HEADING, fontSize: 30, lineHeight: 1.1, color: summaryWinRate === null ? COLORS.muted : summaryWinRate >= 0.5 ? COLORS.good : COLORS.bad }}>
                {summaryWinRate === null ? "–" : new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(summaryWinRate)}
              </span>
              <span style={{ fontSize: 11, color: COLORS.muted }}>{t("Matchups.summaryGames", { games: nf.format(summaryGames), rivals: solidAs.length })}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 1 320px", minWidth: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>{t("Matchups.bestMatchups")}</span>
                {best.length === 0 ? <span style={{ fontSize: 11, color: COLORS.muted }}>{t("Matchups.noneYet")}</span> : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{best.map(chip)}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={labelStyle}>{t("Matchups.worstMatchups")}</span>
                {worst.length === 0 ? <span style={{ fontSize: 11, color: COLORS.muted }}>{t("Matchups.noneYet")}</span> : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{worst.map(chip)}</div>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: COLORS.muted }}>{t("Matchups.sortBy")}</span>
            {(["winrate", "games"] as const).map((option) => (
              <button key={option} onClick={() => setSort(option)} aria-pressed={sort === option} style={pillStyle(sort === option, "compact")}>
                {t(option === "games" ? "Matchups.sortGames" : "Matchups.sortWinrate")}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {column(data.asChampion, "asChampionTitle", "asChampionHint")}
            {column(data.againstChampion, "againstChampionTitle", "againstChampionHint")}
          </div>
          <DataQualityNote quality={data.dataQuality} patches={data.dataPatches} />
        </>
      )}
    </div>
  );
}
