const V = '3';   /* bump on every deploy so browsers fetch the new files */
const $ = (s, el = document) => el.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('en-US');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
};

/* ---------- bounty: every game's best score, added up ---------- */
const GAMES = {
  switchboard: { name: 'Switchboard', worth: 300000, timed: false, how: 'Callers ring in on the left. Drag a wire from a caller to any green rep before they hang up. Wires cannot cross a call that is still going. Three hang ups and you are done.' },
  streak: { name: 'Streak', worth: 300000, timed: false, how: 'A marker runs around the ring. Tap while it is inside the green zone to add a day. The zone shrinks, the marker speeds up, and one miss ends the streak.' },
  allhands: { name: 'All Hands', worth: 1500000, timed: true, how: 'Some of the team has checked out. Asking one person flips them and the people sitting next to them. Get everyone on board, as many rooms as you can in 75 seconds.' },
  soccer: { name: 'Two a side', worth: 2000000, timed: true, how: 'Your player follows your finger or mouse. Run through the ball to kick it. Score in the top goal. Win and they get faster.' },
  hundredk: { name: 'The $100K Challenge', worth: 500000, timed: true, how: 'You have $100,000 and thirty seconds of a moving market. Hold anywhere to be in the market, let go to sit in cash. Walk away with as much as you can.' },
  room: { name: 'Win the Room', worth: 500000, timed: false, how: 'Every judge has a favourite four slide pitch. Build a deck and pitch it. Green is the right slide in the right spot, yellow is the right slide in the wrong spot, grey means they do not care. Six tries per judge.' }
};
let best = store.get('zj.best3', {});
const bounty = () => Object.keys(GAMES).reduce((sum, id) => sum + (best[id] || 0) * GAMES[id].worth, 0);
let shown = 0;
function paintBounty(instant) {
  const target = bounty();
  if (instant) shown = target;
  const tick = () => {
    shown += (target - shown) * 0.16;
    if (Math.abs(target - shown) < 500) shown = target;
    $('#bounty').textContent = fmt(shown); $('#amt').textContent = fmt(shown);
    if (shown !== target) requestAnimationFrame(tick);
  };
  tick();
}
paintBounty(true);

/* ---------- name: one balloon per letter ---------- */
{
  const el = $('#name'), words = el.textContent.trim().split(' ');
  let i = 0;
  el.innerHTML = words.map(w => '<span class="w">' + [...w].map(ch => `<span class="l" style="--i:${i++}" aria-hidden="true">${ch}</span>`).join('') + '</span>').join(' ');
  el.addEventListener('pointerdown', e => {
    const l = e.target.closest('.l');
    if (!l) return;
    l.classList.remove('squish'); void l.offsetWidth; l.classList.add('squish');
  });
}
for (const c of document.querySelectorAll('.cloud')) c.addEventListener('click', () => {
  c.classList.add('puff'); setTimeout(() => c.classList.remove('puff'), 520);
});

/* ---------- menu ---------- */
{
  const b = $('#burger'), m = $('#menu');
  const set = on => { m.classList.toggle('open', on); b.setAttribute('aria-expanded', on); };
  b.addEventListener('click', () => set(!m.classList.contains('open')));
  m.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
}

/* ---------- the bust ---------- */
let hero = null;
const mug = () => { if (hero) try { $('#mug').src = hero.snapshot(480); } catch (_) {} };
import(`./hero.js?v=${V}`).then(({ mountHero }) => {
  hero = mountHero($('#bust'), $('#top'));
  new IntersectionObserver(es => hero.setActive(es[0].isIntersecting), { threshold: 0.02 }).observe($('#top'));
  if (store.get('zj.hat', false)) { hero.wearHat(); $('#hatline').textContent = 'Scroll up. It fits.'; $('#hat').style.visibility = 'hidden'; }
  setTimeout(mug, 900);
  window.__hero = hero;
}).catch(err => { console.error('bust failed to load', err); $('#bust').hidden = true; });

/* ---------- props ---------- */
const seen = new Map();
const io = new IntersectionObserver(es => { for (const e of es) seen.set(e.target, e.isIntersecting); }, { threshold: 0.05 });
function fitCanvas(cv) {
  const d = Math.min(devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  return [g, w, h];
}
const loops = [];
const bounce = el => { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); };
function confetti(host, x, y, n = 26) {
  const cols = ['#FFC83D', '#E5533D', '#58B8F2', '#6CC36A', '#fff'];
  for (let i = 0; i < n; i++) {
    const b = document.createElement('i'), a = Math.random() * 6.283, d = 70 + Math.random() * 150;
    b.className = 'bit'; b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.background = cols[i % cols.length];
    b.style.setProperty('--dx', Math.cos(a) * d + 'px'); b.style.setProperty('--dy', Math.sin(a) * d - 60 + 'px'); b.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    host.appendChild(b); setTimeout(() => b.remove(), 1050);
  }
}

