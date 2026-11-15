# threejs-fps-02 — Emberline

Round-based tactical single-player FPS in the browser (three.js 0.187.0, ES
modules, no build step, no network). Two teams of bots+you, short rounds won by
elimination or the Ember objective (plant/defuse), money between rounds, a buy
menu, three weapons and a grenade, recoil/spread heat model, headshot bonus,
route-following bots, radar HUD, WebAudio-synthesized sound. All names, map
("Emberline"), palette and geometry are original.

Play: `node serve.ts` (or any static server) → open `game/` in desktop Chrome.
Deterministic screenshot modes: `game/index.html?shot=start|play|plant|end|bots`.

Dossier build: `MAKEFUN_OUTPUT_DIR=out node main.ts` (Node 22+).
MIT License.
