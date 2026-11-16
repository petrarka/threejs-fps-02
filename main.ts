// make.fun threejs-fps-02 entry — "Emberline", a round-based tactical
// single-player FPS in plain ES modules (three.js 0.187.0 vendored under
// game/vendor, no build step, no network at runtime). This Node program is
// the hand-in: it copies game/ and screenshots/ from beside this file into
// the output directory and writes dossier.json, the summary the judge reads,
// with the vendored make.fun library.
//
// The game in one breath: you and three AI crew mates (Tally, Mason, Brack)
// push a dusk kiln yard held by nine named guards. Rounds are won by
// elimination or by the Ember objective — hold E on a site to plant, defend
// the 40-second fuse, or defuse with E. Money flows between rounds into a
// five-slot field kit (vest, helm, ammo, FIREPOT HE, stim) and a two-gun
// primary rack (COIL-9 SMG, scoped Longsight — RMB pulls FOV 74 down to 32
// with low-sensitivity aim). Every combatant routes over one shared A* nav
// grid, hears shots through real wall muffling (hearing.js runs an
// ear-to-source raycast; heavy kiln masonry cuts a noise's reach to a fifth),
// and shoots true hitscan rounds against head-sphere + body-capsule hitboxes
// with fixed per-weapon recoil patterns and a heat-driven spread model.
// All audio is WebAudio-synthesized; all textures are canvas-painted.
//
// Screenshot scenes are deterministic: serve statically and open
// game/index.html?shot=start|play|plant|end|bots|buy|match|nade|radar.
// Serve locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Two runs must produce identical trees — the build is deterministic.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Dossier caps mirror the scorer's reference gate: text payload size, the
// screenshot count/size budget, and the game/ tree's file and byte ceilings
// (game/ counts beside /output's own cap, with screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

// The verification pass taught this entrypoint to say what it handed in, so a
// headless run leaves evidence of the tree it built, not just a silent exit.
function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return total;
}
const gameFiles = countFiles(join(out, 'game'));
const shotFiles = readdirSync(join(out, 'screenshots')).length;
console.log(`dossier written to ${join(out, 'dossier.json')} (game: ${gameFiles} files, screenshots: ${shotFiles})`);
