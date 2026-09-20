// Payloads of /api/v1/esports/* as the web serves them (RiftCompass-Web,
// src/lib/esports/queries.ts). Kept as plain shapes here, not imported:
// the two repos are separate codebases and the API contract is additive.

export type MatchState = "unstarted" | "inProgress" | "completed";
export type GameSide = "blue" | "red";

export interface LeagueSummary {
  id: string;
  slug: string;
  name: string;
  region: string;
}

export interface TournamentSummary {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface MatchTeam {
  id: string | null;
  code: string;
  name: string;
  wins: number;
}

export interface MatchSummary {
  id: string;
  leagueId: string;
  tournamentId: string | null;
  blockName: string;
  startTime: string;
  state: MatchState;
  bestOf: number;
  team1: MatchTeam;
  team2: MatchTeam;
  hasGames: boolean;
}

export interface TeamRef {
  id: string | null;
  code: string;
  name: string;
}

export interface StageMatchRef {
  id: string;
  state: MatchState;
  teams: { team: TeamRef | null; gameWins: number; outcome: "win" | "loss" | null }[];
}

export type StageSection =
  | { name: string; type: "group"; rankings: { ordinal: number; team: TeamRef; wins: number; losses: number }[] }
  | { name: string; type: "bracket"; columns: { cells: { name: string; slug: string; matches: StageMatchRef[] }[] }[] };

export interface StageSummary {
  slug: string;
  name: string;
  position: number;
  structure: { sections: StageSection[] };
  fetchedAt: string;
}

export interface TeamTotals {
  gold: number;
  kills: number;
  towers: number;
  inhibitors: number;
  barons: number;
  dragons: string[];
}

export interface Vod {
  provider: string;
  parameter: string;
  locale: string;
  startMillis: number | null;
}

export interface GamePlayer {
  participantId: number;
  side: GameSide;
  role: string;
  esportsPlayerId: string | null;
  summonerName: string;
  champion: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  cs: number;
  killParticipation: number;
  damageShare: number;
  wardsPlaced: number;
  items: number[];
  runeStyle: number;
  runeSubStyle: number;
  perks: number[];
  skillOrder: string[];
  playerSlug: string | null;
}

export interface GameTeam {
  id: string | null;
  code: string;
  name: string;
  totals: TeamTotals | null;
}

export interface GameDetail {
  id: string;
  number: number;
  patch: string | null;
  durationS: number | null;
  startedAt: string | null;
  winnerSide: GameSide | null;
  blue: GameTeam;
  red: GameTeam;
  vods: Vod[];
  players: GamePlayer[];
}

export interface MatchDetail {
  match: MatchSummary;
  league: LeagueSummary;
  tournament: TournamentSummary | null;
  games: GameDetail[];
  fetchedAt: string;
}

export interface EsportsDataQuality {
  games: number;
  updatedAt: string | null;
}

export interface LeaguesResponse {
  leagues: (LeagueSummary & { live: MatchSummary[]; upcoming: MatchSummary[]; recent: MatchSummary[] })[];
  dataQuality: EsportsDataQuality;
}

export interface LeagueResponse {
  league: LeagueSummary;
  tournaments: TournamentSummary[];
  tournament: TournamentSummary | null;
  stages: StageSummary[];
  matches: MatchSummary[];
}

export interface ProPlayer {
  id: string;
  slug: string;
  alias: string;
  country: string | null;
  role: string | null;
  teamName: string | null;
  teamCode: string | null;
  career: { team: string; from: string; to: string | null }[];
  podiums: { event: string; place: string; date: string; team: string }[];
  leaguepediaId: string | null;
  fetchedAt: string | null;
}

export interface PlayerResponse {
  player: ProPlayer;
  recentGames: {
    gameId: string;
    matchId: string;
    number: number;
    startedAt: string | null;
    champion: string;
    kills: number;
    deaths: number;
    assists: number;
    won: boolean | null;
    opponentCode: string;
    leagueSlug: string;
  }[];
  champions: { champion: string; games: number; wins: number }[];
}

export interface CompetitiveBuild {
  champion: string;
  patches: string[];
  games: number;
  runes: { runeStyle: number; runeSubStyle: number; perks: number[]; games: number }[];
  items: { item: number; games: number }[];
  recent: { gameId: string; matchId: string; gameNumber?: number; startTime?: string; opponentCode?: string; summonerName: string; leagueSlug: string; won: boolean | null }[];
}
