import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { patchLabel } from "../lib/patch-label";
import { ChampionCombobox } from "../ChampionCombobox";
import { fetchChampionMap, fetchLatestVersion, toDDragonId, type ChampionInfo } from "../ddragon";
import { POOL_ROLES } from "../lib/champion-pool-builder";
import { primaryRoleOf } from "../lib/champion-roles";
import { type PersonalityRole } from "../lib/personality-test";
import { formatPercent, positionIconUrl } from "../lib/profile-analysis";
import { API_BASE_URL } from "../shared/api";
import { useI18n } from "../i18n";
import { useOpenTool, useRequestedChampion } from "../tool-navigation";
import { COLORS, FONT_HEADING, pillStyle, TYPE } from "../theme";
import { LoadError } from "./LoadError";
import { apiGet } from "../lib/api-fetch";
import { DataQualityNote, type DataQuality } from "../DataQualityNote";
import { MatchupCard, MATCHUPS_ACCENT, WinRateBar, winRateTone } from "./MatchupCard";

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
// tonos de winrate, barra con la marca del 50 %, resumen de la linea sin
// caja, columnas sin caja con la cabecera subrayada y filas enteras
// pulsables. Un cambio alli se replica aqui.
function sortRows(rows: MatchupRow[], sort: MatchupSort): MatchupRow[] {
  return [...rows].sort((a, b) =>
    sort === "games" ? b.games - a.games || b.winRate - a.winRate : b.winRate - a.winRate || b.games - a.games,
  );
}

interface MatchupsResponse {
  dataPatches: string[];
  minGames: number;
  asChampion: MatchupRow[];
  againstChampion: MatchupRow[];
  dataQuality?: DataQuality;
}

const labelStyle: CSSProperties = { fontSize: TYPE.label, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.04em" };
// Una fila del tablero entera es el boton (la barra y las cifras son lo que
// la gente pulsa); el fondo al pasar el raton lo pone global.css.
const rowButtonStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "20px 36px minmax(0,1fr) 48px 72px",
  alignItems: "center",
  columnGap: 8,
  width: "calc(100% + 16px)",
  margin: "0 -8px",
  padding: "8px",
  borderRadius: 6,
  border: "none",
  background: "none",
  color: COLORS.text,
  font: "inherit",
  textAlign: "left",
};

