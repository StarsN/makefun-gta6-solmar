// render.js — canvas drawing for Solmar Heat: the sun-soaked city (sand roads,
// teal sea, palms), buildings with shadow offsets and rooftop details, cars with
// soft shadows and lights, and people. Golden-hour palette throughout.
export function drawWorld(ctx, world, cam, vw, vh, time) {
  ctx.fillStyle = '#cdb287'; ctx.fillRect(0, 0, vw, vh); // sand ground
  const x0 = cam.x - 60, y0 = cam.y - 60, x1 = cam.x + vw + 60, y1 = cam.y + vh + 60;
  // Park lawn
  const p = world.park;
  ctx.fillStyle = '#5da75d'; ctx.fillRect(p.x - cam.x, p.y - cam.y, p.w, p.h);
  // Beach sand then animated sea along the south edge
  ctx.fillStyle = '#ecd29a'; ctx.fillRect(0, 1930 - cam.y, vw, Math.max(0, 2130 - cam.y));
  const seaTop = 2060;
  const grad = ctx.createLinearGradient(0, seaTop - cam.y, 0, 2400 - cam.y);
  grad.addColorStop(0, '#2ec4b6'); grad.addColorStop(1, '#0b6e7d');
  ctx.fillStyle = grad; ctx.fillRect(0, seaTop - cam.y, vw, 2400 - seaTop + cam.y);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const wy = seaTop + 18 + i * 24 - cam.y; if (wy < -10 || wy > vh + 10) continue;
    ctx.beginPath();
    for (let x = 0; x <= vw; x += 24) ctx.lineTo(x, wy + Math.sin(time * 1.6 + x * 0.02 + i) * 3);
    ctx.stroke();
  }
  // Pier
  ctx.fillStyle = '#8a6a48'; ctx.fillRect(world.pier.x - cam.x, world.pier.y - cam.y, world.pier.w, world.pier.len);
  ctx.fillStyle = '#6e5439'; for (let i = 0; i < 8; i++) ctx.fillRect(world.pier.x - cam.x, world.pier.y + i * 34 - cam.y, world.pier.w, 4);
  // Roads: asphalt strips with lane dashes and crosswalks at intersections
  ctx.fillStyle = '#4a4a52';
  for (const rx of worldRoadXs()) ctx.fillRect(rx - 46 - cam.x, 0 - cam.y, 92, 2060);
  for (const ry of worldRoadYs()) ctx.fillRect(0 - cam.x, ry - 46 - cam.y, 3200, 92);
  ctx.strokeStyle = '#f7d774'; ctx.lineWidth = 3; ctx.setLineDash([22, 18]);
  for (const rx of worldRoadXs()) { ctx.beginPath(); ctx.moveTo(rx - cam.x, -cam.y); ctx.lineTo(rx - cam.x, 2060 - cam.y); ctx.stroke(); }
  for (const ry of worldRoadYs()) { ctx.beginPath(); ctx.moveTo(-cam.x, ry - cam.y); ctx.lineTo(3200 - cam.x, ry - cam.y); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of worldRoadXs()) for (const ry of worldRoadYs()) {
    for (let s = -40; s <= 40; s += 16) { ctx.fillRect(rx - 44 - cam.x, ry + s - cam.y, 26, 7); ctx.fillRect(rx + 18 - cam.x, ry + s - cam.y, 26, 7); }
  }
  // Sidewalk tint along roads
  ctx.strokeStyle = 'rgba(255,240,200,0.35)'; ctx.lineWidth = 8;
  for (const rx of worldRoadXs()) { ctx.beginPath(); ctx.moveTo(rx - 52 - cam.x, -cam.y); ctx.lineTo(rx - 52 - cam.x, 2060 - cam.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(rx + 52 - cam.x, -cam.y); ctx.lineTo(rx + 52 - cam.x, 2060 - cam.y); ctx.stroke(); }
  // Buildings with shadow offset, roof detail, AC units, water tanks, signs
  for (const b of world.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(60,30,10,0.28)'; ctx.fillRect(b.x + 9 - cam.x, b.y + 11 - cam.y, b.w, b.h);
    ctx.fillStyle = b.color; ctx.fillRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(b.x + 6 - cam.x, b.y + 6 - cam.y, b.w - 12, 8);
    if (b.ac) { ctx.fillStyle = '#d9d9d9'; ctx.fillRect(b.x + b.w * 0.6 - cam.x, b.y + b.h * 0.55 - cam.y, 16, 12); }
    if (b.tank) { ctx.fillStyle = '#7a4a2b'; ctx.beginPath(); ctx.arc(b.x + b.w * 0.3 - cam.x, b.y + b.h * 0.3 - cam.y, 10, 0, 7); ctx.fill(); }
    if (b.sign) { ctx.fillStyle = '#ffdf6b'; ctx.fillRect(b.x + 4 - cam.x, b.y + b.h - 14 - cam.y, Math.min(52, b.w - 8), 9); }
  }
  // Trees in the park and palms
  for (const t of world.trees) drawTree(ctx, t.x - cam.x, t.y - cam.y, t.s, '#2e7d32');
  for (const t of world.palms) drawPalm(ctx, t.x - cam.x, t.y - cam.y, t.s, t.lean);
}
function worldRoadXs() { const xs = []; for (let x = 200; x < 3200; x += 400) xs.push(x); return xs; }
function worldRoadYs() { const ys = []; for (let y = 200; y < 2060; y += 400) ys.push(y); return ys; }
export function drawTree(ctx, x, y, s, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 5, 13 * s, 9 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6d4c2f'; ctx.fillRect(x - 2 * s, y, 4 * s, 9 * s);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y - 4 * s, 13 * s, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(x - 4 * s, y - 7 * s, 6 * s, 0, 7); ctx.fill();
}
export function drawPalm(ctx, x, y, s, lean) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 4, 12 * s, 6 * s, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#8a6a48'; ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 20, y - 14 * s, x + lean * 34, y - 24 * s); ctx.stroke();
  ctx.strokeStyle = '#2f9e44'; ctx.lineWidth = 3 * s;
  const tx = x + lean * 34, ty = y - 24 * s;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * 15 * s, ty + Math.sin(a) * 8 * s - 3); ctx.stroke(); }
}
export function drawCar(ctx, car, cam, time) {
  const x = car.x - cam.x, y = car.y - cam.y;
  ctx.save(); ctx.translate(x, y); ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, 5, 26, 13, 0, 0, 7); ctx.fill();
  ctx.fillStyle = car.color; roundRect(ctx, -24, -11, 48, 22, 6); ctx.fill();
  ctx.fillStyle = 'rgba(20,30,50,0.85)'; roundRect(ctx, -6, -8, 18, 16, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(ctx, -20, -8, 8, 16, 3); ctx.fill();
  ctx.fillStyle = '#222'; for (const [wx, wy] of [[-16, -12], [16, -12], [-16, 10], [16, 10]]) ctx.fillRect(wx - 4, wy, 9, 4);
  // Headlights / taillights
  ctx.fillStyle = '#fff6b0'; ctx.fillRect(23, -8, 3, 5); ctx.fillRect(23, 3, 3, 5);
  ctx.fillStyle = car.braking ? '#ff2222' : '#aa2222'; ctx.fillRect(-26, -8, 3, 5); ctx.fillRect(-26, 3, 3, 5);
  if (car.police) {
    ctx.fillStyle = '#ffffff'; roundRect(ctx, -24, -11, 48, 22, 6); ctx.fill();
    ctx.fillStyle = '#123a7a'; ctx.fillRect(-10, -11, 20, 22);
    ctx.fillStyle = Math.floor(time * 4) % 2 ? '#ff3333' : '#3366ff';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#123a7a'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('POLICE', 0, -3);
  }
  if (car.marked) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; roundRect(ctx, -27, -14, 54, 28, 8); ctx.stroke(); }
  ctx.restore();
  if (car.smoke > 0.15) {
    ctx.fillStyle = 'rgba(90,90,90,0.45)';
    ctx.beginPath(); ctx.arc(x - Math.cos(car.angle) * 24, y - Math.sin(car.angle) * 24, 6 + car.smoke * 10, 0, 7); ctx.fill();
  }
}
export function drawPerson(ctx, px, py, shirt, skin, angle, walking, time, isPlayer) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(px + 2, py + 4, 8, 5, 0, 0, 7); ctx.fill();
  const bob = walking ? Math.sin(time * 12 + px * 0.1) * 2 : 0;
  ctx.fillStyle = '#2b3a55'; ctx.fillRect(px - 5, py + 2 + Math.abs(bob) * 0.4, 4, 7); ctx.fillRect(px + 1, py + 2 - Math.abs(bob) * 0.4, 4, 7);
  ctx.fillStyle = shirt; ctx.beginPath(); ctx.arc(px, py + bob * 0.3, 7, 0, 7); ctx.fill();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(px + Math.cos(angle) * 2, py + Math.sin(angle) * 2 + bob * 0.3, 4.4, 0, 7); ctx.fill();
  if (isPlayer) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 11, 0, 7); ctx.stroke(); }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
