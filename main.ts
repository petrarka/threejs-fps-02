// Emberline — dossier builder for the make.fun "threejs-fps-02" bounty.
// `node main.ts` (Node 22+) copies the playable tree (game/ + screenshots/)
// into the output directory and writes dossier.json describing the game.
// Standard library only; no build step, no network.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function copyTree(rel: string): void {
  const from = join(root, rel);
  if (!existsSync(from)) return;
  cpSync(from, join(outDir, rel), { recursive: true });
}

function listFiles(dir: string, base = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...listFiles(full, base));
    else found.push(full.slice(base.length + 1));
  }
  return found.sort();
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
copyTree('game');
copyTree('screenshots');

const dossier = {
  name: 'Emberline',
  bounty: 'make.fun threejs-fps-02',
  kind: 'Round-based tactical single-player FPS (Counter-Strike-style, original IP)',
  engine: {
    renderer: 'three.js 0.187.0, vendored at game/vendor/three/ (ES modules, import map)',
    build: 'none — plain ES modules loaded by game/index.html',
    network: 'none at runtime — every asset is a local file or generated at boot',
    assets: 'procedural canvas textures only; all sound is WebAudio-synthesized',
  },
  play: {
    serve: 'node serve.ts → http://localhost:8080',
    modes: ['start', 'play', 'plant', 'end', 'bots', 'buy', 'match', 'nade', 'radar'],
    modeUrl: 'game/index.html?shot=<mode>&seed=1 (deterministic staged frames)',
  },
  match: {
    teams: 'you + 3 AI crew mates (Tally, Mason, Brack) vs 9 named AI guards',
    winCondition: 'first to 8 rounds',
    roundWin: 'elimination, or the Ember objective: plant at site A/B and defend the fuse; guards defuse',
    timeExpiry: 'no plant before the clock runs out is an honest round loss for the crew',
    noRespawn: 'no mid-round respawns; dead is dead until the next round',
  },
  controls: {
    mouse: 'look · LMB fire · RMB Longsight scope (FOV 74→32, low sensitivity, sway)',
    wasd: 'move · Shift walk-quiet · Space jump',
    keys: '1/2/3 weapons · R reload · G FIREPOT grenade · E hold plant (charge carrier) · B buy menu',
    buyMenu: 'during buy time: 1 vest · 2 helm · 3 ammo · 4 HE · 5 stim · 6 COIL-9 · 7 Longsight',
  },
  economy: {
    wallet: 'money carries between rounds',
    income: 'kill +$300 · round win +$2500 · round loss +$1500 · plant +$400 · survival bonus',
    slots: ['Kiln Vest $650', 'Lamp Helm $350', 'Ash Ammo $200', 'FIREPOT HE $300', 'Ember Stim $400'],
    weapons: ['COIL-9 SMG $1400', 'Longsight scoped rifle $2400', 'SPARK-6 sidearm (default)'],
  },
  gunplay: {
    hitscan: 'true hitscan with tracers and muzzle flash',
    hitboxes: 'capsule hitboxes: head sphere + body capsule, headshot bonus x4',
    recoil: 'fixed per-weapon recoil patterns + recoil/spread heat model; accuracy beats speed',
    grenade: 'FIREPOT HE: throw arc, clay bounce, fuse, kilnwash burst with area denial',
  },
  ai: {
    nav: 'A* over a walkability grid, binary-heap open set, string pulling; shared by guards and mates',
    hearing: 'ear-to-source raycast wall muffling; guards investigate noise and converge on the planted charge',
    mates: 'Tally entries, Mason carries and plants the Ember on a quiet lane, Brack anchors your back',
    board: 'round board shows per-guard and per-mate K/D/DMG',
  },
  hud: ['radar', 'alive-pip crew strip', 'money', 'round score + clock', 'quiet key-hint line', 'kick-table roster naming every guard with K/D/DMG'],
  map: 'Emberline — canvas-skinned kiln yard, bomb sites A and B, ember lamp light pools',
  modules: {
    'main.js': 'boot, the loop, and the deterministic ?shot= staging (seeded RNG, fixed sim ticks, frozen frame)',
    'world.js': 'the yard: kiln, walls, crates, lamps, site letters; colliders and every raycast',
    'nav.js': 'A* walkability grid, binary-heap open set, string pulling — shared by guards and mates',
    'hearing.js': 'noise bus with ear-to-source raycast wall muffling',
    'player.js': 'first-person controller, viewmodel, scope, stims, plant channel',
    'bots.js': 'nine named guards: posts, vision, hearing, aimed burst fire, converge and defuse',
    'mates.js': 'Tally entries, Mason carries and plants on the quiet lane, Brack anchors',
    'weapon.js': 'fixed recoil patterns, heat/spread model, hitscan, tracers, damage',
    'grenade.js': 'FIREPOT: throw arc, clay bounce, fuse, kilnwash burst area denial',
    'bomb.js': 'the Ember charge: carry, drop, plant, ticking fuse, defuse, detonation',
    'economy.js': 'wallet, round awards, the five-slot buy menu plus two weapons',
    'rounds.js': 'the referee: buy time, live clock, honest time-expiry losses, first to 8',
    'targets.js': 'capsule hitboxes (head sphere + body) and hitscan resolution',
    'radar.js': 'yard scan: walls, sites, crew pips, seen-or-heard guard blips',
    'hud.js': 'DOM: clock, score, roster kick-table, pips, hints, boards, buy menu',
    'sound.js': 'every sound WebAudio-synthesized at runtime — no audio files',
    'palette.js': 'the Emberline look: canvas-painted textures, one palette',
    'input.js': 'pointer lock, keys, mouse deltas',
    'config.js': 'every tuning number, the cast, and the seeded RNG',
  },
  handedIn: {
    gameFiles: listFiles(join(root, 'game')).length,
    srcModules: listFiles(join(root, 'game/src')).length,
    shots: existsSync(join(root, 'screenshots'))
      ? listFiles(join(root, 'screenshots')).map((f) => `${f} (${statSync(join(root, 'screenshots', f)).size} bytes)`)
      : [],
    renderCheck: 'zsh render_shots.sh renders all nine ?shot= modes via headless Chrome; all nine verified readable this session',
  },
  files: {
    game: listFiles(join(root, 'game')),
    screenshots: existsSync(join(root, 'screenshots')) ? listFiles(join(root, 'screenshots')) : [],
  },
};

writeFileSync(join(outDir, 'dossier.json'), JSON.stringify(dossier, null, 2) + '\n');
console.log(`dossier written to ${join(outDir, 'dossier.json')}`);
console.log(`game files: ${dossier.files.game.length}, screenshots: ${dossier.files.screenshots.length}`);
