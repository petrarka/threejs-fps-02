[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/petrarka/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/petrarka/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Entry for the [make.fun “Make the best three.js tactical FPS” bounty](https://make.fun/bounty/threejs-fps-02) — $1,000 in USDC.

# threejs-fps-02 — Emberline

Round-based tactical single-player FPS in the browser (three.js 0.187.0, ES
modules, no build step, no network). Two teams of bots+you, rounds (first to
eight) won by elimination or the Ember objective (plant/defuse), money between
rounds, a five-slot buy menu (vest, helm, ammo, HE, stim), three weapons with
fixed per-weapon recoil patterns and a grenade, recoil/spread heat model,
headshot bonus, capsule hitboxes, and a nine-guard crew that walks A* routes,
hears gunfire through hearing.js (radius reach with honest wall muffling — an
ear-to-source raycast, so a kiln between you and a guard halves the noise),
investigates noise, converges on the charge and answers with
true hitscan rounds (head sphere + body capsule tests, tracers). The FIREPOT
HE lives in its own grenade.js — throw arc, clay bounce, fuse and kilnwash
burst. You never run
alone: three crew mates share the same A* grid and physics — Tally entries,
Mason carries and plants the Ember on a quiet lane, Brack anchors your back —
they see, fight and die beside you, ring the ticking charge and show their
K/D/DMG on the round board. The Longsight scopes with the right mouse
(FOV 74→32, low-sensitivity overlay). Radar HUD, alive-pip crew strip,
WebAudio-synthesized sound. All names, map
("Emberline"), palette and geometry are original.

Play: `node serve.ts` (or any static server) → open `game/` in desktop Chrome.
Deterministic screenshot modes: `game/index.html?shot=start|play|plant|end|bots|buy|match|nade|radar`.

Dossier build: `MAKEFUN_OUTPUT_DIR=out node main.ts` (Node 22+).
MIT License.
