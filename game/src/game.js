// game.js — Solmar Heat core: state, input, on-foot and driving simulation,
// traffic AI, pedestrians, the wanted system and police response, the mission
// chain, HUD with minimap, screens (title / pause / busted / wasted / complete),
// localStorage saves, and deterministic screenshot staging (?shot=...&seed=N).
import { makeRng, clamp, dist, angleLerp, pick } from './rng.js';
import { buildWorld, roadXs, roadYs, isOnRoad, collideBuildings, SEA_Y, WORLD_W, WORLD_H } from './world.js';
import { drawWorld, drawCar, drawPerson } from './render.js';
import { SoundEngine } from './audio.js';
import { MISSIONS } from './missions.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '7', 10) || 7;
const SHOT = params.get('shot') || '';

export class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.rng = makeRng(SEED * 131 + 7);
    this.world = buildWorld(SEED);
    this.sound = new SoundEngine();
    this.keys = {}; this.mouse = { x: 0, y: 0, down: false };
    this.state = 'title'; // title | play | paused | busted | wasted | complete
    this.time = 0; this.clockMin = 17 * 60 + 20; // golden hour 17:20
    this.feed = []; this.banner = null; this.bannerT = 0;
    this.resetRun(false);
    this.bindInput();
  }
  resetRun(loadSave) {
    const L = this.world.landmarks;
    this.player = { x: L.safehouse.x + 60, y: L.safehouse.y + 60, angle: 0, health: 100, car: null, speed: 0 };
    this.cash = 50; this.missionIdx = 0; this.missionStage = 0; this.missionTimer = 0; this.checkpoint = 0; this.takedowns = 0; this.vaultT = 0;
    this.wanted = 0; this.crimeT = 0; this.bustT = 0; this.shotsFx = [];
    if (loadSave) { try { const s = JSON.parse(localStorage.getItem('solmar-heat-save') || 'null'); if (s) { this.cash = s.cash; this.missionIdx = s.missionIdx; this.player.x = s.x; this.player.y = s.y; } } catch {} }
    this.spawnTraffic(); this.startMission(false);
  }
  save() { try { localStorage.setItem('solmar-heat-save', JSON.stringify({ cash: this.cash, missionIdx: this.missionIdx, x: this.player.x, y: this.player.y })); } catch {} }
  spawnTraffic() {
    this.cars = []; this.peds = []; this.cops = []; this.officers = []; this.rivals = [];
    const xs = roadXs(), ys = roadYs();
    for (let i = 0; i < 26; i++) {
      const vertical = this.rng() < 0.5;
      const car = { x: 0, y: 0, angle: 0, speed: 0, color: pick(this.rng, this.world.carColors), health: 100, smoke: 0, police: false, marked: false, driver: true, traffic: true, braking: false, laneDir: this.rng() < 0.5 ? 1 : -1 };
      if (vertical) { car.x = pick(this.rng, xs) + (car.laneDir > 0 ? 22 : -22); car.y = 100 + this.rng() * 1800; car.angle = car.laneDir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { car.y = pick(this.rng, ys) + (car.laneDir > 0 ? 22 : -22); car.x = 100 + this.rng() * 2900; car.angle = car.laneDir > 0 ? 0 : Math.PI; }
      car.speed = 90 + this.rng() * 60; this.cars.push(car);
    }
    // Parked cars to steal
    for (let i = 0; i < 16; i++) {
      const vertical = this.rng() < 0.5; const car = { x: 0, y: 0, angle: 0, speed: 0, color: pick(this.rng, this.world.carColors), health: 100, smoke: 0, police: false, marked: false, driver: false, traffic: false, braking: false, laneDir: 1 };
      if (vertical) { car.x = pick(this.rng, xs) + 34; car.y = 120 + this.rng() * 1800; car.angle = Math.PI / 2; } else { car.y = pick(this.rng, ys) + 34; car.x = 120 + this.rng() * 2900; car.angle = 0; }
      this.cars.push(car);
    }
    for (let i = 0; i < 30; i++) {
      let x = 0, y = 0, tries = 0;
      do { x = 80 + this.rng() * 3000; y = 80 + this.rng() * 1900; tries++; } while (!isOnRoad(x + 52, y) && tries < 20);
      this.peds.push({ x: x + 52, y, angle: this.rng() * 6.28, speed: 26 + this.rng() * 20, shirt: pick(this.rng, ['#e17055', '#00b894', '#0984e3', '#d63031', '#fdcb6e', '#6c5ce7', '#ffffff']), skin: '#c98d64', flee: 0, dead: false, wanderT: this.rng() * 4 });
    }
  }
  bindInput() {
    addEventListener('keydown', e => {
      this.keys[e.code] = true; this.sound.ensure();
      if (e.code === 'KeyM') this.sound.muted = !this.sound.muted;
      if ((e.code === 'KeyP' || e.code === 'Escape') && this.state === 'play') this.state = 'paused';
      else if ((e.code === 'KeyP' || e.code === 'Escape') && this.state === 'paused') this.state = 'play';
      if (e.code === 'Enter' && (this.state === 'busted' || this.state === 'wasted')) { this.retry(); }
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    this.canvas.addEventListener('mousemove', e => { const r = this.canvas.getBoundingClientRect(); this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; });
    this.canvas.addEventListener('mousedown', () => { this.mouse.down = true; this.sound.ensure(); if (this.state === 'play' && !this.player.car) this.shoot(); });
    addEventListener('mouseup', () => { this.mouse.down = false; });
    this.canvas.addEventListener('click', e => {
      if (this.state === 'title') {
        const r = this.canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        if (mx > this.canvas.width / 2 - 110 && mx < this.canvas.width / 2 + 110 && my > 330 && my < 372) { this.resetRun(true); this.state = 'play'; }
        if (mx > this.canvas.width / 2 - 110 && mx < this.canvas.width / 2 + 110 && my > 384 && my < 426) { this.resetRun(false); this.state = 'play'; }
      } else if (this.state === 'complete' || this.state === 'busted' || this.state === 'wasted') { this.retry(); }
    });
  }
  retry() { const idx = this.missionIdx; this.resetRun(false); this.missionIdx = idx; this.startMission(false); this.state = 'play'; this.player.health = 100; }
  say(text, secs = 4) { this.banner = text; this.bannerT = secs; }
  pushFeed(text) { this.feed.unshift(text); this.feed = this.feed.slice(0, 5); }
  commitCrime(stars, msg) { this.wanted = clamp(this.wanted + stars, 0, 5); this.crimeT = 0; if (msg) this.pushFeed(msg); }
  startMission(announce = true) {
    const m = MISSIONS[this.missionIdx]; this.missionStage = 0; this.checkpoint = 0; this.takedowns = 0; this.vaultT = 0;
    this.missionTimer = m && m.timed ? m.timed : 0;
    if (!m) { this.state = 'complete'; return; }
    if (announce) this.pushFeed('Mission: ' + m.title);
    this.say(m.intro, 5);
    if (m.kind === 'checkpoints') { const c = this.cars.find(c => !c.police); if (c) { const L = this.world.landmarks; c.x = L.downtown[0].x - 120; c.y = L.downtown[0].y + 60; c.marked = true; this.markedCar = c; } }
    if (m.kind === 'takedowns') { const L = this.world.landmarks; this.rivals = []; for (let i = 0; i < 4; i++) this.rivals.push({ x: L.docks.x + (i - 1.5) * 70, y: L.docks.y + (i % 2) * 60 - 30, angle: 3, speed: 30, shirt: '#2d3436', skin: '#a06a42', flee: 0, dead: false, hp: 2, wanderT: i }); }
    if (m.kind === 'surviveHeat') this.commitCrime(2, 'Wanted: 2 stars');
  }
  completeMission() {
    const m = MISSIONS[this.missionIdx]; if (!m) return;
    this.cash += m.reward; this.sound.jingle(true); this.pushFeed(m.title + ' complete: +$' + m.reward);
    this.say('MISSION COMPLETE — ' + m.title + '  +$' + m.reward, 4);
    this.missionIdx++; this.save();
    if (this.missionIdx >= MISSIONS.length) { this.state = 'complete'; } else this.startMission();
  }
  failMission(why) { this.sound.jingle(false); this.say('MISSION FAILED — ' + why + ' (retrying)', 4); const idx = this.missionIdx; this.missionStage = 0; this.checkpoint = 0; this.takedowns = 0; this.missionTimer = MISSIONS[idx].timed || 0; if (MISSIONS[idx].kind === 'takedowns') this.startMission(false); }
  shoot() {
    this.sound.shoot();
    const p = this.player, a = Math.atan2(this.mouse.y - this.canvas.height / 2, this.mouse.x - this.canvas.width / 2);
    p.angle = a; this.shotsFx.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, angle: a, t: 0.09 });
    this.commitCrime(0, ''); if (this.wanted < 1) this.wanted = 1; this.crimeT = 0;
    const targets = [...this.peds, ...this.rivals, ...this.officers];
    for (const t of targets) { if (t.dead) continue; const d = dist(p.x, p.y, t.x, t.y); if (d < 340 && Math.abs(((Math.atan2(t.y - p.y, t.x - p.x) - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.16) { t.hp = (t.hp || 1) - 1; if (t.hp <= 0) { t.dead = true; if (t.policeOfficer) this.commitCrime(2, 'Officer down! +2 stars'); else if (this.rivals.includes(t)) { this.takedowns++; this.pushFeed('Rival down ' + this.takedowns + '/4'); } else this.commitCrime(1, 'Civilian down! +1 star'); } break; } }
    for (const ped of this.peds) if (dist(p.x, p.y, ped.x, ped.y) < 220) ped.flee = 3;
  }
  nearestCar() { let best = null, bd = 64; for (const c of this.cars) { const d = dist(this.player.x, this.player.y, c.x, c.y); if (d < bd) { bd = d; best = c; } } return best; }
  tryEnterExit() {
    const p = this.player;
    if (p.car) { p.x = p.car.x + Math.cos(p.car.angle + Math.PI / 2) * 30; p.y = p.car.y + Math.sin(p.car.angle + Math.PI / 2) * 30; p.car.driver = false; p.car = null; return; }
    const c = this.nearestCar(); if (!c) return;
    if (c.driver) { this.pushFeed('You pulled the driver out!'); this.commitCrime(1, 'Car stolen! +1 star'); const ped = { x: c.x + 30, y: c.y, angle: 0, speed: 40, shirt: '#636e72', skin: '#c98d64', flee: 3, dead: false, wanderT: 0 }; this.peds.push(ped); }
    else if (c.traffic || true) { if (!this.everStole) { this.everStole = true; if (MISSIONS[this.missionIdx] && MISSIONS[this.missionIdx].kind === 'stealToGarage') this.missionStage = 1; } }
    c.driver = false; c.traffic = false; p.car = c;
  }
  marker() {
    const m = MISSIONS[this.missionIdx]; if (!m) return null; const L = this.world.landmarks;
    switch (m.kind) {
      case 'stealToGarage': return this.missionStage === 0 ? null : { ...L.garage, label: 'Garage' };
      case 'pickupDeliver': return this.missionStage === 0 ? { ...L.pierPickup, label: 'Package' } : { ...L.club, label: 'Club Solmar' };
      case 'surviveHeat': return this.wanted > 0 ? null : { ...L.safehouse, label: 'Safehouse' };
      case 'checkpoints': return { ...L.downtown[this.checkpoint], label: 'Checkpoint ' + (this.checkpoint + 1) };
      case 'takedowns': return { ...L.docks, label: 'Docks crew' };
      case 'bankEscape': return this.missionStage === 0 ? { ...L.bank, label: 'Bank vault' } : { ...L.safehouse, label: 'Safehouse' };
    } return null;
  }
  update(dt) {
    if (this.state !== 'play') return;
    this.time += dt; this.clockMin = (this.clockMin + dt * 2) % 1440; this.crimeT += dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    const p = this.player, m = MISSIONS[this.missionIdx];
    // Mission timer
    if (m && m.timed && this.missionStage >= 0 && !(m.kind === 'pickupDeliver' && this.missionStage === 0)) { this.missionTimer -= dt; if (this.missionTimer <= 0) this.failMission('out of time'); }
    if (this.keys['KeyE'] && !this.eHeld) { this.eHeld = true; this.handleE(); }
    if (!this.keys['KeyE']) { this.eHeld = false; this.vaultT = 0; }
    if (p.car) this.updateDriving(dt); else this.updateOnFoot(dt);
    this.updateTraffic(dt); this.updatePeds(dt); this.updatePolice(dt); this.updateMissions(dt);
    // Wanted decay: 20s without crime and no police nearby
    const copNear = this.cops.some(c => dist(p.x, p.y, c.x, c.y) < 320) || this.officers.some(o => dist(p.x, p.y, o.x, o.y) < 200);
    if (this.wanted > 0 && this.crimeT > 20 && !copNear) { this.wanted--; this.crimeT = 10; if (this.wanted === 0) this.pushFeed('Heat cleared.'); }
    if (p.health <= 0) { this.state = 'wasted'; this.sound.busted(); }
    for (const s of this.shotsFx) s.t -= dt; this.shotsFx = this.shotsFx.filter(s => s.t > 0);
    this.sound.update(dt, p.car ? Math.abs(p.car.speed) / 320 : 0, this.wanted > 0);
  }
  handleE() {
    const m = MISSIONS[this.missionIdx];
    if (m && m.kind === 'bankEscape' && this.missionStage === 0 && dist(this.player.x, this.player.y, this.world.landmarks.bank.x, this.world.landmarks.bank.y) < 70 && !this.player.car) return; // vault handled by hold in updateMissions
    this.tryEnterExit();
  }
  updateOnFoot(dt) {
    const p = this.player; let dx = 0, dy = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dy -= 1; if (this.keys['KeyS'] || this.keys['ArrowDown']) dy += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1; if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
    const run = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const sp = run ? 215 : 125, len = Math.hypot(dx, dy) || 1;
    p.x += (dx / len) * sp * dt * (dx || dy ? 1 : 0); p.y += (dy / len) * sp * dt * (dx || dy ? 1 : 0);
    p.moving = !!(dx || dy);
    const a = Math.atan2(this.mouse.y - this.canvas.height / 2, this.mouse.x - this.canvas.width / 2); p.angle = a;
    p.x = clamp(p.x, 16, WORLD_W - 16); p.y = clamp(p.y, 16, WORLD_H - 16);
    collideBuildings(this.world, p, 12);
    // Busted check
    let held = false; for (const o of this.officers) if (!o.dead && dist(p.x, p.y, o.x, o.y) < 26) held = true;
    if (held && this.wanted > 0) { this.bustT += dt; if (this.bustT > 1.5) { this.state = 'busted'; this.sound.busted(); } } else this.bustT = Math.max(0, this.bustT - dt);
  }
  updateDriving(dt) {
    const p = this.player, c = p.car;
    const accel = 260, maxF = 330, maxR = -110;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) c.speed += accel * dt;
    else if (this.keys['KeyS'] || this.keys['ArrowDown']) c.speed -= accel * dt * 0.8;
    else c.speed *= Math.pow(0.4, dt);
    c.speed = clamp(c.speed, maxR, maxF); c.braking = (this.keys['KeyS'] || this.keys['ArrowDown']) && c.speed > 10;
    const steer = (this.keys['KeyA'] || this.keys['ArrowLeft'] ? -1 : 0) + (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0);
    if (steer && Math.abs(c.speed) > 4) c.angle += steer * 1.9 * dt * Math.sign(c.speed) * Math.min(1, Math.abs(c.speed) / 120);
    c.x += Math.cos(c.angle) * c.speed * dt; c.y += Math.sin(c.angle) * c.speed * dt;
    c.x = clamp(c.x, 26, WORLD_W - 26); c.y = clamp(c.y, 26, WORLD_H - 26);
    if (collideBuildings(this.world, c, 20) && Math.abs(c.speed) > 60) { c.health -= 12; c.smoke = Math.min(1, 1 - c.health / 100 + 0.2); p.health -= 2; this.sound.crash(); c.speed *= -0.3; }
    for (const o of this.cars) { if (o === c) continue; if (dist(c.x, c.y, o.x, o.y) < 34) { if (Math.abs(c.speed) > 70) { c.health -= 6; o.health -= 6; c.smoke = 0.4; this.sound.crash(); } c.speed *= 0.6; o.x += Math.cos(c.angle) * 14; o.y += Math.sin(c.angle) * 14; } }
    for (const ped of [...this.peds, ...this.rivals]) { if (!ped.dead && dist(c.x, c.y, ped.x, ped.y) < 200) ped.flee = 2; if (!ped.dead && Math.abs(c.speed) > 60 && dist(c.x, c.y, ped.x, ped.y) < 24) { ped.dead = true; this.commitCrime(1, 'Pedestrian hit! +1 star'); } }
    p.x = c.x; p.y = c.y; p.angle = c.angle;
  }
  updateTraffic(dt) {
    for (const c of this.cars) {
      if (c === this.player.car || !c.traffic) continue;
      // Brake for the car ahead
      let ahead = false; for (const o of this.cars) { if (o === c) continue; const fx = c.x + Math.cos(c.angle) * 52, fy = c.y + Math.sin(c.angle) * 52; if (dist(fx, fy, o.x, o.y) < 30) ahead = true; }
      c.braking = ahead; const target = ahead ? 0 : 130;
      c.speed += clamp(target - c.speed, -200 * dt, 120 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt; c.y += Math.sin(c.angle) * c.speed * dt;
      // Turn at intersections: when near a grid crossing, sometimes turn
      const xs = roadXs(), ys = roadYs();
      const nearX = xs.find(x => Math.abs(c.x - x) < 8), nearY = ys.find(y => Math.abs(c.y - y) < 8);
      if (nearX !== undefined && nearY !== undefined && this.rng() < 0.012) {
        const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2].filter(d => Math.abs(d - c.angle) > 0.1);
        c.angle = pick(this.rng, dirs); c.x = nearX + Math.cos(c.angle) * 10 + (Math.abs(Math.sin(c.angle)) > 0.5 ? 22 * Math.sign(Math.cos(c.angle) || 1) : 0); c.y = nearY + Math.sin(c.angle) * 10;
      }
      if (c.x < 20 || c.x > WORLD_W - 20 || c.y < 20 || c.y > SEA_Y - 20) { c.angle += Math.PI; c.x = clamp(c.x, 30, WORLD_W - 30); c.y = clamp(c.y, 30, SEA_Y - 30); }
      collideBuildings(this.world, c, 18);
    }
  }
  movePed(ped, dt, tx, ty, speed) {
    const a = Math.atan2(ty - ped.y, tx - ped.x); ped.angle = angleLerp(ped.angle, a, 0.2);
    ped.x += Math.cos(ped.angle) * speed * dt; ped.y += Math.sin(ped.angle) * speed * dt; ped.moving = true;
    collideBuildings(this.world, ped, 10);
  }
  updatePeds(dt) {
    const all = [...this.peds, ...this.rivals];
    for (const ped of all) {
      if (ped.dead) { ped.moving = false; continue; }
      if (ped.flee > 0) { ped.flee -= dt; this.movePed(ped, dt, ped.x * 2 - this.player.x, ped.y * 2 - this.player.y, 150); continue; }
      ped.wanderT -= dt; if (ped.wanderT <= 0) { ped.wanderT = 2 + this.rng() * 4; ped.tx = clamp(ped.x + (this.rng() - 0.5) * 300, 30, WORLD_W - 30); ped.ty = clamp(ped.y + (this.rng() - 0.5) * 300, 30, SEA_Y - 20); }
      if (ped.tx !== undefined) { if (dist(ped.x, ped.y, ped.tx, ped.ty) > 12) this.movePed(ped, dt, ped.tx, ped.ty, ped.speed); else ped.moving = false; }
    }
    for (const o of this.officers) {
      if (o.dead) continue;
      if (this.wanted > 0) this.movePed(o, dt, this.player.x, this.player.y, 148);
      else { o.wanderT = (o.wanderT || 0) - dt; if (o.wanderT <= 0) { o.wanderT = 3; o.tx = o.x + (this.rng() - 0.5) * 200; o.ty = o.y + (this.rng() - 0.5) * 200; } if (o.tx) this.movePed(o, dt, o.tx, o.ty, 60); }
      if (!this.player.car && dist(o.x, o.y, this.player.x, this.player.y) < 300 && this.wanted > 0 && Math.random() < dt * 0.25) this.player.health -= 3;
    }
  }
  updatePolice(dt) {
    const want = this.wanted, p = this.player;
    const targetCops = want === 0 ? 0 : 1 + want;
    // Spawn police cars at map edges
    if (this.cops.length < targetCops && Math.random() < dt * 0.8) {
      const edge = this.rng(); const c = { x: clamp(p.x + (edge < 0.5 ? -700 : 700), 40, WORLD_W - 40), y: clamp(p.y + (this.rng() - 0.5) * 500, 40, SEA_Y - 40), angle: 0, speed: 0, color: '#ffffff', health: 100, smoke: 0, police: true, marked: false, driver: true, traffic: false, braking: false, laneDir: 1 };
      const np = this.world.landmarks; c.x = clamp(c.x, 40, WORLD_W - 40); this.cops.push(c); this.cars.push(c);
    }
    if (want === 0) { this.cops = this.cops.filter(c => dist(p.x, p.y, c.x, c.y) < 900); this.cars = this.cars.filter(c => !c.police || this.cops.includes(c)); this.officers = this.officers.filter(o => dist(p.x, p.y, o.x, o.y) < 700); }
    for (const c of this.cops) {
      if (c === p.car) continue;
      const a = Math.atan2(p.y - c.y, p.x - c.x); c.angle = angleLerp(c.angle, a, 1.6 * dt);
      const d = dist(c.x, c.y, p.x, p.y); const sp = d > 60 ? 300 : 120;
      c.speed += clamp(sp - c.speed, -300 * dt, 220 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt; c.y += Math.sin(c.angle) * c.speed * dt;
      collideBuildings(this.world, c, 18);
      if (p.car && d < 36 && Math.abs(c.speed) > 80) { p.car.health -= 5; p.health -= 1.5; c.speed *= 0.5; this.sound.crash(); }
      // Officer steps out when close and player on foot
      if (!p.car && d < 130 && !c.officerOut) { c.officerOut = true; this.officers.push({ x: c.x + 24, y: c.y, angle: 0, speed: 40, shirt: '#123a7a', skin: '#c98d64', flee: 0, dead: false, hp: 2, policeOfficer: true, wanderT: 0 }); }
      if (p.car || d > 220) c.officerOut = false;
    }
  }
  updateMissions(dt) {
    const m = MISSIONS[this.missionIdx]; if (!m) return; const p = this.player, L = this.world.landmarks, mk = this.marker();
    if (m.kind === 'bankEscape' && this.missionStage === 0 && !p.car && this.keys['KeyE'] && dist(p.x, p.y, L.bank.x, L.bank.y) < 70) {
      this.vaultT += dt; this.say('Cracking the vault... ' + Math.ceil(3 - this.vaultT), 0.2);
      if (this.vaultT >= 3) { this.missionStage = 1; this.cash += 500; this.commitCrime(3, 'Vault cracked! +3 stars'); this.sound.pickup(); }
      return;
    }
    if (!mk) { if (m.kind === 'surviveHeat' && this.wanted === 0) { /* marker appears */ } else if (m.kind === 'stealToGarage' && this.missionStage === 0) return; else return; }
    if (mk && dist(p.x, p.y, mk.x, mk.y) < 56) {
      if (m.kind === 'stealToGarage' && p.car) this.completeMission();
      else if (m.kind === 'pickupDeliver' && this.missionStage === 0) { this.missionStage = 1; this.missionTimer = 90; this.sound.pickup(); this.pushFeed('Package collected — get to Club Solmar!'); }
      else if (m.kind === 'pickupDeliver' && this.missionStage === 1) this.completeMission();
      else if (m.kind === 'surviveHeat' && this.wanted === 0) this.completeMission();
      else if (m.kind === 'checkpoints') { this.sound.pickup(); this.checkpoint++; if (this.checkpoint >= 3) this.completeMission(); else this.pushFeed('Checkpoint ' + this.checkpoint + '/3'); }
      else if (m.kind === 'bankEscape' && this.missionStage === 1 && this.wanted === 0) this.completeMission();
    }
    if (m.kind === 'takedowns' && this.takedowns >= 4) this.completeMission();
    if (m.kind === 'bankEscape' && this.missionStage === 1 && this.wanted > 0) { /* must lose heat first: marker still safehouse but gated by wanted check above */ }
  }
  // ---------- rendering ----------
  render() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, p = this.player;
    const cam = { x: clamp(p.x - W / 2, 0, Math.max(0, WORLD_W - W)), y: clamp(p.y - H / 2, 0, Math.max(0, WORLD_H - H)) };
    this.cam = cam;
    drawWorld(ctx, this.world, cam, W, H, this.time);
    // Mission marker beam
    const mk = this.marker();
    if (mk && this.state !== 'title') { ctx.fillStyle = 'rgba(255,215,0,0.3)'; ctx.fillRect(mk.x - 16 - cam.x, mk.y - 320 - cam.y, 32, 320); ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(mk.x - cam.x, mk.y - cam.y, 18 + Math.sin(this.time * 4) * 3, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', mk.x - cam.x, mk.y - cam.y + 5); }
    if (MISSIONS[this.missionIdx] && MISSIONS[this.missionIdx].kind === 'pickupDeliver' && this.missionStage === 0) { ctx.fillStyle = '#8e44ad'; ctx.fillRect(this.world.landmarks.pierPickup.x - 9 - cam.x, this.world.landmarks.pierPickup.y - 9 - cam.y, 18, 18); }
    for (const c of this.cars) drawCar(ctx, c, cam, this.time);
    for (const ped of [...this.peds, ...this.rivals]) { if (ped.dead) { ctx.fillStyle = '#7a2020'; ctx.beginPath(); ctx.ellipse(ped.x - cam.x, ped.y - cam.y, 10, 6, 0, 0, 7); ctx.fill(); } else drawPerson(ctx, ped.x - cam.x, ped.y - cam.y, ped.shirt, ped.skin, ped.angle, ped.moving, this.time, false); }
    for (const o of this.officers) if (!o.dead) drawPerson(ctx, o.x - cam.x, o.y - cam.y, '#123a7a', o.skin, o.angle, true, this.time, false);
    if (!p.car) drawPerson(ctx, p.x - cam.x, p.y - cam.y, '#f39c12', '#c98d64', p.angle, p.moving, this.time, true);
    // Muzzle flash + tracer
    for (const s of this.shotsFx) { ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x - cam.x, s.y - cam.y); ctx.lineTo(s.x + Math.cos(s.angle) * 300 - cam.x, s.y + Math.sin(s.angle) * 300 - cam.y); ctx.stroke(); ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(s.x - cam.x, s.y - cam.y, 7, 0, 7); ctx.fill(); }
    // Golden-hour vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(255,150,50,0)'); vg.addColorStop(1, 'rgba(120,40,0,0.28)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (this.state === 'play' || this.state === 'paused') this.drawHUD(ctx, W, H, mk);
    if (this.state === 'title') this.drawTitle(ctx, W, H);
    if (this.state === 'paused') this.overlay(ctx, W, H, 'PAUSED', 'Press P or Esc to resume — M mutes, progress is saved at each mission.');
    if (this.state === 'busted') this.overlay(ctx, W, H, 'BUSTED', 'The Solmar police held you down. Press Enter or click to retry the mission.');
    if (this.state === 'wasted') this.overlay(ctx, W, H, 'WASTED', 'Leo is down. Press Enter or click to retry the mission.');
    if (this.state === 'complete') this.overlay(ctx, W, H, 'STORY COMPLETE', 'Leo Marin pulled off the Big Score and vanished into the Solmar sunset. Cash: $' + this.cash + '. Click to play again.');
    // Off-screen marker arrow + interact prompt
    if (this.state === 'play' && mk) {
      const sx = mk.x - cam.x, sy = mk.y - cam.y;
      if (sx < 0 || sx > W || sy < 0 || sy > H) { const a = Math.atan2(sy - H / 2, sx - W / 2); const ax = W / 2 + Math.cos(a) * (W / 2 - 40), ay = H / 2 + Math.sin(a) * (H / 2 - 40); ctx.fillStyle = '#ffd700'; ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.restore(); }
      const near = this.nearestCar(); if (!p.car && near) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - 90, H - 64, 180, 26); ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Press E to enter car', W / 2, H - 46); }
    }
  }
  drawHUD(ctx, W, H, mk) {
    const p = this.player, m = MISSIONS[this.missionIdx];
    ctx.textAlign = 'left';
    // Top-left: cash, clock, mission
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(12, 12, 330, m ? 86 : 62);
    ctx.fillStyle = '#7bed6a'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('$' + this.cash, 22, 40);
    const hh = String(Math.floor(this.clockMin / 60)).padStart(2, '0'), mm = String(Math.floor(this.clockMin % 60)).padStart(2, '0');
    ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif'; ctx.fillText('Solmar Bay  ' + hh + ':' + mm, 130, 40);
    if (m) { ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('Mission ' + (this.missionIdx + 1) + ': ' + m.title, 22, 62); ctx.fillStyle = '#eee'; ctx.font = '12.5px sans-serif'; wrapText(ctx, m.objective, 22, 78, 312, 14); }
    // Stars top-right
    ctx.font = '26px sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i < this.wanted ? '#ffd700' : 'rgba(255,255,255,0.25)'; ctx.fillText('★', W - 20 - (4 - i) * 30, 42); }
    if (this.missionTimer > 0 && m && m.timed) { ctx.fillStyle = this.missionTimer < 15 ? '#ff5555' : '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(Math.ceil(this.missionTimer) + 's', W - 20, 72); }
    ctx.textAlign = 'left';
    // Health bar bottom-right, speed/car health while driving
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W - 232, H - 74, 220, p.car ? 62 : 40);
    ctx.fillStyle = '#444'; ctx.fillRect(W - 222, H - 62, 200, 12);
    ctx.fillStyle = p.health > 30 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(W - 222, H - 62, 200 * clamp(p.health, 0, 100) / 100, 12);
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('HEALTH', W - 222, H - 40 + (p.car ? 0 : 14));
    if (p.car) { ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.36) + ' km/h', W - 222, H - 20); ctx.fillStyle = '#aaa'; ctx.font = '12px sans-serif'; ctx.fillText('Car ' + Math.max(0, Math.round(p.car.health)) + '%', W - 120, H - 20); }
    // Feed
    ctx.font = '13px sans-serif'; this.feed.forEach((f, i) => { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(12, 112 + i * 20, ctx.measureText(f).width + 14, 17); ctx.fillStyle = '#ffe9a8'; ctx.fillText(f, 19, 125 + i * 20); });
    // Banner / dialogue
    if (this.banner && this.bannerT > 0) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; const w = Math.min(W - 80, ctx.measureText(this.banner).width + 40); ctx.fillRect((W - w) / 2, H - 128, w, 34); ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(this.banner, W / 2, H - 106); ctx.textAlign = 'left'; }
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '12px sans-serif'; ctx.fillText('WASD move/drive · Shift run · Mouse aim · Click shoot · E enter/exit · P pause · M mute', 14, H - 10);
    this.drawMinimap(ctx, mk);
  }
  drawMinimap(ctx, mk) {
    const S = 148, X = 14, Y = this.canvas.height - S - 34, sx = S / WORLD_W, sy = S / WORLD_H;
    ctx.fillStyle = 'rgba(10,30,40,0.85)'; ctx.fillRect(X, Y, S, S);
    ctx.strokeStyle = '#888'; for (const rx of roadXs()) { ctx.beginPath(); ctx.moveTo(X + rx * sx, Y); ctx.lineTo(X + rx * sx, Y + S); ctx.stroke(); }
    for (const ry of roadYs()) { ctx.beginPath(); ctx.moveTo(X, Y + ry * sy); ctx.lineTo(X + S, Y + ry * sy); ctx.stroke(); }
    ctx.fillStyle = '#2ec4b6'; ctx.fillRect(X, Y + SEA_Y * sy, S, S - SEA_Y * sy);
    for (const c of this.cops) { ctx.fillStyle = Math.floor(this.time * 4) % 2 ? '#ff4444' : '#4488ff'; ctx.fillRect(X + c.x * sx - 2, Y + c.y * sy - 2, 4, 4); }
    if (mk) { ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(X + mk.x * sx, Y + mk.y * sy, 4, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X + this.player.x * sx, Y + this.player.y * sy, 3.4, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffd700'; ctx.strokeRect(X, Y, S, S);
  }
  drawTitle(ctx, W, H) {
    ctx.fillStyle = 'rgba(20,10,0,0.45)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76b'; ctx.font = 'bold 74px sans-serif'; ctx.fillText('SOLMAR HEAT', W / 2, 190);
    ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.fillText('An original open-world crime story in Solmar Bay', W / 2, 228);
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#ffe9a8'; ctx.fillText('Leo Marin, driver-for-hire. Six jobs. One very warm city.', W / 2, 258);
    for (const [label, y] of [['Continue', 330], ['New Game', 384]]) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(W / 2 - 110, y, 220, 42);
      ctx.strokeStyle = '#ffd700'; ctx.strokeRect(W / 2 - 110, y, 220, 42);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 19px sans-serif'; ctx.fillText(label, W / 2, y + 28);
    }
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#ddd'; ctx.fillText('WASD / arrows · Shift run · Mouse aim · Click shoot · E enter car · P pause · M mute', W / 2, 470);
    ctx.textAlign = 'left';
  }
  overlay(ctx, W, H, title, sub) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = title === 'WASTED' || title === 'BUSTED' ? '#ff5544' : '#ffd76b';
    ctx.font = 'bold 64px sans-serif'; ctx.fillText(title, W / 2, H / 2 - 10);
    ctx.fillStyle = '#fff'; ctx.font = '17px sans-serif'; ctx.fillText(sub, W / 2, H / 2 + 30); ctx.textAlign = 'left';
  }
  // Deterministic screenshot staging: step the real simulation into a scene.
  stageShot(name) {
    const L = this.world.landmarks;
    if (name === 'start') { this.state = 'title'; this.player.x = 1500; this.player.y = 1050; }
    if (name === 'play') {
      this.state = 'play'; this.missionIdx = 1; this.startMission(false); this.say(MISSIONS[1].intro, 99);
      const c = this.cars[0]; c.x = 1400; c.y = 1010; c.angle = 0; c.speed = 180; this.player.car = c; this.player.x = c.x; this.player.y = c.y; this.wanted = 2; this.cash = 200;
    }
    if (name === 'chase') {
      this.state = 'play'; this.missionIdx = 2; this.startMission(false);
      const c = this.cars[1]; c.x = 1800; c.y = 620; c.angle = 0; c.speed = 230; this.player.car = c; this.player.x = c.x; this.player.y = c.y; this.wanted = 3; this.cash = 750;
      for (let i = 0; i < 3; i++) { const pc = { x: c.x - 130 - i * 90, y: c.y + (i - 1) * 44, angle: 0, speed: 240, color: '#ffffff', health: 100, smoke: 0, police: true, marked: false, driver: true, traffic: false, braking: false, laneDir: 1 }; this.cops.push(pc); this.cars.push(pc); }
    }
    if (name === 'end') { this.state = 'complete'; this.cash = 3050; this.player.x = 1500; this.player.y = 1050; }
    for (let i = 0; i < 40; i++) { const keep = this.state; this.state = 'play'; if (name !== 'start' && name !== 'end') this.update(1 / 30); this.state = keep; }
    // Re-frame the hero car after stepping so the staged scene reads clearly:
    // collisions during the warm-up steps can shove it out of the camera centre.
    if (name === 'play' && this.player.car) { const c = this.player.car; c.x = 1400; c.y = 1010; c.angle = 0; c.speed = 170; c.health = 100; c.smoke = 0; this.player.x = c.x; this.player.y = c.y; this.wanted = 2; this.crimeT = 0; }
    if (name === 'chase' && this.player.car) { const c = this.player.car; c.x = 1800; c.y = 620; c.angle = 0; c.speed = 225; this.player.x = c.x; this.player.y = c.y; this.wanted = 3; this.crimeT = 0; this.cops.forEach((pc, i) => { pc.x = c.x - 120 - i * 85; pc.y = c.y + (i - 1) * 42; pc.angle = 0; pc.speed = 230; }); }
    this.render(); this.render();
    window.__shotReady = true;
  }
}
function wrapText(ctx, text, x, y, maxW, lh) { const words = text.split(' '); let line = '', yy = y; for (const w of words) { if (ctx.measureText(line + w).width > maxW) { ctx.fillText(line, x, yy); line = ''; yy += lh; } line += w + ' '; } ctx.fillText(line, x, yy); }
export function boot() {
  const canvas = document.getElementById('game');
  const game = new Game(canvas);
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; }; resize(); addEventListener('resize', resize);
  let last = performance.now();
  function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!SHOT) { game.update(dt); game.render(); } requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  if (SHOT) { resize(); game.stageShot(SHOT); }
  return game;
}
