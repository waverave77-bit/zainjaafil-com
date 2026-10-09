/* All Hands. Some of the team has checked out. Asking one person for their take flips them and whoever sits next to them.
   Get the whole room on board, then do it again with a bigger, harder room, before the clock runs out. */
export default function allhands(stage, api) {
  const el = document.createElement('div');
  el.className = 'g';
  el.innerHTML = '<div class="ms-top"><span>Room<b id="al">1</b></span><span>Asks<b id="am">0</b></span><span>Par<b id="ap">0</b></span></div><div class="ah" id="ag"></div><div class="flash" id="af">Tap someone to ask what they think</div>';
  stage.appendChild(el);
  const q = s => el.querySelector(s), grid = q('#ag');
  let n = 3, cells = [], pending = new Set(), level = 1, moves = 0, score = 0, time = 75, locked = false, dead = false, raf = 0, last = performance.now(), timer = 0;

  const flip = i => {
    const x = i % n, y = (i / n) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < n && ny < n) cells[ny * n + nx] = !cells[ny * n + nx]; }
  };
  function paint() {
    [...grid.children].forEach((b, i) => { b.classList.toggle('in', cells[i]); b.setAttribute('aria-label', cells[i] ? 'On board' : 'Checked out'); });
    q('#al').textContent = level; q('#am').textContent = moves;
  }
  function deal() {
    n = level < 3 ? 3 : level < 7 ? 4 : 5;
    const k = Math.min(n * n - 2, 2 + level);
    do {
      cells = Array(n * n).fill(true); pending = new Set();
      while (pending.size < k) pending.add(Math.floor(Math.random() * n * n));
      for (const i of pending) flip(i);
    } while (cells.every(Boolean));
    moves = 0; locked = false;
    grid.style.setProperty('--n', n);
    grid.innerHTML = Array.from({ length: n * n }, (_, i) => `<button class="ah-p" data-i="${i}"><i></i><i></i><u></u></button>`).join('');
    q('#ap').textContent = k;
    paint();
  }
  function ask(i) {
    if (locked || dead) return;
    flip(i); moves++;
    pending.has(i) ? pending.delete(i) : pending.add(i);
    q('#af').textContent = '';
    paint();
    if (cells.every(Boolean)) {
      locked = true; score++; level++; api.score(score);
      q('#af').textContent = 'Everyone is in';
      timer = setTimeout(deal, 650);
    }
  }
  grid.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) ask(+b.dataset.i); });
  function update(dt) {
    if (dead) return;
    time -= dt; api.time(Math.max(0, Math.ceil(time)));
    if (time <= 0) { dead = true; api.end(score, `${score} ${score === 1 ? 'room' : 'rooms'} brought on board. In the real class, I do this by asking everyone and putting it to a vote.`); }
  }
  function frame(now) { const dt = Math.min((now - last) / 1000, 0.1); last = now; update(dt); if (!dead) raf = requestAnimationFrame(frame); }
  api.score(0); api.time(75);
  deal();
  raf = requestAnimationFrame(frame);
  window.__game = { ask, get cells() { return cells.slice(); }, get pending() { return [...pending]; }, get n() { return n; }, get level() { return level; }, get score() { return score; }, get dead() { return dead; }, get locked() { return locked; },
    step(n2, dt = 1 / 60) { for (let i = 0; i < n2 && !dead; i++) update(dt); } };
  return () => { dead = true; cancelAnimationFrame(raf); clearTimeout(timer); };
}
