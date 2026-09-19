import { useEffect, useState, type CSSProperties } from "react";
import { itemIconUrl, type ItemCatalog } from "../ddragon";
import { patchLabel } from "../lib/patch-label";
import { apiGet } from "../lib/api-fetch";
import { API_BASE_URL } from "../shared/api";
import { COLORS, FONT_HEADING, TYPE } from "../theme";
import { RunePageView, type RuneIndex, type Translate } from "../tools/build-visuals";
import { runePageFromPerks } from "./format";
import type { CompetitiveBuild } from "./types";

// "How the pros played it" (the web's competitive-build.tsx): the rune
// pages and final items that repeat most in stored competitive games of a
// champion on the latest competitive patches, from
// /api/v1/esports/champion-build. Counts, never win rates (esports.md).
// Renders nothing while loading, on error or without games: the block is
// an extra on Champion Builds, not something to show an error for.
export function CompetitiveBuildBlock({
  championId,
  version,
  runeIndex,
  catalog,
  t,
  style,
}: {
  championId: string;
  version: string;
  runeIndex: RuneIndex;
  catalog: ItemCatalog | null;
  t: Translate;
  /** The surrounding page's card style, applied only when there is something to show. */
  style?: CSSProperties;
}) {
  const [build, setBuild] = useState<CompetitiveBuild | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBuild(null);
    apiGet<CompetitiveBuild>(`${API_BASE_URL}/api/v1/esports/champion-build?champion=${encodeURIComponent(championId)}`)
      .then((data) => {
        if (!cancelled) setBuild(data);
      })
      .catch(() => {
        // Nothing to show: the section simply stays absent.
      });
    return () => {
      cancelled = true;
    };
  }, [championId]);
  if (!build || build.games === 0) return null;

  const subTitle = { fontSize: TYPE.label, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" as const, color: COLORS.muted, margin: 0 };
  return (
    <div style={{ ...style, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontFamily: FONT_HEADING, fontSize: TYPE.subheading, fontWeight: 400, margin: 0 }}>{t("Esports.competitive.title")}</h2>
        <p style={{ fontSize: TYPE.body, color: COLORS.muted, margin: 0 }}>{t("Esports.competitive.summary", { games: build.games, patches: patchLabel(build.patches) })}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <p style={subTitle}>{t("Esports.runes")}</p>
          {build.runes.map((page, index) => (
            <div key={index} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px" }}>
              <RunePageView runes={runePageFromPerks(page.runeStyle, page.runeSubStyle, page.perks)} index={runeIndex} t={t} />
              <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>{t("Esports.competitive.timesPlayed", { games: page.games })}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <p style={subTitle}>{t("Esports.competitive.finalItems")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {build.items.map((entry) => {
              const item = catalog?.byId[String(entry.item)];
              return (
                <span key={entry.item} title={item ? `${item.name}: ${t("Esports.competitive.inGames", { games: entry.games, total: build.games })}` : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <img src={itemIconUrl(version, entry.item)} alt={item?.name ?? String(entry.item)} style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${COLORS.cardBorder}` }} />
                  <span style={{ fontSize: TYPE.label, color: COLORS.muted, fontVariantNumeric: "tabular-nums" }}>
                    {entry.games}/{build.games}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={subTitle}>{t("Esports.competitive.recent")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: TYPE.body }}>
          {build.recent.map((game) => (
            <span key={game.gameId}>
              {game.summonerName}
              <span style={{ marginLeft: 4, fontSize: TYPE.label, color: game.won === null ? COLORS.muted : game.won ? COLORS.goodMild : COLORS.badMild }}>{game.won === null ? "" : game.won ? t("Esports.pro.won") : t("Esports.pro.lost")}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
