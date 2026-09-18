// The League client's own local API (LCU) — the same mechanism
// Porofessor/Blitz/op.gg's client use. Read-only use plus the
// build-import writes; no automating of game actions.
//
// Auth: the running client writes a `lockfile` next to its executable
// with `name:pid:port:password:protocol` (live-verified format).
//
// TLS: the LCU serves a self-signed cert on 127.0.0.1, so both transports
// must explicitly trust it — plain https.request via `rejectUnauthorized:
// false`, and the websocket via the same option passed to `ws`.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";
import WebSocket from "ws";

export interface LcuCredentials {
  port: number;
  password: string;
}

// Donde esta instalado League, segun el propio instalador de Riot: el
// fichero de producto en ProgramData lleva `product_install_full_path`.
// Antes solo se miraban dos rutas fijas (C:\Riot Games y LOCALAPPDATA) y
// quien tuviera el juego en D: o en una carpeta elegida a mano no veia nunca
// "cliente detectado", sin ningun aviso (APP-1, ronda 20).
function installDirFromRiotMetadata(): string | null {
  const programData = process.env.PROGRAMDATA ?? "C:\\ProgramData";
  const settings = path.join(programData, "Riot Games", "Metadata", "league_of_legends.live", "league_of_legends.live.product_settings.yaml");
  let text: string;
  try {
    text = fs.readFileSync(settings, "utf-8");
  } catch {
    return null;
  }
  const match = /^product_install_full_path:\s*"?([^"\r\n]+)"?/m.exec(text);
  return match ? match[1].trim() : null;
}

// Carpeta elegida a mano en Ajustes (settings.json), por si ni las rutas
// habituales ni los metadatos de Riot dan con ella.
let manualInstallDir: string | null = null;
export function setManualInstallDir(dir: string | null): void {
  manualInstallDir = dir;
}

export function findLockfile(): string | null {
  const candidates = ["C:\\Riot Games\\League of Legends\\lockfile"];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(path.join(localAppData, "Riot Games", "League of Legends", "lockfile"));
  }
  const fromRiot = installDirFromRiotMetadata();
  if (fromRiot) candidates.push(path.join(fromRiot, "lockfile"));
  if (manualInstallDir) candidates.push(path.join(manualInstallDir, "lockfile"));
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

// Ultimo recurso, sin rutas: el cliente en marcha lleva el puerto y la
// contrasena en sus propios argumentos (`--app-port=`,
// `--remoting-auth-token=`), que es lo que leen Porofessor o Blitz. Cuesta
// arrancar un PowerShell, asi que gameConnection.ts solo lo pregunta de vez
// en cuando y solo mientras no haya lockfile.
export function readCredentialsFromProcess(): Promise<LcuCredentials | null> {
  if (process.platform !== "win32") return Promise.resolve(null);
  // Asynchronous (round 33): the synchronous version froze the main process
  // for ~270 ms every 15 s while no client was running (tray, drag, window
  // buttons and every invoke waited), which is most of a tray app's life.
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -First 1 -ExpandProperty CommandLine)",
      ],
      { encoding: "utf-8", timeout: 8000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const out = String(stdout);
        const port = Number(/--app-port=(\d+)/.exec(out)?.[1]);
        const password = /--remoting-auth-token=([^\s"]+)/.exec(out)?.[1];
        resolve(Number.isInteger(port) && password ? { port, password } : null);
      },
    );
  });
}

export function readLockfile(lockfilePath: string): LcuCredentials | null {
  let raw: string;
  try {
    raw = fs.readFileSync(lockfilePath, "utf-8");
  } catch {
    return null;
  }
  // name:pid:port:password:protocol
  const parts = raw.split(":");
  const port = Number(parts[2]);
  const password = parts[3];
  if (!Number.isInteger(port) || !password) return null;
  return { port, password };
}

function basicAuth(creds: LcuCredentials): string {
  return "Basic " + Buffer.from(`riot:${creds.password}`).toString("base64");
}

// 204/empty -> null; otherwise parse whatever came back, success or error
// body alike, and let the caller decide.
export function lcuRequest(creds: LcuCredentials, method: string, urlPath: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: "127.0.0.1",
        port: creds.port,
        path: urlPath,
        method: method.toUpperCase(),
        rejectUnauthorized: false,
        headers: {
          Authorization: basicAuth(creds),
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode === 204 || text.length === 0) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error(`LCU returned non-JSON (${res.statusCode}): ${e}`));
          }
        });
      },
    );
    req.on("error", (e) => reject(new Error(`LCU request failed: ${e.message}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

// Real-time push events — the LCU's websocket wants a Socket.IO-flavored
// subscribe frame (`[5,"OnJsonApiEvent"]`) right after connecting, then
// emits `[8, "OnJsonApiEvent_<uri>", payload]` for every REST resource
// that changes.
export interface LcuEvent {
  uri: string;
  eventType: string;
  data: unknown;
}

export function connectWs(creds: LcuCredentials): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://127.0.0.1:${creds.port}`, {
      rejectUnauthorized: false,
      headers: { Authorization: basicAuth(creds) },
    });
    ws.once("open", () => {
      ws.send('[5, "OnJsonApiEvent"]');
      resolve(ws);
    });
    ws.once("error", (e) => reject(new Error(`LCU ws connect failed: ${e.message}`)));
  });
}

// Parses one incoming websocket text frame into an event, if it is one.
// The LCU sends empty keepalive frames and the initial subscribe ack —
// both come back as null.
export function parseEventFrame(text: string): LcuEvent | null {
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed[0] !== 8) return null;
  const payload = parsed[2];
  if (typeof payload !== "object" || payload === null) return null;
  const { uri, eventType, data } = payload as Record<string, unknown>;
  if (typeof uri !== "string") return null;
  return { uri, eventType: typeof eventType === "string" ? eventType : "", data };
}
