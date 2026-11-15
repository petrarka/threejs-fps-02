// A working threejs-fps-02 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files the browser loads as ES modules with three.js from an import
// map, and the program hands it in. It copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library. The game is "Emberline": a round-based tactical FPS on a dusk kiln-yard. v4 adds a
// nine-guard hitscan squad that navigates by A* and hears every shot. v5 puts a crew of three
// mates beside you — A* follow, an autonomous plant on a site, and honest hitscan team
// firefights — and gives the Longsight a real scope (right mouse) that pulls the FOV in. v6 is
// the CS loop made honest: a live round clock on the HUD (stall it out and the round is lost),
// wardens who stay down until the round turns over so elimination wins, a shop that actually
// sells guns (the COIL-9 SMG and the scoped Longsight are bought, not issued), and a yard that
// reads at a glance — procedural brick, panel seams, ground plates and painted site letters
// under a brighter dusk. v7 gives the systems their own organs and the scoreboard
// its names: the FIREPOT HE lives in grenade.js (throw, fuse, burst), guard hearing
// lives in hearing.js with real wall muffling (an ear-to-source raycast — noise
// behind brick carries less than half as far), the HUD keeps one quiet line of key
// hints (G FRAG · E PLANT · B SUPPLY · M MUTE), and the round-end kick-table reads
// like a roster: your K/D/DMG, the crew's, and one K · DMG · UP/DOWN row per named
// guard. Put your PNG
// or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// v6 in short: the round runs on a live clock (stall out and it is a loss), wardens who go
// down stay down until the round turns over so clearing the crew wins the round, and the yard
// shop sells the guns — the COIL-9 SMG and the scoped Longsight are bought, never issued.
// v7 in short: grenade.js owns the firepot, hearing.js owns the ears (walls muffle), the
// HUD hints its keys in one line, and the kick-table names every guard with his K/DMG.
//
// The dossier is assembled by two deterministic runs (out and out2) whose trees must diff clean.
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all: game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);