// The patch number players know (round 31, extended to the whole site in
// round 34). Riot's public numbering is year-based since 2025 ("25.1",
// "26.18") while Data Dragon and the match payloads keep the internal
// season count ("15.1", "16.18"): the internal major plus 10. Everything
// stored (tables, `saved_champion_builds.source_patch`, the API's `patch`,
// `dataPatches`, `latestPatch` and `?patch=`) stays internal so the app and
// Match-V5 keep matching; only what a person reads goes through here.
// Copy of the web's src/lib/patch-label.ts (same rule, same reason).

export function publicPatchLabel(patch: string): string {
  const [major, minor] = patch.split(".");
  const n = Number(major);
  return Number.isFinite(n) && n < 25 && minor !== undefined ? `${n + 10}.${minor}` : patch;
}

/** "16.18" | "16.18 + 16.17" | ["16.18", "16.17"] → "26.18 + 26.17". */
export function patchLabel(patches: string | string[]): string {
  const list = Array.isArray(patches) ? patches : patches.split(" + ");
  return list.map((p) => publicPatchLabel(p.trim())).join(" + ");
}
