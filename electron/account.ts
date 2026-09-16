// Login and account-backed data against riftcompass.com's own accounts —
// same accounts and passwords as the website, never RSO/Riot credentials.
// The bearer token (90-day credential) is encrypted at rest via DPAPI
// (dpapi.ts), tied to the logged-in OS user, and never crosses to the
// renderer: every endpoint is called from here and only plain JSON
// results are returned.

import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { protect, unprotect } from "./dpapi";
import { BACKEND_ORIGIN as API_BASE_URL } from "./backend";
import { writeFileAtomic } from "./settings";

// Ninguna llamada a riftcompass.com se queda colgada sin limite (APP-3,
// ronda 20): si la web tarda (el servidor compilando, un corte de red), la
// pantalla se quedaba en "cargando" para siempre. Es el mismo error de red
// que ya existia (`network`), solo que llega.
const REQUEST_TIMEOUT_MS = 15000;
function timeout(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

// Every call to riftcompass.com says which app build is asking
// (`X-RiftCompass-Client: electron/<version>`, A6): the API only promises
// additive changes, and this is how the server can tell, if it ever has to,
// which builds are still out there. The renderer's own fetches get the same
// header from main.ts (webRequest), so the two paths never disagree.
export const CLIENT_HEADER = { "X-RiftCompass-Client": `electron/${app.getVersion()}` } as const;

export interface AccountUser {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  /** Falso hasta abrir el enlace del correo: se puede entrar, pero no guardar (la API contesta 403 emailNotVerified). Ausente en sesiones guardadas antes del 2026-09-12. */
  emailVerified?: boolean;
}

interface AccountSession {
  token: string;
  user: AccountUser;
}

function sessionFilePath(): string {
  return path.join(app.getPath("userData"), "session.dat");
}

function persistSession(session: AccountSession): void {
  const json = Buffer.from(JSON.stringify(session), "utf-8");
  // No plaintext fallback: if DPAPI is unavailable (never the case on a
  // normal Windows session) we simply don't persist.
  const encrypted = protect(json);
  if (!encrypted) return;
  try {
    writeFileAtomic(sessionFilePath(), encrypted);
  } catch {
    // best-effort, like the settings file
  }
}

function loadPersistedSession(): AccountSession | null {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(sessionFilePath());
  } catch {
    return null;
  }
  const json = unprotect(raw);
  if (!json) return null;
  try {
    return JSON.parse(json.toString("utf-8"));
  } catch {
    return null;
  }
}

function clearPersistedSession(): void {
  try {
    fs.unlinkSync(sessionFilePath());
  } catch {
    // already gone
  }
}

// The tagged { ok: true, ... } | { ok: false, error } result unions the
// bridge expects.
function err(code: string): { ok: false; error: string } {
  return { ok: false, error: code };
}

// riftcompass.com's response bodies are always a JSON object (or absent
// on a parse failure) — typed as a loose record here since each caller
// already knows, and checks for, the specific fields its own endpoint
// returns.
async function readJson(res: Response): Promise<Record<string, any> | null> {
  try {
    return (await res.json()) as Record<string, any>;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: unknown, token?: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { ...CLIENT_HEADER, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: timeout(),
    });
  } catch {
    return null;
  }
}

export async function accountLogin(email: string, password: string): Promise<unknown> {
  const res = await postJson(`${API_BASE_URL}/api/v1/auth/login`, { email, password });
  if (!res) return err("network");
  const ok = res.ok;
  const data = await readJson(res);
  if (ok && data?.token && data?.user) {
    persistSession({ token: data.token, user: data.user });
    return { ok: true, user: data.user };
  }
  return err(data?.error ?? "unknown");
}

