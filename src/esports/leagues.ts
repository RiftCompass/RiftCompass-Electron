// The leagues whose tournaments are international events (Worlds, MSI,
// First Stand): the Esports screen leads with the nearest one and lists
// them after the regional leagues (esports-portada.md). Copy of the web's
// src/lib/esports/leagues.ts; a league added there is added here.
export const INTERNATIONAL_LEAGUES: readonly string[] = ["worlds", "msi", "first_stand"];

export function isInternationalLeague(slug: string): boolean {
  return INTERNATIONAL_LEAGUES.includes(slug);
}

// LoL Esports names a league's region in English capitals; the screens
// translate the ones the catalogs know (`Esports.regions`) and show the
// rest as they come (copy of the web's regions.ts).
const REGION_KEYS: Record<string, string> = {
  EMEA: "emea",
  EUROPE: "emea",
  KOREA: "korea",
  CHINA: "china",
  "NORTH AMERICA": "northAmerica",
  INTERNATIONAL: "international",
};

/** The message key of a region, or null for one the catalogs do not know. */
export function regionKey(region: string): string | null {
  return REGION_KEYS[region.trim().toUpperCase()] ?? null;
}
