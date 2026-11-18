// Solmar Heat — hand-in program for the gta6-01 entry (Node 22, stdlib only).
// The game itself is the static site in game/ (game/index.html plus its ES
// modules, no build step, no network). This program copies game/ and
// screenshots/ into the output directory and writes dossier.json there using
// buildDossier from the vendored kit library, exactly as the gate expects.
// Run locally with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR stands in for /output outside the grader.)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps mirror the scorer's gate so a local run refuses what the gate refuses:
// at most 4 screenshots of 256 KiB each, game/ at most 993 entries and 48 MiB,
// no game/ path over 1000 bytes, dossier text capped at 160 KiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log('Solmar Heat: game/ + screenshots/ copied, dossier written to', out);
