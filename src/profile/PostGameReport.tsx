// Dedicated "how did that game go" coaching screen, shown automatically
// from MainView.tsx right after a match ends — not just a jump to the
// profile screen. Reuses the same per-match diagnostic already computed for
// the profile's match history (diagnoseMatch in lib/profile-analysis.ts)
// but surfaces the full per-metric breakdown, you against this game's lane
// opponent, as a report instead of a single compact note.
import { useEffect, useState } from "react";
import { championSquareUrl } from "../ddragon";
import { useI18n } from "../i18n";
import { diagnoseMatch, FOCUS_RATIO, STRENGTH_RATIO } from "../lib/profile-analysis";
import { DiagnosticBar, formatDiagnosticPair } from "./ProfileDetail";
import type { RecentMatchSummary } from "../lib/profile-types";
import type { LcuIdentity } from "../riftcompass";
import { COLORS, TYPE, cardStyle as makeCardStyle } from "../theme";
import { fetchProfile, type ProfileTarget } from "./ProfileShared";

const cardStyle = makeCardStyle();

// gameCreation (what the web API reports as playedAt) is stamped around
// when the loading screen starts, which can land a few seconds BEFORE this
// app's own LcuPhase listener sees "InProgress" — a strict `>=` comparison
// against the captured start time would reject the very match we're
// waiting for. A 5-minute margin absorbs that gap while still reliably
// excluding any real previous match (at least one full game duration
// earlier).
const FRESHNESS_MARGIN_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 5000;

type Sentiment = "good" | "neutral" | "bad";

function ratioSentiment(ratio: number): Sentiment {
  if (ratio >= STRENGTH_RATIO) return "good";
  if (ratio <= FOCUS_RATIO) return "bad";
  return "neutral";
}

function sentimentColor(s: Sentiment): string {
  if (s === "good") return COLORS.goodMild;
  if (s === "bad") return COLORS.badMild;
  return COLORS.muted;
}

export function PostGameReport({
  identity,
  gameStartedAt,
  onOpenProfile,
}: {
  identity: LcuIdentity;
  gameStartedAt: number;
  onOpenProfile: (target: ProfileTarget) => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"loading" | "ready" | "timeout">("loading");
  const [match, setMatch] = useState<RecentMatchSummary | null>(null);
  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function poll() {
      attempt += 1;
      let data = await fetchProfile(identity.platform, identity.gameName, identity.tagLine, { force: attempt === 1 });
      if ("error" in data && data.retryAfterSeconds !== undefined) {
        // The force-refresh cooldown was already spent recently (e.g. the
        // player manually refreshed right before this game) — a plain
        // fetch still returns a reasonably fresh cache instead of failing
        // the whole report over a cooldown that isn't really an error.
        data = await fetchProfile(identity.platform, identity.gameName, identity.tagLine);
      }
      if (cancelled) return;

      if (!("error" in data)) {
        const top = data.profile.recentMatches[0];
        if (top && top.playedAt >= gameStartedAt - FRESHNESS_MARGIN_MS) {
          setMatch(top);
          setDdragonVersion(data.ddragonVersion);
          setStatus("ready");
          return;
        }
      }

      if (attempt >= MAX_ATTEMPTS) {
        setStatus("timeout");
        return;
      }
      setTimeout(poll, RETRY_DELAY_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [identity.platform, identity.gameName, identity.tagLine, gameStartedAt]);

  function openFullProfile() {
    onOpenProfile({ platform: identity.platform, gameName: identity.gameName, tagLine: identity.tagLine });
  }

  if (status === "loading") {
    return (
      <div style={cardStyle}>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: TYPE.body }}>{t("PostGameReport.loading")}</p>
      </div>
    );
  }

  if (status === "timeout" || !match) {
    return (
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: TYPE.body }}>{t("PostGameReport.timeout")}</p>
        <button
          onClick={openFullProfile}
          style={{
            alignSelf: "flex-start",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            background: `${COLORS.rose}26`,
            color: COLORS.rose,
          }}
        >
          {t("PostGameReport.openProfile")}
        </button>
      </div>
    );
  }

  const note = diagnoseMatch(match);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 14 }}>
        {ddragonVersion ? (
          <img
            src={championSquareUrl(ddragonVersion, match.championName)}
            alt={match.championName}
            style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          <span style={{ fontSize: TYPE.subheading, fontWeight: 700, color: match.win ? COLORS.goodMild : COLORS.badMild }}>
            {match.win ? t("PostGameReport.win") : t("PostGameReport.loss")}
          </span>
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            {match.kills}/{match.deaths}/{match.assists} · {Math.round(match.durationSeconds / 60)}m
          </span>
        </div>
        {note ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            <span style={{ fontSize: TYPE.heading, fontWeight: 700, color: sentimentColor(note.scoreSentiment) }}>{note.score.toFixed(1)}</span>
            <span style={{ fontSize: 11, color: COLORS.muted }}>{t("PostGameReport.scoreLabel")}</span>
          </div>
        ) : null}
      </div>

      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 12, color: COLORS.muted }}>{t("PostGameReport.breakdownTitle")}</span>
        {note ? (
          <>
            <p style={{ fontSize: 12, color: COLORS.muted, margin: "4px 0 0" }}>{t("PostGameReport.breakdownSubtitle")}</p>
            {note.nodes.map((node) => {
              const pair = formatDiagnosticPair(node);
              const color = sentimentColor(ratioSentiment(node.ratio));
              return (
                <div key={node.metric} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                    <span style={{ color: COLORS.text }}>{t(`Roadmap.${node.metric}.title`)}</span>
                    <span style={{ color: COLORS.muted }}>
                      <span style={{ color, fontWeight: 700 }}>
                        {t("Roadmap.youLabel")} {pair.value}
                      </span>
                      {" · "}
                      {t("PostGameReport.opponentLabel")} {pair.reference}
                    </span>
                  </div>
                  <DiagnosticBar node={node} />
                </div>
              );
            })}
          </>
        ) : (
          // ARAM, Arena and the like: no lane opponent to measure against,
          // and a made-up benchmark would be worse than saying so.
          <p style={{ fontSize: 12, color: COLORS.muted, margin: "4px 0 0" }}>{t("PostGameReport.noOpponent")}</p>
        )}
      </div>

      <button
        onClick={openFullProfile}
        style={{
          alignSelf: "flex-start",
          border: "none",
          borderRadius: 8,
          padding: "8px 14px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          background: `${COLORS.rose}26`,
          color: COLORS.rose,
        }}
      >
        {t("PostGameReport.openProfile")}
      </button>
    </div>
  );
}
