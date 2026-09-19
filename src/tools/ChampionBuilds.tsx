import { useEffect, useMemo, useState } from "react";
import { patchLabel } from "../lib/patch-label";
import { MagnifyingGlass, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import type {
  AccountUser,
  ChampionBuildInput,
  ChampionBuildRunes,
  ChampionBuildSpells,
  SavedChampionBuild,
} from "../riftcompass";
import {
  championSquareUrl,
  fetchChampionDetail,
  fetchChampionMap,
  fetchItemCatalog,
  fetchLatestVersion,
  fetchRuneStyles,
  fetchSummonerSpellPicks,
  itemIconUrl,
  runeIconUrl,
  spellIconUrl,
  STAT_SHARD_ROWS,
  statShardById,
  statShardIconUrl,
  toDDragonId,
  type ChampionDetail,
  type ChampionInfo,
  type ItemCatalog,
  type RuneStyle,
  type SummonerSpellPick,
} from "../ddragon";
import { ChampionCombobox } from "../ChampionCombobox";
import { damageTypeOf } from "../lib/champion-damage-type";
import { formatPercent, positionIconUrl } from "../lib/profile-analysis";
import { API_BASE_URL } from "../shared/api";
import { useI18n } from "../i18n";
import { useOpenAccountPanel } from "../account-panel";
import { useOpenTool, useRequestedChampion } from "../tool-navigation";
import { LoadError } from "./LoadError";
import { apiGet, saveErrorMessage, savedListError } from "../lib/api-fetch";
import { DataQualityNote, type DataQuality } from "../DataQualityNote";
import { AbilityBadge, RunePageView, SKILL_KEYS, SkillGrid, type Translate } from "./build-visuals";
import { CompetitiveBuildBlock } from "../esports/CompetitiveBuild";
import { COLORS, FONT_HEADING, cardStyle, inputStyle, pillStyle, TYPE } from "../theme";

// The desktop half of the web's champion pages (/champions/<champion>):
// same public endpoint (/api/v1/champion-builds), same saved builds in the
// same account (/api/v1/saved-champion-builds), same two halves — what the
// tracked games actually run, and what this player has saved for the
// champion. The web splits it across a directory page and a champion page
// because it has URLs to split it with; here it is one tool with a champion
// picker on top.

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
type Role = (typeof ROLES)[number];

const RANK_TIERS = [
  "CHALLENGER",
  "GRANDMASTER",
  "MASTER",
  "DIAMOND",
  "EMERALD",
  "PLATINUM",
  "GOLD",
  "SILVER",
  "BRONZE",
  "IRON",
] as const;
type RankTier = (typeof RANK_TIERS)[number];

const MAX_BUILD_ITEMS = 6;

interface PopularRunePage extends ChampionBuildRunes {
  games: number;
  wins: number;
}

interface PopularSpellPair extends ChampionBuildSpells {
  games: number;
  wins: number;
}

interface PopularItemCore {
  itemIds: string[];
  games: number;
  wins: number;
}

interface SkillLevelChoice {
  level: number;
  skillSlot: number;
  games: number;
  wins: number;
}

interface ItemPlanEntry {
  itemId: number;
  games: number;
  winRate: number;
}

interface ItemPlan {
  startingItems: ItemPlanEntry[];
  itemOrder: { slot: number; itemId: number; games: number }[];
  situationalItems: ItemPlanEntry[];
}

interface BuildBoard {
  /** Etiqueta: "16.18", "16.18 + 16.17" o un "16.17" anterior. */
  patch: string;
  /** Los parches en sí (la web los manda desde el 2026-09-12; antes solo `patch`). */
  dataPatches?: string[];
  /** Partidas y última escritura del crawler detrás del tablero (aditivo, 2026-09-12). */
  dataQuality?: DataQuality;
  /** Compra de salida, orden de compra y situacionales (aditivo, 2026-09-12); lo mismo que la ficha de la web. */
  itemPlan?: ItemPlan;
  currentPatch: string;
  runePages: PopularRunePage[];
  spellPairs: PopularSpellPair[];
  itemCores: PopularItemCore[];
  skillOrder: { path: SkillLevelChoice[]; maxPriority: number[]; sampleGames: number };
  roles: { role: string; games: number; wins: number }[];
}

interface Draft {
  id: string | null;
  name: string;
  role: Role;
  items: string[];
  runes: Partial<ChampionBuildRunes>;
  spells: ChampionBuildSpells | null;
  skillPriority: number[];
  skillOrder: number[] | null;
  notes: string;
  source: "custom" | "crawler";
  sourcePatch: string | null;
  sourceRankTier: string | null;
}

const RUNE_FIELDS: (keyof ChampionBuildRunes)[] = [
  "primaryStyleId",
  "subStyleId",
  "perk0",
  "perk1",
  "perk2",
  "perk3",
  "perk4",
  "perk5",
  "statPerk0",
  "statPerk1",
  "statPerk2",
];

function runesComplete(runes: Partial<ChampionBuildRunes>): runes is ChampionBuildRunes {
  return RUNE_FIELDS.every((field) => typeof runes[field] === "number" && (runes[field] as number) > 0);
}

function runesStarted(runes: Partial<ChampionBuildRunes>): boolean {
  return RUNE_FIELDS.some((field) => typeof runes[field] === "number");
}

function emptyDraft(role: Role): Draft {
  return {
    id: null,
    name: "",
    role,
    items: [],
    runes: {},
    spells: null,
    skillPriority: [],
    skillOrder: null,
    notes: "",
    source: "custom",
    sourcePatch: null,
    sourceRankTier: null,
  };
}

function winRatePercent(games: number, wins: number): number {
  return games > 0 ? Math.round((wins / games) * 100) : 0;
}

// Same accent-insensitive match the web's build editor and the Gold
// Calculator here use: "epee" must find "Épée" in the French catalog.
function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Fewer tracked games than this and a win rate is noise, so the header
// stays silent (same floor as the web's champion page).
const MIN_GAMES_FOR_WINRATE = 20;

export function ChampionBuilds() {
  const { t, locale } = useI18n();
  const openAccountPanel = useOpenAccountPanel();
  // Set when the Meta Tier List sent the user here on a champion.
  const requestedChampion = useRequestedChampion();
  const openTool = useOpenTool();

  const [version, setVersion] = useState("");
  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [champion, setChampion] = useState<ChampionInfo | null>(null);
  const [role, setRole] = useState<Role>("MIDDLE");
  const [roleTouched, setRoleTouched] = useState(false);
  const [rank, setRank] = useState<RankTier>("CHALLENGER");
  const [board, setBoard] = useState<BuildBoard | null>(null);
  const [boardStatus, setBoardStatus] = useState<"loading" | "error" | "ready">("loading");
  const [boardError, setBoardError] = useState<unknown>(null);
  const [boardAttempt, setBoardAttempt] = useState(0);
  // The champion whose first board already picked the position for us:
  // switching rank reloads the board and must not move the position again.
  const [autoRoledChampion, setAutoRoledChampion] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChampionDetail | null>(null);
  const [catalog, setCatalog] = useState<ItemCatalog | null>(null);
  const [runeStyles, setRuneStyles] = useState<RuneStyle[]>([]);
  const [spellPicks, setSpellPicks] = useState<SummonerSpellPick[]>([]);

  const [runePick, setRunePick] = useState(0);
  const [spellPick, setSpellPick] = useState(0);
  const [itemPick, setItemPick] = useState(0);

  const [user, setUser] = useState<AccountUser | null | undefined>(undefined);
  // null = not loaded yet; `savedError` = the list couldn't be fetched
  // (round 29): before, loading and failing both looked like "you haven't
  // saved a build for this champion yet", the one saved list round 22 left
  // without LoadError + "Loading your saved items…".
  const [builds, setBuilds] = useState<SavedChampionBuild[] | null>(null);
  const [savedError, setSavedError] = useState<Error | null>(null);
  const [savedAttempt, setSavedAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemQuery, setItemQuery] = useState("");

  useEffect(() => {
    window.riftcompass.getSession().then((session) => setUser(session.user));
  }, []);

  useEffect(() => {
    fetchLatestVersion().then(setVersion);
  }, []);

  useEffect(() => {
    fetchChampionMap().then((maps) => {
      setChampions(Object.values(maps.byInternalId));
      // Opened from another tool: land straight on that champion. The
      // position and rank it was being looked at in come along when the
      // caller had them (a Meta Tier List row); otherwise the champion's
      // own most-played position wins (roleTouched stays false).
      if (!requestedChampion) return;
      setChampion(maps.byInternalId[requestedChampion.championInternalId] ?? null);
      const role = requestedChampion.role as Role | undefined;
      const rank = requestedChampion.rank as RankTier | undefined;
      if (role && ROLES.includes(role)) {
        setRole(role);
        setRoleTouched(true);
      }
      if (rank && RANK_TIERS.includes(rank)) setRank(rank);
    });
  }, [requestedChampion]);

  useEffect(() => {
    if (!version) return;
    fetchItemCatalog(version, locale).then(setCatalog);
    fetchRuneStyles(version, locale).then(setRuneStyles);
    fetchSummonerSpellPicks(version, locale).then(setSpellPicks);
  }, [version, locale]);

  useEffect(() => {
    if (!champion || !version) return;
    let cancelled = false;
    fetchChampionDetail(version, toDDragonId(champion.internalId), locale)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [champion, version, locale]);

  useEffect(() => {
    if (!champion) {
      setBoard(null);
      return;
    }
    let cancelled = false;
    setBoard(null);
    setBoardStatus("loading");
    setRunePick(0);
    setSpellPick(0);
    setItemPick(0);
    const params = new URLSearchParams({ champion: champion.internalId, role, rank });
    setBoardError(null);
    apiGet<BuildBoard>(`${API_BASE_URL}/api/v1/champion-builds?${params}`)
      .then((data) => {
        if (cancelled) return;
        setBoard(data);
        setBoardStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBoardError(err);
        setBoardStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [champion, role, rank, boardAttempt]);

  // Opening a champion lands on the position it is actually played in,
  // until the player picks one themselves: the roles list comes back with
  // the board, ordered by real tracked games. Only the champion's first
  // board gets a say; later boards (another rank) keep the position as is.
  useEffect(() => {
    if (!champion || !board || roleTouched || autoRoledChampion === champion.internalId) return;
    setAutoRoledChampion(champion.internalId);
    const top = board.roles[0]?.role as Role | undefined;
    if (top && ROLES.includes(top) && top !== role) setRole(top);
  }, [champion, board, roleTouched, autoRoledChampion, role]);

  useEffect(() => {
    if (!user) {
      setBuilds(user === null ? [] : null);
      return;
    }
    setSavedError(null);
    window.riftcompass.getSavedChampionBuilds().then((result) => {
      if (result.ok) setBuilds(result.items);
      else setSavedError(savedListError(result));
    });
  }, [user, savedAttempt]);

  const runeIndex = useMemo(() => {
    const byId = new Map<number, { name: string; icon: string; shortDesc: string }>();
    const styleById = new Map<number, RuneStyle>();
    for (const style of runeStyles) {
      styleById.set(style.id, style);
      for (const slot of style.slots) for (const rune of slot) byId.set(rune.id, rune);
    }
    return { byId, styleById };
  }, [runeStyles]);

  const spellsById = useMemo(
    () => new Map(spellPicks.map((spell) => [spell.id, spell])),
    [spellPicks],
  );

  const championBuilds = useMemo(
    () => (builds ?? []).filter((build) => champion && build.championName === champion.internalId),
    [builds, champion],
  );

  const itemResults = useMemo(() => {
    if (!catalog) return [];
    const needle = normalizeSearch(itemQuery.trim());
    const pool = needle ? catalog.list.filter((item) => normalizeSearch(item.name).includes(needle)) : catalog.list;
    return pool.slice(0, 60);
  }, [catalog, itemQuery]);

  const damageType = champion ? damageTypeOf(champion.internalId) : null;
  const roleSample = board?.roles.find((entry) => entry.role === role) ?? null;

  const abilityIcon = (slot: number): string | null => {
    const spell = detail?.spells[slot - 1];
    return spell && version ? spellIconUrl(version, spell.image.full) : null;
  };

  function draftFromBoard(): Draft {
    const runes = board?.runePages[runePick];
    const spells = board?.spellPairs[spellPick];
    const items = board?.itemCores[itemPick];
    const path = board?.skillOrder.path ?? [];
    const levels = Array.from({ length: 18 }, () => 0);
    for (const step of path) levels[step.level - 1] = step.skillSlot;
    return {
      ...emptyDraft(role),
      name: `${champion?.name ?? ""} ${t(`Profile.positions.${role.toLowerCase()}`)}`.trim(),
      items: items?.itemIds ?? [],
      runes: runes ? stripCounts(runes) : {},
      spells: spells ? { spellLow: spells.spellLow, spellHigh: spells.spellHigh } : null,
      skillPriority: board?.skillOrder.maxPriority ?? [],
      skillOrder: path.length > 0 ? levels : null,
      source: "crawler",
      sourcePatch: board?.patch ?? null,
      sourceRankTier: rank,
    };
  }

  function draftFromSaved(build: SavedChampionBuild): Draft {
    return {
      id: build.id,
      name: build.name,
      role: (ROLES.includes(build.role as Role) ? build.role : "MIDDLE") as Role,
      items: build.items,
      runes: build.runes ?? {},
      spells: build.spells,
      skillPriority: build.skillPriority ?? [],
      skillOrder: build.skillOrder ?? null,
      notes: build.notes ?? "",
      source: build.source,
      sourcePatch: build.sourcePatch,
      sourceRankTier: build.sourceRankTier,
    };
  }

  function payloadOf(current: Draft): ChampionBuildInput {
    return {
      name: current.name.trim(),
      championName: champion?.internalId ?? "",
      role: current.role,
      items: current.items,
      runes: runesComplete(current.runes) ? current.runes : null,
      spells: current.spells,
      skillPriority: current.skillPriority.length > 0 ? current.skillPriority : null,
      skillOrder: current.skillOrder ? current.skillOrder.filter((slot) => slot > 0) : null,
      source: current.source,
      sourcePatch: current.sourcePatch,
      sourceRankTier: current.sourceRankTier,
      notes: current.notes.trim() || null,
    };
  }

  async function persist(current: Draft, closeEditor: boolean) {
    setBusy(true);
    setError(null);
    const result = current.id
      ? await window.riftcompass.updateChampionBuild(current.id, payloadOf(current))
      : await window.riftcompass.createChampionBuild(payloadOf(current));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBuilds(result.builds);
    if (closeEditor) setDraft(null);
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const result = await window.riftcompass.deleteChampionBuild(id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBuilds(result.builds);
  }

  const card = cardStyle();
  const sectionTitle = { fontFamily: FONT_HEADING, fontSize: TYPE.subheading, fontWeight: 400, margin: 0 } as const;
  const subTitle = {
    fontSize: TYPE.label,
    fontWeight: 600,
    letterSpacing: 0.6,
    textTransform: "uppercase" as const,
    color: COLORS.muted,
    margin: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ maxWidth: 320 }}>
        <ChampionCombobox
          champions={champions}
          value={champion}
          onChange={(next) => {
            setChampion(next);
            setRoleTouched(false);
            setDraft(null);
            setError(null);
          }}
          placeholder={t("Common.searchChampion")}
          noResultsLabel={t("ChampionBuilds.noResults")}
        />
      </div>

      {!champion ? (
        <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ChampionBuilds.pickChampion")}</p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {version ? (
                <img
                  src={championSquareUrl(version, toDDragonId(champion.internalId))}
                  alt=""
                  style={{ width: 48, height: 48, borderRadius: 10, border: `1px solid ${COLORS.cardBorder}`, flex: "none" }}
                />
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <h2 style={{ fontFamily: FONT_HEADING, fontSize: TYPE.heading, fontWeight: 400, margin: 0 }}>{champion.name}</h2>
                {damageType ? (
                  <span style={{ fontSize: TYPE.caption, color: COLORS.muted }}>{t(`ChampionBuilds.damageTypes.${damageType}`)}</span>
                ) : null}
              </div>
            </div>
            {roleSample && roleSample.games >= MIN_GAMES_FOR_WINRATE ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, marginLeft: "auto" }}>
                <span style={{ fontFamily: FONT_HEADING, fontSize: 18 }}>{formatPercent(locale, winRatePercent(roleSample.games, roleSample.wins) / 100)}</span>
                <span style={{ fontSize: TYPE.label, color: COLORS.muted, textAlign: "right" }}>
                  {t("ChampionBuilds.winRateIn", {
                    position: t(`Profile.positions.${role.toLowerCase()}`),
                    games: roleSample.games.toLocaleString(locale),
                  })}
                </span>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ROLES.map((option) => {
              const icon = positionIconUrl(option);
              const games = board?.roles.find((entry) => entry.role === option)?.games ?? 0;
              return (
                <button
                  key={option}
                  onClick={() => {
                    setRole(option);
                    setRoleTouched(true);
                  }}
                  aria-pressed={option === role}
                  style={{ ...pillStyle(option === role, "compact"), display: "flex", alignItems: "center", gap: 6 }}
                >
                  {icon ? <img src={icon} alt="" style={{ width: 13, height: 13, opacity: 0.85 }} /> : null}
                  {t(`Profile.positions.${option.toLowerCase()}`)}
                  {games > 0 ? <span style={{ fontSize: 10, opacity: 0.7 }}>{games}</span> : null}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: TYPE.caption, color: COLORS.muted, marginRight: 2 }}>{t("ChampionBuilds.rank")}</span>
            {RANK_TIERS.map((tier) => (
              <button key={tier} onClick={() => setRank(tier)} aria-pressed={tier === rank} style={pillStyle(tier === rank, "compact")}>
                {t(`MetaTierList.rankTiers.${tier}`)}
              </button>
            ))}
          </div>

          {board && (board.dataPatches?.length ?? 1) > 1 ? (
            <p style={{ fontSize: TYPE.body, color: COLORS.gold, margin: 0 }}>
              {t("ChampionBuilds.dataFromPatches", { patches: patchLabel(board.patch), current: patchLabel(board.currentPatch) })}
            </p>
          ) : board && board.patch !== board.currentPatch ? (
            <p style={{ fontSize: TYPE.body, color: COLORS.gold, margin: 0 }}>
              {t("ChampionBuilds.dataFromPatch", { patch: patchLabel(board.patch), current: patchLabel(board.currentPatch) })}
            </p>
          ) : null}

          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <h2 style={sectionTitle}>{t("ChampionBuilds.popularBuild")}</h2>
              {board ? (
                <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                  {t("ChampionBuilds.popularBuildSource", { patch: patchLabel(board.patch) })}
                  {openTool && champion ? (
                    <>
                      {" · "}
                      <button
                        onClick={() => openTool({ toolId: "matchups", championInternalId: champion.internalId, role, rank })}
                        style={{ background: "none", border: "none", color: COLORS.rose, fontSize: TYPE.label, cursor: "pointer", padding: 0 }}
                      >
                        {t("ChampionBuilds.openMatchups")}
                      </button>
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
            {board ? <DataQualityNote quality={board.dataQuality} patches={board.dataPatches ?? [board.patch]} /> : null}

            {!board ? (
              boardStatus === "error" ? (
                <LoadError error={boardError} onRetry={() => setBoardAttempt((n) => n + 1)} />
              ) : (
                <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ProfileSearch.loading")}</p>
              )
            ) : board.runePages.length === 0 && board.itemCores.length === 0 ? (
              <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ChampionBuilds.noBuildData")}</p>
            ) : (
              <>
                {board.runePages.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <p style={subTitle}>{t("ChampionBuilds.runes")}</p>
                    {board.runePages.map((page, index) => (
                      <OptionRow
                        key={index}
                        selected={index === runePick}
                        onSelect={() => setRunePick(index)}
                        games={page.games}
                        wins={page.wins}
                        gamesLabel={t("ChampionBuilds.games", { games: page.games })}
                      >
                        <RunePageView runes={page} index={runeIndex} t={t} />
                      </OptionRow>
                    ))}
                  </div>
                ) : null}

                {board.spellPairs.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <p style={subTitle}>{t("ChampionBuilds.summonerSpells")}</p>
                    {board.spellPairs.map((pair, index) => (
                      <OptionRow
                        key={index}
                        selected={index === spellPick}
                        onSelect={() => setSpellPick(index)}
                        games={pair.games}
                        wins={pair.wins}
                        gamesLabel={t("ChampionBuilds.games", { games: pair.games })}
                      >
                        <div style={{ display: "flex", gap: 5 }}>
                          {[pair.spellLow, pair.spellHigh].map((id) => {
                            const spell = spellsById.get(id);
                            return spell ? (
                              <img
                                key={id}
                                src={spell.iconUrl}
                                alt={spell.name}
                                loading="lazy"
                                decoding="async"
                                title={spell.name}
                                style={{ width: 26, height: 26, borderRadius: 6 }}
                              />
                            ) : null;
                          })}
                        </div>
                      </OptionRow>
                    ))}
                  </div>
                ) : null}

                {board.itemCores.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <p style={subTitle}>{t("ChampionBuilds.coreItems")}</p>
                    {board.itemCores.map((core, index) => (
                      <OptionRow
                        key={index}
                        selected={index === itemPick}
                        onSelect={() => setItemPick(index)}
                        games={core.games}
                        wins={core.wins}
                        gamesLabel={t("ChampionBuilds.games", { games: core.games })}
                      >
                        <div style={{ display: "flex", gap: 5 }}>
                          {core.itemIds.map((id, itemIndex) => (
                            <img
                              key={`${id}-${itemIndex}`}
                              src={itemIconUrl(version, id)}
                              alt={catalog?.byId[id]?.name ?? id}
                              loading="lazy"
                              decoding="async"
                              title={itemTooltip(catalog, id)}
                              style={{ width: 26, height: 26, borderRadius: 6 }}
                            />
                          ))}
                        </div>
                      </OptionRow>
                    ))}
                  </div>
                ) : null}

                {board.itemPlan ? <ItemPlanView plan={board.itemPlan} version={version} catalog={catalog} /> : null}

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  {user ? (
                    <>
                      <button
                        onClick={() => persist({ ...draftFromBoard(), id: null }, false)}
                        disabled={busy || board.itemCores.length === 0}
                        style={{ ...pillStyle(true, "compact"), opacity: busy ? 0.6 : 1 }}
                      >
                        {t("ChampionBuilds.savePopularBuild")}
                      </button>
                      <button
                        onClick={() => setDraft(draftFromBoard())}
                        disabled={busy}
                        style={pillStyle(false, "compact")}
                      >
                        {t("ChampionBuilds.savePopularAndEdit")}
                      </button>
                    </>
                  ) : user === null ? (
                    <>
                      <span style={{ fontSize: TYPE.caption, color: COLORS.muted }}>{t("ChampionBuilds.loginToSave")}</span>
                      {openAccountPanel ? (
                        <button onClick={openAccountPanel} style={pillStyle(false, "compact")}>
                          {t("ChampionBuilds.loginToSaveLink")}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <h2 style={sectionTitle}>{t("ChampionBuilds.skillOrder")}</h2>
              {board && board.skillOrder.sampleGames > 0 ? (
                <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                  {t("ChampionBuilds.games", { games: board.skillOrder.sampleGames })}
                </span>
              ) : null}
            </div>
            {!board ? (
              boardStatus === "error" ? (
                <LoadError error={boardError} onRetry={() => setBoardAttempt((n) => n + 1)} />
              ) : (
                <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ProfileSearch.loading")}</p>
              )
            ) : board.skillOrder.path.length === 0 ? (
              <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ChampionBuilds.noSkillOrderData")}</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: TYPE.caption, color: COLORS.muted }}>{t("ChampionBuilds.maxOrder")}</span>
                  {board.skillOrder.maxPriority.map((slot, index) => (
                    <span key={slot} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {index > 0 ? <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>&gt;</span> : null}
                      <AbilityBadge slot={slot} iconUrl={abilityIcon(slot)} />
                    </span>
                  ))}
                </div>
                <SkillGrid path={board.skillOrder.path} abilityIcon={abilityIcon} t={t} />
              </>
            )}
          </div>

          {/* What the pros ran (esports.md, fase 3): absent until the
              section has games of this champion, never an empty box. */}
          {version ? <CompetitiveBuildBlock championId={champion.internalId} version={version} runeIndex={runeIndex} catalog={catalog} t={t} style={card} /> : null}

          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <h2 style={sectionTitle}>{t("ChampionBuilds.myBuilds")}</h2>
              {user ? (
                <button
                  onClick={() => setDraft(emptyDraft(role))}
                  disabled={busy || draft !== null}
                  style={{ ...pillStyle(false, "compact"), display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Plus size={12} />
                  {t("ChampionBuilds.newBuild")}
                </button>
              ) : null}
            </div>

            {error && draft === null ? (
              <span style={{ fontSize: TYPE.caption, color: COLORS.destructive }}>{saveErrorMessage(t, "ChampionBuilds.errors", error)}</span>
            ) : null}

            {user === null ? (
              <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ChampionBuilds.loginToSave")}</p>
            ) : savedError ? (
              <LoadError error={savedError} onRetry={() => setSavedAttempt((n) => n + 1)} />
            ) : builds === null ? (
              <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("Common.loadingSaved")}</p>
            ) : championBuilds.length === 0 ? (
              <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("ChampionBuilds.noSavedBuilds")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {championBuilds.map((build) => (
                  <div
                    key={build.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      border: `1px solid ${COLORS.cardBorder}`,
                      borderRadius: 10,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: TYPE.body, fontWeight: 600 }}>{build.name}</span>
                        <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                          {t(`Profile.positions.${build.role.toLowerCase()}`)}
                        </span>
                        {build.source === "crawler" && build.sourcePatch ? (
                          <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                            {t("ChampionBuilds.fromTrackedGames", { patch: patchLabel(build.sourcePatch) })}
                          </span>
                        ) : null}
                      </div>
                      {build.runes ? <RunePageView runes={build.runes} index={runeIndex} t={t} /> : null}
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                        {build.spells
                          ? [build.spells.spellLow, build.spells.spellHigh].map((id) => {
                              const spell = spellsById.get(id);
                              return spell ? (
                                <img
                                  key={id}
                                  src={spell.iconUrl}
                                  alt={spell.name}
                                  loading="lazy"
                                  decoding="async"
                                  title={spell.name}
                                  style={{ width: 22, height: 22, borderRadius: 5 }}
                                />
                              ) : null;
                            })
                          : null}
                        {build.items.map((id, index) => (
                          <img
                            key={`${id}-${index}`}
                            src={itemIconUrl(version, id)}
                            alt={catalog?.byId[id]?.name ?? id}
                            loading="lazy"
                            decoding="async"
                            title={itemTooltip(catalog, id)}
                            style={{ width: 22, height: 22, borderRadius: 5 }}
                          />
                        ))}
                      </div>
                      {build.skillPriority && build.skillPriority.length > 0 ? (
                        <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                          {t("ChampionBuilds.maxOrder")}: {build.skillPriority.map((slot) => SKILL_KEYS[slot]).join(" > ")}
                        </span>
                      ) : null}
                      {build.notes ? <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>{build.notes}</span> : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={() => setDraft(draftFromSaved(build))}
                        disabled={busy}
                        style={{ ...pillStyle(false, "compact"), display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <PencilSimple size={12} />
                        {t("ChampionBuilds.edit")}
                      </button>
                      <button
                        onClick={() => remove(build.id)}
                        disabled={busy}
                        title={t("ChampionBuilds.delete")}
                        style={{ ...pillStyle(false, "compact"), padding: "6px 8px", lineHeight: 0 }}
                      >
                        <Trash size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {draft ? (
              <BuildEditor
                draft={draft}
                onChange={setDraft}
                version={version}
                catalog={catalog}
                itemResults={itemResults}
                itemQuery={itemQuery}
                onItemQuery={setItemQuery}
                runeStyles={runeStyles}
                spellPicks={spellPicks}
                abilityIcon={abilityIcon}
                popularPath={board?.skillOrder.path ?? []}
                onCancel={() => {
                  setDraft(null);
                  setError(null);
                }}
                onSave={() => persist(draft, true)}
                busy={busy}
                error={error}
                t={t}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// Qué comprar primero y en qué orden, debajo de los cores ("qué se lleva al
// final"): salida, terminados en orden de compra y situacionales, cada uno
// con su muestra en el tooltip. Puerto del ItemPlanView de la ficha web.
const PLAN_SUBTITLE: React.CSSProperties = {
  fontSize: TYPE.label,
  fontWeight: 600,
  letterSpacing: 0.6,
  textTransform: "uppercase" as const,
  color: COLORS.muted,
  margin: 0,
};

function ItemPlanView({ plan, version, catalog }: { plan: ItemPlan; version: string; catalog: ItemCatalog | null }) {
  const { t } = useI18n();
  if (plan.startingItems.length === 0 && plan.itemOrder.length === 0) return null;
  const icon = (itemId: number, label: string) => (
    <img
      src={itemIconUrl(version, String(itemId))}
      alt={catalog?.byId[String(itemId)]?.name ?? String(itemId)}
      loading="lazy"
      decoding="async"
      title={`${catalog?.byId[String(itemId)]?.name ?? itemId} · ${label}`}
      style={{ width: 26, height: 26, borderRadius: 6 }}
    />
  );
  const sample = (e: ItemPlanEntry) => t("ChampionBuilds.itemSample", { games: e.games, rate: Math.round(e.winRate * 100) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {plan.startingItems.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={PLAN_SUBTITLE}>{t("ChampionBuilds.startingItems")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {plan.startingItems.map((e) => (
              <span key={e.itemId}>{icon(e.itemId, sample(e))}</span>
            ))}
          </div>
        </div>
      ) : null}
      {plan.itemOrder.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={PLAN_SUBTITLE}>{t("ChampionBuilds.buildOrder")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
            {plan.itemOrder.map((e, i) => (
              <span key={e.slot} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {i > 0 ? <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>→</span> : null}
                {icon(e.itemId, t("ChampionBuilds.games", { games: e.games }))}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {plan.situationalItems.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={PLAN_SUBTITLE}>{t("ChampionBuilds.situationalItems")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {plan.situationalItems.map((e) => (
              <span key={e.itemId}>{icon(e.itemId, sample(e))}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function itemTooltip(catalog: ItemCatalog | null, id: string): string {
  const item = catalog?.byId[id];
  return item ? `${item.name} (${item.totalGold})` : id;
}

function stripCounts(page: PopularRunePage): ChampionBuildRunes {
  const { games, wins, ...runes } = page;
  void games;
  void wins;
  return runes;
}


function OptionRow({
  selected,
  onSelect,
  games,
  wins,
  gamesLabel,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  games: number;
  wins: number;
  gamesLabel: string;
  children: React.ReactNode;
}) {
  const { locale } = useI18n();
  const rate = winRatePercent(games, wins);
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        border: `1px solid ${selected ? COLORS.rose : COLORS.cardBorder}`,
        background: selected ? `${COLORS.rose}18` : "none",
        borderRadius: 10,
        padding: "7px 10px",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {children}
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: TYPE.caption, fontWeight: 700, color: rate >= 53 ? COLORS.gold : COLORS.muted }}>{formatPercent(locale, rate / 100)}</span>
        <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>{gamesLabel}</span>
      </span>
    </button>
  );
}

function BuildEditor({
  draft,
  onChange,
  version,
  catalog,
  itemResults,
  itemQuery,
  onItemQuery,
  runeStyles,
  spellPicks,
  abilityIcon,
  popularPath,
  onCancel,
  onSave,
  busy,
  error,
  t,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  version: string;
  catalog: ItemCatalog | null;
  itemResults: ItemCatalog["list"];
  itemQuery: string;
  onItemQuery: (value: string) => void;
  runeStyles: RuneStyle[];
  spellPicks: SummonerSpellPick[];
  abilityIcon: (slot: number) => string | null;
  popularPath: { level: number; skillSlot: number }[];
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  error: string | null;
  t: Translate;
}) {
  const primaryStyle = runeStyles.find((style) => style.id === draft.runes.primaryStyleId);
  const secondaryStyle = runeStyles.find((style) => style.id === draft.runes.subStyleId);
  const incompleteRunes = runesStarted(draft.runes) && !runesComplete(draft.runes);

  const patch = (changes: Partial<Draft>) => onChange({ ...draft, ...changes });
  const patchRunes = (changes: Partial<ChampionBuildRunes>) => patch({ runes: { ...draft.runes, ...changes } });

  function toggleItem(id: string) {
    if (draft.items.includes(id)) {
      patch({ items: draft.items.filter((item) => item !== id) });
      return;
    }
    if (draft.items.length >= MAX_BUILD_ITEMS) return;
    patch({ items: [...draft.items, id] });
  }

  function toggleSpell(id: number) {
    const current = draft.spells ? [draft.spells.spellLow, draft.spells.spellHigh] : [];
    let next: number[];
    if (current.includes(id)) next = current.filter((spell) => spell !== id);
    else if (current.length >= 2) next = [current[1], id];
    else next = [...current, id];

    if (next.length === 2) {
      const [low, high] = [...next].sort((a, b) => a - b);
      patch({ spells: { spellLow: low, spellHigh: high } });
    } else {
      patch({ spells: null });
    }
  }

  function togglePriority(slot: number) {
    if (draft.skillPriority.includes(slot)) {
      patch({ skillPriority: draft.skillPriority.filter((entry) => entry !== slot) });
      return;
    }
    if (draft.skillPriority.length >= 3) return;
    patch({ skillPriority: [...draft.skillPriority, slot] });
  }

  function setLevel(level: number, slot: number) {
    const next = [...(draft.skillOrder ?? Array.from({ length: 18 }, () => 0))];
    next[level - 1] = next[level - 1] === slot ? 0 : slot;
    patch({ skillOrder: next });
  }

  const editorPath = (draft.skillOrder ?? [])
    .map((slot, index) => ({ level: index + 1, skillSlot: slot }))
    .filter((step) => step.skillSlot > 0);

  const label = { fontSize: TYPE.label, color: COLORS.muted, margin: 0 } as const;
  const runeButton = (picked: boolean) => ({
    border: `1px solid ${picked ? COLORS.rose : "transparent"}`,
    background: "none",
    borderRadius: "50%",
    padding: 2,
    opacity: picked ? 1 : 0.45,
    cursor: "pointer",
    lineHeight: 0,
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 220px", minWidth: 0 }}>
          <span style={label}>{t("ChampionBuilds.buildName")}</span>
          <input
            value={draft.name}
            maxLength={60}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={t("ChampionBuilds.buildNamePlaceholder")}
            style={inputStyle}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={label}>{t("ChampionBuilds.position")}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ROLES.map((option) => {
              const icon = positionIconUrl(option);
              return (
                <button
                  key={option}
                  onClick={() => patch({ role: option })}
                  style={{ ...pillStyle(option === draft.role, "compact"), display: "flex", alignItems: "center", gap: 6 }}
                >
                  {icon ? <img src={icon} alt="" style={{ width: 13, height: 13, opacity: 0.85 }} /> : null}
                  {t(`Profile.positions.${option.toLowerCase()}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={label}>{t("ChampionBuilds.runes")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {runeStyles.map((style) => (
            <button
              key={style.id}
              onClick={() =>
                patchRunes({
                  primaryStyleId: style.id,
                  perk0: undefined,
                  perk1: undefined,
                  perk2: undefined,
                  perk3: undefined,
                  ...(draft.runes.subStyleId === style.id ? { subStyleId: undefined, perk4: undefined, perk5: undefined } : {}),
                })
              }
              style={{ ...pillStyle(style.id === draft.runes.primaryStyleId, "compact"), display: "flex", alignItems: "center", gap: 6 }}
            >
              <img src={runeIconUrl(style.icon)} alt="" style={{ width: 14, height: 14 }} />
              {style.name}
            </button>
          ))}
        </div>

        {primaryStyle
          ? primaryStyle.slots.map((slot, slotIndex) => {
              const field = (["perk0", "perk1", "perk2", "perk3"] as const)[slotIndex];
              return (
                <div key={slotIndex} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {slot.map((rune) => (
                    <button
                      key={rune.id}
                      onClick={() => patchRunes({ [field]: rune.id } as Partial<ChampionBuildRunes>)}
                      title={`${rune.name}: ${rune.shortDesc}`}
                      style={runeButton(draft.runes[field] === rune.id)}
                    >
                      <img src={runeIconUrl(rune.icon)} alt={rune.name} style={{ width: slotIndex === 0 ? 30 : 24, height: slotIndex === 0 ? 30 : 24 }} />
                    </button>
                  ))}
                </div>
              );
            })
          : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {runeStyles
            .filter((style) => style.id !== draft.runes.primaryStyleId)
            .map((style) => (
              <button
                key={style.id}
                onClick={() => patchRunes({ subStyleId: style.id, perk4: undefined, perk5: undefined })}
                style={{ ...pillStyle(style.id === draft.runes.subStyleId, "compact"), display: "flex", alignItems: "center", gap: 6 }}
              >
                <img src={runeIconUrl(style.icon)} alt="" style={{ width: 14, height: 14 }} />
                {style.name}
              </button>
            ))}
        </div>

        {secondaryStyle ? (
          <>
            <p style={label}>{t("ChampionBuilds.secondaryHint")}</p>
            {secondaryStyle.slots.slice(1).map((slot, slotIndex) => (
              <div key={slotIndex} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {slot.map((rune) => {
                  const picked = draft.runes.perk4 === rune.id || draft.runes.perk5 === rune.id;
                  return (
                    <button
                      key={rune.id}
                      onClick={() => {
                        const current = [draft.runes.perk4, draft.runes.perk5].filter(
                          (id): id is number => typeof id === "number",
                        );
                        // Two runes from the same row is not a legal page, so
                        // picking one replaces whatever its row already had.
                        const rowIds = new Set(slot.map((option) => option.id));
                        const kept = current.filter((id) => !rowIds.has(id));
                        const next = picked ? kept : [...kept, rune.id].slice(-2);
                        patchRunes({ perk4: next[0], perk5: next[1] });
                      }}
                      title={`${rune.name}: ${rune.shortDesc}`}
                      style={runeButton(picked)}
                    >
                      <img src={runeIconUrl(rune.icon)} alt={rune.name} style={{ width: 24, height: 24 }} />
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        ) : null}

        <p style={label}>{t("ChampionBuilds.shards")}</p>
        {STAT_SHARD_ROWS.map((row, rowIndex) => {
          const field = (["statPerk0", "statPerk1", "statPerk2"] as const)[rowIndex];
          return (
            <div key={rowIndex} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {row.map((shard) => (
                <button
                  key={`${rowIndex}-${shard.id}`}
                  onClick={() => patchRunes({ [field]: shard.id } as Partial<ChampionBuildRunes>)}
                  title={t(`ChampionBuilds.statShards.${shard.key}`)}
                  style={runeButton(draft.runes[field] === shard.id)}
                >
                  <img src={statShardIconUrl(shard)} alt={t(`ChampionBuilds.statShards.${shard.key}`)} style={{ width: 20, height: 20 }} />
                </button>
              ))}
            </div>
          );
        })}
        {incompleteRunes ? (
          <span style={{ fontSize: TYPE.label, color: COLORS.gold }}>{t("ChampionBuilds.runesIncomplete")}</span>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={label}>{t("ChampionBuilds.summonerSpells")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {spellPicks.map((spell) => {
            const picked = draft.spells?.spellLow === spell.id || draft.spells?.spellHigh === spell.id;
            return (
              <button
                key={spell.id}
                onClick={() => toggleSpell(spell.id)}
                title={spell.name}
                style={{
                  border: `1px solid ${picked ? COLORS.rose : COLORS.cardBorder}`,
                  background: "none",
                  borderRadius: 6,
                  padding: 0,
                  opacity: picked ? 1 : 0.5,
                  cursor: "pointer",
                  lineHeight: 0,
                }}
              >
                <img src={spell.iconUrl} alt={spell.name} style={{ width: 26, height: 26, borderRadius: 6 }} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={label}>{t("ChampionBuilds.items")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          {draft.items.length === 0 ? (
            <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>{t("ChampionBuilds.noItemsYet")}</span>
          ) : (
            draft.items.map((id, index) => (
              <button
                key={`${id}-${index}`}
                onClick={() => toggleItem(id)}
                title={t("ChampionBuilds.removeItem", { item: catalog?.byId[id]?.name ?? id })}
                style={{ position: "relative", border: "none", background: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
              >
                <img src={itemIconUrl(version, id)} alt="" style={{ width: 30, height: 30, borderRadius: 6 }} />
                <X size={10} style={{ position: "absolute", top: -4, right: -4, background: COLORS.background, borderRadius: "50%" }} />
              </button>
            ))
          )}
        </div>
        <div style={{ position: "relative", maxWidth: 260 }}>
          <MagnifyingGlass
            size={13}
            color={COLORS.muted}
            style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            value={itemQuery}
            onChange={(e) => onItemQuery(e.target.value)}
            placeholder={t("ChampionBuilds.itemSearchPlaceholder")}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              borderBottom: `1px solid ${COLORS.cardBorder}`,
              color: COLORS.text,
              fontSize: TYPE.body,
              padding: "4px 4px 4px 22px",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
            maxHeight: 150,
            overflowY: "auto",
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            padding: 6,
          }}
        >
          {itemResults.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleItem(item.id)}
              title={`${item.name} (${item.totalGold})`}
              disabled={!draft.items.includes(item.id) && draft.items.length >= MAX_BUILD_ITEMS}
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
            >
              <img src={itemIconUrl(version, item.id)} alt={item.name} style={{ width: 28, height: 28, borderRadius: 6 }} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={label}>{t("ChampionBuilds.skillOrder")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: TYPE.caption, color: COLORS.muted }}>{t("ChampionBuilds.maxOrder")}</span>
          {[1, 2, 3].map((slot) => {
            const position = draft.skillPriority.indexOf(slot);
            return (
              <button key={slot} onClick={() => togglePriority(slot)} style={pillStyle(position >= 0, "compact")}>
                {SKILL_KEYS[slot]}
                {position >= 0 ? <span style={{ fontSize: TYPE.micro, marginLeft: 3 }}>{position + 1}</span> : null}
              </button>
            );
          })}
          {draft.skillPriority.length > 0 ? (
            <button
              onClick={() => patch({ skillPriority: [] })}
              style={{ background: "none", border: "none", color: COLORS.muted, fontSize: TYPE.label, cursor: "pointer" }}
            >
              {t("ChampionBuilds.clear")}
            </button>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: TYPE.caption, color: COLORS.muted }}>{t("ChampionBuilds.levelByLevel")}</span>
          {popularPath.length > 0 ? (
            <button
              onClick={() => {
                const filled = Array.from({ length: 18 }, () => 0);
                for (const step of popularPath) filled[step.level - 1] = step.skillSlot;
                patch({ skillOrder: filled });
              }}
              style={{ background: "none", border: "none", color: COLORS.rose, fontSize: TYPE.label, cursor: "pointer" }}
            >
              {t("ChampionBuilds.copyPopularOrder")}
            </button>
          ) : null}
          {draft.skillOrder ? (
            <button
              onClick={() => patch({ skillOrder: null })}
              style={{ background: "none", border: "none", color: COLORS.muted, fontSize: TYPE.label, cursor: "pointer" }}
            >
              {t("ChampionBuilds.clear")}
            </button>
          ) : null}
        </div>
        <SkillGrid path={editorPath} abilityIcon={abilityIcon} onSet={setLevel} t={t} />
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={label}>{t("ChampionBuilds.notes")}</span>
        <textarea
          value={draft.notes}
          maxLength={500}
          rows={2}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder={t("ChampionBuilds.notesPlaceholder")}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>

      {error ? <span style={{ fontSize: TYPE.caption, color: COLORS.destructive }}>{saveErrorMessage(t, "ChampionBuilds.errors", error)}</span> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          onClick={onSave}
          disabled={busy || incompleteRunes || draft.items.length === 0 || !draft.name.trim()}
          style={{
            ...pillStyle(true, "compact"),
            opacity: busy || incompleteRunes || draft.items.length === 0 || !draft.name.trim() ? 0.5 : 1,
          }}
        >
          {busy ? t("ChampionBuilds.saving") : t("ChampionBuilds.saveBuild")}
        </button>
        <button onClick={onCancel} disabled={busy} style={pillStyle(false, "compact")}>
          {t("ChampionBuilds.cancel")}
        </button>
      </div>
    </div>
  );
}

