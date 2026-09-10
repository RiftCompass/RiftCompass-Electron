// The one remote origin this app talks to: riftcompass.com's own site,
// which serves both the JSON of /api/v1/* and the files it hands back as
// absolute URLs — today the account avatar under /avatars/<file>.
//
// main.ts builds the CSP from this constant and account.ts fetches from
// it, so the allowlist cannot drift away from the host actually in use.
// It did drift once: when the site moved off Vercel to its own server,
// avatar URLs became riftcompass.com/avatars/... while img-src still
// only named the old Vercel Blob host, and every avatar rendered as a
// broken image. Adding a new remote host means adding it here and in the
// CSP directive that needs it, deliberately, in one place.
//
// Mirrors src/shared/api.ts on the renderer side, which cannot be shared
// with this tsconfig because it reads Vite's `import.meta.env`.
export const BACKEND_ORIGIN = "https://riftcompass.com";
