import { API_BASE_URL } from "./shared/api";

// Same public Data Dragon source the main RiftCompass web app uses for
// champion data — no API key needed, just the current patch version.
//
// Champion and rune icons, though, come from riftcompass.com's own WebP set
// (round 40; the web's scripts/build-icons.ts): Data Dragon's PNGs weighed
// 27-30 KB per champion and up to 366 KB per rune, 1.7 MB for one esports
// series or one Meta Tier List in this app. The web serves
// /icons/<patch>/champion/<id>.webp and /icons/<patch>/perk-images/... at
// ~3-8 KB, immutable, and redirects to Data Dragon anything its set does
// not have (a patch newer than the set, a new champion), so nothing renders
// broken when the two are out of step. Items and summoner spells stay on
// Data Dragon (64 px, 6 KB).
export interface ChampionInfo {
  id: number;
  internalId: string;
  name: string;
  iconUrl: string;
  tags: string[];
  difficulty: number;
  attack: number;
  defense: number;
  magic: number;
}

export interface ChampionMaps {
  byId: Record<number, ChampionInfo>;
  // Keyed by Data Dragon's internal id (e.g. "MonkeyKing") — this is what
  // champ-select's assignedPosition/championId resolve to, and what real
  // (non-bot) players' Live Client Data championName reports.
  byInternalId: Record<string, ChampionInfo>;
  // Keyed by a normalized (lowercased, non-alphanumeric stripped) name —
  // covers both the internal id ("twistedfate") and, once
  // mergeLocalizedChampionNames adds them, the League client's own
  // display-locale name ("maestroyi" for "Maestro Yi"). Needed because
  // Live Client Data reports BOT-controlled champions' names in the
  // client's display locale, not the English internal id (under a
  // Spanish-locale client: "Maestro Yi" for MasterYi, "Twisted Fate"/
  // "Xin Zhao" with a space where the internal id has none) — see
  // OverlayView.tsx's resolveLanePlayer.
  byNormalizedName: Record<string, ChampionInfo>;
}

export function normalizeChampionName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function fetchChampionMap(): Promise<ChampionMaps> {
  const versions: string[] = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) =>
    r.json(),
  );
  const version = versions[0];
  rememberIconSet(version);
  const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`).then(
    (r) => r.json(),
  );
  const byId: Record<number, ChampionInfo> = {};
  const byInternalId: Record<string, ChampionInfo> = {};
  const byNormalizedName: Record<string, ChampionInfo> = {};
  for (const champ of Object.values(data.data) as Array<{
    id: string;
    key: string;
    name: string;
    image: { full: string };
    tags: string[];
    info: { difficulty: number; attack: number; defense: number; magic: number };
  }>) {
    const info: ChampionInfo = {
      id: Number(champ.key),
      internalId: champ.id,
      name: champ.name,
      iconUrl: championSquareUrl(version, champ.id),
      tags: champ.tags,
      difficulty: champ.info.difficulty,
      attack: champ.info.attack,
      defense: champ.info.defense,
      magic: champ.info.magic,
    };
    byId[info.id] = info;
    byInternalId[champ.id] = info;
    byNormalizedName[normalizeChampionName(champ.id)] = info;
  }
  return { byId, byInternalId, byNormalizedName };
}

// Adds the League client's own display-locale champion names into an
// already-fetched ChampionMaps' byNormalizedName lookup, mutating it in
// place — a second Data Dragon fetch (locale-specific champion.json),
// merged by numeric key so it lines up with the English-keyed maps
// already built. Best-effort: an unsupported/unreachable locale just
// means bot champion names in that locale keep failing to resolve,
// same as before this function existed.
export async function mergeLocalizedChampionNames(maps: ChampionMaps, version: string, ddLocale: string): Promise<void> {
  if (ddLocale === "en_US") return; // already covered by fetchChampionMap's own English pass
  let data: { data: Record<string, { key: string; name: string }> };
  try {
    data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/${ddLocale}/champion.json`).then((r) =>
      r.json(),
    );
  } catch {
    return;
  }
  for (const champ of Object.values(data.data)) {
    const info = maps.byId[Number(champ.key)];
    if (info) maps.byNormalizedName[normalizeChampionName(champ.name)] = info;
  }
}

export async function fetchLatestVersion(): Promise<string> {
  const versions: string[] = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) =>
    r.json(),
  );
  rememberIconSet(versions[0]);
  return versions[0];
}

