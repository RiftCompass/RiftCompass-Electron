import { createContext, useContext } from "react";

// Tools are rendered generically by MainView (`<NativeView />`, no props), so
// a tool that needs to send the user to the account panel had no way to ask
// for it and could only describe where the button was. This is that one
// missing thread, kept deliberately narrow: opening the account panel, and
// nothing else.
const OpenAccountPanelContext = createContext<(() => void) | null>(null);

export const OpenAccountPanelProvider = OpenAccountPanelContext.Provider;

export function useOpenAccountPanel(): (() => void) | null {
  return useContext(OpenAccountPanelContext);
}
