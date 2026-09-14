// App settings. Auto-launch reads straight from the OS
// (app.getLoginItemSettings, registry-backed on Windows) so it can never
// drift from what's actually registered; overlay module toggles and the
// UI locale persist to a small settings.json in the app's userData dir.
// Parsing is tolerant field by field: an unknown or missing field falls
// back to its default individually instead of discarding the whole file.

import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

// Escritura atomica (APP-5, ronda 20): un apagon a mitad de writeFileSync
// dejaba settings.json truncado y la lectura tolerante lo devolvia todo a
// los valores por defecto sin decir nada (calibracion, posiciones de los
// paneles). Se escribe al lado y se renombra encima, que en NTFS es atomico.
export function writeFileAtomic(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export const SUPPORTED_LOCALES = ["en", "es", "fr", "de"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export interface OverlayModules {
  csPerMinute: boolean;
  goldDiff: boolean;
  skillOrder: boolean;
  autoBuild: boolean;
}

const DEFAULT_OVERLAY_MODULES: OverlayModules = {
  csPerMinute: true,
  goldDiff: true,
  skillOrder: true,
  autoBuild: true,
};

export interface OverlayModulesPatch {
  csPerMinute?: boolean;
  goldDiff?: boolean;
  skillOrder?: boolean;
  autoBuild?: boolean;
}

export type FlashSide = "left" | "right";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface AbilityBarCalibration {
  q: ScreenPoint;
  w: ScreenPoint;
  e: ScreenPoint;
}

export type OverlayPanelKey = "gold" | "objectives" | "csPerMin";

export interface OverlayPanelPositions {
  gold: ScreenPoint | null;
  objectives: ScreenPoint | null;
  csPerMin: ScreenPoint | null;
}

const DEFAULT_PANEL_POSITIONS: OverlayPanelPositions = {
  gold: null,
  objectives: null,
  csPerMin: null,
};

interface PersistedSettings {
  overlayModules: OverlayModules;
  locale: string;
  // Carpeta de League elegida a mano en Ajustes (APP-1), por si ni las rutas
  // habituales ni los metadatos de Riot dan con el `lockfile`. Null = no.
  leagueInstallDir: string | null;
  // Whether auto-launch has ever been decided (by the first-run default or
  // by the user's own toggle in Settings). The OS registration stays the
  // single source of truth for whether auto-launch IS on — this marker
  // only stops the first-run default from overriding a user who
  // explicitly turned it off. Not exposed in AppSettings.
  autoLaunchConfigured: boolean;
  flashSide: FlashSide;
  abilityBarCalibration: AbilityBarCalibration | null;
  overlayPanelPositions: OverlayPanelPositions;
}

export interface AppSettings {
  autoLaunch: boolean;
  overlayModules: OverlayModules;
  locale: string;
  leagueInstallDir: string | null;
  flashSide: FlashSide;
  abilityBarCalibration: AbilityBarCalibration | null;
  overlayPanelPositions: OverlayPanelPositions;
}

// First launch, before settings.json exists: pick the closest supported
// locale to the OS's own language instead of always defaulting to English.
function systemDefaultLocale(): string {
  const primary = app.getLocale().split(/[-_]/)[0]?.toLowerCase() ?? "";
  return isLocale(primary) ? primary : "en";
}

function defaultPersisted(): PersistedSettings {
  return {
    overlayModules: DEFAULT_OVERLAY_MODULES,
    locale: systemDefaultLocale(),
    leagueInstallDir: null,
    autoLaunchConfigured: false,
    flashSide: "left",
    abilityBarCalibration: null,
    overlayPanelPositions: DEFAULT_PANEL_POSITIONS,
  };
}

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function parseScreenPoint(v: unknown): ScreenPoint | null {
  if (typeof v !== "object" || v === null) return null;
  const { x, y } = v as Record<string, unknown>;
  return typeof x === "number" && typeof y === "number" ? { x, y } : null;
}

function readPersisted(): PersistedSettings {
  const fallback = defaultPersisted();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(settingsFilePath(), "utf-8"));
  } catch {
    return fallback;
  }

  // Tolerant merge: unknown or missing fields fall back individually
  // instead of discarding the whole file.
  const rawModules = parsed.overlayModules as Record<string, unknown> | undefined;
  const overlayModules: OverlayModules = {
    csPerMinute: typeof rawModules?.csPerMinute === "boolean" ? rawModules.csPerMinute : DEFAULT_OVERLAY_MODULES.csPerMinute,
    goldDiff: typeof rawModules?.goldDiff === "boolean" ? rawModules.goldDiff : DEFAULT_OVERLAY_MODULES.goldDiff,
    skillOrder: typeof rawModules?.skillOrder === "boolean" ? rawModules.skillOrder : DEFAULT_OVERLAY_MODULES.skillOrder,
    autoBuild: typeof rawModules?.autoBuild === "boolean" ? rawModules.autoBuild : DEFAULT_OVERLAY_MODULES.autoBuild,
  };
  const locale = typeof parsed.locale === "string" && isLocale(parsed.locale) ? parsed.locale : fallback.locale;
  const autoLaunchConfigured = typeof parsed.autoLaunchConfigured === "boolean" ? parsed.autoLaunchConfigured : false;
  const flashSide: FlashSide = parsed.flashSide === "left" || parsed.flashSide === "right" ? parsed.flashSide : fallback.flashSide;
  const rawCalibration = parsed.abilityBarCalibration as Record<string, unknown> | null | undefined;
  let abilityBarCalibration: AbilityBarCalibration | null = null;
  if (rawCalibration) {
    const q = parseScreenPoint(rawCalibration.q);
    const w = parseScreenPoint(rawCalibration.w);
    const e = parseScreenPoint(rawCalibration.e);
    if (q && w && e) abilityBarCalibration = { q, w, e };
  }
  const rawPositions = parsed.overlayPanelPositions as Record<string, unknown> | undefined;
  const overlayPanelPositions: OverlayPanelPositions = {
    gold: parseScreenPoint(rawPositions?.gold),
    objectives: parseScreenPoint(rawPositions?.objectives),
    csPerMin: parseScreenPoint(rawPositions?.csPerMin),
    // Un `enemySpells` guardado por versiones anteriores se ignora: ese
    // panel se retiro el 2026-09-12 por las reglas de Riot.
  };

  const leagueInstallDir = typeof parsed.leagueInstallDir === "string" && parsed.leagueInstallDir.length > 0 ? parsed.leagueInstallDir : null;

  return { overlayModules, locale, leagueInstallDir, autoLaunchConfigured, flashSide, abilityBarCalibration, overlayPanelPositions };
}

