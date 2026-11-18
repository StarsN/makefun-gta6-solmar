// world.js — builds the seeded city of Solmar Bay: road grid, building blocks,
// the park, the beach and animated sea along the south edge, and the marina pier.
// World size is 3200 x 2400 world units. Roads run on a regular grid so traffic
// AI can follow them and turn at intersections.
import { makeRng, pick, randInt, randRange } from './rng.js';

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_EVERY = 400;      // spacing between road centrelines
export const ROAD_W = 92;           // full road width
export const SEA_Y = 2060;          // sea starts here, beach just above it

export function roadXs() { const xs = []; for (let x = 200; x < WORLD_W; x += ROAD_EVERY) xs.push(x); return xs; }
export function roadYs() { const ys = []; for (let y = 200; y < SEA_Y; y += ROAD_EVERY) ys.push(y); return ys; }
export function isOnRoad(x, y) {
  if (y >= SEA_Y) return false;
  for (const rx of roadXs()) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of roadYs()) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}
export function nearestRoadPoint(x, y) {
  let best = null, bd = 1e9;
  for (const rx of roadXs()) { const d = Math.abs(x - rx); if (d < bd) { bd = d; best = { x: rx, y }; } }
  for (const ry of roadYs()) { const d = Math.abs(y - ry); if (d < bd) { bd = d; best = { x, y: ry }; } }
  return best;
}

const ROOFS = ['#c96f4a', '#b8573f', '#d98e5f', '#a34d68', '#7a6a9e', '#4f7d8a', '#e0b36a', '#8a5a44'];
const CAR_COLORS = ['#e74c3c', '#f39c12', '#ecf0f1', '#3498db', '#2ecc71', '#9b59b6', '#f1c40f', '#1abc9c', '#e67e22', '#95a5a6', '#fd79a8', '#00cec9'];

export function buildWorld(seed) {
  const rng = makeRng(seed * 7919 + 13);
  const buildings = [];
  const xs = roadXs(), ys = roadYs();
  // Building blocks sit in the cells between roads.
  for (let cx = 0; cx < xs.length; cx++) for (let cy = 0; cy < ys.length; cy++) {
    const x0 = xs[cx] + ROAD_W / 2 + 14, x1 = (xs[cx + 1] ?? WORLD_W - 60) - ROAD_W / 2 - 14;
    const y0 = ys[cy] + ROAD_W / 2 + 14, y1 = (ys[cy + 1] ?? SEA_Y - 40) - ROAD_W / 2 - 14;
    if (x1 - x0 < 90 || y1 - y0 < 90) continue;
    if (cx === 3 && cy === 2) continue; // park cell
    const n = randInt(rng, 2, 4);
    for (let i = 0; i < n; i++) {
      const w = randRange(rng, 70, Math.max(80, (x1 - x0) / 2 - 10));
      const h = randRange(rng, 60, Math.max(70, (y1 - y0) / 2 - 10));
      buildings.push({
        x: randRange(rng, x0, Math.max(x0 + 1, x1 - w)), y: randRange(rng, y0, Math.max(y0 + 1, y1 - h)),
        w, h, color: pick(rng, ROOFS), floors: randInt(rng, 2, 9),
        ac: rng() < 0.7, tank: rng() < 0.3, sign: rng() < 0.25,
      });
    }
  }
  const palms = [];
  for (let i = 0; i < 130; i++) {
    const onBeach = i < 60;
    const x = randRange(rng, 30, WORLD_W - 30);
    const y = onBeach ? randRange(rng, SEA_Y - 130, SEA_Y - 15) : randRange(rng, 40, SEA_Y - 60);
    if (!onBeach && isOnRoad(x, y)) continue;
    palms.push({ x, y, s: randRange(rng, 0.8, 1.4), lean: randRange(rng, -0.2, 0.2) });
  }
  const park = { x: xs[3] + ROAD_W / 2 + 14, y: ys[2] + ROAD_W / 2 + 14, w: ROAD_EVERY - ROAD_W - 28, h: ROAD_EVERY - ROAD_W - 28 };
  const trees = [];
  for (let i = 0; i < 26; i++) trees.push({ x: randRange(rng, park.x + 20, park.x + park.w - 20), y: randRange(rng, park.y + 20, park.y + park.h - 20), s: randRange(rng, 0.9, 1.6) });
  const pier = { x: 1500, y: SEA_Y, w: 46, len: 260 };
  const landmarks = {
    garage: { x: 620, y: 640, label: 'Garage' },
    pierPickup: { x: pier.x + 23, y: SEA_Y + 190, label: 'Pier' },
    club: { x: 2620, y: 620, label: 'Club Solmar' },
    safehouse: { x: 260, y: 260, label: 'Safehouse' },
    bank: { x: 1820, y: 1020, label: 'Solmar Bank' },
    docks: { x: 1020, y: 1900, label: 'Docks' },
    downtown: [{ x: 1420, y: 620 }, { x: 2220, y: 1020 }, { x: 1820, y: 1460 }],
  };
  return { buildings, palms, park, trees, pier, landmarks, carColors: CAR_COLORS };
}

export function buildingAt(world, x, y, pad = 0) {
  for (const b of world.buildings) if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  return null;
}
export function collideBuildings(world, e, r) {
  const b = buildingAt(world, e.x, e.y, r * 0.6);
  if (!b) return false;
  const nx = Math.max(b.x, Math.min(b.x + b.w, e.x)), ny = Math.max(b.y, Math.min(b.y + b.h, e.y));
  const dx = e.x - nx, dy = e.y - ny, d = Math.hypot(dx, dy) || 1;
  e.x = nx + (dx / d) * r * 0.7; e.y = ny + (dy / d) * r * 0.7;
  return true;
}