{ /* Vitalis: listen in, catch an objection */
  const bars = $('#bars'), heard = $('#heard'), kinds = ['Objection heard: price', 'Objection heard: contract', 'Objection heard: hardware', 'Objection heard: competitor'];
  bars.innerHTML = Array.from({ length: 22 }, (_, i) => `<i style="--i:${i};--h:${(0.25 + 0.75 * Math.abs(Math.sin(i * 1.7))).toFixed(2)}"></i>`).join('');
  let i = 0, t;
  bars.addEventListener('click', () => { heard.textContent = kinds[i++ % kinds.length]; heard.classList.add('on'); clearTimeout(t); t = setTimeout(() => heard.classList.remove('on'), 1800); });
}
{ /* IMpowered: the gym floor screen. Check in and watch the streak */
  const lines = ['Tap check in', 'Day one. Good start.', 'Two in a row.', 'Three. That is a streak.', 'Four. Do not break it now.', 'Five days straight.', 'Six. One more for the week.', 'One week. You are on the board.'];
  let n = 0;
  $('#cin').addEventListener('click', () => {
    n++;
    $('#st').textContent = n; $('#sh').textContent = lines[Math.min(n, lines.length - 1)];
    bounce($('#st'));
    if (n % 7 === 0) { const box = $('#p-tv'); confetti(box, box.clientWidth / 2, 90, 30); }
  });
}
{ /* Modjewel: modular pieces, tap one to swap it */
  const shapes = ['round', 'square', 'diamond', 'pill'], cols = ['#FFC83D', '#E5533D', '#58B8F2', '#6CC36A', '#B4489B', '#FFF6E3'], chain = $('#chain');
  chain.innerHTML = Array.from({ length: 7 }, (_, i) => `<button class="gem ${shapes[i % 4]}" style="--c:${cols[i % 6]}" data-s="${i % 4}" data-c="${i % 6}" aria-label="Swap this piece"></button>`).join('');
  chain.addEventListener('click', e => {
    const b = e.target.closest('.gem'); if (!b) return;
    const s = (+b.dataset.s + 1) % 4, c = (+b.dataset.c + 1 + Math.floor(Math.random() * 3)) % 6;
    b.dataset.s = s; b.dataset.c = c; b.className = 'gem ' + shapes[s]; b.style.setProperty('--c', cols[c]);
    bounce(b);
  });
}
{ /* soccer: keep it up */
  const box = $('#p-ball'), cv = $('canvas', box), out = $('#jug');
  const b = { x: 0, y: 60, vx: 40, vy: 0, r: 26, spin: 0 };
  let count = 0, started = false;
  io.observe(box);
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (Math.hypot(px - b.x, py - b.y) > b.r + 46) return;
    b.vy = -560; b.vx = clamp((b.x - px) * 7 + b.vx * 0.3, -260, 260); b.spin += (b.x - px) * 0.3;
    count++; out.textContent = count;
  });
  loops.push(dt => {
    if (!seen.get(box)) return;
    const [g, w, h] = fitCanvas(cv), floor = h - 34;
    if (!started) { b.x = w / 2; started = true; }
    b.vy += 1500 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.spin *= Math.exp(-dt);
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; } if (b.x > w - b.r) { b.x = w - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
    if (b.y > floor - b.r) { b.y = floor - b.r; if (Math.abs(b.vy) > 60 && count) { count = 0; out.textContent = '0'; } b.vy = -Math.abs(b.vy) * 0.55; b.vx *= 0.9; if (Math.abs(b.vy) < 40) b.vy = 0; }
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(28,36,64,.16)'; g.beginPath(); g.ellipse(b.x, floor + 6, b.r * (0.5 + 0.5 * Math.min(1, b.y / floor)), 6, 0, 0, 7); g.fill();
    g.strokeStyle = '#1C2440'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, floor + 2); g.lineTo(w, floor + 2); g.stroke();
    g.save(); g.translate(b.x, b.y); g.rotate(b.x * 0.02 + b.spin * 0.02);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, b.r, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#1C2440'; g.beginPath(); g.arc(0, 0, b.r * 0.34, 0, 7); g.fill();
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; g.beginPath(); g.arc(Math.cos(a) * b.r * 0.86, Math.sin(a) * b.r * 0.86, b.r * 0.2, 0, 7); g.fill(); }
    g.restore();
  });
}
{ /* Mr. Guy Invests: lessons, XP, level up */
  const topics = ['What a stock is', 'What an index fund is', 'Why fees matter', 'Risk and time', 'How compounding works', 'Why you spread it out'];
  let xp = 0, level = 1, lesson = 0;
  $('#xpb').addEventListener('click', () => {
    xp += 34; lesson++;
    if (xp >= 100) { xp -= 100; level++; $('#lv').textContent = level; bounce($('#lv')); const box = $('#p-xp'); confetti(box, box.clientWidth / 2, 80, 26); }
    $('#xpf').style.transform = `scaleX(${xp / 100})`;
    $('#xpl').textContent = `Lesson ${lesson + 1}: ${topics[lesson % topics.length]}`;
  });
}
$('.trophy').addEventListener('click', e => {
  const t = e.currentTarget, box = $('#p-trophy'), r = box.getBoundingClientRect(), tr = t.getBoundingClientRect();
  bounce(t);
  confetti(box, tr.left - r.left + tr.width / 2, tr.top - r.top + 40);
});
$('#hat').addEventListener('click', e => {
  const h = e.currentTarget;
  h.classList.add('thrown');
  setTimeout(() => { h.style.visibility = 'hidden'; $('#hatline').textContent = 'Scroll up. It fits.'; if (hero) { hero.wearHat(); setTimeout(mug, 1200); } store.set('zj.hat', true); }, 650);
});

