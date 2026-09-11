// Ported from the web app's src/lib/riot/{rank-band,diagnostic,
// role-breakdown,head-to-head}.ts — same formulas (the lane-opponent
// diagnostic, the CS/min table, the laning-advantage midpoint), not
// re-derived. All pure functions of the
// same RecentMatchSummary[] the profile endpoint already returns, so the
// desktop app computes diagnostic/role-breakdown/head-to-head
// client-side from one fetch instead of needing a matching endpoint per
// widget. Kept in one file (the web app splits these into 5) since this
// app doesn't need the same file-per-concern granularity.
import type { MatchParticipantSummary, RecentMatchSummary } from "./profile-types";

// --- rank-band.ts ---
export type RankBand = "default" | "learning" | "climbing" | "high";

export function tierToBand(tier: string | null | undefined): RankBand {
  if (!tier) return "default";
  if (["IRON", "BRONZE", "SILVER"].includes(tier)) return "learning";
  if (["GOLD", "PLATINUM", "EMERALD"].includes(tier)) return "climbing";
  return "high";
}

export const CS_PER_MIN_TARGETS: Record<RankBand, number> = {
  default: 7,
  learning: 5,
  climbing: 6.5,
  high: 8.5,
};
export const SUPPORT_CS_PER_MIN_TARGET = 1.5;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// --- diagnostic.ts ---
// One diagnostic feeds everything the profile says about "how you play":
// the roadmap rows, the strength/focus pills above them, the per-game note
// and score in the match list, the post-game report and the compare view.
// The reference for every metric is the player's real lane opponent in
// each game (same teamPosition on the other team): same role, same elo, no
// invented benchmark. Only Summoner's Rift 5v5 games count, and the only
// published number left is the CS/min table above, shown as a side note.
export type DiagnosticMetric = "csPerMin" | "visionPerMin" | "damagePerMin" | "killParticipation" | "kda" | "laningAdvantage";

export const DIAGNOSTIC_METRICS: DiagnosticMetric[] = ["csPerMin", "visionPerMin", "damagePerMin", "killParticipation", "kda", "laningAdvantage"];

/** Metrics that exist for a single game (laningAdvantage is a per-game flag, only meaningful as a share of games). */
export const MATCH_METRICS: Exclude<DiagnosticMetric, "laningAdvantage">[] = ["csPerMin", "visionPerMin", "damagePerMin", "killParticipation", "kda"];

export const SUMMONERS_RIFT_QUEUE_IDS: ReadonlySet<number> = new Set([400, 420, 430, 440, 490, 700]);
export const MIN_DIAGNOSTIC_GAMES = 3;
export const STRENGTH_RATIO = 1.15;
export const FOCUS_RATIO = 0.85;
const LANING_ADVANTAGE_REFERENCE = 50;

export type DiagnosticStatus = "above" | "below";

export interface DiagnosticNode {
  metric: DiagnosticMetric;
  /** The player's own figure over the diagnosed games. */
  value: number;
  /** Their lane opponents' figure over the same games (laningAdvantage: the 50% midpoint). */
  reference: number;
  /** value / reference: 1 = even with the opponent. */
  ratio: number;
  status: DiagnosticStatus;
}

export type Position = (typeof KNOWN_POSITIONS)[number];

export interface Diagnostic {
  ready: true;
  games: number;
  totalGames: number;
  primaryRole: Position;
  primaryRoleGames: number;
  band: RankBand;
  /** Published CS/min reference for the rank band; absent without a rank and for supports. */
  csReference?: number;
  /** Worst gap first. */
  nodes: DiagnosticNode[];
  strengths: DiagnosticMetric[];
  focus: DiagnosticMetric[];
}

export interface DiagnosticNotReady {
  ready: false;
  games: number;
  totalGames: number;
  required: number;
}

export type DiagnosticResult = Diagnostic | DiagnosticNotReady;

function isKnownPosition(position: string): position is Position {
  return (KNOWN_POSITIONS as readonly string[]).includes(position);
}

/** The enemy in the same position as `participant`, or null outside Summoner's Rift / without one. */
export function laneOpponentOf(participant: MatchParticipantSummary, match: Pick<RecentMatchSummary, "queueId" | "participants">): MatchParticipantSummary | null {
  if (!SUMMONERS_RIFT_QUEUE_IDS.has(match.queueId) || !isKnownPosition(participant.teamPosition)) return null;
  return match.participants.find((p) => p.teamPosition === participant.teamPosition && p.teamId !== participant.teamId) ?? null;
}

