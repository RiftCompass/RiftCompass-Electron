// Types of the pure helpers of github-release.mjs, for the test that
// imports them from src/ (the script itself stays plain ESM for CI).
export function changelogFor(version: string, text?: string): string;
export function releaseNotes(version: string, publishedVersion: string | null, text?: string): string;
export function compareVersions(a: string, b: string): number;
