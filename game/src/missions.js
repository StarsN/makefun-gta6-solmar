// missions.js — the six-mission story chain of Leo Marin, driver-for-hire in
// Solmar Bay. Each mission is data: an intro line, an objective line, a reward,
// and a kind the game loop interprets. Progress is an index into this list.
export const MISSIONS = [
  { title: 'Keys to the City', kind: 'stealToGarage', reward: 150,
    intro: 'Leo: "First job in Solmar Bay. Wheels first — any car will do."',
    objective: 'Steal any car (E near a car), then drive to the garage marker.' },
  { title: 'The Pickup', kind: 'pickupDeliver', reward: 300, timed: 90,
    intro: 'Dispatcher: "Package waiting at the pier. Club Solmar wants it fast."',
    objective: 'Collect the package at the pier, then deliver it to Club Solmar in 90s.' },
  { title: 'Heat on the Strip', kind: 'surviveHeat', reward: 400,
    intro: 'Leo: "That drop brought the heat down on me. Shake them off."',
    objective: 'Survive a 2-star wanted level until it clears, then reach the safehouse.' },
  { title: 'Downtown Delivery', kind: 'checkpoints', reward: 500, timed: 150,
    intro: 'Dispatcher: "Marked car, three downtown checkpoints. No scratches."',
    objective: 'Drive the marked car through 3 checkpoints in order, against the clock.' },
  { title: 'Street Justice', kind: 'takedowns', reward: 650, count: 4,
    intro: 'Leo: "The rival crew at the docks pushed too far. Time to push back."',
    objective: 'Take down 4 rival crew members on foot near the docks.' },
  { title: 'The Big Score', kind: 'bankEscape', reward: 2000,
    intro: 'Dispatcher: "Solmar Bank vault. Crack it, then run. This is the big one."',
    objective: 'Reach the bank, hold E for 3s at the vault, then escape 3 stars to the safehouse.' },
];
export function missionByIndex(i) { return MISSIONS[i] || null; }
