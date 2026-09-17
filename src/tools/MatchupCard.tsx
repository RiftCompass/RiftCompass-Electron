import { useEffect, useMemo, useState } from "react";
import { X } from "@phosphor-icons/react";
import {
  fetchChampionDetail,
  fetchItemCatalog,
  fetchRuneStyles,
  fetchSummonerSpellPicks,
  itemIconUrl,
  spellIconUrl,
  toDDragonId,
  type ChampionDetail,
  type ChampionInfo,
  type ItemCatalog,
  type RuneStyle,
  type SummonerSpellPick,
} from "../ddragon";
import type { ChampionBuildRunes } from "../riftcompass";
import { API_BASE_URL } from "../shared/api";
import { useI18n } from "../i18n";
import { apiGet } from "../lib/api-fetch";
import { COLORS, FONT_HEADING, cardStyle as makeCardStyle, pillStyle, TYPE } from "../theme";
import { LoadError } from "./LoadError";
import { AbilityBadge, RunePageView, SkillGrid, indexRunes } from "./build-visuals";

// La ficha de un matchup concreto (fase A de matchups-v2.md): quién es
// quién, cómo va ese enfrentamiento y qué se lleva contra ese rival. Misma
// composición que src/components/tools/matchup-card.tsx de la web: un
// cambio allí se replica aquí.
//
// Copy honesto: cada pieza dice de dónde sale. Si la build no llega al suelo
// de partidas contra ese rival, se enseña la general del campeón y se dice;
// el orden de habilidades es siempre el general hasta que el crawler lo
// guarde por rival (fase B).

interface BuildPiece<T> {
  value: T;
  games: number;
  wins: number;
  matchupSpecific: boolean;
}

interface MatchupCardResponse {
  dataPatches: string[];
  minGames: number;
  matchup?: {
    enemy: string;
    games: number;
    wins: number;
    winRate: number | null;
    build: {
      runes: BuildPiece<ChampionBuildRunes> | null;
      spells: BuildPiece<{ spellLow: number; spellHigh: number }> | null;
      items: BuildPiece<{ coreItemsKey: string }> | null;
      vsGames: number;
    };
    skillOrder: { path: { level: number; skillSlot: number }[]; maxPriority: number[]; sampleGames: number } | null;
  };
}

// Cuatro tonos, como el tablero (COLORS.good/goodMild/badMild/bad).
function winRateTone(winRate: number): "good" | "goodMild" | "badMild" | "bad" {
  if (winRate >= 0.55) return "good";
  if (winRate >= 0.5) return "goodMild";
  if (winRate >= 0.45) return "badMild";
  return "bad";
}

const cardStyle = makeCardStyle({ borderRadius: 12, padding: 16 });
const blockStyle = { display: "flex", flexDirection: "column" as const, gap: 10, borderRadius: 10, border: `1px solid ${COLORS.cardBorder}`, background: `${COLORS.background}66`, padding: 12 };
const labelStyle = { fontSize: TYPE.label, color: COLORS.muted };