// The patch a Data Dragon version belongs to ("16.18.1" → "16.18"): the name
// of the icon set on riftcompass.com. Rune icons are versionless on Data
// Dragon and their helpers take no version, so the last patch seen by any
// fetch is remembered for them; before one is known they stay on Data Dragon.
export function iconSetFor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

let currentIconSet: string | null = null;
let currentVersion: string | null = null;

function rememberIconSet(version: string): void {
  currentIconSet = iconSetFor(version);
  currentVersion = version;
}

// The original Data Dragon URL behind one of our /icons/ URLs, or null when
// the URL is not one of ours (or a champion's before any version is known).
export function dataDragonFallbackFor(src: string): string | null {
  const prefix = `${API_BASE_URL}/icons/`;
  if (!src.startsWith(prefix)) return null;
  const [, kind, ...rest] = src.slice(prefix.length).split("/");
  const png = rest.join("/").replace(/\.webp$/i, ".png");
  if (kind === "champion" && rest.length === 1) {
    return currentVersion ? `https://ddragon.leagueoflegends.com/cdn/${currentVersion}/img/champion/${png}` : null;
  }
  if (kind === "perk-images" && rest.length > 0) return `https://ddragon.leagueoflegends.com/cdn/img/perk-images/${png}`;
  return null;
}

// When riftcompass.com cannot answer for an icon at all (the site unreachable
// while Data Dragon is not, a build older than the app), the web's redirect
// never happens: this swaps any failed <img> of ours to the original PNG. One
// capture-phase listener for the whole document, installed once by main.tsx,
// so the ~30 places that render champion or rune icons need nothing.
export function installIconFallback(): void {
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const fallback = dataDragonFallbackFor(img.src);
      if (fallback && img.src !== fallback) img.src = fallback;
    },
    true,
  );
}

// Same real-world Riot API inconsistency the main web app's ddragon.ts
// documents and fixes (see its CHAMPION_NAME_DDRAGON_OVERRIDES): Match-V5,
// Spectator, and this app's own crawler-backed /api/v1/champion-winrates
// all spell this champion's name "FiddleSticks" (capital S); Data Dragon's
// own champion id — and its actual asset filename — is "Fiddlesticks"
// (lowercase s). Anything built from real match/crawler data (not from
// Data Dragon's own champion list already) needs this, or the lookup/image
// silently misses: confirmed live as a blank icon box in Meta Tier List's
// Jungle D tier, a missing real-winrate badge in Personality Test and
// Draft Simulator's suggestions, a missing real-tier badge in Tier List
// Builder, and a broken champion-square image in match history/champion
// overview (anywhere championSquareUrl is fed a raw match championName).
const DDRAGON_ID_OVERRIDES: Record<string, string> = {
  FiddleSticks: "Fiddlesticks",
};

export function toDDragonId(name: string): string {
  return DDRAGON_ID_OVERRIDES[name] ?? name;
}

export function championSquareUrl(version: string, championInternalId: string): string {
  return `${API_BASE_URL}/icons/${iconSetFor(version)}/champion/${toDDragonId(championInternalId)}.webp`;
}

