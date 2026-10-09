/* Win the Room. Every judge has a favourite four slide pitch. Build a deck, pitch it, and read the room:
   green is the right slide in the right spot, yellow is a slide they want but somewhere else, grey is a slide they do not care about.
   Six pitches per judge. Win one and the next judge walks in. */
const SLIDES = [
  { id: 'problem', name: 'Problem', c: '#FF9A8A' }, { id: 'fix', name: 'Fix', c: '#9BE08A' }, { id: 'market', name: 'Market', c: '#9AD9F7' },
  { id: 'demo', name: 'Demo', c: '#FFC83D' }, { id: 'team', name: 'Team', c: '#E9B8F0' }, { id: 'ask', name: 'Ask', c: '#FFD9A8' }
];
const MOOD = ['The judge is checking their phone.', 'A polite nod.', 'The judge writes something down.', 'The judge leans in.', 'Sold.'];
const BY = Object.fromEntries(SLIDES.map(s => [s.id, s]));

export default function room(stage, api) {
  const el = document.createElement('div');
  el.className = 'g';
  el.innerHTML = '<div class="ms-top"><span>Judge<b id="rj">1</b></span><span>Pitches left<b id="rl">6</b></span></div><div class="rm" id="rb"></div><div class="flash" id="rf" style="font-size:18px">Pick four slides, in order</div>' +
    '<div class="rm-pal" id="rp">' + SLIDES.map(s => `<button class="cardb" data-s="${s.id}" style="--c:${s.c}">${s.name}</button>`).join('') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 2fr;gap:10px"><button class="btn2" id="rc">Clear</button><button class="play" id="rg" style="margin:0">Pitch it</button></div>';
  stage.appendChild(el);
  const q = s => el.querySelector(s);
  let secret = [], rows = [], cur = [], judge = 1, total = 0, locked = false, dead = false, timer = 0, dull = new Set();

  function deal() {
    secret = SLIDES.map(s => s.id).sort(() => Math.random() - 0.5).slice(0, 4);
    rows = []; cur = []; dull = new Set(); locked = false;
    q('#rj').textContent = judge; q('#rf').textContent = 'Pick four slides, in order';
    paint();
  }
  const mark = guess => guess.map((id, i) => id === secret[i] ? 'ok' : secret.includes(id) ? 'near' : 'no');
  function paint() {
    let html = '';
    for (let r = 0; r < 6; r++) {
      const done = rows[r], live = r === rows.length && !locked;
      html += '<div class="rm-row">';
      for (let i = 0; i < 4; i++) {
        const id = done ? done.guess[i] : live ? cur[i] : null, cls = done ? done.marks[i] : live && id ? 'live' : '';
        html += `<button class="rm-s ${cls}" ${live && id ? `data-x="${i}"` : 'disabled'} style="${id && !done ? `--c:${BY[id].c}` : ''}">${id ? BY[id].name : ''}</button>`;
      }
      html += '</div>';
    }
    q('#rb').innerHTML = html;
    q('#rl').textContent = 6 - rows.length;
    for (const b of q('#rp').children) { b.classList.toggle('dull', dull.has(b.dataset.s)); b.classList.toggle('used', cur.includes(b.dataset.s)); }
  }
  function add(id) { if (locked || dead || cur.length >= 4 || cur.includes(id)) return; cur.push(id); paint(); }
  function pitch() {
    if (locked || dead) return;
    if (cur.length < 4) { q('#rf').textContent = 'A pitch needs four slides'; return; }
    const marks = mark(cur), right = marks.filter(m => m === 'ok').length;
    cur.forEach((id, i) => { if (marks[i] === 'no') dull.add(id); });
    rows.push({ guess: cur, marks }); cur = [];
    q('#rf').textContent = MOOD[right];
    if (right === 4) {
      locked = true; total += 7 - rows.length; judge++; api.score(total);
      paint(); timer = setTimeout(deal, 1300);
    } else if (rows.length >= 6) {
      locked = true; dead = true; paint();
      q('#rf').textContent = 'They wanted: ' + secret.map(id => BY[id].name).join(', ');
      timer = setTimeout(() => api.end(total, `You won over ${judge - 1} ${judge - 1 === 1 ? 'judge' : 'judges'}. My real one was at Berkeley Haas, against thirty teams.`), 1900);
    } else paint();
  }
  el.addEventListener('click', e => {
    const s = e.target.closest('[data-s]'), x = e.target.closest('[data-x]');
    if (s) add(s.dataset.s);
    else if (x && !locked) { cur.splice(+x.dataset.x, 1); paint(); }
    else if (e.target.closest('#rc') && !locked) { cur = []; paint(); }
    else if (e.target.closest('#rg')) pitch();
  });
  api.score(0);
  deal();
  window.__game = { get secret() { return secret.slice(); }, get total() { return total; }, get judge() { return judge; }, get dead() { return dead; }, get tries() { return rows.length; }, get marks() { return rows.map(r => r.marks.join(',')); },
    guess(ids) { cur = []; ids.forEach(add); pitch(); } };
  return () => { dead = true; clearTimeout(timer); };
}