export function MatchupCard({
  champion,
  enemy,
  role,
  rank,
  version,
  onClose,
  onSwap,
  onOpenEnemyBuilds,
}: {
  champion: ChampionInfo;
  enemy: ChampionInfo;
  role: string;
  rank: string;
  version: string;
  onClose: () => void;
  onSwap: () => void;
  /** Abre al rival en Builds de campeón (el "abrir la página del rival" de la web). */
  onOpenEnemyBuilds?: () => void;
}) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<MatchupCardResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState<ItemCatalog | null>(null);
  const [runeStyles, setRuneStyles] = useState<RuneStyle[]>([]);
  const [spellPicks, setSpellPicks] = useState<SummonerSpellPick[]>([]);
  const [detail, setDetail] = useState<ChampionDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    const url = `${API_BASE_URL}/api/v1/champion-matchups?champion=${encodeURIComponent(champion.internalId)}&role=${role}&rank=${rank}&vs=${encodeURIComponent(enemy.internalId)}`;
    apiGet<MatchupCardResponse>(url)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [champion, enemy, role, rank, attempt]);

  // Los catálogos que dibujan runas, objetos, hechizos y habilidades: los
  // mismos que Champion Builds. Si alguno falla, la pieza sale sin icono;
  // no bloquea la ficha.
  useEffect(() => {
    if (!version) return;
    fetchItemCatalog(version, locale).then(setCatalog).catch(() => setCatalog(null));
    fetchRuneStyles(version, locale).then(setRuneStyles).catch(() => setRuneStyles([]));
    fetchSummonerSpellPicks(version, locale).then(setSpellPicks).catch(() => setSpellPicks([]));
  }, [version, locale]);
  useEffect(() => {
    if (!version) return;
    let cancelled = false;
    fetchChampionDetail(version, toDDragonId(champion.internalId), locale)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [champion, version, locale]);

  const runeIndex = useMemo(() => indexRunes(runeStyles), [runeStyles]);
  const spellsById = useMemo(() => new Map(spellPicks.map((spell) => [spell.id, spell])), [spellPicks]);
  const abilityIcon = (slot: number): string | null => {
    const spell = detail?.spells[slot - 1];
    return spell && version ? spellIconUrl(version, spell.image.full) : null;
  };
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const pct = useMemo(() => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }), [locale]);

  const matchup = data?.matchup;
  const minGames = data?.minGames ?? 20;
  const pieces = matchup ? [matchup.build.runes, matchup.build.spells, matchup.build.items].filter((p) => p !== null) : [];
  const allGeneral = pieces.length > 0 && pieces.every((p) => !p.matchupSpecific);
  const anyGeneral = pieces.some((p) => !p.matchupSpecific);
  const sample = (piece: { games: number; wins: number; matchupSpecific: boolean }) => (
    <span style={labelStyle}>
      {t("ChampionBuilds.itemSample", { games: piece.games, rate: Math.round((piece.wins / Math.max(piece.games, 1)) * 100) })}
      {!piece.matchupSpecific && !allGeneral ? ` · ${t("Matchups.cardGeneralTag")}` : ""}
    </span>
  );
  const tone = matchup?.winRate == null ? null : winRateTone(matchup.winRate);

  return (
    <section style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 14, borderColor: `${COLORS.rose}66` }} aria-label={t("Matchups.cardTitle", { champion: champion.name, enemy: enemy.name })}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={champion.iconUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${COLORS.cardBorder}` }} />
          <span style={{ fontSize: TYPE.label, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{t("Matchups.cardVersus")}</span>
          <img src={enemy.iconUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${COLORS.cardBorder}` }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h2 style={{ fontFamily: FONT_HEADING, fontSize: 17, fontWeight: 400, margin: 0 }}>
              {t("Matchups.cardTitle", { champion: champion.name, enemy: enemy.name })}
            </h2>
            <span style={{ fontSize: TYPE.caption, color: COLORS.muted }}>
              {t(`Profile.positions.${role.toLowerCase()}`)}
              {data ? ` · ${t("ChampionBuilds.popularBuildSource", { patch: data.dataPatches.join(" + ") })}` : ""}
            </span>
          </div>
        </div>
        <button onClick={onClose} style={{ ...pillStyle(false, "compact"), display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <X size={12} />
          {t("Matchups.cardClose")}
        </button>
      </div>

      {status === "error" || (status === "ready" && !matchup) ? (
        // Sin `matchup` en una respuesta correcta solo pasa con una web
        // anterior a la fase A: se trata como fallo de carga, con reintento.
        <LoadError error={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : status === "loading" || !matchup ? (
        <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ProfileSearch.loading")}</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 12px" }}>
              <span style={{ fontFamily: FONT_HEADING, fontSize: TYPE.display, lineHeight: 1.1, color: tone ? COLORS[tone] : COLORS.muted }}>
                {matchup.winRate == null ? "–" : pct.format(matchup.winRate)}
              </span>
              <span style={{ fontSize: TYPE.body, color: COLORS.muted }}>{t("Matchups.cardWinrate", { champion: champion.name, enemy: enemy.name })}</span>
              <span style={labelStyle}>{t("Matchups.games", { games: matchup.games })}</span>
            </div>
            {matchup.winRate != null ? (
              <div style={{ position: "relative", height: 6, maxWidth: 440, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "clip" }} aria-hidden="true">
                <div style={{ height: "100%", borderRadius: 999, width: `${Math.round(matchup.winRate * 100)}%`, background: tone ? COLORS[tone] : COLORS.muted }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(247,243,245,0.5)" }} />
              </div>
            ) : null}
            {matchup.games < minGames ? <p style={{ ...labelStyle, margin: 0 }}>{t("Matchups.cardThinSample", { min: minGames })}</p> : null}
          </div>

          <div style={blockStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <h3 style={{ fontFamily: FONT_HEADING, fontSize: TYPE.subheading, fontWeight: 400, margin: 0 }}>{t("Matchups.cardBuildTitle", { enemy: enemy.name })}</h3>
              <p style={{ ...labelStyle, margin: 0 }}>
                {allGeneral
                  ? t("Matchups.cardBuildGeneral", { enemy: enemy.name, games: nf.format(matchup.build.vsGames), min: minGames, champion: champion.name })
                  : anyGeneral
                    ? t("Matchups.cardBuildMixed", { enemy: enemy.name })
                    : t("Matchups.cardBuildSpecific", { enemy: enemy.name })}
              </p>
            </div>
            {pieces.length === 0 ? (
              <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ChampionBuilds.noBuildData")}</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 1 320px", minWidth: 0 }}>
                  {matchup.build.runes ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={labelStyle}>{t("ChampionBuilds.runes")}</span>
                      <RunePageView runes={matchup.build.runes.value} index={runeIndex} t={t} />
                      {sample(matchup.build.runes)}
                    </div>
                  ) : null}
                  {matchup.build.items ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={labelStyle}>{t("ChampionBuilds.coreItems")}</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {matchup.build.items.value.coreItemsKey
                          .split(",")
                          .filter(Boolean)
                          .map((id, index) => {
                            const item = catalog?.byId[id];
                            return (
                              <img
                                key={`${id}-${index}`}
                                src={itemIconUrl(version, id)}
                                alt={item?.name ?? id}
                                title={item ? `${item.name} (${item.totalGold})` : id}
                                style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${COLORS.cardBorder}` }}
                              />
                            );
                          })}
                      </div>
                      {sample(matchup.build.items)}
                    </div>
                  ) : null}
                </div>
                {matchup.build.spells ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={labelStyle}>{t("ChampionBuilds.summonerSpells")}</span>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[matchup.build.spells.value.spellLow, matchup.build.spells.value.spellHigh].map((id) => {
                        const spell = spellsById.get(id);
                        return spell ? (
                          <img key={id} src={spell.iconUrl} alt={spell.name} title={spell.name} style={{ width: 34, height: 34, borderRadius: 6 }} />
                        ) : (
                          <span key={id} style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${COLORS.cardBorder}` }} />
                        );
                      })}
                    </div>
                    {sample(matchup.build.spells)}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div style={blockStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <h3 style={{ fontFamily: FONT_HEADING, fontSize: TYPE.subheading, fontWeight: 400, margin: 0 }}>{t("ChampionBuilds.skillOrder")}</h3>
              <p style={{ ...labelStyle, margin: 0 }}>{t("Matchups.cardSkillOrderGeneral", { champion: champion.name })}</p>
            </div>
            {matchup.skillOrder && matchup.skillOrder.path.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <span style={labelStyle}>{t("ChampionBuilds.maxOrder")}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {matchup.skillOrder.maxPriority.map((slot, index) => (
                      <span key={slot} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {index > 0 ? <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>&gt;</span> : null}
                        <AbilityBadge slot={slot} iconUrl={abilityIcon(slot)} />
                      </span>
                    ))}
                  </span>
                  <span style={labelStyle}>{t("Matchups.games", { games: matchup.skillOrder.sampleGames })}</span>
                </div>
                <SkillGrid path={matchup.skillOrder.path} abilityIcon={abilityIcon} t={t} />
              </div>
            ) : (
              <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ChampionBuilds.noSkillOrderData")}</p>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            <button onClick={onSwap} style={{ background: "none", border: "none", color: COLORS.rose, fontSize: TYPE.caption, cursor: "pointer", padding: 0 }}>
              {t("Matchups.cardSwap", { enemy: enemy.name })}
            </button>
            {onOpenEnemyBuilds ? (
              <button onClick={onOpenEnemyBuilds} style={{ background: "none", border: "none", color: COLORS.rose, fontSize: TYPE.caption, cursor: "pointer", padding: 0 }}>
                {t("Matchups.cardEnemyPage", { enemy: enemy.name })}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
