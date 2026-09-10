import { MainView } from "./MainView";
import { OverlayView } from "./OverlayView";
import { ChampSelectView } from "./champselect/ChampSelectView";
import { I18nProvider } from "./i18n";

// Both windows load the same renderer bundle — main/windows.ts tells them
// apart with a `?view=` query param on the URL each one loads. Both also
// need the locale (the overlay HUD is user-facing too), so I18nProvider
// wraps whichever view renders rather than living inside just one of them.
export function App() {
  const view = new URLSearchParams(window.location.search).get("view");
  return (
    <I18nProvider>
      {view === "overlay" ? <OverlayView /> : view === "champselect" ? <ChampSelectView /> : <MainView />}
    </I18nProvider>
  );
}
