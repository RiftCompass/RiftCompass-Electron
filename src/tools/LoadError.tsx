import { useI18n } from "../i18n";
import { COLORS, pillStyle } from "../theme";
import { ApiRateLimited } from "../lib/api-fetch";

// A tool's data failing to arrive from riftcompass.com, with a way back
// that isn't reopening the tool. Shared by the tools whose whole board
// comes from one API call (Champion Builds, Meta Tier List, Matchups).
// Con `error` se distingue un 429 ("espera N segundos") de un fallo de red
// (PAR-4, ronda 20).
export function LoadError({ onRetry, error }: { onRetry: () => void; error?: unknown }) {
  const { t } = useI18n();
  const message =
    error instanceof ApiRateLimited
      ? error.retryAfterSeconds
        ? t("Common.rateLimitedFor", { seconds: error.retryAfterSeconds })
        : t("Common.rateLimited")
      : t("Common.networkError");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <p style={{ fontSize: 13, color: COLORS.destructive, margin: 0 }}>{message}</p>
      <button onClick={onRetry} style={{ ...pillStyle(true, "compact"), cursor: "pointer" }}>
        {t("ProfileSearch.retryNow")}
      </button>
    </div>
  );
}
