import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../shared/api";
import { DraftAdvisor } from "./DraftAdvisor";
import { useI18n } from "../i18n";
import { COLORS, FONT_HEADING, cardStyle } from "../theme";
import { fetchChampionMap, type ChampionMaps } from "../ddragon";
import { rolesOf } from "../lib/champion-roles";
import type { LcuIdentity, RecommendedItemSet, SavedChampionBuild } from "../riftcompass";

// La ventana del acompañante de draft: aparece sola al entrar en champ select
// y se va al salir (electron/gameConnection.ts). Aquí viven las dos cosas que
// el jugador necesita mientras el reloj corre: a quién elegir, y qué build
// ponerse una vez elegido.
//
// Está aparte del overlay a propósito (ver createChampSelectWindow): champ
// select ocurre en el cliente y no en la partida, así que el overlay inyectado
// de Overwolf ni siquiera existe todavía; y aquí hay que poder pulsar, cosa que
// el overlay no permite por ser click-through.

interface JugadorSeleccion {
  cellId: number;
  championId: number;
  assignedPosition: string;
}

interface SesionSeleccion {
  localPlayerCellId: number;
  myTeam?: JugadorSeleccion[];
  theirTeam?: JugadorSeleccion[];
}

interface RunasRecomendadas {
  primaryStyleId: number;
  subStyleId: number;
  perk0: number;
  perk1: number;
  perk2: number;
  perk3: number;
  perk4: number;
  perk5: number;
  statPerk0: number;
  statPerk1: number;
  statPerk2: number;
  games: number;
}

interface HechizosRecomendados {
  spellLow: number;
  spellHigh: number;
  games: number;
}

interface EntradaOrdenObjetos {
  slot: number;
  itemId: number;
  games: number;
}

// Una opción de build que el jugador puede aplicar. Las fuentes (la recomendada
// y las suyas guardadas) se normalizan a esto para que aplicar sea un solo
// camino y no uno por fuente.
interface OpcionBuild {
  clave: string;
  etiqueta: string;
  /** De dónde sale, para decírselo al jugador en vez de que lo deduzca. */
  origen: "recomendada" | "guardada";
  /** Partidas que la respaldan. Ausente en las guardadas: son decisión suya, no una medición. */
  muestra?: number;
  perkIds: number[];
  primaryStyleId: number;
  subStyleId: number;
  spellLow: number;
  spellHigh: number;
  /** En orden de compra. Vacío cuando no se conoce, y entonces no se escribe item set. */
  itemIds: number[];
}

const tarjeta = cardStyle;
const SIN_CAMPEONES: ChampionMaps = { byId: {}, byInternalId: {}, byNormalizedName: {} };

function runasAPerkIds(r: RunasRecomendadas): number[] {
  return [r.perk0, r.perk1, r.perk2, r.perk3, r.perk4, r.perk5, r.statPerk0, r.statPerk1, r.statPerk2];
}

