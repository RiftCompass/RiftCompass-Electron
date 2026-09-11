// Escribe en el cliente de League el "champion set" con la build recomendada,
// para que el jugador vea en la tienda qué comprarse y en qué orden.
//
// Los objetos no se pueden comprar por la LCU, pero SÍ se le puede dejar puesto
// al jugador un item set, que es exactamente la pieza que el cliente tiene para
// esto: aparece en la tienda, con sus objetos en el orden que le demos.
//
// El orden viene de `itemOrder` de /api/v1/champion-build, que sale de las
// compras reales de las partidas rastreadas. Sin ese dato no se escribe nada:
// un set con los objetos en orden arbitrario es peor que no tener set, porque
// el jugador se fía de él.

import { lcuRequest, type LcuCredentials } from "./lcu";
import { settingsGet } from "./settings";

// El nuestro se reconoce por su `uid` fijo: la LCU obliga a reescribir la
// lista entera de sets en cada guardado y, sin una marca clara, actualizar el
// nuestro significaría borrarle al jugador los suyos. Las versiones
// anteriores lo marcaban con este prefijo en el título; se sigue
// reconociendo para limpiarlas.
const PREFIJO_ANTIGUO = "RiftCompass";

// Hay UN solo set nuestro, sin campeón ni mapa asociados, que se reescribe en
// cada selección con la build del campeón elegido. No es por comodidad: la
// tienda del juego abre el desplegable por el primer set SIN campeón asociado
// (probado el 2026-09-11 con cinco sets a la vez: ni el `sortrank` en ninguna
// dirección, ni el orden de la lista, ni el `uid`, ni el título alfabético
// adelantaron a uno global). Con un set por campeón el jugador tenía que ir
// al desplegable a buscar el nuestro cada partida. Es lo mismo que hace
// iTero. El precio: si juega sin la app, en la tienda sigue el set de la
// última partida con ella.
const UID = "00000000-0000-0000-0000-000000000000";

interface ItemSet {
  uid?: string;
  title: string;
  type?: string;
  map?: string;
  mode?: string;
  sortrank?: number;
  startedFrom?: string;
  associatedMaps?: number[];
  associatedChampions?: number[];
  blocks: Array<{ type: string; items: Array<{ id: string; count: number }> }>;
}

interface ItemSetsDocument {
  accountId?: number;
  itemSets?: ItemSet[];
  timestamp?: number;
}

export interface BuildParaSet {
  championId: number;
  championName: string;
  role: string;
  /** La compra de salida. Puede ir vacía: entonces no hay bloque. */
  startingItemIds: number[];
  /** En orden de compra: el primero es el primer objeto terminado. */
  itemIds: number[];
  /** Alternativas frecuentes fuera del orden principal. Puede ir vacía. */
  situationalItemIds: number[];
  /** Título del set en la tienda: "RiftCompass · Jinx Bot", o el nombre de la build guardada. */
  titulo: string;
}

// Los títulos de los bloques los ve el jugador en la tienda, así que van en
// su idioma. El proceso principal no tiene el catálogo de textos del
// renderer, y por tres palabras no compensa traerlo.
const BLOQUES: Record<string, { salida: string; orden: string; situacionales: string }> = {
  en: { salida: "Starting items", orden: "Recommended order", situacionales: "Situational" },
  es: { salida: "Salida", orden: "Orden recomendado", situacionales: "Situacionales" },
  fr: { salida: "Départ", orden: "Ordre recommandé", situacionales: "Situationnels" },
  de: { salida: "Start", orden: "Empfohlene Reihenfolge", situacionales: "Situativ" },
};

// Dentro de un bloque el cliente respeta el orden que se le da, que es justo
// lo que hace falta para el orden de compra. Se probó partirlo en un bloque
// por posición ("1.º", "2.º"...) y en la tienda queda ilegible: seis
// cabeceras para seis objetos.
function esNuestro(set: ItemSet): boolean {
  return set.uid === UID || set.title.startsWith(PREFIJO_ANTIGUO);
}

function construirSet(build: BuildParaSet): ItemSet {
  const textos = BLOQUES[settingsGet().locale] ?? BLOQUES.en;
  const bloque = (type: string, ids: number[]) => ({ type, items: ids.map((id) => ({ id: String(id), count: 1 })) });
  const blocks = [
    ...(build.startingItemIds.length > 0 ? [bloque(textos.salida, build.startingItemIds)] : []),
    bloque(textos.orden, build.itemIds),
    ...(build.situationalItemIds.length > 0 ? [bloque(textos.situacionales, build.situationalItemIds)] : []),
  ];
  return {
    uid: UID,
    title: build.titulo,
    type: "custom",
    map: "any",
    mode: "any",
    sortrank: 0,
    startedFrom: "blank",
    associatedMaps: [],
    associatedChampions: [],
    blocks,
  };
}

// Deja en el cliente nuestro único set con esta build, el primero de la
// lista (entre los globales manda el orden de la lista: el de prueba que iba
// delante del de iTero salió delante) y respetando los del jugador.
//
// Devuelve false, sin tocar nada, cuando no hay orden de compra que enseñar:
// es el caso normal mientras el rastreador aún no tiene muestra de ese
// campeón en ese rol, y es mejor no dejar set que dejar uno vacío.
export async function aplicarItemSet(creds: LcuCredentials, build: BuildParaSet): Promise<boolean> {
  if (build.itemIds.length === 0) return false;

  const summoner = (await lcuRequest(creds, "GET", "/lol-summoner/v1/current-summoner")) as {
    summonerId?: number;
    accountId?: number;
  } | null;
  if (!summoner?.summonerId) throw new Error("current-summoner no devolvió summonerId");

  const ruta = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`;
  const documento = ((await lcuRequest(creds, "GET", ruta)) ?? {}) as ItemSetsDocument;
  const existentes = documento.itemSets ?? [];

  const delJugador = existentes.filter((s) => !esNuestro(s));
  const itemSets = [construirSet(build), ...delJugador];

  // La LCU reescribe el documento entero: hay que devolverle también el
  // accountId y una marca de tiempo, o descarta el guardado sin decir nada.
  await lcuRequest(creds, "PUT", ruta, {
    accountId: documento.accountId ?? summoner.accountId,
    itemSets,
    timestamp: Date.now(),
  });
  return true;
}

// Para "quitar lo que RiftCompass haya dejado puesto": borra el nuestro (y
// cualquiera de versiones anteriores, que eran uno por campeón) y deja
// intactos los del jugador.
export async function borrarNuestrosItemSets(creds: LcuCredentials): Promise<number> {
  const summoner = (await lcuRequest(creds, "GET", "/lol-summoner/v1/current-summoner")) as {
    summonerId?: number;
    accountId?: number;
  } | null;
  if (!summoner?.summonerId) throw new Error("current-summoner no devolvió summonerId");

  const ruta = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`;
  const documento = ((await lcuRequest(creds, "GET", ruta)) ?? {}) as ItemSetsDocument;
  const existentes = documento.itemSets ?? [];
  const quedan = existentes.filter((s) => !esNuestro(s));
  const borrados = existentes.length - quedan.length;
  if (borrados === 0) return 0;

  await lcuRequest(creds, "PUT", ruta, {
    accountId: documento.accountId ?? summoner.accountId,
    itemSets: quedan,
    timestamp: Date.now(),
  });
  return borrados;
}