let last = performance.now();
(function tick(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
  for (const f of loops) f(dt);
  requestAnimationFrame(tick);
})(last);

/* ---------- game window ---------- */
const modal = $('#modal'), stage = $('#stage');
let current = null, cleanup = null;
function cover(html) {
  $('.cover', stage)?.remove();
  const c = document.createElement('div'); c.className = 'cover'; c.innerHTML = html; stage.appendChild(c); return c;
}
function intro(id) {
  const meta = GAMES[id];
  const c = cover(`<h4>${meta.name}</h4><p>${meta.how}</p><div class="row"><button class="play" data-go>Play</button></div>`);
  $('[data-go]', c).addEventListener('click', () => run(id));
}
async function run(id) {
  stop();
  stage.innerHTML = '';
  $('#gscore').textContent = '0'; $('#gtime').textContent = '';
  const api = {
    score: v => { $('#gscore').textContent = v; },
    time: v => { $('#gtime').textContent = v; },
    end: (score, line) => finish(id, score, line)
  };
  try { const mod = await import(`./games/${id}.js?v=${V}`); if (current === id) cleanup = mod.default(stage, api); }
  catch (err) { console.error(err); cover('<h4>That one broke</h4><p>Sorry. Try another game.</p>'); }
}
function stop() { if (cleanup) { try { cleanup(); } catch (_) {} cleanup = null; } }
function finish(id, score, line) {
  stop();
  const meta = GAMES[id], prev = best[id] || 0, isBest = score > prev;
  if (isBest) { best[id] = score; store.set('zj.best3', best); paintBounty(); }
  $('#gbest').textContent = best[id] || 0;
  const gained = isBest ? (score - prev) * meta.worth : 0;
  const c = cover(`<h4>${isBest ? 'New best' : 'Game over'}</h4><div class="big">${score}</div><p>${line || ''}</p>${gained ? `<p><b>+${fmt(gained)}</b> to the bounty</p>` : ''}
    <div class="row"><button class="play" data-go>Again</button><button class="btn2" data-x>Close</button></div>`);
  $('[data-go]', c).addEventListener('click', () => run(id));
  $('[data-x]', c).addEventListener('click', close);
  if (isBest) confetti(c, c.clientWidth / 2, c.clientHeight / 2 - 40, 34);
}
function open(id) {
  if (!GAMES[id]) return;
  current = id;
  $('#gname').textContent = GAMES[id].name; $('#gbest').textContent = best[id] || 0; $('#gscore').textContent = '0'; $('#gtime').textContent = '';
  $('#gtimewrap').style.visibility = GAMES[id].timed ? 'visible' : 'hidden';
  stage.innerHTML = '';
  modal.classList.add('on'); document.body.style.overflow = 'hidden';
  intro(id);
}
function close() { stop(); current = null; stage.innerHTML = ''; modal.classList.remove('on'); document.body.style.overflow = ''; }
document.addEventListener('click', e => { const b = e.target.closest('[data-game]'); if (b) open(b.dataset.game); });
$('#gclose').addEventListener('click', close);
modal.addEventListener('pointerdown', e => { if (e.target === modal) close(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && current) close(); });
window.__site = { open, close, run, bounty, games: Object.keys(GAMES), get best() { return best; } };