export function ChampSelectView() {
  const { t } = useI18n();
  const [identity, setIdentity] = useState<LcuIdentity | null>(null);
  const [sesion, setSesion] = useState<SesionSeleccion | null>(null);
  const [champions, setChampions] = useState<ChampionMaps>(SIN_CAMPEONES);
  const [recomendada, setRecomendada] = useState<{
    runes: RunasRecomendadas | null;
    spells: HechizosRecomendados | null;
    itemOrder: EntradaOrdenObjetos[];
  } | null>(null);
  const [guardadas, setGuardadas] = useState<SavedChampionBuild[]>([]);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [aplicada, setAplicada] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  // Si el auto-aplicado falla, NO se reintenta solo: se marca aquí y el jugador
  // decide con el botón. Sin esto el efecto volvería a dispararse en cuanto
  // `aplicando` vuelve a null y quedaría martilleando el cliente de League.
  const [autoIntentado, setAutoIntentado] = useState(false);

  useEffect(() => {
    window.riftcompass.onLcuIdentity(setIdentity);
    window.riftcompass.onChampSelectSession((s) => setSesion((s as SesionSeleccion | null) ?? null));
    // Esta ventana nace a mitad de partida, cuando la sesión de champ select ya
    // se emitió: suscribirse no basta, hay que pedir el estado que ya hay o la
    // ventana se queda en blanco hasta el siguiente cambio del draft.
    window.riftcompass
      .getChampSelectState()
      .then(({ session }) => {
        if (session) setSesion(session as SesionSeleccion);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (Object.keys(champions.byId).length > 0) return;
    fetchChampionMap()
      .then(setChampions)
      .catch(() => undefined);
  }, [champions]);

  useEffect(() => {
    window.riftcompass
      .getSavedChampionBuilds()
      .then(setGuardadas)
      .catch(() => undefined);
  }, []);

  const yo = sesion?.myTeam?.find((p) => p.cellId === sesion.localPlayerCellId);
  const campeonId = yo?.championId ?? 0;
  const campeon = campeonId ? champions.byId[campeonId] : undefined;
  // El cliente no siempre asigna posición: la Herramienta de Práctica, las
  // personalizadas a ciegas y ARAM la dejan vacía. Sin rol no se puede pedir
  // build, así que se cae al carril habitual del campeón, que la app ya conoce
  // (`champion-roles.ts`, el mismo dato que usa el consejero). Es mejor
  // recomendar la build de Ahri media que no recomendar nada; y cuando el
  // cliente SÍ dice el rol, manda el cliente.
  const rolAsignado = yo?.assignedPosition ? yo.assignedPosition.toUpperCase() : "";
  const rolHabitual = campeon ? (rolesOf(campeon.internalId)?.[0] ?? "") : "";
  const rol = rolAsignado || rolHabitual;
  const rolEsSupuesto = !rolAsignado && rol !== "";

  // La build recomendada se pide al elegir campeón, no antes: hasta entonces no
  // hay nada que pedir.
  useEffect(() => {
    if (!campeon || !rol) {
      setRecomendada(null);
      return;
    }
    const params = new URLSearchParams({ champion: campeon.internalId, role: rol });
    let cancelado = false;
    fetch(`${API_BASE_URL}/api/v1/champion-build?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelado) return;
        setRecomendada({ runes: d.runes ?? null, spells: d.spells ?? null, itemOrder: d.itemOrder ?? [] });
      })
      .catch(() => {
        if (!cancelado) setRecomendada(null);
      });
    return () => {
      cancelado = true;
    };
  }, [campeon, rol]);

  // Al cambiar de campeón se olvida lo aplicado: si no, el tick verde de la
  // build anterior se quedaría puesto sobre las opciones del campeón nuevo.
  useEffect(() => {
    setAplicada(null);
    setFallo(false);
    setAutoIntentado(false);
  }, [campeonId]);

  const opciones = useMemo<OpcionBuild[]>(() => {
    if (!campeon) return [];
    const lista: OpcionBuild[] = [];

    if (recomendada?.runes && recomendada.spells) {
      lista.push({
        clave: "recomendada",
        etiqueta: t("ChampSelect.recommended"),
        origen: "recomendada",
        // La del dato peor respaldado: es la que sostiene la build entera.
        muestra: Math.min(recomendada.runes.games, recomendada.spells.games),
        perkIds: runasAPerkIds(recomendada.runes),
        primaryStyleId: recomendada.runes.primaryStyleId,
        subStyleId: recomendada.runes.subStyleId,
        spellLow: recomendada.spells.spellLow,
        spellHigh: recomendada.spells.spellHigh,
        itemIds: recomendada.itemOrder.map((e) => e.itemId),
      });
    }

    // Solo las del campeón recién elegido, y solo las que traen runas y
    // hechizos: una guardada sin eso no se puede aplicar, y ofrecerla para que
    // falle al pulsarla es peor que no ofrecerla.
    for (const b of guardadas) {
      if (b.championName !== campeon.internalId) continue;
      if (!b.runes || !b.spells) continue;
      lista.push({
        clave: `guardada:${b.id}`,
        etiqueta: b.name,
        origen: "guardada",
        perkIds: [
          b.runes.perk0,
          b.runes.perk1,
          b.runes.perk2,
          b.runes.perk3,
          b.runes.perk4,
          b.runes.perk5,
          b.runes.statPerk0,
          b.runes.statPerk1,
          b.runes.statPerk2,
        ],
        primaryStyleId: b.runes.primaryStyleId,
        subStyleId: b.runes.subStyleId,
        spellLow: b.spells.spellLow,
        spellHigh: b.spells.spellHigh,
        itemIds: b.items.map((i) => Number(i)).filter((n) => Number.isFinite(n) && n > 0),
      });
    }

    return lista;
  }, [campeon, recomendada, guardadas, t]);

  async function aplicar(opcion: OpcionBuild) {
    if (!campeon || !campeonId) return;
    setAplicando(opcion.clave);
    setFallo(false);
    try {
      const itemSet: RecommendedItemSet | undefined =
        opcion.itemIds.length > 0
          ? {
              championId: campeonId,
              championName: campeon.internalId,
              role: rol,
              itemIds: opcion.itemIds,
              games: opcion.muestra ?? 0,
            }
          : undefined;
      const r = await window.riftcompass.applyRecommendedBuild(
        opcion.perkIds,
        opcion.primaryStyleId,
        opcion.subStyleId,
        opcion.spellLow,
        opcion.spellHigh,
        itemSet,
      );
      if (r.ok) setAplicada(opcion.clave);
      else setFallo(true);
    } catch {
      setFallo(true);
    } finally {
      setAplicando(null);
    }
  }

  // Auto-aplicar la recomendada en cuanto la hay, sin esperar un clic: es lo
  // que pidió Julio ("la app importará automáticamente la build con más
  // winrate") y lo que hace iTero. El overlay ya lo hacía, pero bajo
  // `ow-electron` el overlay no existe durante champ select (nace al inyectarse
  // en la partida), así que en la práctica no se aplicaba nada: probado en una
  // partida real el 2026-09-10, ni item set ni página de runas.
  //
  // `aplicando/aplicada` hacen de guarda: `aplicar` pone `aplicando` de forma
  // síncrona, así que esto no puede dispararse dos veces para el mismo pick, y
  // el efecto que limpia al cambiar de campeón lo re-arma para el siguiente.
  // Los botones siguen ahí para cambiar de build o reintentar.
  useEffect(() => {
    if (autoIntentado || aplicando !== null || aplicada !== null) return;
    const recomendadaLista = opciones.find((o) => o.origen === "recomendada");
    if (!recomendadaLista) return;
    setAutoIntentado(true);
    void aplicar(recomendadaLista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opciones, aplicando, aplicada, autoIntentado]);

  return (
    <div
      style={{
        height: "100vh",
        overflowY: "auto",
        background: COLORS.background,
        color: COLORS.text,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: FONT_HEADING, fontSize: 17 }}>{t("ChampSelect.title")}</span>
        {campeon ? (
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            {campeon.name}
            {rol ? ` · ${t(`Profile.positions.${rol.toLowerCase()}`)}` : ""}
            {rolEsSupuesto ? ` (${t("ChampSelect.roleGuessed")})` : ""}
          </span>
        ) : null}
      </div>

      <DraftAdvisor identity={identity} />

      <div style={{ ...tarjeta, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontFamily: FONT_HEADING, fontSize: 15 }}>{t("ChampSelect.buildTitle")}</span>

        {!campeon ? (
          <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>{t("ChampSelect.pickFirst")}</p>
        ) : opciones.length === 0 ? (
          <p style={{ color: COLORS.muted, fontSize: 13, margin: 0 }}>{t("ChampSelect.noBuilds")}</p>
        ) : (
          opciones.map((o) => (
            <button
              key={o.clave}
              onClick={() => aplicar(o)}
              disabled={aplicando !== null}
              style={{
                textAlign: "left",
                background: aplicada === o.clave ? "rgba(120,57,172,0.18)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${aplicada === o.clave ? COLORS.good : COLORS.cardBorder}`,
                borderRadius: 8,
                padding: "8px 10px",
                color: COLORS.text,
                cursor: aplicando ? "default" : "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 13 }}>{o.etiqueta}</span>
              <span style={{ fontSize: 11, color: COLORS.muted }}>
                {o.origen === "guardada"
                  ? t("ChampSelect.fromSaved")
                  : t("ChampSelect.fromSample", { games: String(o.muestra ?? 0) })}
                {o.itemIds.length > 0 ? ` · ${t("ChampSelect.withItems", { count: String(o.itemIds.length) })}` : ""}
                {aplicando === o.clave ? ` · ${t("ChampSelect.applying")}` : ""}
                {aplicada === o.clave ? ` · ${t("ChampSelect.applied")}` : ""}
              </span>
            </button>
          ))
        )}

        {fallo ? <span style={{ fontSize: 12, color: COLORS.destructive }}>{t("ChampSelect.applyFailed")}</span> : null}
      </div>
    </div>
  );
}
