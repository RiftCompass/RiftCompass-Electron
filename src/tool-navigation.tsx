import { createContext, useContext } from "react";
import type { ToolId } from "./tool-meta";

// One tool sending the user to another one, with a champion already picked.
// The web does this with a link (Meta Tier List's chips are anchors to
// /champions/<champion>); this app has no URLs, so the same jump needs a
// thread through MainView, which renders every tool generically with no
// props. Kept as narrow as OpenAccountPanelContext next door: open a tool,
// optionally on a champion (and the position and rank it was being looked
// at in, the same query the web's chips carry), and nothing else.
export interface ToolNavigationRequest {
  toolId: ToolId;
  /** Data Dragon / crawler internal champion id ("Ahri"), when the jump is about one champion. */
  championInternalId?: string;
  /** Crawler role ("TOP", "UTILITY"...) the champion was being looked at in. */
  role?: string;
  /** Rank tier ("CHALLENGER", "GOLD"...) the champion was being looked at in. */
  rank?: string;
}

export type RequestedChampion = Pick<ToolNavigationRequest, "championInternalId" | "role" | "rank"> & {
  championInternalId: string;
};

const OpenToolContext = createContext<((request: ToolNavigationRequest) => void) | null>(null);
const RequestedChampionContext = createContext<RequestedChampion | null>(null);

export const OpenToolProvider = OpenToolContext.Provider;
export const RequestedChampionProvider = RequestedChampionContext.Provider;

export function useOpenTool(): ((request: ToolNavigationRequest) => void) | null {
  return useContext(OpenToolContext);
}

/** The champion (and position/rank) the tool was opened on, if it was opened from another tool. */
export function useRequestedChampion(): RequestedChampion | null {
  return useContext(RequestedChampionContext);
}
