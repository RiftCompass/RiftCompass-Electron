import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Medal, Trophy } from "@phosphor-icons/react";
import { ChampionSplashAccent } from "../ChampionSplashAccent";
import { championSquareUrl, fetchChampionMap, fetchItemCatalog, fetchLatestVersion, fetchRuneStyles, itemIconUrl, type ChampionMaps, type ItemCatalog, type RuneStyle } from "../ddragon";
import { useI18n } from "../i18n";
import { ApiFailed, apiGet } from "../lib/api-fetch";
import { patchLabel } from "../lib/patch-label";
import { formatPercent, formatRelativeTime } from "../lib/profile-analysis";
import { API_BASE_URL, webUrl } from "../shared/api";
import { COLORS, FONT_HEADING, cardStyle, pillStyle, TYPE } from "../theme";
import { ESPORTS } from "../tool-meta";
import { indexRunes, RunePageView, type Translate } from "../tools/build-visuals";
import { LoadError } from "../tools/LoadError";
import { dedupePodiums, dragonKey, formatGameDuration, localizedCountryName, matchStateKey, pickHeadlineMatch, pickVods, roleKey, runePageFromPerks, yearIfNotCurrent } from "./format";
import { teamTagColors } from "./team-colors";
import type { EsportsEntry } from "./esports-navigation";
import type { GameDetail, GameSide, GameTeam, LeagueResponse, LeaguesResponse, MatchDetail, MatchSummary, MatchTeam, PlayerResponse, StageMatchRef, StageSection, TeamTotals } from "./types";

// The web's /esports section (esports.md), as one screen with four views:
// the covered leagues (the series to look at right now drawn big, then
// live, next seven days and latest results), a league (tournaments,
// stages, schedule and results), a series (game by game, the end state of
// every player: champion, KDA, gold, CS, kill and damage share, wards,
// final items, rune page) and a pro (career, podiums, latest games, most
// played champions). Everything from /api/v1/esports/*, which only reads
// the tables the crawler's sync fills; nothing here talks to LoL Esports
// or Leaguepedia. Runes are drawn with the same RunePageView Champion
// Builds uses; teams are codes in tinted tags, no logos, like the web.

type View = { kind: "leagues" } | { kind: "league"; slug: string; tournament?: string } | EsportsEntry;

// The web's gem tokens this screen borrows (globals.css): the game's two
// sides, the podium metals and the mono face the scores use.
const SIDE_COLOR: Record<GameSide, string> = { blue: "#4d7fe8", red: "#d6394a" };
const SILVER = "#9aa5b1";
const FONT_MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

// A 404 from /api/v1/esports/* is "the section has nothing here yet" (a
// series or a pro the sync has not written; the league route answers 200
// with empty lists), never a connection problem: the same sentence the
// web shows, not "check your connection".
function isNotReady(error: unknown): boolean {
  return error instanceof ApiFailed && error.status === 404;
}

function useApi<T>(url: string | null): { data: T | null; error: unknown; loading: boolean; retry: () => void } {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: unknown; loading: boolean }>({ url, data: null, error: null, loading: Boolean(url) });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setState({ url, data: null, error: null, loading: true });
    apiGet<T>(url).then(
      (data) => {
        if (!cancelled) setState({ url, data, error: null, loading: false });
      },
      (error: unknown) => {
        if (!cancelled) setState({ url, data: null, error, loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url, attempt]);
  return { data: state.url === url ? state.data : null, error: state.url === url ? state.error : null, loading: state.loading, retry: () => setAttempt((n) => n + 1) };
}

// Data Dragon catalogs the series view needs, fetched once per screen.
interface Catalogs {
  version: string;
  champions: ChampionMaps;
  runeStyles: RuneStyle[];
  items: ItemCatalog;
}

function useCatalogs(locale: string): Catalogs | null {
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const version = await fetchLatestVersion();
      const [champions, runeStyles, items] = await Promise.all([fetchChampionMap(), fetchRuneStyles(version, locale), fetchItemCatalog(version, locale)]);
      if (!cancelled) setCatalogs({ version, champions, runeStyles, items });
    })().catch(() => {
      // Without catalogs the scoreboard still shows names and numbers;
      // only icons and rune names are missing.
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);
  return catalogs;
}

export function EsportsView({ initialView }: { initialView?: EsportsEntry }) {
  const { t, locale } = useI18n();
  // Opened from another screen on a series or a pro (esports-navigation.tsx):
  // that view sits on top of the leagues, so "back" leads there.
  const [trail, setTrail] = useState<View[]>(initialView ? [{ kind: "leagues" }, initialView] : [{ kind: "leagues" }]);
  const view = trail[trail.length - 1];
  const open = useCallback((next: View) => setTrail((current) => [...current, next]), []);
  const back = useCallback(() => setTrail((current) => (current.length > 1 ? current.slice(0, -1) : current)), []);
  const catalogs = useCatalogs(locale);

  // The mouse's back button steps back inside the section, like the tools.
  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) back();
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [back]);

  return (
    // rc-stack: the container the narrow-width rules query (.rc-team-name,
    // global.css), because the window can be wide with the account panel
    // taking a third of it.
    <div className="rc-stack" style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative", zIndex: 0 }}>
      {trail.length > 1 ? (
        <button onClick={back} style={{ display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start", background: "none", border: "none", color: COLORS.muted, fontSize: TYPE.body, cursor: "pointer", padding: 0 }}>
          <ArrowLeft size={15} /> {t("Common.back")}
        </button>
      ) : null}
      {view.kind === "leagues" ? <LeaguesScreen open={open} t={t} locale={locale} /> : null}
      {view.kind === "league" ? <LeagueScreen key={`${view.slug}-${view.tournament ?? ""}`} slug={view.slug} tournament={view.tournament} open={open} replace={(next) => setTrail((current) => [...current.slice(0, -1), next])} t={t} locale={locale} /> : null}
      {view.kind === "match" ? <MatchScreen key={view.id} id={view.id} game={view.game} open={open} catalogs={catalogs} t={t} locale={locale} /> : null}
      {view.kind === "player" ? <PlayerScreen key={view.slug} slug={view.slug} open={open} catalogs={catalogs} t={t} locale={locale} /> : null}
    </div>
  );
}

// ---- shared pieces --------------------------------------------------------

// The tint is the team's own brand colour when team-colors.ts knows it
// and a hue derived from the code otherwise; the code is always the text.
function TeamTag({ code, name, size = "md", muted = false }: { code: string; name?: string; size?: "sm" | "md" | "lg"; muted?: boolean }) {
  const colors = muted ? null : teamTagColors(code);
  const font = size === "lg" ? TYPE.subheading : size === "sm" ? TYPE.label : TYPE.caption;
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: size === "lg" ? 56 : size === "sm" ? 40 : 48,
    padding: size === "lg" ? "4px 8px" : "2px 6px",
    borderRadius: 6,
    border: `1px solid ${colors ? colors.border : COLORS.cardBorder}`,
    background: colors ? colors.background : "none",
    color: colors ? colors.text : COLORS.muted,
    fontFamily: FONT_MONO,
    fontWeight: 600,
    fontSize: font,
    letterSpacing: 0.5,
    flexShrink: 0,
  };
  return (
    <span title={name && name !== code ? name : undefined} style={style}>
      {code}
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={{ fontFamily: FONT_HEADING, fontSize: TYPE.subheading, fontWeight: 400, margin: 0 }}>{children}</h2>;
}

function Muted({ children, size = TYPE.body }: { children: ReactNode; size?: number }) {
  return <p style={{ margin: 0, fontSize: size, color: COLORS.muted }}>{children}</p>;
}

// The pulsing dot next to "Live" (global.css, the web's LiveDot): the one
// animated thing on a schedule, only ever next to its label.
function LiveDot() {
  return <span className="rc-live-dot" aria-hidden="true" />;
}

function isLive(stateKey: string): boolean {
  return stateKey === "inProgress" || stateKey === "started";
}

function StateLine({ stateKey, label, size = TYPE.label }: { stateKey: string; label: string; size?: number }) {
  const live = isLive(stateKey);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: size, fontWeight: live ? 500 : 400, color: live ? COLORS.roseBright : stateKey === "completed" ? COLORS.muted : `${COLORS.text}b3` }}>
      {live ? <LiveDot /> : null}
      {label}
    </span>
  );
}

