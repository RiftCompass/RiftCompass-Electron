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

// Todos los sets nuestros llevan este prefijo en el título. Es lo único que
// distingue los nuestros de los que el jugador se haya hecho a mano, y la LCU
// obliga a reescribir la lista entera de sets en cada guardado: sin una marca
// clara, actualizar el nuestro significaría borrarle los suyos.
const PREFIJO = "RiftCompass";

// Grieta del Invocador y ARAM. `associatedMaps` vacío significa "todos", pero
// entonces el set aparece también en modos donde esta build no tiene sentido.
const MAPAS = [11, 12];

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
  /** En orden de compra: el primero es el primer objeto principal. */
  itemIds: number[];
  /** Partidas que respaldan el objeto con menos muestra de la build. */
  games: number;
}

// Un solo bloque con los objetos en orden. Se probó partirlo en un bloque por
// posición ("1.º", "2.º"...) y en la tienda queda ilegible: seis cabeceras para
// seis objetos. Dentro de un bloque el cliente respeta el orden que se le da,
// que es justo lo que hace falta.
function construirSet(build: BuildParaSet): ItemSet {
  return {
    title: `${PREFIJO} · ${build.championName} ${build.role} (${build.games} partidas)`,
    type: "custom",
    map: "any",
    mode: "any",
    sortrank: 1,
    startedFrom: "blank",
    associatedMaps: MAPAS,
    associatedChampions: [build.championId],
    blocks: [
      {
        type: "Orden recomendado",
        items: build.itemIds.map((id) => ({ id: String(id), count: 1 })),
      },
    ],
  };
}

// Deja en el cliente UN set nuestro para este campeón, respetando los del
// jugador y los nuestros de otros campeones.
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

  const nuestroDeEsteCampeon = (s: ItemSet) =>
    s.title.startsWith(PREFIJO) && (s.associatedChampions ?? []).includes(build.championId);

  const itemSets = [...existentes.filter((s) => !nuestroDeEsteCampeon(s)), construirSet(build)];

  // La LCU reescribe el documento entero: hay que devolverle también el
  // accountId y una marca de tiempo, o descarta el guardado sin decir nada.
  await lcuRequest(creds, "PUT", ruta, {
    accountId: documento.accountId ?? summoner.accountId,
    itemSets,
    timestamp: Date.now(),
  });
  return true;
}

// Para "quitar lo que RiftCompass haya dejado puesto": borra los nuestros de
// todos los campeones y deja intactos los del jugador.
export async function borrarNuestrosItemSets(creds: LcuCredentials): Promise<number> {
  const summoner = (await lcuRequest(creds, "GET", "/lol-summoner/v1/current-summoner")) as {
    summonerId?: number;
    accountId?: number;
  } | null;
  if (!summoner?.summonerId) throw new Error("current-summoner no devolvió summonerId");

  const ruta = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`;
  const documento = ((await lcuRequest(creds, "GET", ruta)) ?? {}) as ItemSetsDocument;
  const existentes = documento.itemSets ?? [];
  const quedan = existentes.filter((s) => !s.title.startsWith(PREFIJO));
  const borrados = existentes.length - quedan.length;
  if (borrados === 0) return 0;

  await lcuRequest(creds, "PUT", ruta, {
    accountId: documento.accountId ?? summoner.accountId,
    itemSets: quedan,
    timestamp: Date.now(),
  });
  return borrados;
}
