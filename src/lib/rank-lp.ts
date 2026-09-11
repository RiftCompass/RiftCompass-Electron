// Small duplicate of the web app's src/lib/riot/rank-lp.ts — same real
// tier/rank/LP conversion, kept local since the renderer can't import
// across the repo boundary. Only what the saved-profiles panel needs:
// a display label, a sortable LP value, and the tier color.
const TIER_ORDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const RANK_LP_OFFSET: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };
const TIER_LP_WIDTH = 400;
const APEX_TIER_LP_WIDTH = 5000;

export function rankToLpValue(tier: string, rank: string, leaguePoints: number): number {
  const upperTier = tier.toUpperCase();
  const tierIndex = TIER_ORDER.indexOf(upperTier);
  if (tierIndex < 0) return leaguePoints;
  if (APEX_TIERS.has(upperTier)) {
    const masterIndex = TIER_ORDER.indexOf("MASTER");
    return masterIndex * TIER_LP_WIDTH + (tierIndex - masterIndex) * APEX_TIER_LP_WIDTH + leaguePoints;
  }
  return tierIndex * TIER_LP_WIDTH + (RANK_LP_OFFSET[rank.toUpperCase()] ?? 0) + leaguePoints;
}

export function formatTierRank(tier: string, rank: string): string {
  const label = tier.charAt(0) + tier.slice(1).toLowerCase();
  const apex = APEX_TIERS.has(tier.toUpperCase());
  return apex ? label : `${label} ${rank}`;
}

export const TIER_COLORS: Record<string, string> = {
  IRON: "#8a7d6f",
  BRONZE: "#b3702f",
  SILVER: "#9aa7b0",
  GOLD: "#d7a13b",
  PLATINUM: "#3fc1b0",
  EMERALD: "#2fae67",
  DIAMOND: "#5680e9",
  MASTER: "#b15cff",
  GRANDMASTER: "#ef4d5f",
  CHALLENGER: "#4dd8ff",
};

export function tierColor(tier: string): string {
  return TIER_COLORS[tier.toUpperCase()] ?? TIER_COLORS.GOLD;
}

// Máximo alcanzado en cada temporada clasificatoria — copia de la función
// homónima de la web (lib/riot/rank-lp.ts), sobre los mismos snapshots que
// /api/v1/profile ya manda en lpHistory/flexLpHistory. Riot no expone el
// rango de temporadas pasadas, así que solo existe desde la primera vez que
// alguien miró el perfil; el corte entre temporadas es el reinicio del
// contador de partidas (victorias + derrotas vuelven a cero con cada
// temporada/split). Los ecos rancios de Riot, que también van hacia atrás
// pero por pocas partidas, ya los quita el servidor antes de mandarlos.
export interface SeasonPeak {
  tier: string;
  rank: string;
  leaguePoints: number;
  /** Primer y último snapshot de esa temporada (desde cuándo la vemos). */
  from: Date;
  to: Date;
  games: number;
}

interface SeasonSnapshot {
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  capturedAt: string | Date;
}

export function computeSeasonPeaks(history: SeasonSnapshot[]): SeasonPeak[] {
  const seasons: SeasonSnapshot[][] = [];
  for (const snapshot of history) {
    const current = seasons[seasons.length - 1];
    const last = current?.[current.length - 1];
    if (!last || snapshot.wins + snapshot.losses < last.wins + last.losses) seasons.push([snapshot]);
    else current.push(snapshot);
  }
  return seasons
    .map((snapshots) => {
      const peak = snapshots.reduce((best, s) =>
        rankToLpValue(s.tier, s.rank, s.leaguePoints) > rankToLpValue(best.tier, best.rank, best.leaguePoints) ? s : best,
      );
      const last = snapshots[snapshots.length - 1];
      return {
        tier: peak.tier,
        rank: peak.rank,
        leaguePoints: peak.leaguePoints,
        from: new Date(snapshots[0].capturedAt),
        to: new Date(last.capturedAt),
        games: last.wins + last.losses,
      };
    })
    .reverse();
}

export const PLATFORM_LABELS: Record<string, string> = {
  euw1: "EUW",
  eun1: "EUNE",
  tr1: "TR",
  ru: "RU",
  me1: "ME",
  na1: "NA",
  br1: "BR",
  la1: "LAN",
  la2: "LAS",
  kr: "KR",
  jp1: "JP",
  oc1: "OCE",
  sg2: "SEA",
  tw2: "TW",
  vn2: "VN",
};
