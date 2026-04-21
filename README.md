# Echo Bat

A browser endless runner. Dash through a procedural cave, collect fireflies,
dive-kill stingers, fight bosses, navigate biome shifts.

**Play: https://echobat.xyz**

## Controls

| Input | Action |
| --- | --- |
| `↑` / `↓` or `W` / `S` | Steer up / down |
| `Space` | Dash — vertical burst in input direction, dive-kills enemies |
| Mobile: tap top / bottom of screen | Steer |
| Mobile: quick tap | Dash |

## What's in there

- **Fireflies** — stationary gold pickups, builds combo
- **Moths** — moving amber pickups, bigger points
- **Golden fireflies** — rare, pink-gold, massive combo payoff
- **Stingers** — red hazards, dive/dash through to kill for points
- **Bosses** — appear every 3500 m, HP, fire hostile ping-waves
- **Wall crystals** — gold diamonds on walls, shatter for bonuses
- **Chambers** — wide sections denser with fireflies
- **Biomes** — cave palette shifts every 1500 m (abyss → ember → void → verdant)
- **Power-ups** — slow-mo and magnet, rare drops
- **Combos** — chain any pickup/kill within 2.6 s for multiplier up to x5
- **Near-miss bonus** — flying close to walls scores extra
- **Milestones** — banner every 100 m
- **Dynamic sonar reveal** — walls always faintly lit, ping (via dash) flashes them bright

## Tech

- Vanilla **TypeScript**, **Vite**, **HTML5 Canvas 2D**
- No frameworks, no game engine
- Audio is all **WebAudio**-synthesized (no audio assets)
- ~15 kB gzipped production bundle

## Run locally

```bash
npm install
npm run dev    # http://localhost:5173
npm run build  # production build → dist/
```

## Deploy

Auto-deploys to [Vercel](https://vercel.com) on every push to `main`.
