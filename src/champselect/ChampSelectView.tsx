import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../shared/api";
import { DraftAdvisor } from "./DraftAdvisor";
import { useI18n } from "../i18n";
import { COLORS, FONT_HEADING, cardStyle } from "../theme";
import { fetchChampionMap, fetchLatestVersion, fetchRuneStyles, runeIconUrl, type ChampionMaps, type RuneStyle } from "../ddragon";
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

interface EntradaPlanObjetos {
  itemId: number;
  games: number;
}

// Una página de runas del tablero de /api/v1/champion-builds: las más
// jugadas, cada una con su muestra y sus victorias.
interface PaginaPopular extends Omit<RunasRecomendadas, "games"> {
  games: number;
  wins: number;
}

// Cuántas páginas distintas de la recomendada se ofrecen. Más de dos es
// una lista para leer, no un botón que pulsar con el reloj corriendo. Y con
// menos de cinco partidas una página no es una alternativa, es una anécdota
// (salían dos con "2 partidas · 100 %" y "2 partidas · 0 %").
const MAX_ALTERNATIVAS = 2;
const MIN_PARTIDAS_ALTERNATIVA = 5;

// Una opción de build que el jugador puede aplicar. Las fuentes (la recomendada
// y las suyas guardadas) se normalizan a esto para que aplicar sea un solo
// camino y no uno por fuente.
interface OpcionBuild {
  clave: string;
  etiqueta: string;
  /** De dónde sale, para decírselo al jugador en vez de que lo deduzca. */
  origen: "recomendada" | "alternativa" | "guardada";
  /** Partidas que la respaldan. Ausente en las guardadas: son decisión suya, no una medición. */
  muestra?: number;
  /** Solo las alternativas: victorias sobre `muestra`, para decir el winrate. */
  victorias?: number;
  /** Icono de la runa clave, para distinguir las alternativas de un vistazo. */
  icono?: string;
  perkIds: number[];
  primaryStyleId: number;
  subStyleId: number;
  spellLow: number;
  spellHigh: number;
  /** La compra de salida. Vacía en las guardadas: solo guardan la build. */
  startingItemIds: number[];
  /** En orden de compra. Vacío cuando no se conoce, y entonces no se escribe item set. */
  itemIds: number[];
  /** Alternativas frecuentes. Vacía en las guardadas. */
  situationalItemIds: number[];
  /** Título del set en la tienda: la recomendada lleva el nombre de la app, una guardada el suyo. */
  tituloSet: string;
}

const tarjeta = cardStyle;
const SIN_CAMPEONES: ChampionMaps = { byId: {}, byInternalId: {}, byNormalizedName: {} };

function runasAPerkIds(r: RunasRecomendadas): number[] {
  return [r.perk0, r.perk1, r.perk2, r.perk3, r.perk4, r.perk5, r.statPerk0, r.statPerk1, r.statPerk2];
}