export function profileIconUrl(version: string, iconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

export function itemIconUrl(version: string, itemId: number | string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}
export interface ItemSummary {
  id: string;
  name: string;
  totalGold: number;
  // Combine cost: what the item itself adds on top of its components.
  baseGold: number;
  // Data Dragon's own item.tags (e.g. "Boots", "Consumable", "Trinket").
  tags: string[];
  // Component/build relations by item id, straight from Data Dragon.
  from: string[];
  into: string[];
  // Localized stat lines parsed out of the description's <stats> block —
  // Data Dragon has no reliable structured stats field, but every shop
  // item carries this block in every locale.
  stats: string[];
}

export interface ItemCatalog {
  // Deduped, name-sorted list of what the shop grid shows.
  list: ItemSummary[];
  // Every purchasable id (pre-dedupe) so from/into chains always resolve.
  byId: Record<string, ItemSummary>;
}

const DDRAGON_LOCALES: Record<string, string> = { en: "en_US", es: "es_ES", fr: "fr_FR", de: "de_DE" };

function parseStatLines(description: string): string[] {
  const match = /<stats>([\s\S]*?)<\/stats>/.exec(description);
  if (!match) return [];
  return match[1]
    .split(/<br\s*\/?>/)
    .map((line) => line.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}

// Ported from the web app's src/lib/riot/ddragon.ts getItemList() — same
// real filtering logic, not re-derived: purchasable-on-Summoner's-Rift
// items only (map "11"), with Data Dragon's Arena-mode remix duplicates
// (id = 300000 + the real item's id) and legitimately-two-id duplicates
// (jungle pet evolutions, Kalista's Black Spear) collapsed by name.
export async function fetchItemCatalog(version: string, locale: string): Promise<ItemCatalog> {
  const ddLocale = DDRAGON_LOCALES[locale] ?? "en_US";
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/${ddLocale}/item.json`);
  const json = await res.json();
  const entries = Object.entries(json.data) as [
    string,
    {
      name: string;
      description: string;
      gold: { base: number; total: number; purchasable: boolean };
      maps: Record<string, boolean>;
      tags?: string[];
      from?: string[];
      into?: string[];
    },
  ][];

  const byId: Record<string, ItemSummary> = {};
  const byName = new Map<string, ItemSummary>();
  for (const [id, item] of entries) {
    if (!item.gold.purchasable || !item.maps["11"]) continue;
    if (Number(id) >= 300000) continue;
    const summary: ItemSummary = {
      id,
      name: item.name,
      totalGold: item.gold.total,
      baseGold: item.gold.base,
      tags: item.tags ?? [],
      from: item.from ?? [],
      into: item.into ?? [],
      stats: parseStatLines(item.description ?? ""),
    };
    byId[id] = summary;
    const existing = byName.get(item.name);
    if (existing && Number(existing.id) <= Number(id)) continue;
    byName.set(item.name, summary);
  }

  return { list: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), byId };
}

export function spellIconUrl(version: string, spellImageFull: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spellImageFull}`;
}

export interface SummonerSpellInfo {
  name: string;
  // Base cooldown only (no CDR items/runes factored in) — Data Dragon has
  // no way to know a player's actual reduction, same honesty rule as the
  // gold estimate above. Always show this prefixed "~" in the UI.
  cooldownSeconds: number;
  iconUrl: string;
}

// Keyed by display name ("Flash", "Ignite"...) — the same human-readable
// name the Live Client Data API's summonerSpells.summonerSpellOne/Two
// .displayName already uses, so no id-mapping step is needed to match them.
export async function fetchSummonerSpells(version: string): Promise<Record<string, SummonerSpellInfo>> {
  const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`).then((r) =>
    r.json(),
  );
  const byName: Record<string, SummonerSpellInfo> = {};
  for (const spell of Object.values(data.data) as Array<{
    name: string;
    cooldown: number[];
    image: { full: string };
  }>) {
    byName[spell.name] = {
      name: spell.name,
      cooldownSeconds: spell.cooldown[0] ?? 0,
      iconUrl: spellIconUrl(version, spell.image.full),
    };
  }
  return byName;
}

// Keyed by Riot's numeric spell id (Match-V5's summoner1Id/summoner2Id use
// this, not the display name fetchSummonerSpells above is keyed by) — same
// approach as the web's getSummonerSpellIconMap (src/lib/riot/ddragon.ts).
export async function fetchSummonerSpellIconsById(version: string): Promise<Record<number, string>> {
  const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`).then((r) =>
    r.json(),
  );
  const byId: Record<number, string> = {};
  for (const spell of Object.values(data.data) as Array<{ key: string; image: { full: string } }>) {
    byId[Number(spell.key)] = spellIconUrl(version, spell.image.full);
  }
  return byId;
}

export interface ChampionSpell {
  id: string;
  name: string;
  cooldown: number[];
  maxrank: number;
  image: { full: string };
}

export interface ChampionDetail {
  id: string;
  name: string;
  spells: ChampionSpell[];
}

// Ported from the web app's src/lib/riot/ddragon.ts getChampionDetail().
// Con el idioma de la app, como el catálogo de objetos: las habilidades
// salían siempre en inglés en es/fr/de (ronda 22; la web lo hizo en 8ae9951).
export async function fetchChampionDetail(version: string, championId: string, locale = "en"): Promise<ChampionDetail> {
  const ddLocale = DDRAGON_LOCALES[locale] ?? "en_US";
  const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/${ddLocale}/champion/${championId}.json`);
  const json = await res.json();
  return json.data[championId];
}

// --- Runes (runesReforged.json) -------------------------------------------
// Mirrors the web's src/lib/riot/runes.ts: the crawler's build data carries
// rune pages as bare perk ids, so showing (or editing) one needs this
// catalog. Duplicated by hand across the two repos, like champion-roles.ts
// and the other shared modules.

export interface RuneSummary {
  id: number;
  name: string;
  icon: string;
  shortDesc: string;
}

export interface RuneStyle {
  id: number;
  name: string;
  icon: string;
  /** Keystone row first, then the three minor rows. */
  slots: RuneSummary[][];
}

function stripRuneMarkup(html: string): string {
  return html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchRuneStyles(version: string, locale: string): Promise<RuneStyle[]> {
  rememberIconSet(version);
  const ddLocale = DDRAGON_LOCALES[locale] ?? "en_US";
  const json = (await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/${ddLocale}/runesReforged.json`,
  ).then((r) => r.json())) as Array<{
    id: number;
    name: string;
    icon: string;
    slots: Array<{ runes: Array<{ id: number; name: string; icon: string; shortDesc: string }> }>;
  }>;

  return json.map((style) => ({
    id: style.id,
    name: style.name,
    icon: style.icon,
    slots: style.slots.map((slot) =>
      slot.runes.map((rune) => ({
        id: rune.id,
        name: rune.name,
        icon: rune.icon,
        shortDesc: stripRuneMarkup(rune.shortDesc ?? ""),
      })),
    ),
  }));
}

