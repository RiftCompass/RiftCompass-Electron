import { STAT_SHARD_ROWS } from "../ddragon";
import type { ChampionBuildRunes } from "../riftcompass";
import type { Vod } from "./types";

// Port of RiftCompass-Web/src/lib/esports/format.ts: same rules, same
// results. A change on one side is replicated on the other.

/** 2489 → "41:29". */
export function formatGameDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/**
 * The feed's `perks` is a set, not the nine slots: a shard taken in two rows
 * appears once, so the list can have eight entries. The rows are known
 * (STAT_SHARD_ROWS), so the three slots are rebuilt by trying every row
 * assignment and keeping the one that uses every listed shard, in order.
 */
export function expandStatShards(shardIds: number[]): [number, number, number] {
  const listed = shardIds.filter((id) => STAT_SHARD_ROWS.some((row) => row.some((shard) => shard.id === id)));
  if (listed.length === 0) return [0, 0, 0];
  const candidates = STAT_SHARD_ROWS.map((row) => listed.filter((id) => row.some((shard) => shard.id === id)));
  let best: [number, number, number] | null = null;
  let bestScore = -1;
  for (const first of candidates[0].length ? candidates[0] : [0]) {
    for (const second of candidates[1].length ? candidates[1] : [0]) {
      for (const third of candidates[2].length ? candidates[2] : [0]) {
        const chosen = [first, second, third];
        const covered = listed.filter((id) => chosen.includes(id)).length;
        const inOrder = chosen.every((id, i) => i === 0 || id === 0 || chosen[i - 1] === 0 || listed.indexOf(id) >= listed.indexOf(chosen[i - 1]));
        const score = covered * 2 + (inOrder ? 1 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = [first, second, third];
        }
      }
    }
  }
  return best ?? [0, 0, 0];
}

/** A pro's final rune page in the shape RunePageView draws (perks: 6 runes then the shards). */
export function runePageFromPerks(runeStyle: number, runeSubStyle: number, perks: number[]): ChampionBuildRunes {
  const [statPerk0, statPerk1, statPerk2] = expandStatShards(perks.slice(6));
  return {
    primaryStyleId: runeStyle,
    subStyleId: runeSubStyle,
    perk0: perks[0] ?? 0,
    perk1: perks[1] ?? 0,
    perk2: perks[2] ?? 0,
    perk3: perks[3] ?? 0,
    perk4: perks[4] ?? 0,
    perk5: perks[5] ?? 0,
    statPerk0,
    statPerk1,
    statPerk2,
  };
}

const VOD_PROVIDERS: Record<string, { label: string; url: (vod: Vod) => string }> = {
  youtube: {
    label: "YouTube",
    url: (vod) => `https://www.youtube.com/watch?v=${encodeURIComponent(vod.parameter)}${vod.startMillis ? `&t=${Math.floor(vod.startMillis / 1000)}s` : ""}`,
  },
  twitch: {
    label: "Twitch",
    url: (vod) => `https://www.twitch.tv/videos/${encodeURIComponent(vod.parameter)}${vod.startMillis ? `?t=${Math.floor(vod.startMillis / 1000)}s` : ""}`,
  },
};

