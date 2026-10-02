// Deterministic gravity simulation. Shared verbatim by client and server.
// Only + - * / and sqrt are used (all IEEE-754 exact), and launch input is
// quantised to integers, so the server can replay any shot and get the same result.
(function (g) {
  const W = 800, H = 500;

  function simulate(level, vx100, vy100, opts) {
    opts = opts || {};
    const max = opts.maxSteps || 1200;
    const path = opts.record ? [] : null;
    let x = level.start.x, y = level.start.y;
    let vx = vx100 / 100, vy = vy100 / 100;
    const P = level.planets, T = level.target;
    if (path) path.push([x, y]);

    for (let s = 1; s <= max; s++) {
      let ax = 0, ay = 0;
      for (let i = 0; i < P.length; i++) {
        const dx = P[i].x - x, dy = P[i].y - y;
        const d2 = dx * dx + dy * dy + 25; // softening avoids singularities
        const inv = P[i].gm / (d2 * Math.sqrt(d2));
        ax += dx * inv;
        ay += dy * inv;
      }
      vx += ax; vy += ay;
      x += vx; y += vy;
      if (path) path.push([x, y]);

      for (let i = 0; i < P.length; i++) {
        const dx = P[i].x - x, dy = P[i].y - y;
        if (dx * dx + dy * dy < P[i].r * P[i].r) return { result: 'crash', steps: s, path };
      }
      const tx = T.x - x, ty = T.y - y;
      if (tx * tx + ty * ty < T.r * T.r) return { result: 'hit', steps: s, path };
      if (x < -200 || x > W + 200 || y < -200 || y > H + 200) return { result: 'lost', steps: s, path };
    }
    return { result: 'timeout', steps: max, path };
  }

  // Faster arrival and lower launch energy score higher.
  function scoreOf(steps, vx100, vy100) {
    return Math.max(0, 10000 - steps * 5 - Math.round(Math.sqrt(vx100 * vx100 + vy100 * vy100)));
  }

  const api = { W, H, MAX_POWER: 900, simulate, scoreOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else g.Sim = api;
})(typeof window !== 'undefined' ? window : globalThis);