// Primero se revoca el token en el servidor y después se borra del disco:
// si se hiciera al revés y la red fallara, el token seguiría valiendo. Si la
// revocación no llega (sin red), el jugador queda fuera de la app igual y el
// token caduca solo a los 90 días.
export async function accountLogout(): Promise<void> {
  const stored = loadPersistedSession();
  if (stored) {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { ...CLIENT_HEADER, Authorization: `Bearer ${stored.token}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // sin red: el token caduca solo
    }
  }
  clearPersistedSession();
}

// Re-validates the stored token against /api/v1/me. ONLY a 401 clears the
// session (that alone means the token is invalid); any other failure —
// 5xx, offline — falls back to the last-known cached user instead of
// silently logging the user out over a hiccup.
export async function accountGetSession(): Promise<AccountUser | null> {
  const stored = loadPersistedSession();
  if (!stored) return null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/me`, { headers: { ...CLIENT_HEADER, Authorization: `Bearer ${stored.token}` }, signal: timeout() });
  } catch {
    return stored.user;
  }

  if (res.status === 401) {
    clearPersistedSession();
    return null;
  }
  if (!res.ok) return stored.user;

  const data = await readJson(res);
  if (data?.user) {
    // `token` viene solo cuando al actual le quedan menos de 30 dias (SEG-9,
    // ronda 20): se guarda y la sesion no caduca nunca por usar la app.
    const token = typeof data.token === "string" && data.token.length > 0 ? data.token : stored.token;
    persistSession({ token, user: data.user });
    return data.user;
  }
  return stored.user;
}

export async function accountUpdateUsername(username: string): Promise<unknown> {
  const stored = loadPersistedSession();
  if (!stored) return err("notAuthenticated");

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/username`, {
      method: "PATCH",
      headers: { ...CLIENT_HEADER, "Content-Type": "application/json", Authorization: `Bearer ${stored.token}` },
      body: JSON.stringify({ username }),
      signal: timeout(),
    });
  } catch {
    return err("network");
  }
  const ok = res.ok;
  const data = await readJson(res);
  if (ok && data?.user) {
    persistSession({ token: stored.token, user: data.user });
    return { ok: true, user: data.user };
  }
  return err(data?.error ?? "unknown");
}

export async function accountGetSavedProfiles(): Promise<unknown> {
  const empty = { folders: [], profiles: [] };
  const stored = loadPersistedSession();
  if (!stored) return empty;

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/saved-profiles`, { headers: { ...CLIENT_HEADER, Authorization: `Bearer ${stored.token}` }, signal: timeout() });
    if (!res.ok) return empty;
    return await res.json();
  } catch {
    return empty;
  }
}

// Shared by every folder-scoped mutation (profile folders + the toggle
// itself) — the response rides a shared { folders, profiles } payload.
async function folderApiCall(method: string, urlPath: string, body?: unknown): Promise<unknown> {
  const stored = loadPersistedSession();
  if (!stored) return err("notAuthenticated");

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${urlPath}`, {
      method,
      headers: { ...CLIENT_HEADER, "Content-Type": "application/json", Authorization: `Bearer ${stored.token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: timeout(),
    });
  } catch {
    return err("network");
  }
  const ok = res.ok;
  const data = await readJson(res);
  if (ok && data?.folders && data?.profiles) {
    return { ...data, ok: true };
  }
  return err(data?.error ?? "unknown");
}

export function accountToggleSavedProfile(platform: string, gameName: string, tagLine: string, puuid?: string): Promise<unknown> {
  return folderApiCall("POST", "/api/v1/saved-profiles", { platform, gameName, tagLine, puuid });
}

export function accountCreateProfileFolder(name: string): Promise<unknown> {
  return folderApiCall("POST", "/api/v1/saved-profile-folders", { name });
}

export function accountRenameProfileFolder(id: string, name: string): Promise<unknown> {
  return folderApiCall("PATCH", `/api/v1/saved-profile-folders/${id}`, { name });
}

export function accountDeleteProfileFolder(id: string): Promise<unknown> {
  return folderApiCall("DELETE", `/api/v1/saved-profile-folders/${id}`);
}

