import { useI18n } from "./i18n";
import { patchLabel } from "./lib/patch-label";
import { formatRelativeTime } from "./lib/profile-analysis";
import { webUrl } from "./shared/api";
import { COLORS, TYPE } from "./theme";

// The web's data-quality-note.tsx, here: how many tracked games sit behind
// what a tool shows, from which patches and when the crawler last wrote,
// with the link to the web's methodology page. `dataQuality` is the additive
// field the API started sending on 2026-09-12; older responses simply show
// nothing.
export interface DataQuality {
  /** Champion rows summed: ten per tracked game. */
  games: number;
  /** Tracked games (round 35, additive); servers before it only send `games`. */
  matches?: number;
  updatedAt: string | null;
}

export function DataQualityNote({ quality, patches }: { quality: DataQuality | undefined; patches: string[] }) {
  const { t, locale } = useI18n();
  if (!quality) return null;
  // Games, not champion rows: `games` counts each tracked game ten times
  // (one row per participant).
  const games = new Intl.NumberFormat(locale).format(quality.matches ?? Math.round(quality.games / 10));
  const patch = patchLabel(patches);
  const updated = quality.updatedAt ? formatRelativeTime(new Date(quality.updatedAt).getTime(), locale) : null;
  return (
    <p style={{ fontSize: TYPE.label, color: COLORS.muted, margin: 0 }}>
      {updated ? t("DataQuality.summary", { games, patch, updated }) : t("DataQuality.summaryNoUpdate", { games, patch })}{" "}
      <button
        onClick={() => window.riftcompass.openExternal(webUrl(locale, "/methodology"))}
        style={{ background: "none", border: "none", color: COLORS.rose, fontSize: TYPE.label, cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        {t("DataQuality.howWeCount")}
      </button>
    </p>
  );
}