const OVERLINE: CSSProperties = { fontSize: TYPE.label, textTransform: "uppercase", letterSpacing: 0.6, color: COLORS.muted };

function dayKey(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", ...yearIfNotCurrent(iso) }).format(new Date(iso));
}

// `twoColumns`: the days flow in columns when the list has the whole width
// because nothing is coming up (round 41).
function MatchList({ matches, onOpen, emptyLabel, t, locale, showNames = false, twoColumns = false }: { matches: MatchSummary[]; onOpen: (id: string) => void; emptyLabel: string; t: Translate; locale: string; showNames?: boolean; twoColumns?: boolean }) {
  if (matches.length === 0) return <Muted>{emptyLabel}</Muted>;
  const days: { key: string; matches: MatchSummary[] }[] = [];
  for (const match of matches) {
    const key = dayKey(match.startTime, locale);
    const last = days[days.length - 1];
    if (last && last.key === key) last.matches.push(match);
    else days.push({ key, matches: [match] });
  }
  return (
    <div style={twoColumns ? { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "14px 28px", alignItems: "start" } : { display: "flex", flexDirection: "column", gap: 14 }}>
      {days.map((day) => (
        <section key={day.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h3 style={{ ...OVERLINE, margin: 0, fontWeight: 500 }}>{day.key}</h3>
          {day.matches.map((match) => (
            <MatchRow key={match.id} match={match} onOpen={onOpen} t={t} locale={locale} showNames={showNames} />
          ))}
        </section>
      ))}
    </div>
  );
}

function MatchRow({ match, onOpen, t, locale, showNames }: { match: MatchSummary; onOpen: (id: string) => void; t: Translate; locale: string; showNames: boolean }) {
  const played = match.state !== "unstarted";
  const stateKey = matchStateKey(match);
  const team1Won = played && match.team1.wins > match.team2.wins;
  const team2Won = played && match.team2.wins > match.team1.wins;
  // `hour: "numeric"`: "3:00 PM" in 12-hour locales, still "15:00" in the others.
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(match.startTime));
  const row: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "3.5rem minmax(0, 1fr) auto",
    alignItems: "center",
    gap: 10,
    padding: "7px 8px",
    margin: "0 -8px",
    width: "calc(100% + 16px)",
    borderTop: `1px solid ${COLORS.cardBorder}`,
    background: "none",
    border: "none",
    color: COLORS.text,
    textAlign: "left",
    cursor: played ? "pointer" : "default",
    borderRadius: 6,
    font: "inherit",
  };
  const content = (
    <>
      <span style={{ fontSize: TYPE.body, color: COLORS.muted, fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ display: "flex", flex: 1, justifyContent: "flex-end", alignItems: "center", gap: 8, minWidth: 0, color: team2Won ? COLORS.muted : COLORS.text }}>
          {showNames ? <span style={{ fontSize: TYPE.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.team1.name}</span> : null}
          <TeamTag code={match.team1.code || t("Esports.tbd")} name={match.team1.name} muted={!match.team1.code} />
        </span>
        <span style={{ width: 48, textAlign: "center", fontFamily: FONT_MONO, fontSize: TYPE.subheading, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {played ? (
            <>
              <span style={{ color: team1Won ? COLORS.text : COLORS.muted, fontWeight: team1Won ? 600 : 400 }}>{match.team1.wins}</span>
              <span style={{ color: COLORS.muted }}> : </span>
              <span style={{ color: team2Won ? COLORS.text : COLORS.muted, fontWeight: team2Won ? 600 : 400 }}>{match.team2.wins}</span>
            </>
          ) : (
            <span style={{ color: COLORS.muted, fontSize: TYPE.body }}>vs</span>
          )}
        </span>
        <span style={{ display: "flex", flex: 1, alignItems: "center", gap: 8, minWidth: 0, color: team1Won ? COLORS.muted : COLORS.text }}>
          <TeamTag code={match.team2.code || t("Esports.tbd")} name={match.team2.name} muted={!match.team2.code} />
          {showNames ? <span style={{ fontSize: TYPE.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{match.team2.name}</span> : null}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: TYPE.label, color: COLORS.muted, whiteSpace: "nowrap" }}>
        {match.blockName ? <span>{match.blockName}</span> : null}
        <span>{t("Esports.bestOf", { count: match.bestOf })}</span>
        <StateLine stateKey={stateKey} label={t(`Esports.states.${stateKey}`)} />
      </span>
    </>
  );
  return played ? (
    <button onClick={() => onOpen(match.id)} style={row}>
      {content}
    </button>
  ) : (
    <div style={row}>{content}</div>
  );
}

// The series a schedule leads with (pickHeadlineMatch, the web's
// FeaturedMatch): the two teams at header size around a big score, the
// round and kick-off above and the state below. The one box on these
// screens, because it is one button.
function FeaturedMatch({ match, onOpen, t, locale }: { match: MatchSummary; onOpen: (id: string) => void; t: Translate; locale: string }) {
  const played = match.state !== "unstarted";
  const stateKey = matchStateKey(match);
  const team1Won = played && match.team1.wins > match.team2.wins;
  const team2Won = played && match.team2.wins > match.team1.wins;
  const tbd = t("Esports.tbd");
  const side = (team: MatchTeam, lost: boolean, align: "end" | "start") => {
    const tag = <TeamTag code={team.code || tbd} name={team.name} size="lg" muted={!team.code} />;
    return (
      <span style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 12, justifyContent: align === "end" ? "flex-end" : "flex-start", color: lost ? COLORS.muted : COLORS.text }}>
        {align === "start" ? tag : null}
        <span className="rc-team-name" style={{ fontFamily: FONT_HEADING, fontSize: TYPE.heading - 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name || team.code || tbd}</span>
        {align === "end" ? tag : null}
      </span>
    );
  };
  const box: CSSProperties = {
    ...cardStyle({ borderRadius: 12, padding: 16 }),
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
    color: COLORS.text,
    textAlign: "left",
    font: "inherit",
    cursor: played ? "pointer" : "default",
  };
  const inner = (
    <>
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", ...OVERLINE }}>
        {match.blockName ? <span>{match.blockName}</span> : null}
        <span>{t("Esports.bestOf", { count: match.bestOf })}</span>
        <span style={{ textTransform: "none", letterSpacing: 0 }}>
          {new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", ...yearIfNotCurrent(match.startTime), hour: "numeric", minute: "2-digit" }).format(new Date(match.startTime))}
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {side(match.team1, team2Won, "end")}
        <span style={{ flexShrink: 0, fontFamily: FONT_HEADING, fontSize: TYPE.display + 2, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {played ? (
            <>
              <span style={{ color: team1Won ? COLORS.text : COLORS.muted }}>{match.team1.wins}</span>
              <span style={{ color: COLORS.muted }}> : </span>
              <span style={{ color: team2Won ? COLORS.text : COLORS.muted }}>{match.team2.wins}</span>
            </>
          ) : (
            <span style={{ color: COLORS.muted, fontSize: TYPE.heading }}>vs</span>
          )}
        </span>
        {side(match.team2, team1Won, "start")}
      </span>
      <StateLine stateKey={stateKey} label={t(`Esports.states.${stateKey}`)} size={TYPE.body} />
    </>
  );
  return played ? (
    <button onClick={() => onOpen(match.id)} style={box}>
      {inner}
    </button>
  ) : (
    <div style={box}>{inner}</div>
  );
}

function DataNote({ games, updatedAt, t, locale }: { games: number; updatedAt: string | null; t: Translate; locale: string }) {
  const updated = updatedAt ? formatRelativeTime(new Date(updatedAt).getTime(), locale) : null;
  return (
    <p style={{ margin: 0, fontSize: TYPE.label, color: COLORS.muted }}>
      {updated ? t("Esports.dataNote", { games, updated }) : t("Esports.dataNoteNoUpdate")} <Attribution t={t} />{" "}
      <button
        onClick={() => window.riftcompass.openExternal(webUrl(locale, "/methodology"))}
        style={{ background: "none", border: "none", color: COLORS.rose, fontSize: TYPE.label, cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        {t("DataQuality.howWeCount")}
      </button>
    </p>
  );
}

// The attribution sentence with its three names as links (CC BY-SA asks
// for the licence to be linked, not just named): the catalogs keep the
// plain sentence and the names are found in it, so a translation only has
// to keep them spelled the same.
const ATTRIBUTION_LINKS: { label: string; url: string }[] = [
  { label: "LoL Esports", url: "https://lolesports.com" },
  { label: "Leaguepedia", url: "https://lol.fandom.com" },
  { label: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" },
];

function Attribution({ t }: { t: Translate }) {
  const text = t("Esports.attribution");
  const parts: ReactNode[] = [];
  let rest = text;
  while (rest) {
    const next = ATTRIBUTION_LINKS.map((link) => ({ link, at: rest.indexOf(link.label) }))
      .filter((hit) => hit.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (!next) {
      parts.push(rest);
      break;
    }
    if (next.at > 0) parts.push(rest.slice(0, next.at));
    parts.push(
      <button
        key={`${next.link.label}-${parts.length}`}
        onClick={() => window.riftcompass.openExternal(next.link.url)}
        style={{ background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        {next.link.label}
      </button>,
    );
    rest = rest.slice(next.at + next.link.label.length);
  }
  return <>{parts}</>;
}

// ---- leagues --------------------------------------------------------------

function LeaguesScreen({ open, t, locale }: { open: (view: View) => void; t: Translate; locale: string }) {
  const { data, error, loading, retry } = useApi<LeaguesResponse>(`${API_BASE_URL}/api/v1/esports/leagues`);
  const openMatch = (id: string) => open({ kind: "match", id });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <ChampionSplashAccent championId="Azir" opacity={20} style={{ top: -40, right: -40, width: 520, height: 340, transform: "rotate(2deg)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: FONT_HEADING, fontSize: TYPE.heading, fontWeight: 400, margin: 0 }}>
          <Trophy size={24} weight="fill" color={ESPORTS.accent} aria-hidden="true" />
          {t("Esports.title")}
        </h1>
        <Muted>{t("Esports.intro")}</Muted>
        {data?.leagues.length ? <Muted size={TYPE.label}>{t("Esports.coverage", { leagues: data.leagues.map((league) => league.name).join(", ") })}</Muted> : null}
      </div>
      {error ? isNotReady(error) ? <Muted>{t("Esports.noData")}</Muted> : <LoadError onRetry={retry} error={error} /> : null}
      {loading ? <Muted>…</Muted> : null}
      {data && data.leagues.length === 0 ? <Muted>{t("Esports.noData")}</Muted> : null}
      {data?.leagues.map((league) => {
        const headline = pickHeadlineMatch(league.live, league.upcoming, league.recent);
        // A kick-off that has passed while the sync still says "unstarted"
        // belongs under "live" (the rows label it as started).
        const liveNow = league.live.length > 0 || league.upcoming.some((match) => matchStateKey(match) === "started");
        const ahead = [...league.live, ...league.upcoming];
        // Between splits there is nothing coming up: the sections stack and
        // the results take the width, their days in columns (round 41).
        const wide = ahead.length === 0;
        return (
          <section key={league.id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* The league as a band: name, region and the way into its full
                schedule on one underlined line. */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "6px 16px", paddingBottom: 10, borderBottom: `1px solid ${COLORS.cardBorder}` }}>
              <button onClick={() => open({ kind: "league", slug: league.slug })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "baseline", gap: 10, color: COLORS.text }}>
                <span style={{ fontFamily: FONT_HEADING, fontSize: TYPE.heading + 2 }}>{league.name}</span>
                <span style={OVERLINE}>{league.region}</span>
              </button>
              <button onClick={() => open({ kind: "league", slug: league.slug })} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: TYPE.body, color: COLORS.roseBright }}>
                {t("Esports.schedule")}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
            {headline ? <FeaturedMatch match={headline} onOpen={openMatch} t={t} locale={locale} /> : null}
            <div style={wide ? { display: "flex", flexDirection: "column", gap: 20 } : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_HEADING, fontSize: TYPE.subheading, fontWeight: 400, margin: 0 }}>
                  {liveNow ? <LiveDot /> : null}
                  {liveNow ? t("Esports.live") : t("Esports.upcoming")}
                </h2>
                <MatchList matches={ahead} onOpen={openMatch} emptyLabel={t("Esports.noUpcoming")} t={t} locale={locale} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <SectionTitle>{t("Esports.recent")}</SectionTitle>
                <MatchList matches={league.recent} onOpen={openMatch} emptyLabel={t("Esports.noRecent")} t={t} locale={locale} twoColumns={wide} />
              </div>
            </div>
          </section>
        );
      })}
      {data?.leagues.length ? <Muted size={TYPE.label}>{t("Esports.timeZoneNote")}</Muted> : null}
      {data ? <DataNote games={data.dataQuality.games} updatedAt={data.dataQuality.updatedAt} t={t} locale={locale} /> : null}
    </div>
  );
}

// ---- league ---------------------------------------------------------------

function LeagueScreen({ slug, tournament, open, replace, t, locale }: { slug: string; tournament?: string; open: (view: View) => void; replace: (view: View) => void; t: Translate; locale: string }) {
  const params = new URLSearchParams({ slug });
  if (tournament) params.set("tournament", tournament);
  const { data, error, loading, retry } = useApi<LeagueResponse>(`${API_BASE_URL}/api/v1/esports/league?${params}`);
  const stored = useMemo(() => new Set(data?.matches.map((match) => match.id) ?? []), [data]);
  const pending = data?.matches.filter((match) => match.state !== "completed") ?? [];
  const played = [...(data?.matches.filter((match) => match.state === "completed") ?? [])].reverse();
  const headline = data
    ? pickHeadlineMatch(
        data.matches.filter((match) => match.state === "inProgress"),
        data.matches.filter((match) => match.state === "unstarted"),
        played,
      )
    : null;
  const openMatch = (id: string) => open({ kind: "match", id });
  // Three honest empties, as the web: the tournament is over, it has not
  // started (LoL Esports publishes the schedule weeks late), or it is
  // running with a quiet week.
  const today = new Date().toISOString().slice(0, 10);
  const nothingPending =
    data?.tournament && data.tournament.endDate < today
      ? t("Esports.noPending")
      : data?.tournament && data.tournament.startDate > today
        ? t("Esports.noScheduleYet", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(data.tournament.startDate)) })
        : t("Esports.noUpcoming");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ChampionSplashAccent championId="Renekton" opacity={18} style={{ top: -40, right: -40, width: 520, height: 340, transform: "rotate(1deg)" }} />
      {error ? isNotReady(error) ? <Muted>{t("Esports.noData")}</Muted> : <LoadError onRetry={retry} error={error} /> : null}
      {loading ? <Muted>…</Muted> : null}
      {data ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h1 style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, fontFamily: FONT_HEADING, fontSize: TYPE.heading, fontWeight: 400, margin: 0 }}>
              {data.league.name}
              {data.league.region ? <span style={OVERLINE}>{data.league.region}</span> : null}
            </h1>
            {data.tournaments.length > 1 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {data.tournaments.map((candidate) => (
                  <button key={candidate.id} onClick={() => replace({ kind: "league", slug, tournament: candidate.slug })} style={pillStyle(candidate.id === data.tournament?.id, "compact")}>
                    {candidate.name}
                  </button>
                ))}
              </div>
            ) : data.tournament ? (
              <Muted>{data.tournament.name}</Muted>
            ) : null}
          </div>
          {/* Una liga cubierta sin torneo es el sincronizador bajando
              su atraso, que con una liga nueva dura dias (ronda 43). */}
          {!data.tournament ? <Muted>{t("Esports.leagueBackfilling", { league: data.league.name })}</Muted> : null}
          {headline ? <FeaturedMatch match={headline} onOpen={openMatch} t={t} locale={locale} /> : null}
          {data.stages.length ? (
            <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionTitle>{t("Esports.standings")}</SectionTitle>
              {data.stages.map((stage) => (
                <div key={stage.slug} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: TYPE.body, fontWeight: 600 }}>{stage.name}</h3>
                  {stage.structure.sections.map((section, index) => (
                    <StageSectionView key={index} section={section} stageName={stage.name} stored={stored} onOpenMatch={openMatch} t={t} />
                  ))}
                </div>
              ))}
            </section>
          ) : null}
          {data.tournament ? (
            // A finished tournament has nothing pending: the schedule shrinks
            // to its sentence and the results take the width (round 41).
            <div style={pending.length === 0 ? { display: "flex", flexDirection: "column", gap: 20 } : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
              <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <SectionTitle>{t("Esports.schedule")}</SectionTitle>
                <Muted size={TYPE.label}>{t("Esports.timeZoneNote")}</Muted>
                <MatchList matches={pending} onOpen={openMatch} emptyLabel={nothingPending} t={t} locale={locale} />
              </section>
              <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <SectionTitle>{t("Esports.results")}</SectionTitle>
                <MatchList matches={played} onOpen={openMatch} emptyLabel={t("Esports.noMatches")} t={t} locale={locale} twoColumns={pending.length === 0} />
              </section>
            </div>
          ) : null}
          <Muted size={TYPE.label}>
            <Attribution t={t} />
          </Muted>
        </>
      ) : null}
    </div>
  );
}