// A profile is always in exactly one folder — moving it "out" just means
// moving it into the default one, so this always sets a real folder id.
export function accountSetProfileFolder(profileId: string, folderId: string): Promise<unknown> {
  return folderApiCall("PATCH", `/api/v1/saved-profiles/${profileId}`, { folderId });
}

// "My main profile": same PATCH, `isMain` instead of `folderId` (the server
// clears any previous main when setting a new one).
export function accountSetMainProfile(profileId: string, isMain: boolean): Promise<unknown> {
  return folderApiCall("PATCH", `/api/v1/saved-profiles/${profileId}`, { isMain });
}

// El refresco forzado de un perfil (`?force=true`) solo lo acepta la web
// con sesión de la app, para que nadie gaste cuota de Riot a nombre de otro.
// El token vive aquí y no en el renderer, así que la petición se hace aquí y
// se devuelve tal cual (código y cuerpo) para que el renderer la interprete
// igual que las que hace él mismo.
export async function accountFetchProfileForced(
  platform: string,
  gameName: string,
  tagLine: string,
): Promise<{ status: number; body: Record<string, any> | null } | { error: "network" }> {
  const stored = loadPersistedSession();
  const slug = `${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/profile/${platform}/${slug}?force=true`, {
      headers: { ...CLIENT_HEADER, ...(stored ? { Authorization: `Bearer ${stored.token}` } : {}) },
      signal: timeout(),
    });
    return { status: res.status, body: await readJson(res) };
  } catch {
    return { error: "network" };
  }
}

// Una lista guardada que no se pudo pedir NO es una lista vacía (ronda 22):
// antes red caída, timeout, 401 y 429 volvían como [] y el panel decía "Aún
// no tienes drafts guardados", que es una afirmación sobre la cuenta del
// usuario. Sin sesión sí es una lista vacía de verdad para esta app.
type ListResult = { ok: true; items: unknown[] } | { ok: false; error: string; retryAfterSeconds: number | null };

async function getList(urlPath: string, key: string): Promise<ListResult> {
  const stored = loadPersistedSession();
  if (!stored) return { ok: true, items: [] };
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${urlPath}`, { headers: { ...CLIENT_HEADER, Authorization: `Bearer ${stored.token}` }, signal: timeout() });
  } catch {
    return { ok: false, error: "network", retryAfterSeconds: null };
  }
  const data = await readJson(res);
  if (res.status === 429) {
    const fromBody = typeof data?.retryAfterSeconds === "number" ? data.retryAfterSeconds : null;
    return { ok: false, error: "rateLimited", retryAfterSeconds: fromBody ?? (Number(res.headers.get("retry-after")) || null) };
  }
  if (!res.ok) return { ok: false, error: data?.error ?? `http${res.status}`, retryAfterSeconds: null };
  return { ok: true, items: data?.[key] ?? [] };
}

// Wraps a write response whose body carries the updated list under `key`
// (tier lists, drafts, maps, builds) into the { ok: true, <key>: [...] }
// union the bridge expects.
async function listResult(method: string, urlPath: string, body: unknown, key: string): Promise<unknown> {
  const stored = loadPersistedSession();
  if (!stored) return err("notAuthenticated");
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${urlPath}`, {
      method,
      headers: { ...CLIENT_HEADER, "Content-Type": "application/json", Authorization: `Bearer ${stored.token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: timeout(),
    });
  } catch {
    return err("network");
  }
  const ok = res.ok;
  const data = await readJson(res);
  if (ok && data?.[key] !== undefined) {
    return { ok: true, [key]: data[key] };
  }
  return err(data?.error ?? "unknown");
}

export const accountGetSavedTierLists = () => getList("/api/v1/saved-tier-lists", "tierLists");
export const accountCreateTierList = (name: string, board: Record<string, string[]>) =>
  listResult("POST", "/api/v1/saved-tier-lists", { name, board }, "tierLists");
export const accountDeleteTierList = (id: string) => listResult("DELETE", `/api/v1/saved-tier-lists/${id}`, undefined, "tierLists");

export const accountGetSavedDrafts = () => getList("/api/v1/saved-drafts", "drafts");
export const accountCreateDraft = (name: string, selections: string[]) =>
  listResult("POST", "/api/v1/saved-drafts", { name, selections }, "drafts");
export const accountDeleteDraft = (id: string) => listResult("DELETE", `/api/v1/saved-drafts/${id}`, undefined, "drafts");

export const accountGetSavedMaps = () => getList("/api/v1/saved-maps", "maps");
export const accountCreateMap = (name: string, strokes: unknown, notes: string) =>
  listResult("POST", "/api/v1/saved-maps", { name, strokes, notes }, "maps");
export const accountDeleteMap = (id: string) => listResult("DELETE", `/api/v1/saved-maps/${id}`, undefined, "maps");

export async function accountGetSavedMap(id: string): Promise<unknown> {
  const stored = loadPersistedSession();
  if (!stored) return err("notAuthenticated");
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/saved-maps/${id}`, { headers: { ...CLIENT_HEADER, Authorization: `Bearer ${stored.token}` }, signal: timeout() });
  } catch {
    return err("network");
  }
  const ok = res.ok;
  const data = await readJson(res);
  if (ok && data?.strokes !== undefined) {
    return { ...data, ok: true };
  }
  if (res.status === 429) {
    const fromBody = typeof data?.retryAfterSeconds === "number" ? data.retryAfterSeconds : null;
    return { ok: false, error: "rateLimited", retryAfterSeconds: fromBody ?? (Number(res.headers.get("retry-after")) || null) };
  }
  return err(data?.error ?? "unknown");
}