/** Own language first, then English, one link per provider and language; links only, never embeds. */
export function pickVods(vods: Vod[], locale: string): { label: string; url: string; locale: string; tag: string }[] {
  const seen = new Set<string>();
  const score = (vod: Vod) => (vod.locale.startsWith(locale) ? 0 : vod.locale.startsWith("en") ? 1 : 2);
  const picked = [...vods]
    .sort((a, b) => score(a) - score(b))
    .flatMap((vod) => {
      const provider = VOD_PROVIDERS[vod.provider.toLowerCase()];
      if (!provider) return [];
      const key = `${provider.label}:${vod.locale}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ label: provider.label, url: provider.url(vod), locale: vod.locale }];
    })
    .slice(0, 4);
  // The language in brackets, or the whole locale when two links of the
  // same provider share a language ("YouTube (es-ES)", "YouTube (es-MX)").
  const language = (value: string) => value.slice(0, 2);
  return picked.map((vod) => {
    const sameLanguage = picked.filter((other) => other.label === vod.label && language(other.locale) === language(vod.locale)).length;
    return { ...vod, tag: sameLanguage > 1 ? vod.locale : language(vod.locale) };
  });
}

/** A stable hue per team code (no logos: the code in a tinted tag, same as the web). */
export function teamHue(code: string): number {
  let hash = 0;
  for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export type EsportsRoleKey = "top" | "jungle" | "mid" | "bottom" | "support" | "unknown";

export function roleKey(role: string): EsportsRoleKey {
  const lower = role.toLowerCase();
  return lower === "top" || lower === "jungle" || lower === "mid" || lower === "bottom" || lower === "support" ? lower : "unknown";
}

const DRAGON_KINDS = ["mountain", "cloud", "infernal", "ocean", "hextech", "chemtech", "elder"];

export function dragonKey(kind: string): string | null {
  const lower = kind.toLowerCase();
  return DRAGON_KINDS.includes(lower) ? lower : null;
}

// Leaguepedia writes a player's country as its English name; the screen
// shows it in the app's language through Intl.DisplayNames, which wants the
// ISO code (same list as the web's format.ts). Unknown names come back as
// they came.
const COUNTRY_CODES: Record<string, string> = {
  germany: "DE", spain: "ES", france: "FR", denmark: "DK", sweden: "SE", norway: "NO", finland: "FI", iceland: "IS",
  poland: "PL", "czech republic": "CZ", czechia: "CZ", slovakia: "SK", slovenia: "SI", croatia: "HR", serbia: "RS",
  "bosnia and herzegovina": "BA", montenegro: "ME", "north macedonia": "MK", albania: "AL", kosovo: "XK", bulgaria: "BG",
  romania: "RO", hungary: "HU", austria: "AT", switzerland: "CH", belgium: "BE", netherlands: "NL", luxembourg: "LU",
  "united kingdom": "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", ireland: "IE",
  italy: "IT", greece: "GR", cyprus: "CY", malta: "MT", portugal: "PT", turkey: "TR", "türkiye": "TR", ukraine: "UA",
  russia: "RU", belarus: "BY", moldova: "MD", lithuania: "LT", latvia: "LV", estonia: "EE", georgia: "GE", armenia: "AM",
  azerbaijan: "AZ", kazakhstan: "KZ", uzbekistan: "UZ", kyrgyzstan: "KG", israel: "IL", iran: "IR", egypt: "EG",
  morocco: "MA", algeria: "DZ", tunisia: "TN", "saudi arabia": "SA", "united arab emirates": "AE", "south africa": "ZA",
  nigeria: "NG", "south korea": "KR", korea: "KR", china: "CN", taiwan: "TW", "hong kong": "HK", macau: "MO", japan: "JP",
  vietnam: "VN", thailand: "TH", philippines: "PH", indonesia: "ID", malaysia: "MY", singapore: "SG", india: "IN",
  pakistan: "PK", mongolia: "MN", australia: "AU", "new zealand": "NZ", "united states": "US", usa: "US", canada: "CA",
  mexico: "MX", brazil: "BR", argentina: "AR", chile: "CL", peru: "PE", colombia: "CO", venezuela: "VE", uruguay: "UY",
  paraguay: "PY", bolivia: "BO", ecuador: "EC", "costa rica": "CR", panama: "PA", "puerto rico": "PR",
  "dominican republic": "DO", cuba: "CU", guatemala: "GT",
};

export function localizedCountryName(country: string, locale: string): string {
  const code = COUNTRY_CODES[country.trim().toLowerCase()];
  if (!code) return country;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? country;
  } catch {
    return country;
  }
}

/** The same podium twice (Leaguepedia's join repeats it per roster row) is one podium. */
export function dedupePodiums<T extends { event: string; place: string; team: string }>(podiums: T[]): T[] {
  const seen = new Set<string>();
  return podiums.filter((podium) => {
    const key = [podium.event, podium.place, podium.team].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A kick-off that has passed while the sync still says "unstarted" reads as started, not upcoming. */
export function matchStateKey(match: { state: string; startTime: string }, nowMs = Date.now()): string {
  return match.state === "unstarted" && Date.parse(match.startTime) <= nowMs ? "started" : match.state;
}

/** Dates carry their year only when it is not the current one: last year's final read as the November ahead without it. */
export function yearIfNotCurrent(iso: string): { year?: "numeric" } {
  return new Date(iso).getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" };
}

// How far ahead a kick-off still counts as the headline of a schedule.
export const HEADLINE_UPCOMING_MS = 48 * 60 * 60 * 1000;

/**
 * The series a schedule leads with, drawn big above the lists (the web's
 * pickHeadlineMatch): one in progress, else the next kick-off within two
 * days, else the latest result, else the next series at all. The lists
 * below stay complete; the headline repeats one of them.
 */
export function pickHeadlineMatch<T extends { startTime: string }>(live: T[], upcoming: T[], recent: T[], nowMs = Date.now()): T | null {
  const soon = upcoming.find((match) => Date.parse(match.startTime) - nowMs < HEADLINE_UPCOMING_MS);
  return live[0] ?? soon ?? recent[0] ?? upcoming[0] ?? null;
}