// RecentMatchSummary doesn't carry the tracked player's teamId: their own
// row is the one on the winning/losing side with their champion in their
// position (mirror picks in blind pick are told apart by `win`).
function trackedParticipant(match: RecentMatchSummary): MatchParticipantSummary | null {
  return match.participants.find((p) => p.teamPosition === match.teamPosition && p.win === match.win && p.championName === match.championName) ?? null;
}

export function laneOpponent(match: RecentMatchSummary): MatchParticipantSummary | null {
  const me = trackedParticipant(match);
  return me ? laneOpponentOf(me, match) : null;
}

interface GameStats {
  csPerMin: number;
  visionPerMin: number;
  damagePerMin: number;
  killParticipation: number;
  kills: number;
  deaths: number;
  assists: number;
}

function participantGameStats(p: MatchParticipantSummary, durationSeconds: number): GameStats {
  const minutes = Math.max(1, durationSeconds / 60);
  return {
    csPerMin: p.cs / minutes,
    visionPerMin: p.visionScore / minutes,
    damagePerMin: p.damageDealt / minutes,
    killParticipation: p.killParticipation * 100,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
  };
}

function kdaOf(stats: Pick<GameStats, "kills" | "deaths" | "assists">): number {
  return (stats.kills + stats.assists) / Math.max(1, stats.deaths);
}

