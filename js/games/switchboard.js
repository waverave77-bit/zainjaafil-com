/* Switchboard. Callers ring in on the left, reps wait on the right. Drag a wire from a caller to any free rep.
   A live call keeps its wire on the board, wires cannot cross, and callers do not wait forever. */
export default function switchboard(stage, api) {
  const cv = document.createElement('canvas');
  stage.appendChild(cv);
  const g = cv.getContext('2d');
  const COLS = 7, ROWS = 6, LAST = COLS - 1, TALK = 3.2;
  const PAL = ['#E5533D', '#3D7BE5', '#2E9B4E', '#B4489B', '#E08A1E', '#1E8C8C'];
  const callers = Array(ROWS).fill(null), repBusy = Array(ROWS).fill(0), occ = new Map();
  let wires = [], path = null, score = 0, strikes = 0, spawnT = 0.7, clock = 0, dead = false, raf = 0, last = performance.now(), endT = 0;
  let s = 40, ox = 0, oy = 0, colour = 0, flash = '', flashT = 0;
  const key = (c, r) => c + ',' + r;

  function spawn(row) {
    const free = [];
    for (let r = 0; r < ROWS; r++) if (!callers[r]) free.push(r);
    if (row === undefined) { if (!free.length) return; row = free[Math.floor(Math.random() * free.length)]; }
    if (callers[row]) return;
    const max = Math.max(4.6, 9.5 - score * 0.11);
    callers[row] = { left: max, max, talking: false, colour: PAL[colour++ % PAL.length] };
  }
  function start(row) { if (callers[row] && !callers[row].talking) path = { row, cells: [[0, row]], colour: callers[row].colour }; }
  function extend(c, r) {
    if (!path) return;
    for (let guard = 0; guard < 12 && path; guard++) {
      const [lc, lr] = path.cells[path.cells.length - 1];
      if (lc === c && lr === r) return;
      const dc = Math.abs(c - lc) >= Math.abs(r - lr) ? Math.sign(c - lc) : 0, dr = dc ? 0 : Math.sign(r - lr);
      const nc = lc + dc, nr = lr + dr;
      if (path.cells.length > 1) { const [pc, prw] = path.cells[path.cells.length - 2]; if (pc === nc && prw === nr) { path.cells.pop(); continue; } }
      if (nc === LAST) { if (lc === LAST - 1 && repBusy[nr] <= 0) connect(nr); return; }
      if (nc < 1 || nr < 0 || nr >= ROWS || occ.has(key(nc, nr)) || path.cells.some(p => p[0] === nc && p[1] === nr)) return;
      path.cells.push([nc, nr]);
    }
  }
  function connect(rep) {
    const cells = [...path.cells, [LAST, rep]], w = { cells, left: TALK, row: path.row, rep, colour: path.colour };
    for (const [c, r] of cells) if (c > 0 && c < LAST) occ.set(key(c, r), w);
    wires.push(w); callers[path.row].talking = true; repBusy[rep] = TALK; path = null;
    score++; api.score(score);
  }
  function update(dt) {
    if (dead) return;
    clock += dt; flashT -= dt;
    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = Math.max(0.72, 2.3 - score * 0.045); }
    for (let r = 0; r < ROWS; r++) {
      const c = callers[r];
      if (!c || c.talking) continue;
      c.left -= dt;
      if (c.left <= 0) {
        callers[r] = null; strikes++; flash = 'They hung up'; flashT = 0.9;
        if (path && path.row === r) path = null;
        if (strikes >= 3) { dead = true; endT = setTimeout(() => api.end(score, `${score} ${score === 1 ? 'call' : 'calls'} connected before three callers gave up.`), 800); return; }
      }
    }
    for (const w of wires) w.left -= dt;
    for (const w of wires.filter(w => w.left <= 0)) { for (const [c, r] of w.cells) if (occ.get(key(c, r)) === w) occ.delete(key(c, r)); callers[w.row] = null; repBusy[w.rep] = 0; }
    wires = wires.filter(w => w.left > 0);
    for (let r = 0; r < ROWS; r++) if (repBusy[r] > 0) repBusy[r] -= dt;
  }
  const X = c => ox + (c + 0.5) * s, Y = r => oy + (r + 0.5) * s;
  function line(cells, colour, width, dash) {
    g.strokeStyle = colour; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash(dash || []);
    g.beginPath(); cells.forEach(([c, r], i) => i ? g.lineTo(X(c), Y(r)) : g.moveTo(X(c), Y(r))); g.stroke(); g.setLineDash([]);
  }
  function draw() {
    const d = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    s = Math.floor(Math.min((w - 12) / COLS, (h - 70) / ROWS)); ox = (w - s * COLS) / 2; oy = 52 + (h - 52 - s * ROWS) / 2;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#FF9A76'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#FFF1DC'; g.strokeStyle = '#1C2440'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(ox + s - 6, oy - 6, s * (COLS - 2) + 12, s * ROWS + 12, 16); g.fill(); g.stroke();
    g.fillStyle = 'rgba(28,36,64,.2)';
    for (let r = 0; r < ROWS; r++) for (let c = 1; c < LAST; c++) { g.beginPath(); g.arc(X(c), Y(r), 3.5, 0, 7); g.fill(); }
    g.font = '800 11px Nunito, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#1C2440';
    g.fillText('CALLERS', X(0), oy - 16); g.fillText('REPS', X(LAST), oy - 16);
    for (let i = 0; i < 3; i++) { g.fillStyle = i < 3 - strikes ? '#E5533D' : 'rgba(28,36,64,.18)'; g.strokeStyle = '#1C2440'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2 - 26 + i * 26, 22, 8, 0, 7); g.fill(); g.stroke(); }
    for (const wr of wires) { line(wr.cells, '#1C2440', s * 0.34); line(wr.cells, wr.colour, s * 0.2); }
    if (path) { line(path.cells, '#1C2440', s * 0.3); line(path.cells, path.colour, s * 0.16, [2, s * 0.3]); }
    for (let r = 0; r < ROWS; r++) {
      const busy = repBusy[r] > 0;
      g.fillStyle = busy ? '#C9CCD6' : '#9BE08A'; g.strokeStyle = '#1C2440'; g.lineWidth = 3.5;
      g.beginPath(); g.arc(X(LAST), Y(r), s * 0.34, 0, 7); g.fill(); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.arc(X(LAST), Y(r), s * 0.2, Math.PI, 0); g.stroke();           /* headset */
      g.fillStyle = '#1C2440'; g.fillRect(X(LAST) - s * 0.23, Y(r) - 2, s * 0.07, s * 0.14); g.fillRect(X(LAST) + s * 0.16, Y(r) - 2, s * 0.07, s * 0.14);
      const c = callers[r];
      if (!c) { g.strokeStyle = 'rgba(28,36,64,.25)'; g.lineWidth = 2.5; g.setLineDash([4, 6]); g.beginPath(); g.arc(X(0), Y(r), s * 0.3, 0, 7); g.stroke(); g.setLineDash([]); continue; }
      const shake = c.talking ? 0 : Math.sin(clock * 30 + r) * (c.left < 2 ? 2.4 : 1), x = X(0) + shake;
      g.fillStyle = c.colour; g.strokeStyle = '#1C2440'; g.lineWidth = 3.5; g.beginPath(); g.arc(x, Y(r), s * 0.34, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x - s * 0.1, Y(r) - s * 0.17, s * 0.2, s * 0.34, 4); g.fill();
      if (!c.talking) { g.strokeStyle = c.left < 2 ? '#E5533D' : '#1C2440'; g.lineWidth = 5; g.beginPath(); g.arc(x, Y(r), s * 0.45, -1.57, -1.57 + 6.283 * c.left / c.max); g.stroke(); }
    }
    if (flashT > 0) { g.font = '400 26px "Bagel Fat One", sans-serif'; g.lineWidth = 6; g.strokeStyle = '#1C2440'; g.fillStyle = '#fff'; g.strokeText(flash, w / 2, oy + s * ROWS / 2); g.fillText(flash, w / 2, oy + s * ROWS / 2); }
    if (!score && !path && clock < 6) { g.font = '800 13px Nunito, sans-serif'; g.fillStyle = '#1C2440'; g.fillText('Drag from a caller to any green rep', w / 2, h - 12); }
  }
  const cellAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left - ox) / s), Math.floor((e.clientY - r.top - oy) / s)]; };
  cv.addEventListener('pointerdown', e => { const [c, r] = cellAt(e); if (c <= 0 && r >= 0 && r < ROWS) start(r); try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
  cv.addEventListener('pointermove', e => { if (!path) return; const [c, r] = cellAt(e); extend(Math.max(0, Math.min(LAST, c)), Math.max(0, Math.min(ROWS - 1, r))); });
  const drop = () => { path = null; };
  cv.addEventListener('pointerup', drop); cv.addEventListener('pointercancel', drop);
  function frame(now) { const dt = Math.min((now - last) / 1000, 0.1); last = now; update(dt); draw(); if (!dead) raf = requestAnimationFrame(frame); }
  api.score(0);
  raf = requestAnimationFrame(frame);

  /* test hook: route a waiting caller to the nearest free rep along free cells */
  function route(row) {
    if (!callers[row] || callers[row].talking) return false;
    const prev = new Map([[key(0, row), null]]), queue = [[0, row]];
    while (queue.length) {
      const [c, r] = queue.shift();
      if (c === LAST - 1 && repBusy[r] <= 0) { const cells = []; for (let k = key(c, r); k; k = prev.get(k)) cells.unshift(k.split(',').map(Number)); start(row); for (const [pc, prw] of cells.slice(1)) extend(pc, prw); extend(LAST, r); return !path; }
      for (const [dc, dr] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
        const nc = c + dc, nr = r + dr, k = key(nc, nr);
        if (nc < 1 || nc >= LAST || nr < 0 || nr >= ROWS || occ.has(k) || prev.has(k)) continue;
        prev.set(k, key(c, r)); queue.push([nc, nr]);
      }
    }
    path = null; return false;
  }
  window.__game = { spawn, route, start, extend, callers, repBusy, get wires() { return wires; }, get score() { return score; }, get strikes() { return strikes; }, get dead() { return dead; }, get path() { return path; },
    step(n, dt = 1 / 60) { for (let i = 0; i < n && !dead; i++) update(dt); draw(); } };
  return () => { dead = true; cancelAnimationFrame(raf); clearTimeout(endT); };
}
