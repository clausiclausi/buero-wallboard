/* Weihnachtsdeko fürs Board (ab 1.50.0)
   1) Einzelne Deko-Teile (Tannenbäume in 4 Schmuck-Designs, Stern, Geschenke, Adventskranz, Schneemann …),
      frei auf dem Board verschiebbar, größer/kleiner, löschbar. Gespeichert in settings.xmas.items.
   2) Drei komplette Weihnachts-Overlays (Rahmen, Lichterkette, Winterwald …), nur am Rand, nie über Text.
   Alles als SVG mit sparsamen CSS-Animationen; im Ruhemodus pausiert. */
(function () {
  const W = 1920, H = 1080;
  const NS = 'http://www.w3.org/2000/svg';

  // Adventskranz: so viele Kerzen brennen, wie Adventssonntage schon waren
  function adventLit(d = new Date()) {
    const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
    const xmas = new Date(y, 11, 24), a4 = new Date(xmas); a4.setDate(24 - (xmas.getDay() || 7));
    if (xmas.getDay() === 0) a4.setDate(17);
    let n = 0; for (let k = 0; k < 4; k++) { const s = new Date(a4); s.setDate(a4.getDate() - 7 * (3 - k)); if (d >= s) n = k + 1; }
    return d.getMonth() === 0 ? 4 : n;
  }

  // ---------- Deko-Teile (viewBox 0 0 100 100, Mittelpunkt = Position) ----------
  const BALLS = {
    rotgold: ['#C8102E', '#E8B923', '#C8102E', '#E8B923', '#A30D25', '#F2C94C', '#C8102E'],
    silberblau: ['#7FB2E5', '#D9E2EC', '#3F7CC0', '#C0CAD5', '#7FB2E5', '#EEF2F6', '#3F7CC0'],
    bunt: ['#FF5A5F', '#FFD23F', '#3DDC97', '#4CC9F0', '#C77DFF', '#FF9F1C', '#FF5A5F'],
    schnee: ['#FFFFFF', '#CFE3F5', '#FFFFFF', '#B9D3EE', '#FFFFFF', '#E3EEF9', '#CFE3F5'],
  };
  const SPOTS = [[50, 30], [40, 46], [60, 50], [33, 64], [52, 66], [68, 70], [44, 80]];
  function tree(v) {
    const b = BALLS[v] || BALLS.rotgold, glow = v === 'bunt';
    const snow = `<g fill="#FFFFFF" ${v === 'schnee' ? 'opacity=".95"' : 'class="xm-snowcap"'}><path d="M38 33 Q50 27 62 33 Q56 36 50 34 Q44 36 38 33Z"/><path d="M30 52 Q50 44 70 52 Q62 56 50 53 Q38 56 30 52Z"/><path d="M22 73 Q50 64 78 73 Q66 77 50 74 Q34 77 22 73Z"/></g>`;
    return `<rect x="45" y="84" width="10" height="12" rx="2" fill="#7A4A2A"/>
      <path d="M50 12 L66 36 L58 36 L74 56 L64 56 L82 80 L18 80 L36 56 L26 56 L42 36 L34 36 Z" fill="${v === 'schnee' ? '#2E6B4E' : '#1F7A3D'}" stroke="#145C2C" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M50 12 L66 36 L58 36 L74 56 L64 56 L82 80 L50 80 Z" fill="#000" opacity=".12"/>
      ${snow}
      ${v === 'bunt' ? '<path d="M38 36 Q50 42 62 36 M32 56 Q50 64 68 56 M24 78 Q50 86 76 78" fill="none" stroke="#2B2B2B" stroke-width=".8" opacity=".6"/>' : ''}
      ${SPOTS.map(([x, y], i) => `<circle class="${glow ? 'xm-blink' : ''}" style="animation-delay:${(i * .37) % 2}s" cx="${x}" cy="${y}" r="${glow ? 3.2 : 4}" fill="${b[i]}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>${glow ? '' : `<circle cx="${x - 1.2}" cy="${y - 1.4}" r="1.1" fill="#fff" opacity=".7"/>`}`).join('')}
      <path class="xm-twinkle" d="M50 2 L53 9 L60 9.5 L54.5 14 L56.5 21 L50 17 L43.5 21 L45.5 14 L40 9.5 L47 9 Z" fill="${v === 'silberblau' || v === 'schnee' ? '#E6EEF7' : '#FFD23F'}" stroke="#B8860B" stroke-width=".8"/>`;
  }
  const GIFT = { rot: ['#C8102E', '#F2C94C'], gruen: ['#1F7A3D', '#E8E8E8'], blau: ['#2F62B8', '#E8B923'], gold: ['#E8B923', '#C8102E'] };
  function gift(v) {
    const [box, rib] = GIFT[v] || GIFT.rot;
    return `<rect x="18" y="44" width="64" height="48" rx="3" fill="${box}" stroke="rgba(0,0,0,.25)"/>
      <rect x="14" y="34" width="72" height="14" rx="3" fill="${box}" stroke="rgba(0,0,0,.25)"/>
      <rect x="18" y="48" width="64" height="5" fill="#000" opacity=".12"/>
      <rect x="45" y="34" width="10" height="58" fill="${rib}"/>
      <path d="M50 34 C38 18 24 24 34 33 Z M50 34 C62 18 76 24 66 33 Z" fill="${rib}" stroke="rgba(0,0,0,.2)"/>`;
  }
  function wreath() {
    const lit = adventLit(), cols = ['#8E1B2F', '#8E1B2F', '#8E1B2F', '#8E1B2F'];
    const xs = [24, 42, 58, 76], ys = [58, 52, 52, 58];
    return `<ellipse cx="50" cy="74" rx="44" ry="15" fill="#1F7A3D" stroke="#145C2C" stroke-width="2"/>
      <ellipse cx="50" cy="72" rx="30" ry="8" fill="#0F3F22" opacity=".55"/>
      ${[10, 22, 36, 64, 78, 90].map((x, i) => `<circle cx="${x}" cy="${74 + (i % 2 ? 6 : -4)}" r="3.4" fill="#C8102E"/>`).join('')}
      ${xs.map((x, i) => `<rect x="${x - 5}" y="${ys[i]}" width="10" height="${74 - ys[i]}" rx="2" fill="${cols[i]}"/><line x1="${x}" y1="${ys[i]}" x2="${x}" y2="${ys[i] - 4}" stroke="#333" stroke-width="1"/>
        ${i < lit ? `<path class="xm-flame" style="animation-delay:${i * .23}s" d="M${x} ${ys[i] - 15} Q${x + 5} ${ys[i] - 7} ${x} ${ys[i] - 3} Q${x - 5} ${ys[i] - 7} ${x} ${ys[i] - 15}Z" fill="#FFB627"/><circle cx="${x}" cy="${ys[i] - 8}" r="9" fill="#FFD23F" opacity=".22"/>` : ''}`).join('')}`;
  }
  const PARTS = {
    baum: { name: 'Tannenbaum', short: 'Baum', vars: { rotgold: 'Rot-Gold', silberblau: 'Silber-Blau', bunt: 'Bunte Lichter', schnee: 'Verschneit' }, svg: tree, size: 150 },
    stern: { name: 'Stern', vars: { gold: 'Gold', silber: 'Silber' }, size: 70,
      svg: v => `<circle cx="50" cy="50" r="34" fill="${v === 'silber' ? '#DDE8F5' : '#FFD23F'}" opacity=".18"/><path class="xm-twinkle" d="M50 8 L61 36 L91 37 L67 56 L76 86 L50 69 L24 86 L33 56 L9 37 L39 36 Z" fill="${v === 'silber' ? '#E6EEF7' : '#FFD23F'}" stroke="${v === 'silber' ? '#8FA3B8' : '#B8860B'}" stroke-width="2" stroke-linejoin="round"/>` },
    geschenk: { name: 'Geschenk', short: 'Geschenk', vars: { rot: 'Rot', gruen: 'Grün', blau: 'Blau', gold: 'Gold' }, svg: gift, size: 70 },
    kranz: { name: 'Adventskranz', short: 'Kranz', vars: { klassisch: 'Rote Kerzen' }, svg: wreath, size: 120 },
    schneemann: { name: 'Schneemann', vars: { normal: 'Mit Schal' }, size: 120,
      svg: () => `<circle cx="50" cy="74" r="22" fill="#FFF" stroke="#B9C7D6" stroke-width="1.5"/><circle cx="50" cy="40" r="15" fill="#FFF" stroke="#B9C7D6" stroke-width="1.5"/>
        <rect x="36" y="14" width="28" height="4" rx="1" fill="#2B2B2B"/><rect x="40" y="0" width="20" height="16" rx="2" fill="#2B2B2B"/><rect x="40" y="10" width="20" height="3" fill="#C8102E"/>
        <circle cx="45" cy="37" r="1.8" fill="#2B2B2B"/><circle cx="55" cy="37" r="1.8" fill="#2B2B2B"/><path d="M50 41 L62 44 L50 45 Z" fill="#F28C1B"/>
        <path d="M36 52 Q50 58 64 52 L64 57 Q50 63 36 57 Z" fill="#C8102E"/><rect x="57" y="55" width="7" height="16" rx="2" fill="#C8102E"/>
        <circle cx="50" cy="68" r="2" fill="#2B2B2B"/><circle cx="50" cy="78" r="2" fill="#2B2B2B"/>
        <path d="M30 66 L14 54 M70 66 L86 54" stroke="#6B4423" stroke-width="2.5" stroke-linecap="round"/>` },
    kugel: { name: 'Weihnachtskugel', short: 'Kugel', vars: { rot: 'Rot', gold: 'Gold', blau: 'Blau' }, size: 70,
      svg: v => { const c = { rot: '#C8102E', gold: '#E8B923', blau: '#2F62B8' }[v] || '#C8102E';
        return `<line x1="50" y1="0" x2="50" y2="26" stroke="#8A8A8A" stroke-width="1.5"/><rect x="43" y="24" width="14" height="9" rx="2" fill="#C9A227"/>
          <circle cx="50" cy="62" r="30" fill="${c}" stroke="rgba(0,0,0,.25)"/><path d="M24 58 Q50 70 76 58" stroke="#fff" stroke-width="3" fill="none" opacity=".5"/><circle cx="39" cy="50" r="7" fill="#fff" opacity=".45"/>`; } },
    zuckerstange: { name: 'Zuckerstange', vars: { rot: 'Rot-Weiß' }, size: 80,
      svg: () => `<path d="M60 96 L60 32 A16 16 0 0 0 28 32" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round"/>
        <path d="M60 96 L60 32 A16 16 0 0 0 28 32" fill="none" stroke="#C8102E" stroke-width="12" stroke-linecap="round" stroke-dasharray="7 8"/>` },
    glocke: { name: 'Glocke', vars: { gold: 'Gold' }, size: 70,
      svg: () => `<path d="M50 14 C30 14 28 40 26 62 L18 74 L82 74 L74 62 C72 40 70 14 50 14Z" fill="#E8B923" stroke="#B8860B" stroke-width="2"/><circle cx="50" cy="80" r="7" fill="#B8860B"/>
        <path d="M50 14 C40 0 28 6 38 14 Z M50 14 C60 0 72 6 62 14 Z" fill="#C8102E"/><path d="M34 40 Q36 26 46 22" stroke="#fff" stroke-width="3" fill="none" opacity=".5"/>` },
    lichter: { name: 'Lichterkette', short: 'Lichter', vars: { bunt: 'Bunt', warm: 'Warmweiß' }, size: 200,
      svg: v => { const c = v === 'warm' ? ['#FFE7A3', '#FFD27A'] : ['#FF5A5F', '#FFD23F', '#3DDC97', '#4CC9F0', '#C77DFF'];
        return `<path d="M0 40 Q25 62 50 44 Q75 62 100 40" fill="none" stroke="#2B3A2F" stroke-width="1.4"/>` +
          [6, 18, 30, 42, 56, 68, 80, 92].map((x, i) => { const y = 40 + Math.sin((x % 50) / 50 * Math.PI) * 13 + 3; return `<circle class="xm-blink" style="animation-delay:${(i * .41) % 2}s" cx="${x}" cy="${y}" r="3.6" fill="${c[i % c.length]}"/>`; }).join(''); } },
  };

  // ---------- Overlays (ganzes Board, nur am Rand) ----------
  function swagPath(n, depth, y0 = 0) { let d = `M0 ${y0}`; const w = W / n; for (let i = 0; i < n; i++) d += ` Q${w * i + w / 2} ${y0 + depth * 2} ${w * (i + 1)} ${y0}`; return d; }
  function bulbs(n, depth, per, colors, y0 = 0, r = 4.5) {
    const w = W / n; let s = '';
    for (let i = 0; i < n; i++) for (let k = 1; k < per; k++) {
      const t = k / per, x = w * i + w * t, y = y0 + 2 * t * (1 - t) * depth * 2;
      s += `<circle class="xm-blink" style="animation-delay:${((i * per + k) * .29) % 2.4}s" cx="${x.toFixed(1)}" cy="${(y + 3).toFixed(1)}" r="${r}" fill="${colors[(i * per + k) % colors.length]}"/>`;
    }
    return s;
  }
  const OVERLAYS = {
    klassisch: { name: 'Klassisch', desc: 'Tannengirlande mit bunten Lichtern oben, rot-goldener Rahmen', svg: () =>
      `<path d="${swagPath(6, 11)}" fill="none" stroke="#1F5E35" stroke-width="9" stroke-linecap="round"/>
       <path d="${swagPath(6, 11)}" fill="none" stroke="#2E8048" stroke-width="4" stroke-dasharray="3 5" stroke-linecap="round"/>
       ${bulbs(6, 11, 7, ['#FF5A5F', '#FFD23F', '#3DDC97', '#4CC9F0', '#C77DFF'])}
       ${[0, 1, 2, 3, 4, 5, 6].map(i => `<g transform="translate(${i * W / 6} 4)"><path d="M0 0 C-14 -8 -16 10 0 2 C16 10 14 -8 0 0Z" fill="#C8102E"/><circle r="3" fill="#A30D25"/></g>`).join('')}`,
      frame: 'inset 0 0 0 5px rgba(200,16,46,.35), inset 0 0 0 7px rgba(232,185,35,.35), inset 0 0 60px rgba(200,16,46,.12)' },
    winterwald: { name: 'Winterwald', desc: 'Grüne Tannen am unteren Rand (werden bei Schnee weiß), funkelnde Sterne oben, kühler Rahmen', svg: () => {
      let trees = '', x = -10, i = 0;
      while (x < W + 20) { const h = 18 + ((i * 37) % 19), w = h * .7; trees += `<path d="M${x} ${H} L${x + w / 2} ${H - h} L${x + w} ${H} Z"/><path class="xm-snowcap wald" d="M${x + w * .22} ${H - h * .5} L${x + w / 2} ${H - h - 1} L${x + w * .78} ${H - h * .5} Q${x + w / 2} ${H - h * .38} ${x + w * .22} ${H - h * .5} Z" fill="#fff"/>`; x += w * .62; i++; }
      let stars = ''; for (let k = 0; k < 26; k++) { const sx = (k * 157 + 40) % W, sy = 4 + (k * 7) % 14; stars += `<circle class="xm-blink" style="animation-delay:${(k * .53) % 3}s" cx="${sx}" cy="${sy}" r="${1.4 + (k % 3) * .6}" fill="#EAF4FF"/>`; }
      return `<g fill="#1F6B3A" opacity=".9">${trees}</g>${stars}`; },
      frame: 'inset 0 0 0 4px rgba(140,190,235,.35), inset 0 0 70px rgba(140,190,235,.18)' },
    gemuetlich: { name: 'Gemütlich', desc: 'Warmweiße Lichterkette mit Strohsternen, warmer Schimmer am Rand', svg: () => {
      const star = (x, y, r) => `<g transform="translate(${x} ${y})" stroke="#D9B26A" stroke-width="1.6" stroke-linecap="round">${[0, 45, 90, 135].map(a => `<line x1="${-r}" y1="0" x2="${r}" y2="0" transform="rotate(${a})"/>`).join('')}<circle r="2" fill="#C8102E" stroke="none"/></g>`;
      return `<path d="${swagPath(8, 9)}" fill="none" stroke="#5A4632" stroke-width="1.2"/>
        ${bulbs(8, 9, 9, ['#FFE7A3', '#FFD27A'], 0, 3.6)}
        ${[1, 3, 5, 7].map(i => star(i * W / 8 - W / 16, 18, 9)).join('')}`; },
      frame: 'inset 0 0 0 4px rgba(217,178,106,.35), inset 0 0 80px rgba(255,190,110,.18)' },
  };

  function create(stage, { onSave, scale }) {
    const ov = document.createElement('div'); ov.className = 'xmas-ov'; ov.setAttribute('aria-hidden', 'true');
    const layer = document.createElement('div'); layer.className = 'xmas-layer';
    stage.append(ov, layer);
    let cfg = { items: [], overlay: 'aus', when: 'saison' }, editing = null, sel = null;

    const inSeason = (d = new Date()) => { const m = d.getMonth() + 1, day = d.getDate(); return (m === 11 && day >= 15) || m === 12 || (m === 1 && day <= 6); };
    const active = () => cfg.when === 'an' || (cfg.when === 'saison' && inSeason()) || !!editing;

    function itemEl(it) {
      const P = PARTS[it.t]; if (!P) return null;
      const el = document.createElement('div'); el.className = 'xm-item'; el.dataset.id = it.id;
      const sz = P.size * (it.s || 1);
      el.style.cssText = `left:${it.x - sz / 2}px;top:${it.y - sz / 2}px;width:${sz}px;height:${sz}px`;
      el.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%">${P.svg(it.v)}</svg>`;
      return el;
    }
    function render() {
      const on = active();
      const o = OVERLAYS[cfg.overlay];
      ov.innerHTML = on && o ? `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${o.svg()}</svg>` : '';
      ov.style.boxShadow = on && o ? o.frame : '';
      layer.innerHTML = '';
      if (!on) return;
      for (const it of cfg.items) { const el = itemEl(it); if (el) { if (sel === it.id) el.classList.add('sel'); layer.append(el); } }
    }
    let lastKey = '';
    function apply(c) { if (editing) return; const key = JSON.stringify(c || {}) + inSeason(); if (key === lastKey) return; lastKey = key; cfg = Object.assign({ items: [], overlay: 'aus', when: 'saison' }, c || {}); cfg.items = (cfg.items || []).slice(); render(); }

    // ---------- Bearbeiten: Teile hinzufügen, ziehen, Größe, löschen ----------
    function edit(host) {
      if (editing) return;
      editing = true; sel = null; stage.classList.add('xm-editing');
      const bar = document.createElement('div'); bar.className = 'xm-bar';
      const save = () => onSave && onSave({ items: cfg.items });
      const pal = Object.entries(PARTS).flatMap(([t, P]) => Object.entries(P.vars).map(([v, label]) =>
        `<button type="button" class="xm-add" data-t="${t}" data-v="${v}" title="${P.name}: ${label}"><svg viewBox="0 0 100 100">${P.svg(v)}</svg><span><b>${P.short || P.name}</b>${Object.keys(P.vars).length > 1 ? label : ''}</span></button>`)).join('');
      bar.innerHTML = `<div class="xm-head"><b>Deko anordnen</b><span class="xm-hint">Teil antippen zum Hinzufügen, auf dem Board ziehen zum Verschieben. Antippen wählt aus.</span>
          <span class="xm-selbtns"><button type="button" class="btn" data-a="kleiner">Kleiner</button><button type="button" class="btn" data-a="groesser">Größer</button><button type="button" class="btn" data-a="loeschen">Löschen</button></span>
          <button type="button" class="btn" data-a="pos">Leiste nach oben</button><button type="button" class="btn" data-a="alle">Alle entfernen</button><button type="button" class="btn primary" data-a="fertig">Fertig</button></div>
        <div class="xm-pal">${pal}</div>`;
      host.append(bar);
      const selBtns = bar.querySelector('.xm-selbtns');
      const upd = () => { selBtns.hidden = !sel; render(); };
      upd();
      bar.querySelectorAll('.xm-add').forEach(b => b.onclick = () => {
        if (cfg.items.length >= 40) return;
        const id = Math.random().toString(36).slice(2, 9);
        // neu in die Mitte, leicht versetzt, damit mehrere nicht genau übereinander liegen
        const k = cfg.items.length % 6;
        cfg.items.push({ id, t: b.dataset.t, v: b.dataset.v, x: 960 + (k - 3) * 40, y: 600 + (k % 3) * 30, s: 1 });
        sel = id; upd(); save();
      });
      bar.onclick = (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
        const it = cfg.items.find(i => i.id === sel);
        if (a === 'kleiner' && it) it.s = Math.max(.4, +(it.s - .15).toFixed(2));
        if (a === 'groesser' && it) it.s = Math.min(3, +(it.s + .15).toFixed(2));
        if (a === 'loeschen' && it) { cfg.items = cfg.items.filter(i => i !== it); sel = null; }
        if (a === 'pos') { const top = bar.classList.toggle('top'); e.target.textContent = top ? 'Leiste nach unten' : 'Leiste nach oben'; return; }
        if (a === 'alle') { cfg.items = []; sel = null; }
        if (a === 'fertig') { editing = null; lastKey = ''; sel = null; stage.classList.remove('xm-editing'); bar.remove(); layer.onpointerdown = null; save(); render(); return; }
        upd(); save();
      };
      layer.onpointerdown = (e) => {
        const el = e.target.closest('.xm-item'); if (!el) { sel = null; upd(); return; }
        e.preventDefault();
        const it = cfg.items.find(i => i.id === el.dataset.id); if (!it) return;
        sel = it.id; layer.querySelectorAll('.xm-item').forEach(x => x.classList.toggle('sel', x === el)); selBtns.hidden = false;
        const s = scale(), sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y, P = PARTS[it.t], half = P.size * (it.s || 1) / 2;
        el.setPointerCapture(e.pointerId);
        el.onpointermove = (m) => {
          it.x = Math.round(Math.min(W - half * .3, Math.max(half * .3, ox + (m.clientX - sx) / s)));
          it.y = Math.round(Math.min(H - half * .3, Math.max(half * .3, oy + (m.clientY - sy) / s)));
          el.style.left = it.x - half + 'px'; el.style.top = it.y - half + 'px';
        };
        el.onpointerup = el.onpointercancel = () => { el.onpointermove = el.onpointerup = el.onpointercancel = null; save(); };
      };
    }
    // Tagesgrenze (Saison, Adventskerzen) einmal pro Stunde prüfen
    setInterval(() => { if (!editing) { lastKey = ''; render(); } }, 3600000);
    return { apply, edit, render, get editing() { return !!editing; } };
  }
  window.WBXmas = { create, PARTS, OVERLAYS, adventLit };
})();
