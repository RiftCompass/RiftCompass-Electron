import { teamHue } from "./format";

// The colour each team's tag wears (TeamTag in EsportsView.tsx): the
// team's own brand colour when it is in this table, the hue hashed from
// its code otherwise. Copy of RiftCompass-Web/src/lib/esports/team-colors.ts:
// a change there is a change here. Only teams whose colours the project
// can vouch for; black-and-white brands get a light grey, a navy brand its
// brighter blue so it reads on the dark theme.
export const TEAM_BRAND_COLORS: Record<string, string> = {
  // LEC
  KC: "#2b5cd9",
  VIT: "#ffee00",
  G2: "#d4d4d4",
  NAVI: "#ffe100",
  MKOI: "#8b4de0",
  FNC: "#ff5900",
  SK: "#d4d4d4",
  // LCK
  T1: "#e4002b",
  GEN: "#b8955a",
  HLE: "#f37021",
  KT: "#c8102e",
  // LPL
  BLG: "#00a1d6",
  TES: "#e5322d",
  JDG: "#e1251b",
  LNG: "#2f6fe0",
  WBG: "#e0402f",
  IG: "#d4d4d4",
  // Americas
  FLY: "#00a35d",
  TL: "#1f5fd6",
  TLAW: "#1f5fd6",
  C9: "#00aeef",
  "100T": "#ea0a2a",
  PAIN: "#e01b3a",
  VKS: "#7a2fb5",
  // Asia-Pacific
  GAM: "#f5c400",
  PSG: "#2f5fd0",
};

export function teamBrandColor(code: string): string | null {
  return TEAM_BRAND_COLORS[code.toUpperCase()] ?? null;
}

export interface TeamTagColors {
  border: string;
  text: string;
  background: string;
}

// The three colours of a tag: from a brand hex, the text is the brand
// lifted towards white, the border the brand itself and the background a
// faint tint; without one, the tint recipe on the hashed hue.
export function teamTagColors(code: string): TeamTagColors {
  const brand = teamBrandColor(code);
  if (brand) {
    return {
      border: `color-mix(in srgb, ${brand} 70%, transparent)`,
      text: `color-mix(in oklch, ${brand} 55%, white)`,
      background: `color-mix(in srgb, ${brand} 16%, transparent)`,
    };
  }
  const hue = teamHue(code);
  return {
    border: `oklch(0.62 0.13 ${hue} / 0.55)`,
    text: `oklch(0.86 0.09 ${hue})`,
    background: `oklch(0.62 0.13 ${hue} / 0.12)`,
  };
}
