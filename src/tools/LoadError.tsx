import { useI18n } from "../i18n";
import { COLORS, pillStyle } from "../theme";

// A tool's data failing to arrive from riftcompass.com, with a way back
// that isn't reopening the tool. Shared by the tools whose whole board
// comes from one API call (Champion Builds, Meta Tier List).
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <p style={{ fontSize: 13, color: COLORS.destructive, margin: 0 }}>{t("Common.networkError")}</p>
      <button onClick={onRetry} style={{ ...pillStyle(true, "compact"), cursor: "pointer" }}>
        {t("ProfileSearch.retryNow")}
      </button>
    </div>
  );
}