// Rune icons are versionless on Data Dragon, unlike champion and item ones.
export function runeIconUrl(icon: string): string {
  if (!currentIconSet) return `https://ddragon.leagueoflegends.com/cdn/img/${icon}`;
  return `${API_BASE_URL}/icons/${currentIconSet}/${icon.replace(/\.png$/i, ".webp")}`;
}

export interface StatShard {
  id: number;
  /** Translation key under ChampionBuilds.statShards. */
  key: string;
  iconFile: string;
}

// The three stat-shard rows. Data Dragon has no data file for them, only
// the icons; the ids are the ones the crawler actually records.
export const STAT_SHARD_ROWS: StatShard[][] = [
  [
    { id: 5008, key: "adaptiveForce", iconFile: "StatModsAdaptiveForceIcon.png" },
    { id: 5005, key: "attackSpeed", iconFile: "StatModsAttackSpeedIcon.png" },
    { id: 5007, key: "abilityHaste", iconFile: "StatModsCDRScalingIcon.png" },
  ],
  [
    { id: 5008, key: "adaptiveForce", iconFile: "StatModsAdaptiveForceIcon.png" },
    { id: 5010, key: "moveSpeed", iconFile: "StatModsMovementSpeedIcon.png" },
    { id: 5001, key: "healthScaling", iconFile: "StatModsHealthScalingIcon.png" },
  ],
  [
    { id: 5011, key: "health", iconFile: "StatModsHealthPlusIcon.png" },
    { id: 5013, key: "tenacity", iconFile: "StatModsTenacityIcon.png" },
    { id: 5001, key: "healthScaling", iconFile: "StatModsHealthScalingIcon.png" },
  ],
];

export function statShardIconUrl(shard: StatShard): string {
  return runeIconUrl(`perk-images/StatMods/${shard.iconFile}`);
}

export function statShardById(row: number, id: number): StatShard | undefined {
  return STAT_SHARD_ROWS[row]?.find((shard) => shard.id === id);
}

export interface SummonerSpellPick {
  id: number;
  name: string;
  iconUrl: string;
}

// Summoner's Rift spells only, keyed by Riot's numeric id: what the build
// editor's picker offers and what the crawler's own pairs use.
export async function fetchSummonerSpellPicks(version: string, locale: string): Promise<SummonerSpellPick[]> {
  const ddLocale = DDRAGON_LOCALES[locale] ?? "en_US";
  const data = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/${ddLocale}/summoner.json`,
  ).then((r) => r.json());
  return (
    Object.values(data.data) as Array<{ key: string; name: string; modes: string[]; image: { full: string } }>
  )
    .filter((spell) => spell.modes.includes("CLASSIC"))
    .map((spell) => ({ id: Number(spell.key), name: spell.name, iconUrl: spellIconUrl(version, spell.image.full) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
