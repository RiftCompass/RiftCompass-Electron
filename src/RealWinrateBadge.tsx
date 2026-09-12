import { useI18n } from "./i18n";
import { COLORS } from "./theme";

// Real winrate from RiftCompass's own crawler (/api/v1/champion-winrates,
// the endpoint MetaTierList.tsx already uses). Only champion+role pairs
// with enough tracked games come back at all, so a missing badge means
// "no data yet", never a guess: same rule as the web's own badge.
export interface ChampionWinrate {
  championName: string;
  role: string;
  games: number;
  winRate: number;
}

export function RealWinrateBadge({
  winrate,
  label,
}: {
  winrate: ChampionWinrate | undefined;
  /** i18n namespace that owns `realWinrate` / `realWinrateTooltip`. */
  label: "PersonalityTest" | "ChampionPoolBuilder";
}) {
  const { t } = useI18n();
  if (!winrate) return null;
  return (
    <span
      style={{
        flexShrink: 0,
        borderRadius: 999,
        padding: "1px 5px",
        fontSize: 10,
        fontWeight: 400,
        color: COLORS.rose,
        background: `${COLORS.rose}1a`,
      }}
      title={t(`${label}.realWinrateTooltip`)}
    >
      {t(`${label}.realWinrate`, { rate: Math.round(winrate.winRate * 100), games: winrate.games })}
    </span>
  );
}
