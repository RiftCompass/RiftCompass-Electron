import { useI18n } from "../i18n";
import { COLORS, pillStyle, TYPE } from "../theme";
import { ApiRateLimited, ApiSessionExpired } from "../lib/api-fetch";

// A tool's data failing to arrive from riftcompass.com, with a way back
// that isn't reopening the tool. Shared by the tools whose whole board
// comes from one API call (Champion Builds, Meta Tier List, Matchups).
// Con `error` se distingue un 429 ("espera N segundos") de un fallo de red
// (PAR-4, ronda 20). `message` sustituye el texto de fallo de red cuando los
// datos no vienen de riftcompass.com (la Calculadora de oro los pide a Data
// Dragon, ronda 21).
export function LoadError({ onRetry, error, message: fallback }: { onRetry: () => void; error?: unknown; message?: string }) {
  const { t } = useI18n();
  const message =
    error instanceof ApiSessionExpired
      ? t("Common.sessionExpired")
      : error instanceof ApiRateLimited
        ? error.retryAfterSeconds
          ? t("Common.rateLimitedFor", { seconds: error.retryAfterSeconds })
          : t("Common.rateLimited")
        : (fallback ?? t("Common.networkError"));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <p style={{ fontSize: TYPE.body, color: COLORS.destructive, margin: 0 }}>{message}</p>
      <button onClick={onRetry} style={{ ...pillStyle(true, "compact"), cursor: "pointer" }}>
        {t("ProfileSearch.retryNow")}
      </button>
    </div>
  );
}
