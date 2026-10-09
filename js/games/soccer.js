/* Two a side. You are the one in the straw hat. Score in the top goal. */
export default function soccer(stage, api) {
  const cv = document.createElement('canvas');
  stage.appendChild(cv);
  const g = cv.getContext('2d');
  const FW = 360, FH = 520, GOAL = 124, GX0 = (FW - GOAL) / 2, GX1 = (FW + GOAL) / 2;
  let level = 1;
  try { level = Math.max(1, +localStorage.getItem('zj.soccer.level') || 1); } catch (_) {}
  const mk = (x, y, team, role) => ({ x, y, vx: 0, vy: 0, hx: x, hy: y, team, role, r: 14 });
  const me = mk(180, 360, 0, 'me'), mate = mk(180, 450, 0, 'back'), o1 = mk(180, 160, 1, 'chase'), o2 = mk(180, 70, 1, 'back');
  const players = [me, mate, o1, o2], ball = { x: FW / 2, y: FH / 2, vx: 0, vy: 0, r: 8 };
  const ptr = { x: me.x, y: me.y };
  let stuck = 0, jam = 0, free = 0, still = 0, sx = 0, sy = 0, goals = [0, 0], time = 60, hold = 0.9, flash = '', done = false, scale = 1, ox = 0, oy = 0, raf = 0, last = performance.now();
  const oppSpeed = Math.min(200, 92 + level * 11), mateSpeed = 120;

  function kickoff(msg) {
    for (const p of players) { p.x = p.hx; p.y = p.hy; p.vx = p.vy = 0; }
    ball.x = FW / 2; ball.y = FH / 2; ball.vx = ball.vy = 0; hold = 0.9; flash = msg || '';
    ptr.x = me.x; ptr.y = me.y;
  }
  function seek(p, tx, ty, speed, dt) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1, s = speed * Math.min(1, d / 18), k = 1 - Math.exp(-dt * 11);
    p.vx += (dx / d * s - p.vx) * k; p.vy += (dy / d * s - p.vy) * k;
    p.x = Math.max(p.r, Math.min(FW - p.r, p.x + p.vx * dt)); p.y = Math.max(p.r, Math.min(FH - p.r, p.y + p.vy * dt));
  }
  /* run at the far side of the ball so a touch sends it toward (gx, gy) */
  function behind(gx, gy, off) { const dx = ball.x - gx, dy = ball.y - gy, d = Math.hypot(dx, dy) || 1; return [ball.x + dx / d * off, ball.y + dy / d * off]; }

  function update(dt) {
    if (done) return;
    if (hold > 0) { hold -= dt; return; }
    time -= dt;
    if (time <= 0) return finish();

    seek(me, ptr.x, ptr.y, 182, dt);
    const [ax, ay] = behind(FW / 2, FH + 20, 15);                        /* chaser drives it at my goal */
    seek(o1, ax, ay, oppSpeed, dt);
    const od = ball.y < FH * 0.3 ? behind(FW / 2, FH + 20, 15) : [FW / 2 + (ball.x - FW / 2) * 0.32, 84];
    seek(o2, od[0], od[1], oppSpeed * 0.7, dt);
    const near = Math.hypot(ball.x - mate.x, ball.y - mate.y) < 90 || ball.y > FH * 0.7;
    const md = near ? behind(FW / 2, -20, 15) : [FW / 2 + (ball.x - FW / 2) * 0.4, FH - 92];
    seek(mate, md[0], md[1], mateSpeed, dt);

    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const a = players[i], b = players[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, o = a.r + b.r - d;
      if (o > 0) { a.x -= dx / d * o / 2; a.y -= dy / d * o / 2; b.x += dx / d * o / 2; b.y += dy / d * o / 2; }
    }
    let touch = [0, 0];
    free -= dt;
    for (const p of [o2, o1, mate, me]) {
      const dx = ball.x - p.x, dy = ball.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (free > 0 || d >= p.r + ball.r) continue;
      touch[p.team]++;
      let nx = dx / d, ny = dy / d;
      ball.x = p.x + nx * (p.r + ball.r + 0.5); ball.y = p.y + ny * (p.r + ball.r + 0.5);
      const sp = Math.hypot(p.vx, p.vy);
      let power = 150 + sp * 1.55;
      if (p !== me) {                                                   /* the others aim a little */
        const gy = p.team ? FH + 20 : -20, tx = FW / 2 - ball.x, ty = gy - ball.y, td = Math.hypot(tx, ty) || 1;
        nx = nx * 0.55 + tx / td * 0.45; ny = ny * 0.55 + ty / td * 0.45;
        const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
        power = p.team ? 165 + level * 13 : 230;
      }
      /* a ball against a wall gets played back into the pitch, never pinned */
      const mouth = ball.x > GX0 && ball.x < GX1;
      if (ball.x < 34) nx += 1.1; if (ball.x > FW - 34) nx -= 1.1;
      if (!mouth && ball.y < 34) ny += 1.1; if (!mouth && ball.y > FH - 34) ny -= 1.1;
      const nn = Math.hypot(nx, ny) || 1;
      ball.vx = nx / nn * power; ball.vy = ny / nn * power;
    }
    /* two players squeezing the ball: it squirts out sideways */
    jam = touch[0] && touch[1] ? jam + dt : 0;
    if (jam > 0.3) { const a = Math.atan2(ball.vy, ball.vx) + (Math.random() < 0.5 ? 1.57 : -1.57), cx = FW / 2 - ball.x; ball.vx = Math.cos(a) * 330 + Math.sign(cx) * 60; ball.vy = Math.sin(a) * 330; jam = 0; free = 0.32; }
    still += dt;
    if (still > 1.2) { stuck = Math.hypot(ball.x - sx, ball.y - sy) < 14 ? 9 : 0; sx = ball.x; sy = ball.y; still = 0; }
    if (stuck > 1.1) { const a = Math.atan2(FH / 2 - ball.y, FW / 2 - ball.x) + (Math.random() - 0.5); ball.vx = Math.cos(a) * 300; ball.vy = Math.sin(a) * 300; stuck = 0; free = 0.4; }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    const f = Math.exp(-dt * 0.9); ball.vx *= f; ball.vy *= f;
    if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * 0.8; }
    if (ball.x > FW - ball.r) { ball.x = FW - ball.r; ball.vx = -Math.abs(ball.vx) * 0.8; }
    const inMouth = ball.x > GX0 + 3 && ball.x < GX1 - 3;
    if (ball.y < ball.r) { if (inMouth) { if (ball.y < -ball.r) { goals[0]++; kickoff('Goal'); } } else { ball.y = ball.r; ball.vy = Math.abs(ball.vy) * 0.8; } }
    if (ball.y > FH - ball.r) { if (inMouth) { if (ball.y > FH + ball.r) { goals[1]++; kickoff('They scored'); } } else { ball.y = FH - ball.r; ball.vy = -Math.abs(ball.vy) * 0.8; } }
    api.score(goals[0] + ' : ' + goals[1]);
    api.time(Math.ceil(time));
  }
  function finish() {
    done = true;
    const won = goals[0] > goals[1], lost = goals[0] < goals[1];
    const next = won ? level + 1 : lost ? Math.max(1, level - 1) : level;
    try { localStorage.setItem('zj.soccer.level', next); } catch (_) {}
    const points = goals[0] * 2 + (won ? 3 + level : 0);
    api.end(points, `${goals[0]} to ${goals[1]} on level ${level}. ${won ? 'You won, so they get faster.' : lost ? 'They won. They slow down a little.' : 'A draw.'}`);
  }

  function draw() {
    const d = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    scale = Math.min(w / (FW + 28), h / (FH + 56)); ox = (w - FW * scale) / 2; oy = (h - FH * scale) / 2;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#58B158'; g.fillRect(0, 0, w, h);
    g.setTransform(d * scale, 0, 0, d * scale, d * ox, d * oy);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#6CC36A' : '#74CB72'; g.fillRect(0, i * FH / 8, FW, FH / 8); }
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(0, 0, FW, FH);
    g.beginPath(); g.moveTo(0, FH / 2); g.lineTo(FW, FH / 2); g.moveTo(FW / 2 + 46, FH / 2); g.arc(FW / 2, FH / 2, 46, 0, 7); g.stroke();
    g.strokeRect(GX0 - 34, 0, GOAL + 68, 62); g.strokeRect(GX0 - 34, FH - 62, GOAL + 68, 62);
    g.fillStyle = '#1C2440'; g.fillRect(GX0, -16, GOAL, 16); g.fillRect(GX0, FH, GOAL, 16);
    g.fillStyle = '#fff'; for (let x = GX0 + 6; x < GX1; x += 12) { g.fillRect(x, -14, 2, 12); g.fillRect(x, FH + 2, 2, 12); }
    for (const p of players) {
      g.fillStyle = 'rgba(28,36,64,.2)'; g.beginPath(); g.ellipse(p.x, p.y + p.r * 0.75, p.r, p.r * 0.45, 0, 0, 7); g.fill();
      g.fillStyle = p.team ? '#E5533D' : '#3D7BE5'; g.strokeStyle = '#1C2440'; g.lineWidth = 3;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); g.stroke();
      if (p === me) { g.fillStyle = '#E3BC5F'; g.beginPath(); g.arc(p.x, p.y, p.r * 0.72, 0, 7); g.fill(); g.stroke(); g.strokeStyle = '#C8372B'; g.beginPath(); g.arc(p.x, p.y, p.r * 0.38, 0, 7); g.stroke(); }
      else { g.fillStyle = '#1C2440'; g.beginPath(); g.arc(p.x - 4, p.y - 2, 2.2, 0, 7); g.arc(p.x + 4, p.y - 2, 2.2, 0, 7); g.fill(); }
    }
    g.fillStyle = 'rgba(28,36,64,.22)'; g.beginPath(); g.ellipse(ball.x, ball.y + 6, ball.r, 4, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.strokeStyle = '#1C2440'; g.lineWidth = 2.5; g.beginPath(); g.arc(ball.x, ball.y, ball.r, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#1C2440'; g.beginPath(); g.arc(ball.x, ball.y, 2.6, 0, 7); g.fill();
    if (hold > 0) {
      g.font = '400 44px "Bagel Fat One", sans-serif'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = '#1C2440'; g.fillStyle = '#fff';
      const t = flash || 'Level ' + level; g.strokeText(t, FW / 2, FH / 2 - 60); g.fillText(t, FW / 2, FH / 2 - 60);
    }
  }
  const aim = e => { const r = cv.getBoundingClientRect(); ptr.x = (e.clientX - r.left - ox) / scale; ptr.y = (e.clientY - r.top - oy) / scale; };
  cv.addEventListener('pointerdown', aim); cv.addEventListener('pointermove', aim);
  function frame(now) { const dt = Math.min((now - last) / 1000, 1 / 30); last = now; update(dt); draw(); if (!done) raf = requestAnimationFrame(frame); }
  api.score('0 : 0'); api.time(60);
  raf = requestAnimationFrame(frame);
  window.__game = { me, ball, ptr, goals, get time() { return time; }, get done() { return done; }, step(n, dt = 1 / 60) { for (let i = 0; i < n && !done; i++) update(dt); draw(); } };
  return () => { done = true; cancelAnimationFrame(raf); };
}
