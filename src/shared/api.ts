// The desktop app's one real backend: riftcompass.com's own /api/v1/*
// (see the web repo's CLAUDE.md, "API pública v1"). Must match the copy
// in electron/account.ts, which the main process keeps on its own side
// of the IPC boundary.
// `VITE_API_BASE_URL` overrides it for local development only (running
// `dev:renderer` against a web checkout on localhost); with nothing set,
// including in every packaged build, this is production.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://riftcompass.com";
