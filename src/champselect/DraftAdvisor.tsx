// Draft Advisor: the "like iTero" pick recommendation,
// shown in the main app window during ChampSelect, not in the in-game
// overlay (OverlayView.tsx keeps its own simpler, non-matchup-aware
// suggestPicks panel untouched — see draft-help.ts). Ranks real candidates
// for the player's assigned role by a blend of the real 1v1 lane matchup
// winrate (once the enemy laner is known) and the player's own real
// winrate with that champion — see suggestMatchupPicks in draft-help.ts
// for the combination formula and its honesty guarantees.
import { useEffect, useMemo, useState } from "react";
import { fetchChampionMap, type ChampionMaps } from "../ddragon";
import { suggestMatchupPicks, type ChampionWinrateEntry, type LaneMatchupEntry, type MatchupSuggestion } from "../draft-help";
import type { ChampionMasteryEntry } from "../riftcompass";
import { computeChampionOverview, type ChampionOverviewStats } from "../lib/profile-analysis";
import { fetchProfile } from "../profile/ProfileShared";
import { API_BASE_URL } from "../shared/api";
import { COLORS, TYPE, cardStyle as makeCardStyle, pillStyle } from "../theme";
import { apiGet } from "../lib/api-fetch";
import { LoadError } from "../tools/LoadError";
import { useI18n } from "../i18n";
import type { LcuIdentity } from "../riftcompass";

interface ChampSelectPlayer {
  cellId: number;
  championId: number;
  assignedPosition: string;
  puuid?: string;
}

interface ChampSelectSession {
  localPlayerCellId: number;
  myTeam?: ChampSelectPlayer[];
  theirTeam?: ChampSelectPlayer[];
}

// Por debajo de esto el winrate personal se enseña como lo que es, poca
// muestra. Mismo umbral que el resto de la app para fiarse de un porcentaje.
const PERSONAL_SAMPLE_TRUSTED = 5;

const EMPTY_MAPS: ChampionMaps = { byId: {}, byInternalId: {}, byNormalizedName: {} };
const cardStyle = makeCardStyle();

function tierColor(tier: MatchupSuggestion["tier"]): string {
  if (tier === "good") return COLORS.goodMild;
  if (tier === "risky") return COLORS.badMild;
  return COLORS.muted;
}

// Posiciones tal y como las nombra el cliente en `assignedPosition`.
const POSICIONES = ["top", "jungle", "middle", "bottom", "utility"] as const;

interface DraftAdvisorProps {
  identity: LcuIdentity | null;
  // El cliente solo asigna posición en las colas con roles (draft normal,
  // clasificatoria). En la Herramienta de Práctica, las personalizadas a
  // ciegas y ARAM la deja vacía, y sin posición no hay nada que aconsejar: se
  // le pregunta al jugador. La decide quien nos monta porque la build de
  // ChampSelectView necesita la misma respuesta.
  posicionManual: string | null;
  onElegirPosicion: (posicion: string) => void;
}