function ratioOf(value: number, reference: number): number {
  if (reference > 0) return value / reference;
  return value > 0 ? STRENGTH_RATIO : 1;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Ratio and verdict come from the rounded figures the UI prints, so a row
// can never show "0.7 vs 0.7" painted as behind.
function node(metric: DiagnosticMetric, rawValue: number, rawReference: number): DiagnosticNode {
  const decimals = metric === "damagePerMin" || metric === "killParticipation" || metric === "laningAdvantage" ? 0 : 1;
  const value = roundTo(rawValue, decimals);
  const reference = roundTo(rawReference, decimals);
  const ratio = ratioOf(value, reference);
  return { metric, value, reference, ratio, status: ratio >= 1 ? "above" : "below" };
}

function sumOf(stats: GameStats[], key: "kills" | "deaths" | "assists"): number {
  return stats.reduce((sum, game) => sum + game[key], 0);
}

export function computeDiagnostic(matches: RecentMatchSummary[], tier?: string | null): DiagnosticResult {
  const diagnosed: { match: RecentMatchSummary; me: MatchParticipantSummary; opponent: MatchParticipantSummary }[] = [];
  for (const match of matches) {
    const me = trackedParticipant(match);
    const opponent = me ? laneOpponentOf(me, match) : null;
    if (me && opponent) diagnosed.push({ match, me, opponent });
  }
  if (diagnosed.length < MIN_DIAGNOSTIC_GAMES) {
    return { ready: false, games: diagnosed.length, totalGames: matches.length, required: MIN_DIAGNOSTIC_GAMES };
  }

  const mine = diagnosed.map(({ match, me }) => participantGameStats(me, match.durationSeconds));
  const theirs = diagnosed.map(({ match, opponent }) => participantGameStats(opponent, match.durationSeconds));

  // KDA over the whole sample as one ratio of sums, not the mean of per-game
  // KDAs: a single deathless game used to carry a dozen bad ones.
  const myKda = kdaOf({ kills: sumOf(mine, "kills"), deaths: sumOf(mine, "deaths"), assists: sumOf(mine, "assists") });
  const theirKda = kdaOf({ kills: sumOf(theirs, "kills"), deaths: sumOf(theirs, "deaths"), assists: sumOf(theirs, "assists") });
  const laningAdvantagePct = (diagnosed.filter(({ match }) => match.laningAdvantage).length / diagnosed.length) * 100;

  const nodes = [
    node("csPerMin", average(mine.map((g) => g.csPerMin)), average(theirs.map((g) => g.csPerMin))),
    node("visionPerMin", average(mine.map((g) => g.visionPerMin)), average(theirs.map((g) => g.visionPerMin))),
    node("damagePerMin", average(mine.map((g) => g.damagePerMin)), average(theirs.map((g) => g.damagePerMin))),
    node("killParticipation", average(mine.map((g) => g.killParticipation)), average(theirs.map((g) => g.killParticipation))),
    node("kda", myKda, theirKda),
    node("laningAdvantage", laningAdvantagePct, LANING_ADVANTAGE_REFERENCE),
  ].sort((a, b) => a.ratio - b.ratio);

  const roleCounts = new Map<Position, number>();
  for (const { match } of diagnosed) {
    const position = match.teamPosition as Position;
    roleCounts.set(position, (roleCounts.get(position) ?? 0) + 1);
  }
  const [primaryRole, primaryRoleGames] = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const band = tierToBand(tier);

  return {
    ready: true,
    games: diagnosed.length,
    totalGames: matches.length,
    primaryRole,
    primaryRoleGames,
    band,
    csReference: primaryRole === "UTILITY" || band === "default" ? undefined : CS_PER_MIN_TARGETS[band],
    nodes,
    strengths: nodes.filter((n) => n.ratio >= STRENGTH_RATIO).map((n) => n.metric),
    focus: nodes.filter((n) => n.ratio <= FOCUS_RATIO).map((n) => n.metric),
  };
}

/** Roadmap i18n key of a node's advice: by rank band, and for laning also by jungle vs. laner. */
export function tipKey(node: DiagnosticNode, diagnostic: Pick<Diagnostic, "band" | "primaryRole">): string {
  const verdict = node.status === "above" ? "tipAbove" : "tipBelow";
  if (node.metric === "laningAdvantage") {
    const role = diagnostic.primaryRole === "JUNGLE" ? "jungle" : "laner";
    return `Roadmap.${node.metric}.${verdict}.${role}.${diagnostic.band}`;
  }
  return `Roadmap.${node.metric}.${verdict}.${diagnostic.band}`;
}

export type Sentiment = "good" | "neutral" | "bad";

export interface MatchDiagnostic {
  /** Same five per-game metrics as the roadmap, each against this game's lane opponent. */
  nodes: DiagnosticNode[];
  standout: { metric: DiagnosticMetric; sentiment: "good" | "bad" } | { metric: "even"; sentiment: "neutral" };
  /** 0-10, one decimal: the five ratios averaged, 1.5 (and above) = 10, even with the opponent = 6.7. */
  score: number;
  scoreSentiment: Sentiment;
}

const SCORE_CEILING_RATIO = 1.5;

// Any participant of a game against their own lane opponent, so the
// expanded scoreboard can score all ten players with the same rule the
// tracked player gets. Null when the game has no lane opponents (ARAM).
export function diagnoseParticipant(participant: MatchParticipantSummary, match: Pick<RecentMatchSummary, "queueId" | "participants" | "durationSeconds">): MatchDiagnostic | null {
  const opponent = laneOpponentOf(participant, match);
  if (!opponent) return null;

  const mine = participantGameStats(participant, match.durationSeconds);
  const theirs = participantGameStats(opponent, match.durationSeconds);
  const nodes = MATCH_METRICS.map((metric) => (metric === "kda" ? node("kda", kdaOf(mine), kdaOf(theirs)) : node(metric, mine[metric], theirs[metric])));

  const overall = average(nodes.map((n) => Math.min(SCORE_CEILING_RATIO, n.ratio)));
  const score = roundTo((overall / SCORE_CEILING_RATIO) * 10, 1);
  const scoreSentiment: Sentiment = overall >= STRENGTH_RATIO ? "good" : overall <= FOCUS_RATIO ? "bad" : "neutral";

  const furthest = nodes.reduce((most, n) => (Math.abs(n.ratio - 1) > Math.abs(most.ratio - 1) ? n : most));
  const standout: MatchDiagnostic["standout"] =
    furthest.ratio >= STRENGTH_RATIO
      ? { metric: furthest.metric, sentiment: "good" }
      : furthest.ratio <= FOCUS_RATIO
        ? { metric: furthest.metric, sentiment: "bad" }
        : { metric: "even", sentiment: "neutral" };

  return { nodes, standout, score, scoreSentiment };
}

export function diagnoseMatch(match: RecentMatchSummary): MatchDiagnostic | null {
  const me = trackedParticipant(match);
  return me ? diagnoseParticipant(me, match) : null;
}

/** Share of a tug-of-war bar the player's side fills: 50 = even with the opponent. */
export function playerShare(node: DiagnosticNode): number {
  const total = node.value + node.reference;
  if (total <= 0) return 50;
  return Math.round((node.value / total) * 100);
}

export function metricUnit(metric: DiagnosticMetric): "" | "%" {
  return metric === "killParticipation" || metric === "laningAdvantage" ? "%" : "";
}

// --- role-breakdown.ts ---
export const KNOWN_POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export const RANKED_SOLO_QUEUE_ID = 420;
export const RANKED_FLEX_QUEUE_ID = 440;

export interface RoleStats {
  position: (typeof KNOWN_POSITIONS)[number];
  games: number;
  wins: number;
}

export function computeRoleBreakdown(
  matches: Pick<RecentMatchSummary, "queueId" | "teamPosition" | "win">[],
  queueId: number,
): RoleStats[] {
  const byPosition = new Map<string, RoleStats>(
    KNOWN_POSITIONS.map((position) => [position, { position, games: 0, wins: 0 }]),
  );
  for (const match of matches) {
    if (match.queueId !== queueId) continue;
    const entry = byPosition.get(match.teamPosition);
    if (!entry) continue;
    entry.games += 1;
    if (match.win) entry.wins += 1;
  }
  return [...byPosition.values()].sort((a, b) => b.games - a.games);
}

// --- head-to-head.ts ---
export type HeadToHeadStatKey = "winRate" | "kda" | "csPerMin" | "killsPerGame" | "deathsPerGame" | "assistsPerGame" | "visionPerMin";

export interface HeadToHeadStat {
  key: HeadToHeadStatKey;
  valueA: number;
  valueB: number;
  higherIsBetter: boolean;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function playerStats(matches: RecentMatchSummary[]) {
  const minutes = matches.map((m) => Math.max(1, m.durationSeconds / 60));
  return {
    csPerMin: round(average(matches.map((m, i) => m.cs / minutes[i]))),
    kda: round(average(matches.map((m) => (m.kills + m.assists) / Math.max(1, m.deaths)))),
    killsPerGame: round(average(matches.map((m) => m.kills))),
    deathsPerGame: round(average(matches.map((m) => m.deaths))),
    assistsPerGame: round(average(matches.map((m) => m.assists))),
    visionPerMin: round(average(matches.map((m, i) => m.visionScore / minutes[i]))),
    winRate: round((matches.filter((m) => m.win).length / Math.max(1, matches.length)) * 100),
  };
}

export function computeHeadToHead(matchesA: RecentMatchSummary[], matchesB: RecentMatchSummary[]): HeadToHeadStat[] {
  const a = playerStats(matchesA);
  const b = playerStats(matchesB);
  return [
    { key: "winRate", valueA: a.winRate, valueB: b.winRate, higherIsBetter: true },
    { key: "kda", valueA: a.kda, valueB: b.kda, higherIsBetter: true },
    { key: "csPerMin", valueA: a.csPerMin, valueB: b.csPerMin, higherIsBetter: true },
    { key: "killsPerGame", valueA: a.killsPerGame, valueB: b.killsPerGame, higherIsBetter: true },
    { key: "deathsPerGame", valueA: a.deathsPerGame, valueB: b.deathsPerGame, higherIsBetter: false },
    { key: "assistsPerGame", valueA: a.assistsPerGame, valueB: b.assistsPerGame, higherIsBetter: true },
    { key: "visionPerMin", valueA: a.visionPerMin, valueB: b.visionPerMin, higherIsBetter: true },
  ];
}

// --- position-icon.ts / rank-emblem.ts (URL builders only) ---
const POSITION_ICON_FILES: Record<string, string> = {
  TOP: "position-top",
  JUNGLE: "position-jungle",
  MIDDLE: "position-middle",
  BOTTOM: "position-bottom",
  UTILITY: "position-utility",
};

export function positionIconUrl(teamPosition: string): string | null {
  const file = POSITION_ICON_FILES[teamPosition];
  if (!file) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/svg/${file}.svg`;
}

const VALID_TIERS = new Set(["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"]);

export function rankEmblemUrl(tier: string): string | null {
  const normalized = tier.toUpperCase();
  if (!VALID_TIERS.has(normalized)) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/ranked-mini-crests/${normalized.toLowerCase()}.png`;
}

// --- champion-pool.ts ---
// Honest "what you already play and how it's going" pool per role — built
// entirely from the player's own match history. Deliberately NOT a
// recommendation engine (see the web's own champion-pool.ts comment: that
// would need matchup/synergy winrate data Riot's API doesn't expose) —
// only ever real, already-played champions.
export interface ChampionPoolEntry {
  championName: string;
  games: number;
  wins: number;
}

export interface RolePool {
  position: (typeof KNOWN_POSITIONS)[number];
  champions: ChampionPoolEntry[];
  /** Ported from the web's champion-pool.ts — every game in this role, not
   * just the top MAX_PER_ROLE champions, so the UI can say "62% of your
   * Jungle games are on Kayn" instead of just re-listing champions. */
  totalGames: number;
}

const MAX_PER_ROLE = 3;

export function computeChampionPool(matches: RecentMatchSummary[]): RolePool[] {
  const pools: RolePool[] = [];
  for (const position of KNOWN_POSITIONS) {
    const inRole = matches.filter((m) => m.teamPosition === position);
    if (inRole.length === 0) continue;

    const byChampion = new Map<string, { games: number; wins: number }>();
    for (const match of inRole) {
      const entry = byChampion.get(match.championName) ?? { games: 0, wins: 0 };
      entry.games += 1;
      if (match.win) entry.wins += 1;
      byChampion.set(match.championName, entry);
    }

    const champions: ChampionPoolEntry[] = [...byChampion.entries()]
      .sort((a, b) => b[1].games - a[1].games)
      .slice(0, MAX_PER_ROLE)
      .map(([championName, stats]) => ({ championName, games: stats.games, wins: stats.wins }));

    pools.push({ position, champions, totalGames: inRole.length });
  }

  return pools.sort((a, b) => {
    const gamesA = a.champions.reduce((sum, c) => sum + c.games, 0);
    const gamesB = b.champions.reduce((sum, c) => sum + c.games, 0);
    return gamesB - gamesA;
  });
}

// --- champion-overview.ts ---
export interface ChampionOverviewStats {
  championName: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  minutes: number;
}

const MAX_OVERVIEW_ROWS = 6;

// `limit` defaults to the profile summary's top-6 (existing behavior,
// unchanged for that caller). The draft advisor passes `Infinity` instead —
// it needs the player's personal winrate for every champion they've
// recently played in a role, not just their top 6 overall, since a
// candidate outside the top 6 by games is exactly the kind of pick this
// feature should still recognize ("you've played this 4 times and won 3").
export function computeChampionOverview(matches: RecentMatchSummary[], limit = MAX_OVERVIEW_ROWS): ChampionOverviewStats[] {
  const byChampion = new Map<string, ChampionOverviewStats>();
  for (const match of matches) {
    const entry = byChampion.get(match.championName) ?? {
      championName: match.championName,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      minutes: 0,
    };
    entry.games += 1;
    if (match.win) entry.wins += 1;
    entry.kills += match.kills;
    entry.deaths += match.deaths;
    entry.assists += match.assists;
    entry.cs += match.cs;
    entry.minutes += match.durationSeconds / 60;
    byChampion.set(match.championName, entry);
  }
  return [...byChampion.values()].sort((a, b) => b.games - a.games).slice(0, limit);
}

// --- activity-calendar.ts ---
// Current-calendar-month view only, built from the same recentMatches the
// profile payload already carries — the web's month-navigation (browsing
// to past months) needs a fresh Riot Match-V5 range query the desktop app
// doesn't make; out of scope here (see PROGRESS.md).
export interface DayActivity {
  /** YYYY-MM-DD, local time */
  date: string;
  games: number;
  wins: number;
  losses: number;
}

function dateKey(epochMs: number): string {
  const d = new Date(epochMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Whole month, 1st through the last day — including days still to come, so
// the calendar doesn't read as broken on the 1st of a new month (just one
// cell in an otherwise-empty grid). The card renders those future days
// more translucent to tell them apart from real, already-played days,
// same distinction ActivityCalendarCard draws from each entry's own date
// against today's.
export function buildActivityGrid(matches: Pick<RecentMatchSummary, "playedAt" | "win">[]): DayActivity[] {
  const byDay = new Map<string, DayActivity>();
  for (const match of matches) {
    const key = dateKey(match.playedAt);
    const entry = byDay.get(key) ?? { date: key, games: 0, wins: 0, losses: 0 };
    entry.games += 1;
    if (match.win) entry.wins += 1;
    else entry.losses += 1;
    byDay.set(key, entry);
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  const grid: DayActivity[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d.getTime());
    grid.push(byDay.get(key) ?? { date: key, games: 0, wins: 0, losses: 0 });
  }
  return grid;
}

// Ported from the web app's src/lib/utils.ts::formatRelativeTime — same
// logic, same real locale passed in (from useI18n() here, not next-intl),
// since this is a plain client render with no server/client split to
// worry about, but the wrong-language-when-runtime-locale-differs concern
// that made an explicit locale mandatory on the web still applies.
export function formatRelativeTime(fromMs: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diffMs = fromMs - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");
  const diffMonths = Math.round(diffMs / (86_400_000 * 30));
  return rtf.format(diffMonths, "month");
}