function writePersisted(next: PersistedSettings): void {
  // Best-effort, like the original — a failed write just means the change
  // doesn't survive restart.
  try {
    writeFileAtomic(settingsFilePath(), JSON.stringify(next));
  } catch {
    // ignore
  }
}

function autoLaunchEnabled(): boolean {
  return app.getLoginItemSettings({ args: ["--background"] }).openAtLogin;
}

function setAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, args: enabled ? ["--background"] : [] });
}

function currentSettings(): AppSettings {
  const persisted = readPersisted();
  return {
    autoLaunch: autoLaunchEnabled(),
    overlayModules: persisted.overlayModules,
    locale: persisted.locale,
    leagueInstallDir: persisted.leagueInstallDir,
    flashSide: persisted.flashSide,
    abilityBarCalibration: persisted.abilityBarCalibration,
    overlayPanelPositions: persisted.overlayPanelPositions,
  };
}

// First launch only: register auto-launch by default (the default this
// kind of companion app ships with). Once the marker is set — here or by
// the user's own toggle — this never touches the registration again, so
// turning it off in Settings sticks across restarts.
export function ensureDefaultAutoLaunch(): void {
  const persisted = readPersisted();
  if (persisted.autoLaunchConfigured) return;
  setAutoLaunch(true);
  writePersisted({ ...persisted, autoLaunchConfigured: true });
}

// For apply_recommended_build — which slot a recommended Flash lands in
// isn't exposed as its own command, just read alongside applying.
export function currentFlashSide(): FlashSide {
  return readPersisted().flashSide;
}

export function settingsGet(): AppSettings {
  return currentSettings();
}

export function settingsSetAutoLaunch(enabled: boolean): AppSettings {
  setAutoLaunch(enabled);
  const persisted = readPersisted();
  if (!persisted.autoLaunchConfigured) {
    writePersisted({ ...persisted, autoLaunchConfigured: true });
  }
  return currentSettings();
}

// Lo que llega por IPC se valida aqui campo a campo (APP-6, ronda 20): el
// proceso principal no confia en la forma que le mande el renderer, igual
// que readPersisted no confia en lo que haya en el fichero.
const MODULE_KEYS: (keyof OverlayModules)[] = ["csPerMinute", "goldDiff", "skillOrder", "autoBuild"];

export function settingsSetOverlayModules(modules: unknown): AppSettings {
  const persisted = readPersisted();
  const overlayModules = { ...persisted.overlayModules };
  if (typeof modules === "object" && modules !== null) {
    for (const key of MODULE_KEYS) {
      const value = (modules as Record<string, unknown>)[key];
      if (typeof value === "boolean") overlayModules[key] = value;
    }
  }
  writePersisted({ ...persisted, overlayModules });
  return currentSettings();
}

export function settingsSetLeagueInstallDir(dir: unknown): AppSettings {
  const leagueInstallDir = typeof dir === "string" && dir.trim().length > 0 && dir.length < 1024 ? dir.trim() : null;
  writePersisted({ ...readPersisted(), leagueInstallDir });
  return currentSettings();
}

export function currentLeagueInstallDir(): string | null {
  return readPersisted().leagueInstallDir;
}

export function settingsSetLocale(locale: string): AppSettings {
  if (isLocale(locale)) {
    writePersisted({ ...readPersisted(), locale });
  }
  return currentSettings();
}

export function settingsSetFlashSide(side: string): AppSettings {
  if (side === "left" || side === "right") {
    writePersisted({ ...readPersisted(), flashSide: side });
  }
  return currentSettings();
}

export function settingsSetAbilityBarCalibration(calibration: unknown): AppSettings {
  const raw = typeof calibration === "object" && calibration !== null ? (calibration as Record<string, unknown>) : null;
  const q = parseScreenPoint(raw?.q);
  const w = parseScreenPoint(raw?.w);
  const e = parseScreenPoint(raw?.e);
  if (q && w && e) writePersisted({ ...readPersisted(), abilityBarCalibration: { q, w, e } });
  return currentSettings();
}

export function settingsSetOverlayPanelPosition(panel: unknown, position: unknown): AppSettings {
  const persisted = readPersisted();
  const overlayPanelPositions = { ...persisted.overlayPanelPositions };
  const point = parseScreenPoint(position);
  if (point && (panel === "gold" || panel === "objectives" || panel === "csPerMin")) {
    overlayPanelPositions[panel] = point;
  }
  writePersisted({ ...persisted, overlayPanelPositions });
  return currentSettings();
}