export function DraftAdvisor({ identity, posicionManual, onElegirPosicion }: DraftAdvisorProps) {
  const { t, locale } = useI18n();
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const [phase, setPhase] = useState<string>("None");
  const [myTeam, setMyTeam] = useState<ChampSelectPlayer[]>([]);
  const [theirTeam, setTheirTeam] = useState<ChampSelectPlayer[]>([]);
  const [localCellId, setLocalCellId] = useState<number | null>(null);
  const [champions, setChampions] = useState<ChampionMaps>(EMPTY_MAPS);
  // null = not fetched for this champ select yet; [] = fetched, nothing
  // usable (empty or failed). The distinction matters: an effect keyed on
  // "list is empty" refetched in a tight loop whenever the API answered
  // with an empty list or an error, because each `set([])` is a new array.
  const [roleWinrates, setRoleWinrates] = useState<ChampionWinrateEntry[] | null>(null);
  const [matchups, setMatchups] = useState<LaneMatchupEntry[]>([]);
  const [personalOverview, setPersonalOverview] = useState<ChampionOverviewStats[]>([]);
  const [mastery, setMastery] = useState<ChampionMasteryEntry[]>([]);

  useEffect(() => {
    window.riftcompass.onPhase((p) => setPhase(p));
    window.riftcompass.onChampSelectSession((session) => {
      // Same "ignore the teardown event" guard as OverlayView.tsx — the LCU
      // sends one final session with no real myTeam right as champ select
      // ends, which would otherwise wipe the roster this component is
      // still reading from for a moment after the phase flips away.
      const s = session as ChampSelectSession | null;
      if (!s?.myTeam?.length) return;
      setMyTeam(s.myTeam);
      setTheirTeam(s.theirTeam ?? []);
      setLocalCellId(s.localPlayerCellId ?? null);
    });
  }, []);

  // Sin esto, un fallo de red y una descarga en curso se comunicaban los dos
  // con el mismo "aun no hay datos suficientes", que es una afirmacion sobre
  // la muestra del crawler, no sobre la red.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  // Same lazy champion-map fetch OverlayView.tsx uses — no point spending
  // the ~500KB champion.json fetch outside champ select.
  useEffect(() => {
    if (phase !== "ChampSelect" || Object.keys(champions.byId).length > 0) return;
    fetchChampionMap()
      .then(setChampions)
      .catch((err: unknown) => {
        // Offline or Data Dragon hiccup: say so instead of looking empty.
        setLoadError(err);
      });
  }, [phase, champions, attempt]);

  // One fetch per champ select: reset on leaving it, fetch once on entering.
  // Un 429 llega con su espera y un fallo ofrece reintento (ronda 25):
  // antes un fallo dejaba el consejero muerto para todo el champ select.
  useEffect(() => {
    if (phase !== "ChampSelect") {
      setRoleWinrates(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setRoleWinrates(null);
    setLoadError(null);
    apiGet<{ winrates?: ChampionWinrateEntry[] }>(`${API_BASE_URL}/api/v1/champion-winrates`)
      .then((data) => {
        if (!cancelled) setRoleWinrates(data.winrates ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRoleWinrates([]);
        setLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, attempt]);

  const localPlayer = myTeam.find((p) => p.cellId === localCellId);
  // Cuando el cliente asigna posición, manda el cliente.
  const posicionAsignada = localPlayer?.assignedPosition || "";
  const posicion = posicionAsignada || posicionManual || "";
  const enemyLaner = posicion ? theirTeam.find((p) => p.assignedPosition === posicion) : undefined;
  const enemyChampionName = enemyLaner?.championId ? champions.byId[enemyLaner.championId]?.internalId : undefined;
  const enemyChampion = enemyLaner?.championId ? champions.byId[enemyLaner.championId] : undefined;

  // Real matchup winrate, only once the enemy laner is actually known
  // (progressively resolves during the draft, same as the recommended
  // build's matchup awareness in OverlayView.tsx) — before that,
  // suggestMatchupPicks below falls back to the role-wide winrate for
  // every candidate on its own.
  useEffect(() => {
    if (phase !== "ChampSelect" || !posicion || !enemyChampionName) {
      setMatchups([]);
      return;
    }
    const params = new URLSearchParams({ role: posicion.toUpperCase(), enemy: enemyChampionName });
    let cancelled = false;
    apiGet<{ matchups?: LaneMatchupEntry[] }>(`${API_BASE_URL}/api/v1/champion-matchup?${params}`)
      .then((data) => {
        if (!cancelled) setMatchups(data.matchups ?? []);
      })
      .catch(() => {
        if (!cancelled) setMatchups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [phase, posicion, enemyChampionName, attempt]);

  // The player's own real winrate per champion, from their own recent
  // match history — Infinity instead of the profile summary's default
  // top-6 cap, since a candidate outside the player's top 6 by games is
  // exactly the kind of pick this should still recognize.
  useEffect(() => {
    if (phase !== "ChampSelect" || !identity) return;
    let cancelled = false;
    fetchProfile(identity.platform, identity.gameName, identity.tagLine).then((data) => {
      if (cancelled || "error" in data) return;
      setPersonalOverview(computeChampionOverview(data.profile.recentMatches, Infinity));
    });
    return () => {
      cancelled = true;
    };
  }, [phase, identity]);

  // Maestría del propio cliente de League: gratis, sin cuota de Riot y siempre
  // al día. Se pide una vez por champ select, no por pulsación: no cambia
  // durante un draft. Si el cliente no está, la lista viene vacía y la
  // recomendación sigue funcionando con las otras dos señales.
  useEffect(() => {
    if (phase !== "ChampSelect") return;
    let cancelled = false;
    window.riftcompass
      .getChampionMastery()
      .then((r) => {
        if (!cancelled) setMastery(r.mastery);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Mismo motivo que en ChampSelectView: el consejero también puede montarse
  // con el draft ya empezado, y sin esto se queda diciendo "solo disponible
  // durante la selección de campeón" estando dentro de ella.
  useEffect(() => {
    window.riftcompass
      .getChampSelectState()
      .then(({ phase: fase, session }) => {
        if (fase) setPhase(fase);
        const s = session as { myTeam?: ChampSelectPlayer[]; theirTeam?: ChampSelectPlayer[]; localPlayerCellId?: number } | null;
        if (s?.myTeam?.length) {
          setMyTeam(s.myTeam);
          setTheirTeam(s.theirTeam ?? []);
          if (typeof s.localPlayerCellId === "number") setLocalCellId(s.localPlayerCellId);
        }
      })
      .catch(() => undefined);
  }, []);

  // Con pocas partidas el porcentaje engaña ("100 %" con una sola): la
  // puntuación ya lo descuenta (smoothedRate en draft-help.ts), y el texto
  // tiene que decirlo igual de claro.
  function etiquetaPersonal(s: MatchupSuggestion): string {
    if (s.personalWinRate === undefined || s.personalGames === undefined) return t("DraftAdvisor.personalNone");
    const percent = Math.round(s.personalWinRate * 100);
    if (s.personalGames === 1) return t("DraftAdvisor.personalLabelOne", { percent });
    if (s.personalGames < PERSONAL_SAMPLE_TRUSTED) return t("DraftAdvisor.personalLabelFew", { percent, games: s.personalGames });
    return t("DraftAdvisor.personalLabel", { percent, games: s.personalGames });
  }

  const suggestions = useMemo(() => {
    if (!posicion || Object.keys(champions.byId).length === 0) return [];
    // Both teams, not just mine — a champion already locked by anyone
    // (either side) can't be picked again this game.
    const pickedIds = [...myTeam, ...theirTeam].filter((p) => p.championId).map((p) => p.championId);
    return suggestMatchupPicks(
      Object.values(champions.byId),
      pickedIds,
      posicion,
      matchups,
      roleWinrates ?? [],
      personalOverview,
      mastery,
    );
  }, [champions, myTeam, theirTeam, posicion, matchups, roleWinrates, personalOverview, mastery]);

  // "Vacío" solo es honesto cuando ya ha llegado todo lo necesario para
  // decidir: el mapa de campeones y los winrates del rol.
  const stillLoading = Object.keys(champions.byId).length === 0 || roleWinrates === null;

  if (phase !== "ChampSelect") {
    return <p style={{ color: COLORS.muted, fontSize: TYPE.body, margin: 0 }}>{t("DraftAdvisor.notInChampSelect")}</p>;
  }

  // Hasta que llega la primera sesión no se sabe si el cliente va a asignar
  // posición o no; solo entonces tiene sentido preguntar.
  if (!localPlayer) {
    return (
      <div style={cardStyle}>
        <p style={{ color: COLORS.muted, fontSize: TYPE.body, margin: 0 }}>{t("DraftAdvisor.waitingForRole")}</p>
      </div>
    );
  }

  const selectorDePosicion = posicionAsignada ? null : (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: TYPE.body, color: posicion ? COLORS.muted : COLORS.text }}>{t("DraftAdvisor.askRole")}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {POSICIONES.map((p) => {
          const activa = p === posicion;
          return (
            <button
              key={p}
              onClick={() => onElegirPosicion(p)}
              aria-pressed={activa}
              style={pillStyle(activa, "compact")}
            >
              {t(`Profile.positions.${p}`)}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!posicion) {
    return <div style={cardStyle}>{selectorDePosicion}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
        {selectorDePosicion}
        <span style={{ fontSize: 12, color: COLORS.muted }}>
          {t("DraftAdvisor.roleLabel", { role: t(`Profile.positions.${posicion.toLowerCase()}`) })}
        </span>
        <p style={{ margin: 0, fontSize: TYPE.body, color: COLORS.text }}>
          {enemyChampion ? t("DraftAdvisor.enemyKnown", { champion: enemyChampion.name }) : t("DraftAdvisor.enemyUnknown")}
        </p>
      </div>

      {suggestions.length === 0 ? (
        <div style={cardStyle}>
          {loadError ? (
            <LoadError error={loadError} onRetry={() => setAttempt((n) => n + 1)} />
          ) : (
            <p style={{ color: COLORS.muted, fontSize: TYPE.body, margin: 0 }}>
              {stillLoading ? t("DraftAdvisor.loading") : t("DraftAdvisor.empty")}
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestions.map((s) => (
            <div
              key={s.champion.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderRadius: 10,
                padding: "10px 12px",
                background: `${COLORS.card}99`,
                borderLeft: `3px solid ${tierColor(s.tier)}`,
              }}
            >
              <img src={s.champion.iconUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: TYPE.body, fontWeight: 700, color: COLORS.text }}>{s.champion.name}</span>
                <span style={{ fontSize: 11, color: COLORS.muted }}>
                  {s.matchupWinRate !== undefined && s.matchupGames !== undefined
                    ? t(s.matchupSpecific ? "DraftAdvisor.matchupLabel" : "DraftAdvisor.roleWideLabel", {
                        percent: Math.round(s.matchupWinRate * 100),
                        games: nf.format(s.matchupGames),
                      })
                    : t("DraftAdvisor.matchupNone")}
                </span>
                <span style={{ fontSize: 11, color: COLORS.muted }}>{etiquetaPersonal(s)}</span>
                {/* La maestría mueve el orden (masteryLogit): se enseña para
                    que se vea por qué (ronda 25); nada mientras el cliente
                    no haya contestado la lista. */}
                {mastery.length > 0 ? (
                  <span style={{ fontSize: 11, color: COLORS.muted }}>
                    {s.masteryPoints
                      ? t("DraftAdvisor.masteryLabel", { level: s.masteryLevel ?? 0, points: nf.format(s.masteryPoints) })
                      : t("DraftAdvisor.masteryNone")}
                  </span>
                ) : null}
              </div>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 999,
                  color: tierColor(s.tier),
                  background: `${tierColor(s.tier)}26`,
                }}
              >
                {t(`DraftAdvisor.tier.${s.tier}`)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
