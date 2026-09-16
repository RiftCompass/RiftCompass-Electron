// The desktop app's one real backend: riftcompass.com's own /api/v1/*
// (see the web repo's the project guide, "API pública v1"). Must match the copy
// in electron/account.ts, which the main process keeps on its own side
// of the IPC boundary.
// `VITE_API_BASE_URL` overrides it for local development only (running
// `dev:renderer` against a web checkout on localhost); with nothing set,
// including in every packaged build, this is production.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://riftcompass.com";

// A page of the website in the app's own language (round 27). Without the
// prefix the web redirects by the browser's Accept-Language, i.e. Windows'
// language, which is not necessarily the one the app is set to.
export function webUrl(locale: string, path: string): string {
  return `${API_BASE_URL}/${locale}${path}`;
}