export function Matchups() {
  const { t, locale } = useI18n();
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
          gap: 8,
          padding: "3px 10px 3px 3px",
          borderRadius: 999,
          border: `1px solid ${COLORS.cardBorder}`,
          background: "rgba(255,255,255,0.03)",
          color: COLORS.text,
          fontSize: TYPE.caption,
          cursor: info ? "pointer" : "default",
        }}
      >
        {info ? <img src={info.iconUrl} alt="" loading="lazy" decoding="async" style={{ width: 26, height: 26, borderRadius: 999 }} /> : null}
        <span style={{ maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(row)}</span>
        <span style={{ fontWeight: 700, color: COLORS[winRateTone(row.winRate)] }}>{formatPercent(locale, row.winRate)}</span>
      </button>
    );
  };

  const list = (rows: MatchupRow[], thinRows: MatchupRow[]) => {
    if (rows.length === 0 && thinRows.length === 0) {
      return <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("Matchups.noData")}</p>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((row, i) => {
              const info = lookup(row.championName);
              const tone = winRateTone(row.winRate);
              const content = (
                <>
                  <span style={{ fontSize: TYPE.label, color: `${COLORS.muted}b3`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  {info ? (
                    <img src={info.iconUrl} alt="" loading="lazy" decoding="async" style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${COLORS.cardBorder}` }} />
                  ) : (
                    <span style={{ width: 36, height: 36, borderRadius: 8, background: `${COLORS.muted}33` }} />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: TYPE.body, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(row)}</span>
                    <WinRateBar winRate={row.winRate} />
                  </div>
                  <span style={{ fontSize: TYPE.body, fontWeight: 700, textAlign: "right", color: COLORS[tone], fontVariantNumeric: "tabular-nums" }}>{formatPercent(locale, row.winRate)}</span>
                  <span style={{ fontSize: TYPE.label, color: COLORS.muted, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t("Matchups.games", { games: row.games })}</span>
                </>
              );
              return (
                <div key={row.championName} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${COLORS.cardBorder}` : "none" }}>
                  {info ? (
                    <button onClick={() => pick(row)} style={{ ...rowButtonStyle, cursor: "pointer" }}>
                      {content}
                    </button>
                  ) : (
                    <div style={rowButtonStyle}>{content}</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
        {thinRows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: TYPE.label, color: COLORS.muted, margin: 0 }}>{t("Matchups.thinSample", { min: minGames })}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {thinRows.map((row) => {
                const info = lookup(row.championName);
                return (
                  <button
                    key={row.championName}
                    onClick={info ? () => pick(row) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px 2px 2px", borderRadius: 999, border: `1px solid ${COLORS.cardBorder}`, background: "transparent", color: COLORS.muted, fontSize: TYPE.label, cursor: info ? "pointer" : "default" }}
                  >
                    {info ? <img src={info.iconUrl} alt="" loading="lazy" decoding="async" style={{ width: 18, height: 18, borderRadius: 999, opacity: 0.7 }} /> : null}
                    {nameOf(row)}
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.games}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  // Las dos columnas sin caja: la cabecera subrayada de cada una y las
  // barras de sus filas ya las delimitan, como en la web.
  const column = (rows: MatchupRow[], titleKey: "asChampionTitle" | "againstChampionTitle", hintKey: "asChampionHint" | "againstChampionHint") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 1 320px", minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 8, borderBottom: `1px solid ${COLORS.cardBorder}` }}>
        <h2 style={{ fontFamily: FONT_HEADING, fontSize: TYPE.subheading + 2, fontWeight: 400, margin: 0 }}>{t(`Matchups.${titleKey}`, { champion: champion?.name ?? "" })}</h2>
        <p style={{ fontSize: TYPE.label, color: COLORS.muted, margin: 0 }}>{t(`Matchups.${hintKey}`, { champion: champion?.name ?? "" })}</p>
      </div>
      {list(solid(rows), thin(rows))}
    </div>
  );

  const chips = (rows: MatchupRow[], labelKey: "bestMatchups" | "worstMatchups") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={labelStyle}>{t(`Matchups.${labelKey}`)}</span>
      {rows.length === 0 ? <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>{t("Matchups.noneYet")}</span> : <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{rows.map(chip)}</div>}
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
  const roleIcon = effectiveRole ? positionIconUrl(effectiveRole) : null;
  // Each separator travels inside the item it introduces: as loose flex
  // children the dots were left hanging at the end of a line when the row
  // wrapped (round 41).
  const dot = <span aria-hidden="true">· </span>;
  const item: CSSProperties = { whiteSpace: "nowrap" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ fontSize: TYPE.caption, color: COLORS.muted, margin: 0 }}>{t("Matchups.methodologyNote", { min: data?.minGames ?? 20 })}</p>

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
        <span style={{ fontSize: TYPE.caption, color: COLORS.muted }}>{t("Matchups.rank")}</span>
        {RANK_TIERS.map((r) => (
          <button key={r} onClick={() => { setRank(r); setVs(null); }} aria-pressed={rank === r} style={pillStyle(rank === r, "compact")}>
            {t(`MetaTierList.rankTiers.${r}`)}
          </button>
        ))}
      </div>

      {!champion || !effectiveRole ? (
        <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("Matchups.pickChampion")}</p>
      ) : loadStatus === "error" ? (
        <LoadError error={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />
      ) : data === null ? (
        <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ProfileSearch.loading")}</p>
      ) : (
        <>
          {/* El campeon como cabecera de la pantalla: retrato grande con el
              anillo del color de la herramienta, nombre en la fuente de
              titulos y debajo lo que acota cada cifra (posicion con su
              icono, rango y parche). Igual que la web. */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <img
              src={champion.iconUrl}
              alt=""
              style={{ width: 64, height: 64, borderRadius: 16, border: `2px solid ${MATCHUPS_ACCENT}80`, boxShadow: `0 0 28px -8px ${MATCHUPS_ACCENT}`, flexShrink: 0 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <h2 style={{ fontFamily: FONT_HEADING, fontSize: TYPE.heading + 2, fontWeight: 400, lineHeight: 1, margin: 0 }}>{champion.name}</h2>
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", fontSize: TYPE.body, color: COLORS.muted }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.text }}>
                  {roleIcon ? <img src={roleIcon} alt="" style={{ width: 15, height: 15 }} /> : null}
                  {t(`Profile.positions.${effectiveRole.toLowerCase()}`)}
                </span>
                <span style={item}>
                  {dot}
                  {t(`MetaTierList.rankTiers.${rank}`)}
                </span>
                <span style={item}>
                  {dot}
                  {t("ChampionBuilds.popularBuildSource", { patch: patchLabel(data.dataPatches) })}
                </span>
                {openTool ? (
                  <span style={item}>
                    {dot}
                    <button
                      onClick={() => openTool({ toolId: "championBuilds", championInternalId: champion.internalId, role: effectiveRole, rank })}
                      style={{ background: "none", border: "none", color: COLORS.roseBright, fontSize: TYPE.body, cursor: "pointer", padding: 0 }}
                    >
                      {t("Matchups.openChampionBuilds")}
                    </button>
                  </span>
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
          {/* Resumen sin caja: la cifra grande con su barra a un lado y los
              chips al otro, separados por una linea. */}
          <div className="rc-matchups-summary" style={{ display: "flex", flexWrap: "wrap", gap: "20px 32px" }}>
            <div className="rc-matchups-summary-figure" style={{ display: "flex", flexDirection: "column", gap: 6, width: 236 }}>
              <span style={labelStyle}>{t("Matchups.laneWinrate")}</span>
              <span style={{ fontFamily: FONT_HEADING, fontSize: TYPE.display + 4, lineHeight: 1, color: summaryWinRate === null ? COLORS.muted : COLORS[winRateTone(summaryWinRate)] }}>
                {summaryWinRate === null ? "–" : new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(summaryWinRate)}
              </span>
              {summaryWinRate !== null ? <WinRateBar winRate={summaryWinRate} size="md" /> : null}
              <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>{t("Matchups.summaryGames", { games: summaryGames, rivals: solidAs.length })}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: "1 1 320px", minWidth: 0 }}>
              {chips(best, "bestMatchups")}
              {chips(worst, "worstMatchups")}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: TYPE.caption, color: COLORS.muted }}>{t("Matchups.sortBy")}</span>
            {(["winrate", "games"] as const).map((option) => (
              <button key={option} onClick={() => setSort(option)} aria-pressed={sort === option} style={pillStyle(sort === option, "compact")}>
                {t(option === "games" ? "Matchups.sortGames" : "Matchups.sortWinrate")}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
            {column(data.asChampion, "asChampionTitle", "asChampionHint")}
            {column(data.againstChampion, "againstChampionTitle", "againstChampionHint")}
          </div>
          <DataQualityNote quality={data.dataQuality} patches={data.dataPatches} />
        </>
      )}
    </div>
  );
}
