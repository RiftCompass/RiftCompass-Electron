import { useI18n } from "./i18n";
import { formatRelativeTime } from "./lib/profile-analysis";
import { API_BASE_URL } from "./shared/api";
import { COLORS } from "./theme";

// The web's data-quality-note.tsx, here: how many tracked games sit behind
// what a tool shows, from which patches and when the crawler last wrote,
// with the link to the web's methodology page. `dataQuality` is the additive
// field the API started sending on 2026-09-12; older responses simply show
// nothing.
export interface DataQuality {
  games: number;
  updatedAt: string | null;
}

export function DataQualityNote({ quality, patches }: { quality: DataQuality | undefined; patches: string[] }) {
  const { t, locale } = useI18n();
  if (!quality) return null;
  const games = new Intl.NumberFormat(locale).format(quality.games);
  const patch = patches.join(" + ");
  const updated = quality.updatedAt ? formatRelativeTime(new Date(quality.updatedAt).getTime(), locale) : null;
  return (
    <p style={{ fontSize: 11, color: COLORS.muted, margin: 0 }}>
      {updated ? t("DataQuality.summary", { games, patch, updated }) : t("DataQuality.summaryNoUpdate", { games, patch })}{" "}
      <button
        onClick={() => window.riftcompass.openExternal(`${API_BASE_URL}/methodology`)}
        style={{ background: "none", border: "none", color: COLORS.rose, fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        {t("DataQuality.howWeCount")}
      </button>
    </p>
  );
}