export const accountGetSavedBuilds = () => getList("/api/v1/saved-builds", "builds");
export const accountCreateBuild = (name: string, items: string[], supportRole: boolean) =>
  listResult("POST", "/api/v1/saved-builds", { name, items, supportRole }, "builds");
export const accountDeleteBuild = (id: string) => listResult("DELETE", `/api/v1/saved-builds/${id}`, undefined, "builds");

// Champion builds (the Champion Builds tool) are their own endpoint and
// their own table on the web, not an extension of saved-builds above: that
// one is the Gold Calculator's item list, this one carries the champion,
// the position, the runes, the summoner spells and the skill order. The
// whole build travels as one object so this side never has to know the
// field list, which the web validates in one place
// (lib/champion-builds/validate.ts).
export const accountGetSavedChampionBuilds = () => getList("/api/v1/saved-champion-builds", "builds");
export const accountCreateChampionBuild = (build: unknown) =>
  listResult("POST", "/api/v1/saved-champion-builds", build, "builds");
export const accountUpdateChampionBuild = (id: string, build: unknown) =>
  listResult("PUT", `/api/v1/saved-champion-builds/${id}`, build, "builds");
export const accountDeleteChampionBuild = (id: string) =>
  listResult("DELETE", `/api/v1/saved-champion-builds/${id}`, undefined, "builds");

// La foto de rango al acabar la partida (POST /api/v1/rank-snapshot) exige
// sesion de la app desde la ronda 20 (SEG-4): antes la pedia el renderer sin
// token y cualquier web ajena podia disparar el mismo endpoint. El token
// vive aqui, asi que la peticion tambien. Sin sesion no se pide nada.
export async function accountRequestRankSnapshot(platform: string, puuid: string): Promise<"changed" | "unchanged" | "failed"> {
  const stored = loadPersistedSession();
  if (!stored) return "failed";
  const res = await postJson(`${API_BASE_URL}/api/v1/rank-snapshot`, { platform, puuid }, stored.token);
  if (!res || !res.ok) return "failed";
  const data = await readJson(res);
  return data?.changed ? "changed" : "unchanged";
}