export function ChampSelectView() {
  const { t, locale } = useI18n();
  const [identity, setIdentity] = useState<LcuIdentity | null>(null);
  const [sesion, setSesion] = useState<SesionSeleccion | null>(null);
  const [champions, setChampions] = useState<ChampionMaps>(SIN_CAMPEONES);
  const [recomendada, setRecomendada] = useState<{
    runes: RunasRecomendadas | null;
    spells: HechizosRecomendados | null;
    startingItems: EntradaPlanObjetos[];
    itemOrder: EntradaOrdenObjetos[];
    situationalItems: EntradaPlanObjetos[];
  } | null>(null);
  const [guardadas, setGuardadas] = useState<SavedChampionBuild[]>([]);
  // "Las otras de más winrate" que pidió el propietario: las páginas de runas
  // más jugadas del tablero, con los mismos hechizos y objetos que la
  // recomendada. El tablero no da builds enteras (runas, hechizos y objetos
  // van por separado), y lo que de verdad cambia entre builds es la página.
  const [paginasPopulares, setPaginasPopulares] = useState<PaginaPopular[]>([]);
  const [estilosRunas, setEstilosRunas] = useState<RuneStyle[]>([]);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [aplicada, setAplicada] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  // Rango real del jugador, del cliente. Sin él la API cae a Challenger, que es
  // el primero de su lista, y le recomienda a todo el mundo lo que construyen
  // los mejores del servidor. Peor aún: el orden de compra ni siquiera tiene
  // datos en Challenger todavía, así que sin esto no hay item set que dar.
  const [rangoJugador, setRangoJugador] = useState<string | null>(null);
  // La posición que el jugador dice que va a jugar cuando el cliente no
  // asigna ninguna (la pregunta DraftAdvisor). Vive aquí porque decide
  // también qué build se pide.
  const [posicionManual, setPosicionManual] = useState<string | null>(null);
  // Si el auto-aplicado falla, NO se reintenta solo: se marca aquí y el jugador
  // decide con el botón. Sin esto el efecto volvería a dispararse en cuanto
  // `aplicando` vuelve a null y quedaría martilleando el cliente de League.
  const [autoIntentado, setAutoIntentado] = useState(false);
  // El ajuste "Build recomendada" de la app: null hasta leerlo, y hasta
  // entonces no se aplica nada solo. Es el mismo ajuste que ya gobernaba el
  // auto-aplicado del overlay, que se quitó de allí para que no hubiera dos
  // ventanas aplicando a la vez.
  const [autoAplicar, setAutoAplicar] = useState<boolean | null>(null);

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
    fetchLatestVersion()
      .then((version) => fetchRuneStyles(version, locale))
      .then(setEstilosRunas)
      .catch(() => undefined);
  }, [locale]);

  useEffect(() => {
    window.riftcompass
      .getSettings()
      .then((s) => setAutoAplicar(s.overlayModules.autoBuild))
      .catch(() => setAutoAplicar(false));
    window.riftcompass
      .getSavedChampionBuilds()
      .then(setGuardadas)
      .catch(() => undefined);
    window.riftcompass
      .lcuGet<{ queueMap?: Record<string, { tier?: string }> }>("/lol-ranked-stats/v1/current-ranked-stats")
      .then((stats) => {
        const tier = stats.queueMap?.RANKED_SOLO_5x5?.tier;
        // Sin clasificar no se manda nada: es mejor que la web decida su
        // criterio a mandarle un rango inventado.
        if (tier) setRangoJugador(tier.toUpperCase());
      })
      .catch(() => undefined);
  }, []);

  const yo = sesion?.myTeam?.find((p) => p.cellId === sesion.localPlayerCellId);
  const campeonId = yo?.championId ?? 0;
  const campeon = campeonId ? champions.byId[campeonId] : undefined;
  // El cliente no siempre asigna posición: la Herramienta de Práctica, las
  // personalizadas a ciegas y ARAM la dejan vacía. Entonces vale la que el
  // jugador haya elegido en el consejero y, si tampoco la ha dicho, el carril
  // habitual del campeón, que la app ya conoce (`champion-roles.ts`, el mismo
  // dato que usa el consejero). Es mejor recomendar la build de Ahri media que
  // no recomendar nada; y cuando el cliente SÍ dice el rol, manda el cliente.
  const rolAsignado = yo?.assignedPosition ? yo.assignedPosition.toUpperCase() : "";
  const rolElegido = posicionManual ? posicionManual.toUpperCase() : "";
  const rolHabitual = campeon ? (rolesOf(campeon.internalId)?.[0] ?? "") : "";
  const rol = rolAsignado || rolElegido || rolHabitual;
  const rolEsSupuesto = !rolAsignado && !rolElegido && rol !== "";

  // La build recomendada se pide al elegir campeón, no antes: hasta entonces no
  // hay nada que pedir.
  useEffect(() => {
    if (!campeon || !rol) {
      setRecomendada(null);
      return;
    }
    const params = new URLSearchParams({ champion: campeon.internalId, role: rol });
    if (rangoJugador) params.set("rank", rangoJugador);
    let cancelado = false;
    fetch(`${API_BASE_URL}/api/v1/champion-build?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelado) return;
        setRecomendada({
          runes: d.runes ?? null,
          spells: d.spells ?? null,
          startingItems: d.startingItems ?? [],
          itemOrder: d.itemOrder ?? [],
          situationalItems: d.situationalItems ?? [],
        });
      })
      .catch(() => {
        if (!cancelado) setRecomendada(null);
      });
    return () => {
      cancelado = true;
    };
  }, [campeon, rol, rangoJugador]);

  useEffect(() => {
    if (!campeon || !rol) {
      setPaginasPopulares([]);
      return;
    }
    const params = new URLSearchParams({ champion: campeon.internalId, role: rol });
    if (rangoJugador) params.set("rank", rangoJugador);
    let cancelado = false;
    fetch(`${API_BASE_URL}/api/v1/champion-builds?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!cancelado) setPaginasPopulares(d.runePages ?? []);
      })
      .catch(() => {
        if (!cancelado) setPaginasPopulares([]);
      });
    return () => {
      cancelado = true;
    };
  }, [campeon, rol, rangoJugador]);

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
        startingItemIds: recomendada.startingItems.map((e) => e.itemId),
        itemIds: recomendada.itemOrder.map((e) => e.itemId),
        situationalItemIds: recomendada.situationalItems.map((e) => e.itemId),
        tituloSet: `RiftCompass · ${campeon.name} ${t(`Profile.positions.${rol.toLowerCase()}`)}`,
      });
    }

    // Alternativas: páginas populares que un jugador distinguiría de la
    // recomendada y entre sí, es decir, con otra runa clave u otro árbol
    // secundario (dos páginas que solo cambian una runa menor son la misma
    // build para quien elige con el reloj corriendo), con los hechizos y
    // objetos de la recomendada. Se nombran por eso mismo ("Ritmo Letal +
    // Inspiración").
    if (recomendada?.runes && recomendada.spells) {
      const familia = (p: { perk0: number; subStyleId: number }) => `${p.perk0}:${p.subStyleId}`;
      const familiasVistas = new Set([familia(recomendada.runes)]);
      const nombreRuna = (id: number) => estilosRunas.flatMap((s) => s.slots.flat()).find((r) => r.id === id);
      const nombreEstilo = (id: number) => estilosRunas.find((s) => s.id === id)?.name;
      for (const pagina of paginasPopulares) {
        if (pagina.games < MIN_PARTIDAS_ALTERNATIVA || familiasVistas.has(familia(pagina))) continue;
        if (lista.filter((o) => o.origen === "alternativa").length >= MAX_ALTERNATIVAS) break;
        familiasVistas.add(familia(pagina));
        const perkIds = runasAPerkIds({ ...pagina, games: pagina.games });
        const clave = nombreRuna(pagina.perk0);
        const secundario = nombreEstilo(pagina.subStyleId);
        lista.push({
          clave: `alternativa:${perkIds.join("-")}`,
          etiqueta: t("ChampSelect.alternative", {
            runes: [clave?.name ?? String(pagina.perk0), secundario].filter(Boolean).join(" + "),
          }),
          origen: "alternativa",
          muestra: pagina.games,
          victorias: pagina.wins,
          icono: clave ? runeIconUrl(clave.icon) : undefined,
          perkIds,
          primaryStyleId: pagina.primaryStyleId,
          subStyleId: pagina.subStyleId,
          spellLow: recomendada.spells.spellLow,
          spellHigh: recomendada.spells.spellHigh,
          itemIds: recomendada.itemOrder.map((e) => e.itemId),
          startingItemIds: recomendada.startingItems.map((e) => e.itemId),
          situationalItemIds: recomendada.situationalItems.map((e) => e.itemId),
          tituloSet: `RiftCompass · ${campeon.name} ${t(`Profile.positions.${rol.toLowerCase()}`)}`,
        });
      }
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
        startingItemIds: [],
        itemIds: b.items.map((i) => Number(i)).filter((n) => Number.isFinite(n) && n > 0),
        situationalItemIds: [],
        tituloSet: b.name,
      });
    }

    return lista;
  }, [campeon, rol, recomendada, paginasPopulares, estilosRunas, guardadas, t]);

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
              startingItemIds: opcion.startingItemIds,
              itemIds: opcion.itemIds,
              situationalItemIds: opcion.situationalItemIds,
              titulo: opcion.tituloSet,
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

  // Auto-aplicar la recomendada en cuanto la hay, sin esperar un clic, como
  // hace iTero. Esta ventana es la única que lo hace: el overlay también lo
  // hacía y, cuando los dos coincidían (bajo el motor de Overwolf el overlay
  // puede seguir vivo de una partida anterior), se pisaban la página de runas.
  //
  // `aplicando/aplicada` hacen de guarda: `aplicar` pone `aplicando` de forma
  // síncrona, así que esto no puede dispararse dos veces para el mismo pick, y
  // el efecto que limpia al cambiar de campeón lo re-arma para el siguiente.
  // Los botones siguen ahí para cambiar de build o reintentar.
  useEffect(() => {
    if (!autoAplicar || autoIntentado || aplicando !== null || aplicada !== null) return;
    const recomendadaLista = opciones.find((o) => o.origen === "recomendada");
    if (!recomendadaLista) return;
    setAutoIntentado(true);
    void aplicar(recomendadaLista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opciones, aplicando, aplicada, autoIntentado, autoAplicar]);

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

      {/* Mientras se elige, lo importante es el consejo; con el campeón ya
          fijado, la build. Con las sugerencias desplegadas la lista de builds
          quedaba por debajo del borde y había que hacer scroll con el reloj
          corriendo, así que el orden cambia con el pick. Se hace con `order`
          y no moviendo el componente para que React no lo reinicie. */}
      <div style={{ order: campeon ? 2 : 0 }}>
        <DraftAdvisor identity={identity} posicionManual={posicionManual} onElegirPosicion={setPosicionManual} />
      </div>

      <div style={{ ...tarjeta, display: "flex", flexDirection: "column", gap: 8, order: 1 }}>
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
              <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                {o.icono ? <img src={o.icono} alt="" style={{ width: 18, height: 18, borderRadius: 4 }} /> : null}
                {o.etiqueta}
              </span>
              <span style={{ fontSize: 11, color: COLORS.muted }}>
                {o.origen === "guardada"
                  ? t("ChampSelect.fromSaved")
                  : o.origen === "alternativa"
                    ? t("ChampSelect.alternativeStats", {
                        games: String(o.muestra ?? 0),
                        percent: String(Math.round(((o.victorias ?? 0) / Math.max(1, o.muestra ?? 0)) * 100)),
                      })
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
