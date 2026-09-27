// The leagues whose tournaments are international events (Worlds, MSI,
// First Stand): the Esports screen leads with the nearest one and lists
// them after the regional leagues (esports-portada.md). Copy of the web's
// src/lib/esports/leagues.ts; a league added there is added here.
export const INTERNATIONAL_LEAGUES: readonly string[] = ["worlds", "msi", "first_stand"];

export function isInternationalLeague(slug: string): boolean {
  return INTERNATIONAL_LEAGUES.includes(slug);
}
