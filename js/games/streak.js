/* Streak. A marker runs around the check in ring. Tap while it is inside the green zone to add a day.
   Each day the zone gets smaller and the marker gets faster. One miss and the streak is gone. */
export default function streak(stage, api) {
  const cv = document.createElement('canvas');
  stage.appendChild(cv);
  const g = cv.getContext('2d');
  /* gap is how far ahead of the marker the zone still is, measured the way the marker is travelling */
  let ang = -Math.PI / 2, dir = 1, gap = 2.5, days = 0, hold = 0.7, dead = false, raf = 0, last = performance.now(), endT = 0;
  let flash = 'Tap in the green', flashT = 99, pop = 0, shake = 0, broke = false;
  const speed = () => Math.min(5.4, 2.1 + days * 0.075), half = () => Math.max(0.16, 0.44 - days * 0.011);

  function fail(why) {
    if (dead) return;
    dead = true; broke = true; flash = why; flashT = 9; shake = 0.4;
    endT = setTimeout(() => api.end(days, `${days} ${days === 1 ? 'day' : 'days'}. On the real gym floor, once members could see a number like that, skipping a day felt like losing something.`), 900);
  }
  function tap() {
    if (dead) return;
    if (hold > 0) hold = 0;
    const off = Math.abs(gap);
    if (off > half() + 0.06) return fail('Streak broken');
    days++; api.score(days); pop = 1;
    flash = off < half() * 0.35 ? 'Perfect' : days === 7 ? 'One week' : days === 30 ? 'One month' : days === 100 ? 'One hundred' : ''; flashT = 0.8;
    dir = -dir;
    gap = 1.9 + Math.random() * 2.3;
  }
  function update(dt) {
    pop = Math.max(0, pop - dt * 4); shake = Math.max(0, shake - dt); flashT -= dt;
    if (dead) return;
    if (hold > 0) { hold -= dt; return; }
    ang += dir * speed() * dt; gap -= speed() * dt;
    if (gap < -(half() + 0.14)) fail('Missed a day');
  }
  function draw() {
    const d = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#141C36'; g.fillRect(0, 0, w, h);
    const cx = w / 2 + (shake ? Math.sin(shake * 90) * 6 : 0), cy = h / 2 - 6, R = Math.min(w, h) * 0.34, T = Math.max(22, R * 0.2);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,246,227,.1)'; g.lineWidth = T; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    for (let i = 0; i < 60; i++) { const a = i / 60 * 6.283; g.strokeStyle = 'rgba(255,246,227,.16)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R + T * 0.75), cy + Math.sin(a) * (R + T * 0.75)); g.lineTo(cx + Math.cos(a) * (R + T * 0.75 + (i % 5 ? 5 : 11)), cy + Math.sin(a) * (R + T * 0.75 + (i % 5 ? 5 : 11))); g.stroke(); }
    g.strokeStyle = broke ? '#E5533D' : '#8BE08A'; g.lineWidth = T; const target = ang + dir * gap; g.beginPath(); g.arc(cx, cy, R, target - half(), target + half()); g.stroke();
    g.fillStyle = '#FFF6E3'; g.strokeStyle = '#141C36'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, T * 0.62, 0, 7); g.fill(); g.stroke();
    g.textAlign = 'center'; g.fillStyle = broke ? '#FF7A62' : '#FFF6E3';
    g.font = `400 ${Math.round(R * (0.78 + pop * 0.14))}px "Bagel Fat One", sans-serif`; g.fillText(days, cx, cy + R * 0.24);
    g.font = '800 13px Nunito, sans-serif'; g.fillStyle = 'rgba(255,246,227,.65)'; g.fillText('DAY STREAK', cx, cy + R * 0.48);
    if (flashT > 0 && flash) { g.font = '400 28px "Bagel Fat One", sans-serif'; g.fillStyle = broke ? '#FF7A62' : '#FFC83D'; g.fillText(flash, w / 2, cy - R - T - 18); }
    g.font = '800 12px Nunito, sans-serif'; g.fillStyle = 'rgba(255,246,227,.5)'; g.fillText('TAP ANYWHERE, OR PRESS SPACE', w / 2, h - 16);
  }
  const down = e => { tap(); e.preventDefault(); }, key = e => { if (e.code === 'Space') { tap(); e.preventDefault(); } };
  cv.addEventListener('pointerdown', down); addEventListener('keydown', key);
  function frame(now) { const dt = Math.min((now - last) / 1000, 0.05); last = now; update(dt); draw(); if (!dead || shake > 0) raf = requestAnimationFrame(frame); }
  api.score(0);
  raf = requestAnimationFrame(frame);
  window.__game = { tap, get days() { return days; }, get dead() { return dead; }, get off() { return Math.abs(gap); }, get half() { return half(); },
    step(n, dt = 1 / 120) { for (let i = 0; i < n && !dead; i++) update(dt); draw(); } };
  return () => { dead = true; shake = 0; cancelAnimationFrame(raf); clearTimeout(endT); removeEventListener('keydown', key); };
}
