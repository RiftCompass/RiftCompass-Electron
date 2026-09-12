// Electron-specific CSS used for the frameless title bar's drag region
// (MainView.tsx/WindowControls.tsx) — not part of React's built-in
// CSSProperties (a standard DOM type), so it's added here.
declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag";
  }
}

// The window.riftcompass API surface, implemented by src/bridge/index.ts.
export interface OverlayModules {
  csPerMinute: boolean;
  goldDiff: boolean;
  skillOrder: boolean;
  autoBuild: boolean;
}

export type SupportedLocale = "en" | "es" | "fr" | "de";
export type FlashSide = "left" | "right";

// Normalized (0-1) screen-fraction position of each ability icon in
// League's own real in-game HUD, saved once by the user via the
// calibration flow (MainView.tsx's "Calibrar" button + OverlayView.tsx's
// click-to-mark) — there's no official API exposing this, see
// docs/overlay-research.md. Never guessed/defaulted: null until the user
// actually calibrates.
export interface AbilityBarCalibration {
  q: { x: number; y: number };
  w: { x: number; y: number };
  e: { x: number; y: number };
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export type OverlayPanelKey = "gold" | "objectives" | "csPerMin";

// Where the player dragged each draggable overlay panel to, normalized
// (0-1 of the overlay window, same convention as AbilityBarCalibration) —
// null until the panel has been dragged at least once, meaning "use its
// default corner".
export interface OverlayPanelPositions {
  gold: ScreenPoint | null;
  objectives: ScreenPoint | null;
  csPerMin: ScreenPoint | null;
}

export interface LcuIdentity {
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  // Already fetched server-side alongside the rest of this identity (the
  // LCU's current-summoner response) — forwarded for the tools-home
  // header chip (MainView.tsx) so it doesn't need a second round-trip.
  profileIconId: number;
  // The League client's own display locale (e.g. "es_ES") — Live Client
  // Data reports bot-controlled champion names in this locale rather
  // than Data Dragon's English internal id, so OverlayView.tsx uses it to
  // fetch a matching localized champion name lookup.
  gameClientLocale?: string;
}

export interface AppSettings {
  autoLaunch: boolean;
  overlayModules: OverlayModules;
  locale: SupportedLocale;
  flashSide: FlashSide;
  abilityBarCalibration: AbilityBarCalibration | null;
  overlayPanelPositions: OverlayPanelPositions;
}

export interface AccountUser {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  /** Falso hasta abrir el enlace del correo: se puede entrar, pero no guardar (la API contesta 403 emailNotVerified). Ausente en sesiones guardadas antes del 2026-09-12. */
  emailVerified?: boolean;
}

export type LoginResult = { ok: true; user: AccountUser } | { ok: false; error: string };

export interface SavedProfileRank {
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  recentResult: "win" | "loss" | null;
  lpTrend: number[];
}

export interface SavedProfileWithRank {
  id: string;
  platform: string;
  gameName: string;
  tagLine: string;
  folderId: string;
  rank: SavedProfileRank | null;
}

// Backend-synced (riftcompass.com's saved_profile_folders) —
// same real data the web's own ProfilePanel reads/writes. isDefault marks
// the one folder that always exists, is renameable, and can't be deleted.
export interface SavedProfileFolder {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface SavedProfilesPayload {
  folders: SavedProfileFolder[];
  profiles: SavedProfileWithRank[];
}

export type UpdateUsernameResult = { ok: true; user: AccountUser } | { ok: false; error: string };

export type FolderActionResult = ({ ok: true } & SavedProfilesPayload) | { ok: false; error: string };

export type ToggleSavedProfileResult =
  | ({ ok: true; saved: boolean } & SavedProfilesPayload)
  | { ok: false; error: string };

// Backend-synced (riftcompass.com's saved_tier_lists) — same
// real data the web's own Tier List "Save tier list"/"My tier lists" reads
// and writes. `board` is the tier-list board's own
// { [tier | "unranked"]: championId[] } shape.
export interface SavedTierList {
  id: string;
  name: string;
  board: Record<string, string[]>;
  createdAt: string;
}

export type SaveTierListResult = { ok: true; tierLists: SavedTierList[] } | { ok: false; error: string };

// Backend-synced (riftcompass.com's saved_drafts) — same real data as the
// web's own Draft Simulator save / "Mis drafts". `selections` is the
// champion-id sequence in DRAFT_STEPS order.
export interface SavedDraft {
  id: string;
  name: string;
  selections: string[];
  createdAt: string;
}

export type SaveDraftResult = { ok: true; drafts: SavedDraft[] } | { ok: false; error: string };

// Backend-synced (riftcompass.com's saved_maps) — same real data as the
// web's own Map Editor save / "Mis mapas". The list carries summaries;
// getSavedMap loads one map's full strokes + notes.
export interface SavedMapSummary {
  id: string;
  name: string;
  strokeCount: number;
  createdAt: string;
}

export type SaveMapResult = { ok: true; maps: SavedMapSummary[] } | { ok: false; error: string };

export type LoadMapResult = { ok: true; strokes: unknown[]; notes: string } | { ok: false; error: string };

// Backend-synced (riftcompass.com's saved_builds) — same real data as the
// web's own Gold Calculator save / "Mis builds". `items` is the six-slot
// item-id array; supportRole restores the mandatory support-slot rule.
export interface SavedBuild {
  id: string;
  name: string;
  items: string[];
  supportRole: boolean;
  createdAt: string;
}

export type SaveBuildResult = { ok: true; builds: SavedBuild[] } | { ok: false; error: string };

// A champion build (the Champion Builds tool): the web's own
// saved_champion_builds row, mirrored field for field so the app and the
// browser show the same build. `runes` is Riot's own perk-id shape, the
// same one the LCU takes when applying a page in champ select.
export interface ChampionBuildRunes {
  primaryStyleId: number;
  subStyleId: number;
  perk0: number;
  perk1: number;
  perk2: number;
  perk3: number;
  perk4: number;
  perk5: number;
  statPerk0: number;
  statPerk1: number;
  statPerk2: number;
}

export interface ChampionBuildSpells {
  spellLow: number;
  spellHigh: number;
}

export interface ChampionBuildInput {
  name: string;
  championName: string;
  role: string;
  items: string[];
  runes: ChampionBuildRunes | null;
  spells: ChampionBuildSpells | null;
  /** Order to max the basic abilities, as Riot skill slots: [1, 3, 2] = Q > E > W. */
  skillPriority: number[] | null;
  /** Optional level-by-level path, skill slots in level order. */
  skillOrder: number[] | null;
  source: "custom" | "crawler";
  sourcePatch: string | null;
  sourceRankTier: string | null;
  notes: string | null;
}

export interface SavedChampionBuild extends ChampionBuildInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type SaveChampionBuildResult =
  | { ok: true; builds: SavedChampionBuild[] }
  | { ok: false; error: string };

// La build de objetos que se deja puesta en la tienda del cliente como item
// set: con que salir, que completar y en que orden, y las alternativas.
// `itemIds` va EN ORDEN DE COMPRA (el primero es el primer objeto terminado),
// que es el dato que hace util al set.
// Mismo contrato que BuildParaSet en electron/itemSet.ts.
// Maestria del jugador con un campeon, leida del cliente de League. `points`
// es el acumulado de siempre y `level` el nivel de maestria; se guardan los dos
// porque miden cosas distintas: los puntos dicen cuanto lo ha jugado en total y
// el nivel es como el juego resume esa soltura.
export interface ChampionMasteryEntry {
  championId: number;
  points: number;
  level: number;
}

export interface RecommendedItemSet {
  championId: number;
  championName: string;
  role: string;
  startingItemIds: number[];
  itemIds: number[];
  situationalItemIds: number[];
  /** Título del set en la tienda: "RiftCompass · Jinx Bot", o el nombre de la build guardada. */
  titulo: string;
}


export interface RiftCompassApi {
  onLcuConnection: (cb: (status: "connected" | "disconnected") => void) => void;
  onPhase: (cb: (phase: string) => void) => void;
  onLcuIdentity: (cb: (identity: LcuIdentity | null) => void) => void;
  onChampSelectSession: (cb: (session: unknown) => void) => void;
  onLiveGameData: (cb: (data: unknown) => void) => void;
  onTabHeld: (cb: (held: boolean) => void) => void;
  onCalibrationStart: (cb: () => void) => void;
  /** Read-only LCU GET; the main process only serves the paths it allowlists. */
  lcuGet: <T = unknown>(path: string) => Promise<T>;
  setInteractive: (interactive: boolean) => void;
  // Ability-bar calibration: enterCalibration shows the overlay and makes
  // it fully interactive (not click-through) so the user can click their
  // real Q/W/E icons; the overlay itself calls setAbilityBarCalibration
  // once all three are marked, then exitCalibration to restore normal
  // click-through/visibility.
  enterCalibration: () => Promise<void>;
  exitCalibration: () => Promise<void>;
  setAbilityBarCalibration: (calibration: AbilityBarCalibration) => Promise<AppSettings>;
  // Persists where the player dragged a draggable overlay panel to (see
  // OverlayView.tsx's useDraggablePanel) — same normalized-point
  // convention as ability-bar calibration.
  setOverlayPanelPosition: (panel: OverlayPanelKey, position: ScreenPoint) => Promise<AppSettings>;
  importBuild: (championId: number) => Promise<{ ok: true; items: number[] } | { ok: false; reason: string }>;
  // `itemSet` es opcional: sin orden de compra conocido no se escribe ningun
  // item set, en vez de dejarle al jugador uno con los objetos en orden
  // arbitrario. `itemSetAplicado` dice si llego a escribirse, para que la UI
  // no prometa algo que no paso.
  applyRecommendedBuild: (
    perkIds: number[],
    primaryStyleId: number,
    subStyleId: number,
    spellLow: number,
    spellHigh: number,
    itemSet?: RecommendedItemSet,
  ) => Promise<{ ok: true; itemSetAplicado?: boolean } | { ok: false; reason: string }>;
  clearItemSets: () => Promise<{ ok: true; borrados: number } | { ok: false; reason: string }>;
  // Maestria del jugador con cada campeon, del propio cliente de League. Sin
  // cliente devuelve lista vacia, no error: la recomendacion sigue funcionando
  // con los otros dos senales, solo pierde este.
  getChampionMastery: () => Promise<{ ok: true; mastery: ChampionMasteryEntry[] }>;
  // Estado actual, para que una ventana recien abierta se pinte sin esperar al
  // siguiente evento del cliente. Ver champSelectSnapshot en gameConnection.ts.
  getChampSelectState: () => Promise<{ phase: string | null; session: unknown }>;
  getSettings: () => Promise<AppSettings>;
  setAutoLaunch: (enabled: boolean) => Promise<AppSettings>;
  setOverlayModules: (modules: Partial<OverlayModules>) => Promise<AppSettings>;
  setLocale: (locale: string) => Promise<AppSettings>;
  setFlashSide: (side: FlashSide) => Promise<AppSettings>;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  getSession: () => Promise<AccountUser | null>;
  getSavedProfiles: () => Promise<SavedProfilesPayload>;
  toggleSavedProfile: (platform: string, gameName: string, tagLine: string, puuid?: string) => Promise<ToggleSavedProfileResult>;
  updateUsername: (username: string) => Promise<UpdateUsernameResult>;
  createProfileFolder: (name: string) => Promise<FolderActionResult>;
  renameProfileFolder: (id: string, name: string) => Promise<FolderActionResult>;
  deleteProfileFolder: (id: string) => Promise<FolderActionResult>;
  setSavedProfileFolder: (profileId: string, folderId: string) => Promise<FolderActionResult>;
  getSavedTierLists: () => Promise<SavedTierList[]>;
  createTierList: (name: string, board: Record<string, string[]>) => Promise<SaveTierListResult>;
  deleteTierList: (id: string) => Promise<SaveTierListResult>;
  getSavedDrafts: () => Promise<SavedDraft[]>;
  createDraft: (name: string, selections: string[]) => Promise<SaveDraftResult>;
  deleteDraft: (id: string) => Promise<SaveDraftResult>;
  getSavedMaps: () => Promise<SavedMapSummary[]>;
  getSavedMap: (id: string) => Promise<LoadMapResult>;
  createMap: (name: string, strokes: unknown[], notes: string) => Promise<SaveMapResult>;
  deleteMap: (id: string) => Promise<SaveMapResult>;
  getSavedBuilds: () => Promise<SavedBuild[]>;
  createBuild: (name: string, items: string[], supportRole: boolean) => Promise<SaveBuildResult>;
  deleteBuild: (id: string) => Promise<SaveBuildResult>;
  getSavedChampionBuilds: () => Promise<SavedChampionBuild[]>;
  /** Perfil con `?force=true` y la sesión de la app: la web solo fuerza el refresco con sesión. */
  fetchProfileForced: (
    platform: string,
    gameName: string,
    tagLine: string,
  ) => Promise<{ status: number; body: Record<string, unknown> | null } | { error: "network" }>;
  createChampionBuild: (build: ChampionBuildInput) => Promise<SaveChampionBuildResult>;
  updateChampionBuild: (id: string, build: ChampionBuildInput) => Promise<SaveChampionBuildResult>;
  deleteChampionBuild: (id: string) => Promise<SaveChampionBuildResult>;
  openExternal: (url: string) => Promise<void>;
}

// Frameless-window chrome (WindowControls.tsx) — separate from
// RiftCompassApi because it's OS window plumbing, not an app/game
// feature, and (unlike RiftCompassApi) genuinely has nothing to fall back
// to outside Electron: WindowControls renders nothing when it's absent.
export interface RiftCompassWindowApi {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  // Returns an unsubscribe function.
  onResized: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    riftcompass: RiftCompassApi;
    riftcompassWindow?: RiftCompassWindowApi;
  }
}
