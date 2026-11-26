# Langit Nusantara — Sky Courier

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/pradan999/best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/pradan999/best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

A complete, original flight game that plays offline in a desktop browser:
fly a little red-and-white prop plane (PK-LNG) over an Indonesian
archipelago — sea, islands, a volcano, three airstrips — in a chase view
with a full HUD (speed and altitude tapes, compass, attitude ball,
throttle, fuel, damage, mission panel).

## The three sorties

1. **Cincin Langit (Ring Run)** — thread 6 glowing rings over the sea and
   islands, fast and clean, before the fuel runs out.
2. **Kurir Kepulauan (Island Courier)** — take off from the home strip,
   land on two island strips and deliver the cargo.
3. **Senja di Landasan (Sunset Landing)** — one sunset approach: gear down,
   flaps down, touch down as softly as you can.

## How to fly

- **↑ / ↓** pitch, **← / →** bank and turn
- **Shift / Ctrl** throttle up / down, **F** flaps, **G** landing gear,
  **B** brakes, **P** pause, **M** mute, **R** restart, **Esc** menu
- Land with the gear down, gently, and lined up with the runway. Running
  out of fuel means gliding until you land — or ditch.

## How to play

No build step, no network: serve `game/` with any static server
(`node serve.ts` serves it on http://localhost:8080) and open
`game/index.html` in desktop Chrome. Every sound is synthesised with
WebAudio; every pixel is drawn on a 2D canvas.

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to
  `/output` and writes `/output/dossier.json`
- `game/src/config.js` — all tunables, missions, rings, strips, islands
- `game/src/world.js` — terrain height, camera projection, clouds
- `game/src/flight.js` — the flight model (throttle, lift, stall, fuel)
- `game/src/missions.js` — objectives and scoring
- `game/src/render.js` — sky, terrain mesh, runways, rings, aircraft, HUD
- `game/src/audio.js` — synthesised engine, wind, chimes
- `game/src/input.js` — keyboard and mouse
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=…`)
- `game/src/main.js` — game loop and state machine
- `vendor/makefun-game.ts` — the kit's library, unchanged

## License

MIT — see `LICENSE`.
