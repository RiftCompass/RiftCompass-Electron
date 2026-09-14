# RiftCompass desktop

The Windows companion app for [riftcompass.com](https://riftcompass.com): the
same free toolkit and player profiles as the website, plus what only a desktop
app can do with the League of Legends client running next to it: a draft
companion in champion select (champion suggestions from real matchup data,
runes, summoner spells and an item set imported into the client with one
click), a post-game report, and an in-game overlay (gold per lane, objective
timers, CS/min, skill order).

Everything the app reads from your League client stays on your PC. The only
server it talks to is riftcompass.com's public API.

## Install

Download `RiftCompass-Setup.exe` from the
[latest release](https://github.com/RiftCompass/RiftCompass-Electron/releases/latest)
(or from the website). The installer isn't code-signed yet, so Windows
SmartScreen shows a warning the first time: "More info → Run anyway". The app
updates itself from GitHub Releases. What changed in each version is in
[CHANGELOG.md](CHANGELOG.md).

## Build it yourself

```
npm install
npm run dev          # Vite + Electron, against riftcompass.com
npm run typecheck    # tsc for renderer and main process, plus the secrets check
npm test
npm run dist         # NSIS installer in release/
```

Node 22+ and Windows. `CLAUDE.md` is the engineering guide (architecture,
security model, League client integration, Overwolf overlay).

## Reporting a problem

Open an issue on this repository or write to riftcompass@gmail.com. For an
in-game problem, say which League patch and which game mode.

## Legal

MIT licensed (see `LICENSE`). RiftCompass isn't endorsed by Riot Games and
doesn't reflect the views or opinions of Riot Games or anyone officially
involved in producing or managing Riot Games properties. Riot Games and all
associated properties are trademarks or registered trademarks of Riot Games,
Inc. The in-game overlay follows Riot's third-party application policy: no
enemy timers, no enemy status notifications.
