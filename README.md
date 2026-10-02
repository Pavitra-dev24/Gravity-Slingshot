# Gravity Slingshot

A daily gravity-assist puzzle with a server-verified leaderboard. Pull back, release, and bend your probe around planets into the target.

**Live:** _add your Vercel URL_  |  **API:** _add your Render URL_/health

## Why it's built this way
- **Deterministic simulation shared by client and server.** The client sends only an integer launch vector. The server replays the shot with the same `sim.js` and computes the score, so the leaderboard can't be spoofed. The sim uses only `+ - * /` and `sqrt` (exact in IEEE-754) so results match across machines.
- **Procedural daily levels.** A seeded RNG (mulberry32) generates each level from the UTC date. A brute-force solver (120 angles x 13 powers) rejects unsolvable levels, computes par, and filters out levels that are too easy.
- **Live-service shape.** Daily content, a leaderboard, and a REST API mirror how a live mobile game runs, in miniature.
- **Cost-aware.** Levels are cached, the sim is allocation-light, and the preview only runs 180 steps per frame.

## REST API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/level?seed=` | Level for a seed (defaults to today). Solution is never returned. |
| POST | `/api/score` | `{seed,name,vx,vy}`; server replays and returns score and rank. |
| GET | `/api/leaderboard?seed=` | Top 10. |
| GET | `/health` | Health check. |

## Run locally
```bash
cd backend && npm install && npm start      # http://localhost:3000
cd frontend && npx serve .                  # or: python3 -m http.server 5173
```

## Deploy
1. Push this folder to a GitHub repo.
2. **Render:** New > Web Service > pick the repo. Root directory `backend`, build `npm install`, start `node server.js` (or use `render.yaml` via Blueprint). Copy the service URL.
3. Edit `frontend/config.js` and set the Render URL. Commit and push.
4. **Vercel:** New Project > same repo > Root Directory `frontend`, Framework "Other", no build command. Deploy.
5. In Render, set env var `CORS_ORIGIN` to your Vercel URL (for example `https://gravity-slingshot.vercel.app`).

Notes: the Render free tier sleeps after inactivity (first request takes ~30s), and the leaderboard is in memory, so it resets on restart.

## Ideas to extend (good interview talking points)
Persist scores in Postgres or Redis, add a ghost replay of the top player, spatial partitioning for many bodies, profile and optimise the sim, or port the sim to C++/WASM.
