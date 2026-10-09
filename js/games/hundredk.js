/* The $100K Challenge. Thirty seconds of a moving market and $100,000 of pretend money.
   Hold to be in the market, let go to sit in cash. Your score is what you walk away with, against simply holding the whole time. */
export default function hundredk(stage, api) {
  const cv = document.createElement('canvas');
  stage.appendChild(cv);
  const g = cv.getContext('2d');
  const DUR = 30, STEP = 0.05, N = DUR / STEP, money = v => '$' + Math.round(v).toLocaleString('en-US');
  const price = [100];
  for (let i = 1, drift = 0, hold = 0; i <= N; i++) {            /* trends that last a second or two, then turn */
    if (hold-- <= 0) { drift = (Math.random() - 0.5) * 0.95; hold = 14 + Math.random() * 36; }
    price.push(Math.max(40, price[i - 1] * (1 + (drift + (Math.random() - 0.5) * 0.7) / 100)));
  }
  let t = 0, idx = 0, inMkt = false, cash = 100000, dead = false, raf = 0, last = performance.now();
  const mine = [];

  function update(dt) {
    if (dead) return;
    t += dt;
    while (idx < N && (idx + 1) * STEP <= t) { if (inMkt) cash *= price[idx + 1] / price[idx]; idx++; mine[idx] = inMkt; }
    api.score(money(cash));
    api.time(Math.max(0, Math.ceil(DUR - t)));
    if (t >= DUR) {
      dead = true;
      const held = 100000 * price[N] / 100, gain = Math.max(0, Math.round((cash - 100000) / 1000));
      api.end(gain, `You walked away with ${money(cash)}. Holding the whole time would have made it ${money(held)}. Your score is your profit in thousands.`);
    }
  }
  function draw() {
    const d = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#1D2942'; g.fillRect(0, 0, w, h);
    const top = 112, bot = h - 118, seen = price.slice(0, idx + 1), lo = Math.min(...seen) * 0.985, hi = Math.max(...seen) * 1.015;
    const X = i => 18 + i / N * (w - 36), Y = p => bot - (p - lo) / (hi - lo || 1) * (bot - top);
    g.strokeStyle = 'rgba(255,246,227,.12)'; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const y = top + (bot - top) * k / 4; g.beginPath(); g.moveTo(18, y); g.lineTo(w - 18, y); g.stroke(); }
    g.lineWidth = 4; g.lineJoin = 'round'; g.lineCap = 'round';
    for (let i = 1; i <= idx; i++) { g.strokeStyle = mine[i] ? '#8BE08A' : 'rgba(255,246,227,.4)'; g.beginPath(); g.moveTo(X(i - 1), Y(price[i - 1])); g.lineTo(X(i), Y(price[i])); g.stroke(); }
    g.fillStyle = inMkt ? '#8BE08A' : '#FFF6E3'; g.beginPath(); g.arc(X(idx), Y(price[idx]), 7, 0, 7); g.fill();
    const held = 100000 * price[idx] / 100;
    g.textAlign = 'left'; g.font = '800 12px Nunito, sans-serif'; g.fillStyle = 'rgba(255,246,227,.7)'; g.fillText('YOUR PORTFOLIO', 20, 30);
    g.font = '400 40px "Bagel Fat One", sans-serif'; g.fillStyle = cash >= 100000 ? '#8BE08A' : '#FF7A62'; g.fillText(money(cash), 20, 70);
    g.font = '800 12px Nunito, sans-serif'; g.fillStyle = 'rgba(255,246,227,.6)'; g.fillText('IF YOU JUST HELD: ' + money(held), 20, 92);
    const by = h - 92;
    g.fillStyle = inMkt ? '#8BE08A' : '#FFC83D'; g.strokeStyle = '#FFF6E3'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(18, by, w - 36, 68, 34); g.fill(); g.stroke();
    g.fillStyle = '#1C2440'; g.textAlign = 'center'; g.font = '400 26px "Bagel Fat One", sans-serif';
    g.fillText(inMkt ? 'IN THE MARKET' : 'HOLD TO BUY', w / 2, by + 43);
  }
  const down = e => { inMkt = true; e.preventDefault(); }, up = () => { inMkt = false; };
  const kd = e => { if (e.code === 'Space') { inMkt = true; e.preventDefault(); } }, ku = e => { if (e.code === 'Space') inMkt = false; };
  cv.addEventListener('pointerdown', down); addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('keydown', kd); addEventListener('keyup', ku);
  function frame(now) { const dt = Math.min((now - last) / 1000, 0.1); last = now; update(dt); draw(); if (!dead) raf = requestAnimationFrame(frame); }
  api.score(money(cash)); api.time(DUR);
  raf = requestAnimationFrame(frame);
  window.__game = { price, get cash() { return cash; }, get idx() { return idx; }, get dead() { return dead; }, set held(v) { inMkt = v; }, step(n, dt = 1 / 60) { for (let i = 0; i < n && !dead; i++) update(dt); draw(); } };
  return () => { dead = true; cancelAnimationFrame(raf); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
}
