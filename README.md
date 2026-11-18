[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/StarsN/makefun-gta6-solmar/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/StarsN/makefun-gta6-solmar/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Heat

An original top-down open-world crime game set in **Solmar Bay**, a sun-soaked
golden-hour city of sand roads, teal sea, palm trees, a park, a marina pier and
a beach. You play **Leo Marín**, a driver-for-hire working a six-job story chain
while the Solmar police respond to everything you do.

Everything — city, story, characters, art and sound — is original to this
entry. All sound is synthesised live with WebAudio (engine hum, sirens,
gunshots, chimes and a bassline loop); there are no audio files and the game
makes no network requests.

## Run it

```
node serve.ts --port 8907
```

then open http://127.0.0.1:8907/ in desktop Chrome. Or serve the `game/`
folder with any static file server and open `index.html`.

## Controls

- **WASD / arrow keys** — walk, or accelerate / brake / steer while driving
- **Shift** — run on foot
- **Mouse** — aim, **click** — shoot (pistol with muzzle flash and tracers)
- **E** — enter / exit a nearby car (steal parked or occupied cars), hold at
  the bank vault to crack it
- **P / Esc** — pause, **M** — mute

## What is in the game

- A seeded 3200×2400 city: road grid with lane dashes, crosswalks and
  sidewalks, varied buildings with rooftop details and shadow offsets, a park,
  a beach with animated sea, and a marina pier.
- Traffic AI that follows the road network, turns at intersections and brakes
  for the car ahead; parked cars everywhere — any of them can be stolen.
- Pedestrians on the sidewalks who flee from gunfire and traffic.
- A 0–5 star wanted system: stealing, shooting and harming officers raise it;
  police cars spawn at the map edge, chase and ram, and officers pursue on
  foot. Get held on foot for ~1.5 s and you are **busted**; lose all health
  and you are **wasted**. Stars decay after ~20 s clean with no police nearby.
- Six missions with objectives, map markers, minimap blips, off-screen arrows,
  dialogue banners, timers, cash rewards and fail/retry: *Keys to the City*,
  *The Pickup*, *Heat on the Strip*, *Downtown Delivery*, *Street Justice*
  and *The Big Score* — finishing the last one shows the story-complete screen.
- HUD with cash, wanted stars, health, mission objective and timer, speed and
  car health while driving, an in-game clock, a message feed and a live
  minimap (roads, sea, player, police and mission blips).
- Title screen with **Continue / New Game**; progress (cash, mission, player
  position) is saved to `localStorage` at every mission completion.

## Deterministic screenshots

Open the game with `?shot=start|play|chase|end&seed=N` to stage a real scene
by stepping the actual simulation; the page sets `window.__shotReady` when the
scene is painted. `?seed=N` alone replays the same city and traffic exactly.

## Hand-in

`node main.ts` (with `MAKEFUN_OUTPUT_DIR` set locally) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` using the
vendored kit library in `vendor/makefun-game.ts`, which is unchanged.
