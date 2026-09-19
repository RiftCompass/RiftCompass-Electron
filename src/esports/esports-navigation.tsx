import { createContext, useContext } from "react";

// Another screen sending the user into the esports section on a given
// series (Champion Builds' "how the pros played it" lists the games it
// counted; on the web each one is a link to /esports/<league>/<series>).
// Same shape as tool-navigation.tsx: MainView provides the function, the
// esports screen opens on that view with "back" leading to the leagues.
export type EsportsEntry = { kind: "match"; id: string } | { kind: "player"; slug: string };

const OpenEsportsContext = createContext<((entry: EsportsEntry) => void) | null>(null);

export const OpenEsportsProvider = OpenEsportsContext.Provider;

export function useOpenEsports(): ((entry: EsportsEntry) => void) | null {
  return useContext(OpenEsportsContext);
}
