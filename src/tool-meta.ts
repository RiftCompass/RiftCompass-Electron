import {
  Brain,
  Coins,
  Crown,
  Scroll,
  Stack,
  ListNumbers,
  MapTrifold as MapIcon,
  Sword,
  Timer,
  Tree,
  Users,
  Waves,
  type Icon,
} from "@phosphor-icons/react";

// Same tool set and icon choices as riftcompass.com (src/lib/tool-meta.tsx
// in the main repo) — kept in sync by hand since this is a separate
// codebase. Title/description come from the i18n catalog now (ToolsIndex.*
// in i18n/messages/*.ts), not hardcoded here — `id` doubles as the
// translation key. `native` marks which ones are actually built in this
// app yet; the rest show honestly as "not built yet" instead of a broken/
// fake link.
export type ToolId =
  | "goldCalculator"
  | "waveTimer"
  | "tierList"
  | "cooldowns"
  | "draft"
  | "map"
  | "personalityTest"
  | "jungleXp"
  | "championPool"
  | "metaTierList"
  | "championBuilds";

export interface ToolMeta {
  id: ToolId;
  icon: Icon;
  accent: string;
  native: boolean;
  // Translation key for the sentence under the tool's own title. The web
  // puts its `<Tool>.intro` there while this app was printing the short
  // card blurb from the tools grid, so the same tool introduced itself with
  // two different sentences. Every tool with an `.intro` in the catalog is
  // wired here (2026-09-12); the personality test and the champion pool
  // have no intro on the web either, so they keep the blurb on purpose.
  introKey?: string;
}

// Tool order must match the web's: this follows TOOL_ROUTES's own key
// order in the web repo (src/lib/tool-routes.ts), which is what that
// site's /tools grid actually iterates over.
export const TOOLS: ToolMeta[] = [
  { id: "tierList", icon: ListNumbers, accent: "#ffc857", native: true, introKey: "TierList.intro" },
  { id: "cooldowns", icon: Timer, accent: "#4d7fe8", native: true, introKey: "Cooldowns.intro" },
  { id: "draft", icon: Sword, accent: "#d6394a", native: true, introKey: "Draft.intro" },
  { id: "map", icon: MapIcon, accent: "#e63977", native: true, introKey: "MapEditor.intro" },
  { id: "goldCalculator", icon: Coins, accent: "#e0873f", native: true, introKey: "GoldCalculator.intro" },
  { id: "waveTimer", icon: Waves, accent: "#2bb8ad", native: true, introKey: "WaveTimer.intro" },
  { id: "personalityTest", icon: Brain, accent: "#7839ac", native: true },
  { id: "jungleXp", icon: Tree, accent: "#2f9d68", native: true, introKey: "JungleXpCalculator.intro" },
  { id: "championPool", icon: Stack, accent: "#6366d4", native: true },
  { id: "metaTierList", icon: Crown, accent: "#9aa5b1", native: true, introKey: "MetaTierList.intro" },
  // Same hue as the web's --gem-cyan, the twelfth tool's own color.
  { id: "championBuilds", icon: Scroll, accent: "#2f8fd0", native: true, introKey: "ChampionBuilds.intro" },
];

// Squad Synergy isn't a ToolId (it opens the duo-comparison view, not a
// tools/* route), so it can't live in TOOLS above. Its identity still has
// to match the web's, where the same tool is TOOL_ROUTES' `duo` entry: the
// name comes from the same `ToolsIndex.duo` key, the icon is the same two
// people, and the accent is the same hex as the web's gem-magenta
// (globals.css). Kept as a sibling constant rather than forced into
// ToolMeta/TOOLS, which are specifically the routes that mirror the web's
// TOOL_ROUTES order.
export const SQUAD_SYNERGY = { icon: Users, accent: "#c93a9e" } as const;