function StageSectionView({ section, stageName, stored, onOpenMatch, t }: { section: StageSection; stageName: string; stored: Set<string>; onOpenMatch: (id: string) => void; t: Translate }) {
  // A section named like the stage above it ("Playoffs" inside "Playoffs") is not repeated.
  const heading = section.name && section.name !== stageName ? <Muted size={TYPE.caption}>{section.name}</Muted> : null;
  if (section.type === "group") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {heading}
        <table style={{ borderCollapse: "collapse", maxWidth: 620, width: "100%", fontSize: TYPE.body }}>
          <thead>
            <tr style={{ ...OVERLINE, textAlign: "left" }}>
              <th style={{ padding: "4px 6px", fontWeight: 500, width: 28 }}>{t("Esports.rank")}</th>
              <th style={{ padding: "4px 6px", fontWeight: 500 }}>{t("Esports.team")}</th>
              {/* The record as a bar (wins over series played), so the
                  table reads top to bottom; the digits stay beside it. */}
              <th style={{ padding: "4px 6px", width: 110 }} aria-hidden="true" />
              <th style={{ padding: "4px 6px", fontWeight: 500, textAlign: "right", width: 40 }}>{t("Esports.wins")}</th>
              <th style={{ padding: "4px 6px", fontWeight: 500, textAlign: "right", width: 40 }}>{t("Esports.losses")}</th>
            </tr>
          </thead>
          <tbody>
            {section.rankings.map((row) => {
              const playedCount = row.wins + row.losses;
              return (
                <tr key={`${row.ordinal}-${row.team.code}`} style={{ borderTop: `1px solid ${COLORS.cardBorder}` }}>
                  <td style={{ padding: "6px", color: COLORS.muted, fontFamily: FONT_MONO, fontSize: TYPE.caption, fontVariantNumeric: "tabular-nums" }}>{row.ordinal}</td>
                  <td style={{ padding: "6px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <TeamTag code={row.team.code} name={row.team.name} size="sm" />
                      <span style={{ fontWeight: 500 }}>{row.team.name}</span>
                    </span>
                  </td>
                  <td style={{ padding: "6px 16px 6px 6px" }} aria-hidden="true">
                    {playedCount > 0 ? (
                      <span style={{ display: "block", height: 6, width: "100%", borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "clip" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.round((row.wins / playedCount) * 100)}%`, background: `${ESPORTS.accent}b3` }} />
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: "6px", textAlign: "right", fontFamily: FONT_MONO, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.wins}</td>
                  <td style={{ padding: "6px", textAlign: "right", fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", color: COLORS.muted }}>{row.losses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  // A bracket nobody has qualified for yet (Worlds before the play-ins) is
  // one sentence, not eighty "to be determined" boxes.
  const matches = section.columns.flatMap((column) => column.cells.flatMap((cell) => cell.matches));
  if (matches.length && matches.every((match) => match.teams.every((slot) => !slot.team))) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {heading}
        <Muted>{t("Esports.bracketPending", { count: matches.length })}</Muted>
      </div>
    );
  }
  // Five columns of 180 px with 14 px gaps fit the pane; 210/20 cut the finals column.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {heading}
      <div style={{ overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin" }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 14, minWidth: "max-content" }}>
          {section.columns.map((column, columnIndex) => (
            <div key={columnIndex} style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 18, width: 180 }}>
              {column.cells.map((cell) => (
                <div key={cell.slug || cell.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={OVERLINE}>{cell.name}</span>
                  {cell.matches.map((match) => (
                    <BracketMatch key={match.id} match={match} onOpen={stored.has(match.id) ? () => onOpenMatch(match.id) : null} t={t} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BracketMatch({ match, onOpen, t }: { match: StageMatchRef; onOpen: (() => void) | null; t: Translate }) {
  const decided = match.state === "completed";
  const box: CSSProperties = { ...cardStyle({ borderRadius: 8, padding: 0 }), display: "flex", flexDirection: "column", cursor: onOpen ? "pointer" : "default", textAlign: "left", width: "100%", font: "inherit", color: COLORS.text };
  const rows = match.teams.map((slot, index) => {
    const won = decided && slot.outcome === "win";
    return (
      <span key={index} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 8px", borderTop: index ? `1px solid ${COLORS.cardBorder}` : "none", color: won || !decided ? COLORS.text : COLORS.muted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {slot.team ? <TeamTag code={slot.team.code} name={slot.team.name} size="sm" /> : <TeamTag code={t("Esports.tbd")} size="sm" muted />}
          <span style={{ fontSize: TYPE.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slot.team?.name ?? ""}</span>
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: TYPE.body, fontVariantNumeric: "tabular-nums", fontWeight: won ? 600 : 400 }}>{match.state === "unstarted" ? "" : slot.gameWins}</span>
      </span>
    );
  });
  return onOpen ? (
    <button onClick={onOpen} style={box}>
      {rows}
    </button>
  ) : (
    <div style={box}>{rows}</div>
  );
}

// ---- match ----------------------------------------------------------------

function MatchScreen({ id, game: requestedNumber, open, catalogs, t, locale }: { id: string; game?: number; open: (view: View) => void; catalogs: Catalogs | null; t: Translate; locale: string }) {
  const { data, error, loading, retry } = useApi<MatchDetail>(`${API_BASE_URL}/api/v1/esports/match?id=${id}`);
  const [selected, setSelected] = useState<string | null>(null);
  const runeIndex = useMemo(() => (catalogs ? indexRunes(catalogs.runeStyles) : null), [catalogs]);
  if (error) return isNotReady(error) ? <Muted>{t("Esports.noData")}</Muted> : <LoadError onRetry={retry} error={error} />;
  if (loading || !data) return <Muted>…</Muted>;
  const { match, games } = data;
  // What the screen says where the games would be: by the series' state
  // read with the clock (a kick-off that has passed is "in progress" even
  // while the hourly sync still says "unstarted"; the label above uses the
  // same reading) and whether its games have been fetched. Same rule as the
  // web page.
  const stateKey = matchStateKey(match);
  const emptyKey = stateKey === "unstarted" ? "seriesUnstarted" : stateKey === "started" || stateKey === "inProgress" ? "seriesLive" : match.hasGames ? "gameNoStats" : "seriesPending";
  const game = games.find((candidate) => candidate.id === selected) ?? (requestedNumber ? games.find((candidate) => candidate.number === requestedNumber) : undefined) ?? games[0];
  const played = match.state !== "unstarted";
  const team1Won = played && match.team1.wins > match.team2.wins;
  const team2Won = played && match.team2.wins > match.team1.wins;
  // The series is decided once a side has more than half of the games.
  const decided = Math.max(match.team1.wins, match.team2.wins) > match.bestOf / 2;
  const winner = game?.winnerSide ? (game.winnerSide === "blue" ? game.blue : game.red) : null;
  const vods = game ? pickVods(game.vods, locale) : [];
  const championName = (champion: string) => catalogs?.champions.byInternalId[champion]?.name ?? champion;
  const trophy = <Trophy size={18} weight="fill" color={COLORS.gold} aria-hidden="true" style={{ flexShrink: 0 }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ChampionSplashAccent championId="Kassadin" opacity={16} style={{ top: -40, right: -40, width: 520, height: 340, transform: "rotate(2deg)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ ...OVERLINE, display: "flex", flexWrap: "wrap", gap: "2px 8px" }}>
          <span>{data.league.name}</span>
          {data.tournament ? <span>· {data.tournament.name}</span> : null}
          {match.blockName ? <span>· {match.blockName}</span> : null}
          <span>· {t("Esports.bestOf", { count: match.bestOf })}</span>
          <span style={{ textTransform: "none", letterSpacing: 0 }}>
            · {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...yearIfNotCurrent(match.startTime), hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(match.startTime))}
          </span>
        </span>
        {/* The scoreline as the screen's headline: codes, names and a big
            score, the loser dimmed and a trophy by the winner. */}
        <h1 style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 18px", fontFamily: FONT_HEADING, fontSize: TYPE.heading + 2, fontWeight: 400, margin: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, color: team2Won ? COLORS.muted : COLORS.text }}>
            <TeamTag code={match.team1.code || t("Esports.tbd")} name={match.team1.name} size="lg" muted={!match.team1.code} />
            <span className="rc-team-name">{match.team1.name}</span>
            {decided && team1Won ? trophy : null}
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: TYPE.display + 6, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {played ? (
              <>
                <span style={{ color: team1Won ? COLORS.text : COLORS.muted }}>{match.team1.wins}</span>
                <span style={{ color: COLORS.muted, padding: "0 8px" }}>:</span>
                <span style={{ color: team2Won ? COLORS.text : COLORS.muted }}>{match.team2.wins}</span>
              </>
            ) : (
              <span style={{ color: COLORS.muted, fontSize: TYPE.heading }}>vs</span>
            )}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 10, color: team1Won ? COLORS.muted : COLORS.text }}>
            {decided && team2Won ? trophy : null}
            <span className="rc-team-name">{match.team2.name}</span>
            <TeamTag code={match.team2.code || t("Esports.tbd")} name={match.team2.name} size="lg" muted={!match.team2.code} />
          </span>
        </h1>
        {/* In a narrow panel the title keeps codes and score; the names
            move down here, as the web's state line does on a phone. */}
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px", fontSize: TYPE.body, color: COLORS.muted }}>
          <span className="rc-team-names-inline">
            {match.team1.name} · {match.team2.name} ·
          </span>
          <StateLine stateKey={stateKey} label={t(`Esports.states.${stateKey}`)} size={TYPE.body} />
        </span>
      </div>

      {games.length === 0 ? <Muted>{t(`Esports.${emptyKey}`)}</Muted> : null}
      {game ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {games.map((candidate) => {
              const candidateWinner = candidate.winnerSide ? (candidate.winnerSide === "blue" ? candidate.blue : candidate.red) : null;
              return (
                <button key={candidate.id} onClick={() => setSelected(candidate.id)} style={{ ...pillStyle(candidate.id === game.id, "compact"), display: "flex", alignItems: "center", gap: 8 }}>
                  {t("Esports.gameNumber", { number: candidate.number })}
                  {candidateWinner ? <TeamTag code={candidateWinner.code} name={candidateWinner.name} size="sm" /> : null}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px", fontSize: TYPE.body, color: COLORS.muted }}>
            <span style={{ color: COLORS.text, fontWeight: 500 }}>{t("Esports.gameNumber", { number: game.number })}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {winner ? <Trophy size={14} weight="fill" color={COLORS.gold} aria-hidden="true" /> : null}
              {winner ? t("Esports.winner", { team: winner.name }) : t("Esports.winnerUnknown")}
            </span>
            {game.durationS ? (
              <span>
                {t("Esports.duration")}: {formatGameDuration(game.durationS)}
              </span>
            ) : null}
            {game.patch ? (
              <span>
                {t("Esports.patch")} {patchLabel(game.patch)}
              </span>
            ) : null}
            {vods.length ? (
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span>{t("Esports.vods")}:</span>
                {vods.map((vod) => (
                  <button key={`${vod.label}-${vod.locale}`} onClick={() => window.riftcompass.openExternal(vod.url)} style={{ background: "none", border: "none", padding: 0, minHeight: 24, color: COLORS.muted, textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
                    {vod.label} ({vod.tag})
                  </button>
                ))}
              </span>
            ) : null}
          </div>
          {game.blue.totals && game.red.totals ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 24 }}>
              {(["blue", "red"] as const).map((side) => (
                <TeamBoard key={side} game={game} side={side} catalogs={catalogs} runeIndex={runeIndex} championName={championName} open={open} t={t} locale={locale} />
              ))}
            </div>
          ) : (
            <Muted>{t("Esports.gameNoStats")}</Muted>
          )}
        </>
      ) : null}
      <Muted size={TYPE.label}>
        <Attribution t={t} />
      </Muted>
    </div>
  );
}

// Each side wears its colour along its left edge (the game's own blue and
// red) so the two boards read as two teams at a glance; the team line
// above its five players carries the tag, the name (with the trophy when
// it took the game), the side chip and the objectives as labelled figures.
function TeamBoard({ game, side, catalogs, runeIndex, championName, open, t, locale }: { game: GameDetail; side: GameSide; catalogs: Catalogs | null; runeIndex: ReturnType<typeof indexRunes> | null; championName: (id: string) => string; open: (view: View) => void; t: Translate; locale: string }) {
  const team: GameTeam = side === "blue" ? game.blue : game.red;
  const totals = team.totals as TeamTotals;
  const won = game.winnerSide === side;
  const sideColor = SIDE_COLOR[side];
  const figure = (label: string, value: string, mono = true) => (
    <span key={label} style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: TYPE.micro, textTransform: "uppercase", letterSpacing: 0.6, color: COLORS.muted }}>{label}</span>
      <span style={{ fontSize: TYPE.caption, fontFamily: mono ? FONT_MONO : undefined, fontVariantNumeric: "tabular-nums", color: COLORS.text }}>{value}</span>
    </span>
  );
  const stat = (label: string, value: string, strong = false) => (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 44 }}>
      <span style={{ fontSize: TYPE.micro, textTransform: "uppercase", letterSpacing: 0.6, color: COLORS.muted }}>{label}</span>
      <span style={{ fontSize: TYPE.caption, fontFamily: FONT_MONO, fontWeight: strong ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
  const dragons = totals.dragons.length
    ? totals.dragons
        .map((kind) => {
          const key = dragonKey(kind);
          return key ? t(`Esports.dragonKinds.${key}`) : kind;
        })
        .join(", ")
    : t("Esports.noDragons");
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, borderLeft: `2px solid ${sideColor}80`, paddingLeft: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
          <TeamTag code={team.code} name={team.name} size="lg" />
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_HEADING, fontSize: TYPE.subheading, color: won ? COLORS.text : COLORS.muted }}>
            {team.name}
            {won ? <Trophy size={15} weight="fill" color={COLORS.gold} aria-hidden="true" /> : null}
          </span>
          <span style={{ ...OVERLINE, padding: "2px 8px", borderRadius: 999, border: `1px solid ${sideColor}80`, background: `${sideColor}1a`, color: `${COLORS.text}e6`, fontWeight: 500 }}>{t(`Esports.sides.${side}`)}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "4px 16px" }}>
          {figure(t("Esports.gold"), new Intl.NumberFormat(locale).format(totals.gold))}
          {figure(t("Esports.kills"), String(totals.kills))}
          {figure(t("Esports.towers"), String(totals.towers))}
          {figure(t("Esports.inhibitors"), String(totals.inhibitors))}
          {figure(t("Esports.barons"), String(totals.barons))}
          {figure(t("Esports.dragons"), dragons, false)}
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {game.players
          .filter((player) => player.side === side)
          .map((player) => (
            <li key={player.participantId} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0", borderTop: `1px solid ${COLORS.cardBorder}` }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                {catalogs ? (
                  <img src={championSquareUrl(catalogs.version, player.champion)} alt={championName(player.champion)} title={t("Esports.skillOrder", { order: player.skillOrder.join(" ") })} loading="lazy" style={{ width: 40, height: 40, borderRadius: 6, border: `1px solid ${COLORS.cardBorder}` }} />
                ) : null}
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  {player.playerSlug ? (
                    <button onClick={() => open({ kind: "player", slug: player.playerSlug! })} style={{ background: "none", border: "none", padding: 0, textAlign: "left", color: COLORS.text, fontSize: TYPE.body, fontWeight: 500, cursor: "pointer", font: "inherit" }}>
                      {player.summonerName}
                    </button>
                  ) : (
                    <span style={{ fontSize: TYPE.body, fontWeight: 500 }}>{player.summonerName}</span>
                  )}
                  <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                    {championName(player.champion)} · {t(`Esports.roles.${roleKey(player.role)}`)} · {t("Esports.level")} {player.level}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  {stat(t("Esports.kda"), `${player.kills}/${player.deaths}/${player.assists}`, true)}
                  {stat(t("Esports.gold"), new Intl.NumberFormat(locale).format(player.gold))}
                  {stat(t("Esports.cs"), String(player.cs))}
                  {stat(t("Esports.killParticipation"), formatPercent(locale, player.killParticipation))}
                  {stat(t("Esports.damageShare"), formatPercent(locale, player.damageShare))}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 18px", paddingLeft: catalogs ? 52 : 0 }}>
                {catalogs ? (
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {player.items.map((item, index) => {
                      const info = catalogs.items.byId[String(item)];
                      return <img key={`${item}-${index}`} src={itemIconUrl(catalogs.version, item)} alt={info?.name ?? String(item)} title={info?.name} loading="lazy" style={{ width: 28, height: 28, borderRadius: 4, border: `1px solid ${COLORS.cardBorder}` }} />;
                    })}
                  </span>
                ) : null}
                {runeIndex ? <RunePageView runes={runePageFromPerks(player.runeStyle, player.runeSubStyle, player.perks)} index={runeIndex} t={t} /> : null}
                <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                  {t("Esports.wards")} {player.wardsPlaced}
                </span>
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}

// ---- player ---------------------------------------------------------------

// Medal colours by place: gold, silver and bronze. The place is always
// written next to the medal (relief rule), and the bronze only ever
// colours the icon, never small text.
const PLACE_ICON: Record<string, string> = { "1": COLORS.gold, "2": SILVER, "3": ESPORTS.accent, "3-4": ESPORTS.accent };
const PLACE_TEXT: Record<string, string> = { "1": COLORS.gold, "2": SILVER, "3": COLORS.muted, "3-4": COLORS.muted };

function PlayerScreen({ slug, open, catalogs, t, locale }: { slug: string; open: (view: View) => void; catalogs: Catalogs | null; t: Translate; locale: string }) {
  const { data, error, loading, retry } = useApi<PlayerResponse>(`${API_BASE_URL}/api/v1/esports/player?slug=${encodeURIComponent(slug)}`);
  if (error) return isNotReady(error) ? <Muted>{t("Esports.noData")}</Muted> : <LoadError onRetry={retry} error={error} />;
  if (loading || !data) return <Muted>…</Muted>;
  const { player, recentGames, champions } = data;
  const year = (date: string) => date.slice(0, 4);
  const podiums = dedupePodiums([...player.podiums]).sort((a, b) => (a.place === b.place ? b.date.localeCompare(a.date) : a.place.localeCompare(b.place)));
  const championName = (id: string) => catalogs?.champions.byInternalId[id]?.name ?? id;
  // Three different "nothing here": Leaguepedia not asked yet, asked and no
  // page matched, or a page matched with no entries for this list.
  const careerNote = player.leaguepediaId ? t("Esports.pro.careerEmpty") : player.fetchedAt ? t("Esports.pro.careerUnknown") : t("Esports.pro.careerPending");
  const podiumsNote = player.leaguepediaId ? t("Esports.pro.noPodiums") : player.fetchedAt ? t("Esports.pro.careerUnknown") : t("Esports.pro.careerPending");
  const career = [...player.career].reverse();
  const mostGames = champions[0]?.games ?? 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ChampionSplashAccent championId="Yone" opacity={16} style={{ top: -40, right: -40, width: 520, height: 340, transform: "rotate(2deg)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ fontFamily: FONT_HEADING, fontSize: TYPE.heading + 6, fontWeight: 400, margin: 0 }}>{player.alias}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", fontSize: TYPE.body, color: COLORS.muted }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {t("Esports.pro.team")}
            {player.teamCode ? <TeamTag code={player.teamCode} name={player.teamName ?? undefined} size="sm" /> : null}
            <span style={{ color: COLORS.text }}>{player.teamName ?? player.teamCode ?? t("Esports.pro.noTeam")}</span>
          </span>
          {player.role ? (
            <span>
              {t("Esports.pro.role")} <span style={{ color: COLORS.text }}>{t(`Esports.roles.${roleKey(player.role)}`)}</span>
            </span>
          ) : null}
          {player.country ? (
            <span>
              {t("Esports.pro.country")} <span style={{ color: COLORS.text }}>{localizedCountryName(player.country, locale)}</span>
            </span>
          ) : null}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle>{t("Esports.pro.career")}</SectionTitle>
            {career.length ? (
              // A timeline: one dot per stay on a vertical line, the current
              // team lit in rose at the top.
              <ol style={{ listStyle: "none", margin: 0, padding: "0 0 0 20px", position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
                <span aria-hidden="true" style={{ position: "absolute", left: 3, top: 8, bottom: 8, width: 1, background: COLORS.cardBorder }} />
                {career.map((entry, index) => {
                  const current = index === 0 && entry.to === null;
                  return (
                    <li key={`${entry.team}-${entry.from}`} style={{ position: "relative", display: "flex", gap: 12, fontSize: TYPE.body, color: current ? COLORS.text : COLORS.muted }}>
                      <span aria-hidden="true" style={{ position: "absolute", left: -20, top: 5, width: 7, height: 7, borderRadius: 999, background: current ? COLORS.roseBright : COLORS.cardBorder, boxShadow: current ? `0 0 0 2px ${COLORS.rose}4d` : undefined }} />
                      <span style={{ width: 96, flexShrink: 0, fontFamily: FONT_MONO, fontSize: TYPE.label, fontVariantNumeric: "tabular-nums" }}>
                        {year(entry.from)}
                        {entry.to ? (year(entry.to) !== year(entry.from) ? ` – ${year(entry.to)}` : "") : ` – ${t("Esports.pro.current")}`}
                      </span>
                      <span style={{ color: COLORS.text, fontWeight: current ? 500 : 400 }}>{entry.team}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Muted>{careerNote}</Muted>
            )}
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle>{t("Esports.pro.podiums")}</SectionTitle>
            {podiums.length ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {podiums.map((podium) => {
                  const Icon = podium.place === "1" ? Trophy : Medal;
                  return (
                    <li key={`${podium.event}-${podium.date}-${podium.team}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 12px", padding: "5px 0", borderTop: `1px solid ${COLORS.cardBorder}`, fontSize: TYPE.body }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: 120, flexShrink: 0, fontSize: TYPE.label, textTransform: "uppercase", letterSpacing: 0.6, color: PLACE_TEXT[podium.place] ?? COLORS.muted, fontWeight: podium.place === "1" ? 600 : 400 }}>
                        <Icon size={13} weight="fill" color={PLACE_ICON[podium.place] ?? COLORS.muted} aria-hidden="true" />
                        {t(`Esports.pro.place.${podium.place}`)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>{podium.event}</span>
                      <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                        {podium.team}
                        {podium.date ? ` · ${year(podium.date)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Muted>{podiumsNote}</Muted>
            )}
          </section>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle>{t("Esports.pro.recentGames")}</SectionTitle>
            {recentGames.length ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {recentGames.map((game) => (
                  <li key={game.gameId} style={{ borderTop: `1px solid ${COLORS.cardBorder}` }}>
                    <button onClick={() => open({ kind: "match", id: game.matchId })} style={{ display: "flex", alignItems: "center", gap: 10, width: "calc(100% + 16px)", margin: "0 -8px", padding: "7px 8px", borderRadius: 6, background: "none", border: "none", color: COLORS.text, textAlign: "left", cursor: "pointer", font: "inherit" }}>
                      {catalogs ? <img src={championSquareUrl(catalogs.version, game.champion)} alt="" loading="lazy" style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${COLORS.cardBorder}` }} /> : null}
                      <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: TYPE.body }}>
                          {championName(game.champion)} · <span style={{ fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums" }}>{game.kills}/{game.deaths}/{game.assists}</span>
                        </span>
                        <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>
                          {t("Esports.pro.vs", { team: game.opponentCode })} · {t("Esports.gameNumber", { number: game.number })}
                          {game.startedAt ? ` · ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...yearIfNotCurrent(game.startedAt) }).format(new Date(game.startedAt))}` : ""}
                        </span>
                      </span>
                      <span style={{ fontSize: TYPE.label, fontWeight: 500, color: game.won === null ? COLORS.muted : game.won ? COLORS.goodMild : COLORS.badMild }}>{game.won === null ? "" : game.won ? t("Esports.pro.won") : t("Esports.pro.lost")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Muted>{t("Esports.pro.noGames")}</Muted>
            )}
          </section>
          {champions.length ? (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SectionTitle>{t("Esports.pro.mostPlayed")}</SectionTitle>
              {/* A bar per champion, scaled to the most played one, so the
                  pool's shape is visible before the counts are read. */}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {champions.map((entry) => (
                  <li key={entry.champion} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: TYPE.body }}>
                    {catalogs ? <img src={championSquareUrl(catalogs.version, entry.champion)} alt="" loading="lazy" style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${COLORS.cardBorder}` }} /> : null}
                    <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 8px" }}>
                        <span>{championName(entry.champion)}</span>
                        <span style={{ fontSize: TYPE.label, color: COLORS.muted }}>{t("Esports.pro.gamesCount", { games: entry.games, wins: entry.wins })}</span>
                      </span>
                      <span aria-hidden="true" style={{ display: "block", height: 6, width: "100%", maxWidth: 260, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "clip" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${mostGames ? Math.round((entry.games / mostGames) * 100) : 0}%`, background: `${ESPORTS.accent}b3` }} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
      <Muted size={TYPE.label}>
        <Attribution t={t} />
      </Muted>
    </div>
  );
}
