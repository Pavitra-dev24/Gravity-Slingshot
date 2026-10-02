const express = require('express');
const cors = require('cors');
const Sim = require('./sim');

const app = express();
app.use(express.json({ limit: '2kb' }));
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? '*' : origins }));

// ---------- Seeded RNG (integer-only, deterministic) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Level generation + solver ----------
function genLevel(seed, attempt) {
  const rnd = mulberry32(seed * 7919 + attempt * 104729);
  const start = { x: 60, y: 80 + Math.floor(rnd() * 340) };
  const target = { x: 700 + Math.floor(rnd() * 50), y: 60 + Math.floor(rnd() * 380), r: 18 };
  const n = 3 + Math.floor(rnd() * 3);
  const planets = [];
  for (let guard = 0; planets.length < n && guard < 200; guard++) {
    const r = 18 + Math.floor(rnd() * 20);
    const x = 180 + Math.floor(rnd() * 440), y = 40 + Math.floor(rnd() * 420);
    const clear = planets.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + 50);
    if (clear && Math.hypot(x - start.x, y - start.y) > r + 60 && Math.hypot(x - target.x, y - target.y) > r + 60) {
      planets.push({ x, y, r, gm: Math.round(r * r * 0.12) });
    }
  }
  return { seed, start, target, planets };
}

// Brute-force the launch space: 120 angles x 13 powers. Gives us par + difficulty.
function solve(level) {
  let best = null, count = 0;
  for (let a = 0; a < 360; a += 3) {
    const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
    for (let p = 200; p <= 800; p += 50) {
      const vx = Math.round(c * p), vy = Math.round(s * p);
      const r = Sim.simulate(level, vx, vy);
      if (r.result === 'hit') {
        count++;
        const score = Sim.scoreOf(r.steps, vx, vy);
        if (!best || score > best.score) best = { vx, vy, score };
      }
    }
  }
  return { best, count };
}

const levelCache = new Map();
function getLevel(seed) {
  if (levelCache.has(seed)) return levelCache.get(seed);
  let fallback = null, chosen = null;
  for (let attempt = 0; attempt < 300 && !chosen; attempt++) {
    const level = genLevel(seed, attempt);
    const { best, count } = solve(level);
    if (!best) continue;
    const out = { ...level, par: best.score, solutions: count };
    if (count <= 60) chosen = out; // tight enough to be a puzzle
    else fallback = fallback || out;
  }
  const level = chosen || fallback || genLevel(seed, 0);
  if (levelCache.size > 200) levelCache.delete(levelCache.keys().next().value);
  levelCache.set(seed, level);
  return level;
}

const dailySeed = () => Math.floor(Date.now() / 86400000);
const parseSeed = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < 1e9 ? n : null;
};

// ---------- Leaderboard (in-memory; resets on restart) ----------
const boards = new Map(); // seed -> Map(name -> {name, score, steps})
function topScores(seed) {
  return [...(boards.get(seed) || new Map()).values()].sort((a, b) => b.score - a.score).slice(0, 10);
}

// ---------- Tiny per-IP rate limiter ----------
const hits = new Map();
setInterval(() => hits.clear(), 60000).unref();
app.use('/api', (req, res, next) => {
  const n = (hits.get(req.ip) || 0) + 1;
  hits.set(req.ip, n);
  if (n > 120) return res.status(429).json({ error: 'Too many requests. Wait a minute and retry.' });
  next();
});

// ---------- Routes ----------
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/level', (req, res) => {
  const seed = req.query.seed === undefined ? dailySeed() : parseSeed(req.query.seed);
  if (seed === null) return res.status(400).json({ error: 'seed must be an integer from 0 to 999999999' });
  const { solutions, ...level } = getLevel(seed); // never expose the solution
  res.json({ ...level, daily: seed === dailySeed() });
});

app.get('/api/leaderboard', (req, res) => {
  const seed = req.query.seed === undefined ? dailySeed() : parseSeed(req.query.seed);
  if (seed === null) return res.status(400).json({ error: 'Invalid seed' });
  res.json({ seed, scores: topScores(seed) });
});

// The client sends only the launch vector. The server replays the shot and computes the score.
app.post('/api/score', (req, res) => {
  const { seed, name, vx, vy } = req.body || {};
  const s = parseSeed(seed);
  const cleanName = String(name || '').replace(/[^\w \-.]/g, '').trim().slice(0, 16);
  if (s === null || !cleanName) return res.status(400).json({ error: 'Need a valid seed and a name (letters, numbers, spaces).' });
  if (!Number.isInteger(vx) || !Number.isInteger(vy) || Math.hypot(vx, vy) > Sim.MAX_POWER) {
    return res.status(400).json({ error: 'Launch vector must be integers within the power limit.' });
  }
  const r = Sim.simulate(getLevel(s), vx, vy);
  if (r.result !== 'hit') return res.status(422).json({ error: `Replay did not reach the target (${r.result}).` });

  const score = Sim.scoreOf(r.steps, vx, vy);
  if (!boards.has(s)) boards.set(s, new Map());
  const board = boards.get(s);
  const prev = board.get(cleanName);
  if (!prev || score > prev.score) board.set(cleanName, { name: cleanName, score, steps: r.steps });
  const scores = topScores(s);
  res.json({ score, steps: r.steps, rank: scores.findIndex((e) => e.name === cleanName) + 1, scores });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Gravity Slingshot API on :${port}`));
