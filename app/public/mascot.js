// AOK-Maskottchen: Die Buchstaben A, O, K sitzen auf einer Kachel. Alle paar Minuten setzen sie sich zu einer
// Figur zusammen, die zur nächsten Kachel läuft oder springt, sich hinsetzt, winkt und wieder zu „AOK“ wird.
// Die Figur liegt in einer eigenen Ebene über den Kacheln und fängt keine Klicks ab.
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
  const lerp = (a, b, u) => a + (b - a) * u;
  const clamp = u => Math.max(0, Math.min(1, u));
  const ease = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const sstep = (a, b, u) => { const k = clamp((u - a) / (b - a)); return k * k * (3 - 2 * k); };
  const P = (x, y) => [x, y];
  const polar = (o, len, ang) => [o[0] + Math.sin(ang) * len, o[1] + Math.cos(ang) * len]; // 0 = nach unten, PI = nach oben
  const rnd = Array.from({ length: 80 }, (_, i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1));
  function mix(a, b, u) {
    const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const A = h(a), B = h(b);
    return '#' + A.map((v, i) => Math.round(lerp(v, B[i], u)).toString(16).padStart(2, '0')).join('');
  }
  function curve(a, b, bend) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }

  const FONTS = {
    strich: { name: 'Strich (wie die Figur)', css: null },
    segoe: { name: 'Klar', css: "'Segoe UI', system-ui, sans-serif" },
    rund: { name: 'Handschrift', css: "'Segoe Print', 'Comic Sans MS', cursive" },
    technik: { name: 'Technisch', css: "Bahnschrift, 'DIN Alternate', 'Segoe UI', sans-serif" },
    kraeftig: { name: 'Kräftig', css: "'Arial Black', 'Segoe UI Black', sans-serif" },
    klassisch: { name: 'Klassisch', css: "Georgia, 'Times New Roman', serif" },
    verspielt: { name: 'Verspielt', css: "'Comic Sans MS', 'Segoe Print', cursive" },
  };
  const FIGS = { strich: 'Strichmännchen', kugel: 'Kugel', katze: 'Kätzchen', geist: 'Lichtgeist' };
  const SIZES = { klein: .42, mittel: .55, gross: .72 };
  const DEFAULTS = { fig: 'strich', color: '#7FE0AE', text: '', font: 'strich', every: 'zufall', size: 'mittel' };

  // ---------- Posen (Koordinaten in 1/3 Board-Pixeln, Füße bei x/y) ----------
  function letterPose(x, y, t) {
    const b = Math.sin(t * 2.4) * 1.2, x0 = x - 38, h = 30; y += b;
    return {
      L: [[P(x0, y), P(x0 + 10, y - h)], [P(x0 + 20, y), P(x0 + 10, y - h)], [P(x0 + 4, y - 11), P(x0 + 16, y - 11)],
          [P(x0 + 58, y), P(x0 + 58, y - h)], [P(x0 + 58, y - 12), P(x0 + 75, y - h)], [P(x0 + 64, y - 17), P(x0 + 76, y)]],
      O: { cx: x0 + 37, cy: y - 15, rx: 10, ry: 15 }
    };
  }
  // Strichmännchen: O = Kopf, K = Rumpf und Arme, A = Beine und Mund
  function poseStick(s) {
    const { x, y, walk: a, sit, wave, air, t } = s;
    const p = s.dist * 0.28;
    const hip = P(x, lerp(y - 21 - Math.abs(Math.sin(p)) * 2 * a, y - 1, sit) + air * 4);
    const neck = P(hip[0], hip[1] - 22), sh = P(hip[0], hip[1] - 18);
    const th = Math.sin(p) * .55 * a, dang = Math.sin(t * 4) * .35 * sit;
    let fl = polar(hip, 21, th + dang - .5 * sit), fr = polar(hip, 21, -th - dang + .5 * sit);
    fl = [lerp(fl[0], hip[0] - 8, air), lerp(fl[1], hip[1] + 13, air)];
    fr = [lerp(fr[0], hip[0] + 8, air), lerp(fr[1], hip[1] + 13, air)];
    const armR = lerp(lerp(.25 - Math.sin(p) * .6 * a, 2.5, air), 1.95 + .4 * Math.sin(t * 9), wave);
    const armL = lerp(-.25 + Math.sin(p) * .6 * a, -2.5, air);
    const head = { cx: neck[0], cy: neck[1] - 11, rx: 11.5, ry: 10.5 };
    return {
      L: [[fl, hip], [fr, hip], [P(head.cx - 3 + s.dir, head.cy + 4), P(head.cx + 3 + s.dir, head.cy + 4), .9],
          [hip, neck], [sh, polar(sh, 17 + 3 * wave, armR)], [sh, polar(sh, 17, armL)]],
      O: head, eyes: [P(head.cx - 4.5 + s.dir, head.cy - 1.5), P(head.cx + 4.5 + s.dir, head.cy - 1.5)],
      cheeks: [P(head.cx - 7.5 + s.dir, head.cy + 3), P(head.cx + 7.5 + s.dir, head.cy + 3)], er: 1.9
    };
  }
  // Kugel: O = Körper, A = Füße und Lächeln, K = Fühler und Ärmchen
  function poseBall(s) {
    const { x, y, walk: a, sit, wave, air, t } = s;
    const p = s.dist * 0.16;
    const hop = Math.abs(Math.sin(p)) * 11 * a;
    const sq = (1 - Math.abs(Math.sin(p))) * .12 * a - air * .06 + Math.sin(t * 3) * .02;
    const rx = 17 * (1 + sq), ry = 17 * (1 - sq);
    const c = P(x, lerp(y - 6 - ry - hop, y - 9, sit) - air * 2);
    const ft = lerp(y - hop, y + 9, sit), sway = Math.sin(t * 4) * 2.5 * sit;
    const tucked = air > .05 || hop > 2;
    const fl = tucked ? P(c[0] - 7, c[1] + ry + 5) : P(c[0] - 8 + sway, ft);
    const fr = tucked ? P(c[0] + 7, c[1] + ry + 5) : P(c[0] + 8 - sway, ft);
    const flap = Math.sin(t * 14) * 5 * (a + air);
    const handR = P(lerp(c[0] + rx + 9, c[0] + rx + 6, wave), lerp(c[1] - 2 + flap, c[1] - 18 + Math.sin(t * 9) * 5, wave));
    const tip = P(c[0] + Math.sin(t * 5) * 4 - s.dir * 3 * a, c[1] - ry - 11);
    return {
      L: [[P(c[0] - 7, c[1] + ry - 3), fl], [P(c[0] + 7, c[1] + ry - 3), fr], [P(c[0] - 5 + s.dir * 2, c[1] + 5), P(c[0] + 5 + s.dir * 2, c[1] + 5), .7],
          [P(c[0], c[1] - ry), tip], [P(c[0] + rx, c[1] + 1), handR], [P(c[0] - rx, c[1] + 1), P(c[0] - rx - 9, c[1] - 2 - flap)]],
      O: { cx: c[0], cy: c[1], rx, ry }, eyes: [P(c[0] - 6 + s.dir * 2, c[1] - 4), P(c[0] + 6 + s.dir * 2, c[1] - 4)],
      cheeks: [P(c[0] - 11 + s.dir * 2, c[1] + 2), P(c[0] + 11 + s.dir * 2, c[1] + 2)], er: 2.8, tip
    };
  }
  // Kätzchen: O = Körper, A und K = Ohren, K-Stiel = Schwanz, A-Strich = Mündchen
  function poseCat(s) {
    const { x, y, walk: a, sit, wave, air, t } = s;
    const p = s.dist * 0.2;
    const hop = Math.abs(Math.sin(p)) * 7 * a;
    const sq = Math.sin(t * 2.5) * .02 + (1 - Math.abs(Math.sin(p))) * .08 * a;
    const rx = 17 * (1 + sq), ry = 14 * (1 - sq);
    const c = P(x, lerp(y - ry - 1 - hop, y - 8, sit) - air * 3);
    const tw = wave * Math.max(0, Math.sin(t * 7)) * 3;
    const eL = P(c[0] - 11, c[1] - ry - 11 - tw), eR = P(c[0] + 11, c[1] - ry - 11);
    const back = -s.dir, wag = Math.sin(t * (wave ? 9 : 4)) * (wave ? 7 : 4);
    const tb = P(c[0] + back * (rx - 2), c[1] + 6);
    const tt = sit > .5 ? P(tb[0] + back * 4 + wag * .6, c[1] + 28) : P(tb[0] + back * 13, c[1] - 9 + wag);
    return {
      L: [[P(c[0] - 15, c[1] - 6), eL, -.1], [P(c[0] + 15, c[1] - 6), eR, .1], [P(c[0] - 3.5 + s.dir * 2, c[1] + 4), P(c[0] + 3.5 + s.dir * 2, c[1] + 4), .9],
          [tb, tt, back * (sit > .5 ? -.3 : .5)], [eL, P(c[0] - 4, c[1] - ry + 1)], [eR, P(c[0] + 4, c[1] - ry + 1)]],
      O: { cx: c[0], cy: c[1], rx, ry }, eyes: [P(c[0] - 7 + s.dir * 2, c[1] - 3), P(c[0] + 7 + s.dir * 2, c[1] - 3)],
      cheeks: [P(c[0] - 11 + s.dir * 2, c[1] + 3), P(c[0] + 11 + s.dir * 2, c[1] + 3)], er: 2.4
    };
  }
  // Lichtgeist: Umriss aus Punkten
  function ghostShape(s) {
    const { x, y, walk: a, sit, air, t } = s;
    const hov = Math.sin(t * 3) * 2.5 * (1 - sit);
    const top = lerp(y - 46 + hov - air * 4, y - 26, sit), r = 13, bot = lerp(y - 12 + hov, y + 2, sit), lean = -s.dir * 4 * a;
    const seg = [];
    for (let i = 0; i <= 24; i++) { const g = Math.PI + Math.PI * i / 24; seg.push(P(x + Math.cos(g) * r, top + r + Math.sin(g) * r)); }
    seg.push(P(x + r + lean, bot));
    for (let i = 0; i <= 18; i++) { const u = i / 18; seg.push(P(x + r - 2 * r * u + lean, bot + Math.sin(u * Math.PI * 3 + t * 8) * 3 * (1 - sit * .7))); }
    seg.push(P(x - r, top + r));
    return { seg, eyes: [P(x - 4.5 + s.dir * 2, top + 13), P(x + 4.5 + s.dir * 2, top + 13)], cheeks: [P(x - 9 + s.dir * 2, top + 18), P(x + 9 + s.dir * 2, top + 18)] };
  }
  function sampleChain(seg, n) {
    const len = []; let tot = 0;
    for (let i = 1; i < seg.length; i++) { const d = Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]); len.push(d); tot += d; }
    const out = [];
    for (let k = 0; k < n; k++) {
      let d = tot * k / n, i = 0;
      while (i < len.length - 1 && d > len[i]) { d -= len[i]; i++; }
      const u = len[i] ? d / len[i] : 0;
      out.push(P(lerp(seg[i][0], seg[i + 1][0], u), lerp(seg[i][1], seg[i + 1][1], u)));
    }
    return out;
  }
  function letterPoints(lp, n) {
    const parts = lp.L.map(([a, b]) => ({ len: Math.hypot(b[0] - a[0], b[1] - a[1]), f: u => P(lerp(a[0], b[0], u), lerp(a[1], b[1], u)) }));
    const O = lp.O;
    parts.splice(3, 0, { len: 2 * Math.PI * Math.sqrt((O.rx * O.rx + O.ry * O.ry) / 2), f: u => P(O.cx + Math.sin(u * 2 * Math.PI) * O.rx, O.cy - Math.cos(u * 2 * Math.PI) * O.ry), loop: true });
    const tot = parts.reduce((s, p) => s + p.len, 0), out = [];
    for (const p of parts) {
      const k = Math.max(2, Math.round(n * p.len / tot));
      for (let i = 0; i < k; i++) out.push(p.f(p.loop ? i / k : i / (k - 1)));
    }
    while (out.length < n) out.push(out[out.length - 1]);
    return out.slice(0, n);
  }
  const POSES = { strich: poseStick, kugel: poseBall, katze: poseCat };

  function scaleGeo(g, ox, oy, k) {
    const f = q => q && P(ox + (q[0] - ox) * k, oy + (q[1] - oy) * k);
    if (g.L) g.L = g.L.map(l => [f(l[0]), f(l[1]), l[2] || 0]);
    if (g.O) g.O = { cx: ox + (g.O.cx - ox) * k, cy: oy + (g.O.cy - oy) * k, rx: g.O.rx * k, ry: g.O.ry * k };
    if (g.seg) g.seg = g.seg.map(f);
    for (const key of ['eyes', 'cheeks']) if (g[key]) g[key] = g[key].map(f);
    if (g.tip) g.tip = f(g.tip);
    return g;
  }

  // ---------- Ablauf ----------
  function stateAt(segs, t, start, clock) {
    const s = { x: start.x, y: start.y, m: 0, sit: 0, wave: 0, walk: 0, dist: 0, air: 0, dir: start.dir || 1, txt: start.txt, t: clock };
    for (const g of segs) {
      const u = clamp(t / g.d), x0 = s.x, y0 = s.y;
      if (g.k === 'morph') s.m = lerp(s.m, g.to, ease(u));
      if (g.k === 'sit') s.sit = lerp(s.sit, g.to, ease(u));
      if (g.k === 'txt') s.txt = lerp(s.txt, g.to, ease(u));
      if (g.k === 'wave' && t > 0) s.wave = sstep(0, .15, u) * (1 - sstep(.85, 1, u));
      if (g.k === 'walk' || g.k === 'jump') {
        const uu = g.k === 'walk' ? u : ease(u);
        s.x = lerp(x0, g.to[0], uu); s.y = lerp(y0, g.to[1], uu);
        if (Math.abs(g.to[0] - x0) > .5) s.dir = Math.sign(g.to[0] - x0);
        if (g.k === 'jump') { s.y -= 4 * uu * (1 - uu) * g.h; if (t > 0 && t < g.d) s.air = Math.sin(Math.PI * u); }
        if (g.k === 'walk' && t > 0 && t < g.d) s.walk = sstep(0, .15, u) * (1 - sstep(.85, 1, u));
      }
      s.dist += Math.abs(s.x - x0);
      if (t < g.d) break;
      t -= g.d;
    }
    return s;
  }

  function create(stage) {
    const svg = el('svg', { viewBox: '0 0 640 360', class: 'mascot', 'aria-hidden': 'true' });
    const host = stage.querySelector('#toastHost');
    stage.insertBefore(svg, host);
    let cfg = null, key = '', light = false, k = 1;
    let E = {};                // SVG-Elemente der aktuellen Figur
    let pos = null;            // Ruheplatz { x, y, card }
    let move = null;           // laufende Bewegung { segs, start, t0, total, to }
    let nextAt = 0, raf = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const now = () => performance.now() / 1000;
    const sleeping = () => document.documentElement.classList.contains('sleeping');

    function build() {
      svg.innerHTML = '';
      const FC = cfg.color, LC = cfg.text || cfg.color, sw = 4 * k / 1.35;
      E = { FC, LC, sw };
      E.shadow = el('ellipse', { rx: 14, ry: 3 * k, fill: '#000', opacity: 0 }, svg);
      const f = FONTS[cfg.font];
      E.text = f.css ? el('text', { 'text-anchor': 'middle', fill: LC, 'font-size': (43 * k).toFixed(1), 'font-weight': 700, 'letter-spacing': (1.5 * k).toFixed(1), style: `font-family:${f.css}` }, svg) : null;
      if (E.text) E.text.textContent = 'AOK';
      E.fig = el('g', {}, svg);
      E.fig.style.filter = `drop-shadow(0 0 ${(2 * k).toFixed(1)}px ${FC}66)`;
      if (cfg.fig === 'geist') {
        E.dots = Array.from({ length: 70 }, () => el('circle', { r: 2.3 * k / 1.35, fill: LC }, E.fig));
      } else {
        E.oval = el('ellipse', { fill: FC, 'fill-opacity': 0, stroke: LC, 'stroke-width': sw }, E.fig);
        E.lines = Array.from({ length: 6 }, () => el('path', { stroke: LC, fill: 'none', 'stroke-width': sw, 'stroke-linecap': 'round' }, E.fig));
      }
      const eyeCol = cfg.fig === 'geist' ? (light ? '#1D1D1F' : '#FFFFFF') : '#0F1416';
      E.eyes = [0, 1].map(() => el('ellipse', { fill: eyeCol, opacity: 0 }, E.fig));
      E.hl = cfg.fig === 'geist' ? [] : [0, 1].map(() => el('circle', { fill: '#fff', opacity: 0 }, E.fig));
      E.cheeks = [0, 1].map(() => el('ellipse', { rx: 3 * k / 1.35, ry: 1.8 * k / 1.35, fill: '#FF8FA3', opacity: 0 }, E.fig));
      E.tip = cfg.fig === 'kugel' ? el('circle', { r: 3 * k / 1.35, fill: FC, opacity: 0 }, E.fig) : null;
    }

    function render(s) {
      const t = s.t, x = s.x, y = s.y;
      const lp = scaleGeo(letterPose(x, y, reduced.matches ? 0 : t), x, y, k);
      const blink = (t % 3.1) < .12 ? .15 : 1, eyeOn = sstep(.8, 1, s.m);
      const strokes = E.text ? 1 - s.txt : 1;
      E.fig.setAttribute('opacity', strokes.toFixed(2));
      if (E.text) {
        E.text.setAttribute('x', x.toFixed(1)); E.text.setAttribute('y', (y + (reduced.matches ? 0 : Math.sin(t * 2.4) * 1.2)).toFixed(1));
        E.text.setAttribute('opacity', s.txt.toFixed(2));
      }
      E.shadow.setAttribute('cx', x.toFixed(1)); E.shadow.setAttribute('cy', (y + 1).toFixed(1));
      E.shadow.setAttribute('rx', (lerp(30, 14, s.m) * k).toFixed(1));
      E.shadow.setAttribute('opacity', (.25 * s.m * (1 - s.air) * (1 - s.sit)).toFixed(2));

      if (E.dots) {
        const g = scaleGeo(ghostShape(s), x, y, k);
        const a = letterPoints(lp, E.dots.length), b = sampleChain(g.seg, E.dots.length);
        E.dots.forEach((d, i) => {
          const u = ease(clamp(s.m * 1.5 - rnd[i] * .5)), swirl = Math.sin(Math.PI * u) * 22 * k;
          d.setAttribute('cx', (lerp(a[i][0], b[i][0], u) + Math.cos(i * 2.4 + t) * swirl).toFixed(1));
          d.setAttribute('cy', (lerp(a[i][1], b[i][1], u) + Math.sin(i * 2.4 + t) * swirl).toFixed(1));
          d.setAttribute('fill', mix(E.LC, E.FC, u));
          d.setAttribute('opacity', (.8 + .2 * Math.sin(t * 5 + i * 1.7)).toFixed(2));
        });
        E.eyes.forEach((e, i) => { e.setAttribute('cx', g.eyes[i][0]); e.setAttribute('cy', g.eyes[i][1]); e.setAttribute('rx', 1.8 * k); e.setAttribute('ry', 2.4 * k * blink); e.setAttribute('opacity', eyeOn); });
        E.cheeks.forEach((c, i) => { c.setAttribute('cx', g.cheeks[i][0]); c.setAttribute('cy', g.cheeks[i][1]); c.setAttribute('opacity', eyeOn * .7); });
        return;
      }
      const fp = scaleGeo(POSES[cfg.fig](s), x, y, k);
      const mi = i => ease(clamp((s.m - i * .055) / (1 - 6 * .055)));
      const lift = (i, u) => -Math.sin(Math.PI * u) * (14 + 6 * rnd[i]) * k;
      E.lines.forEach((ln, i) => {
        const u = mi(i), A = lp.L[i], B = fp.L[i], dy = lift(i, u);
        ln.setAttribute('d', curve(P(lerp(A[0][0], B[0][0], u), lerp(A[0][1], B[0][1], u) + dy), P(lerp(A[1][0], B[1][0], u), lerp(A[1][1], B[1][1], u) + dy), lerp(A[2], B[2], u)));
        ln.setAttribute('stroke', mix(E.LC, E.FC, u));
      });
      // Mund wird dunkel und dünn, sobald er im Gesicht sitzt
      const um = sstep(.7, 1, mi(2));
      E.lines[2].setAttribute('stroke', mix(mix(E.LC, E.FC, mi(2)), '#1B1410', um));
      E.lines[2].setAttribute('stroke-width', (lerp(E.sw, E.sw * .6, um)).toFixed(2));
      const uo = mi(6), dy = lift(6, uo);
      E.oval.setAttribute('cx', lerp(lp.O.cx, fp.O.cx, uo).toFixed(1)); E.oval.setAttribute('cy', (lerp(lp.O.cy, fp.O.cy, uo) + dy).toFixed(1));
      E.oval.setAttribute('rx', lerp(lp.O.rx, fp.O.rx, uo).toFixed(1)); E.oval.setAttribute('ry', lerp(lp.O.ry, fp.O.ry, uo).toFixed(1));
      E.oval.setAttribute('stroke', mix(E.LC, E.FC, uo)); E.oval.setAttribute('fill-opacity', (.92 * uo).toFixed(2));
      const er = fp.er * k * .8;
      E.eyes.forEach((e, i) => {
        const q = fp.eyes[i];
        e.setAttribute('cx', q[0].toFixed(1)); e.setAttribute('cy', q[1].toFixed(1)); e.setAttribute('rx', er); e.setAttribute('ry', er * 1.2 * blink); e.setAttribute('opacity', eyeOn);
        E.hl[i].setAttribute('cx', (q[0] + er * .35).toFixed(1)); E.hl[i].setAttribute('cy', (q[1] - er * .45).toFixed(1)); E.hl[i].setAttribute('r', er * .38); E.hl[i].setAttribute('opacity', blink > .5 ? eyeOn : 0);
        E.cheeks[i].setAttribute('cx', fp.cheeks[i][0].toFixed(1)); E.cheeks[i].setAttribute('cy', fp.cheeks[i][1].toFixed(1)); E.cheeks[i].setAttribute('opacity', eyeOn * .75);
      });
      if (E.tip) { E.tip.setAttribute('cx', fp.tip[0].toFixed(1)); E.tip.setAttribute('cy', fp.tip[1].toFixed(1)); E.tip.setAttribute('opacity', eyeOn); }
    }

    // Kacheln als Sitzplätze (in 1/3 Board-Pixeln)
    function cards() {
      const sr = stage.getBoundingClientRect(), sc = sr.width / 1920;
      if (!sc) return [];
      return [...stage.querySelectorAll('main > .card')].map(c => {
        const r = c.getBoundingClientRect();
        return { el: c, l: (r.left - sr.left) / sc / 3, r: (r.right - sr.left) / sc / 3, top: (r.top - sr.top) / sc / 3 };
      }).filter(c => c.r - c.l > 60);
    }
    const margin = () => 40 * k;
    function pickSpot(exclude) {
      const list = cards(); if (!list.length) return null;
      const options = list.filter(c => c.el !== exclude);
      const c = (options.length ? options : list)[Math.floor(Math.random() * (options.length || list.length))];
      return { x: lerp(c.l + margin(), c.r - margin(), Math.random()), y: c.top, card: c.el };
    }
    const restState = () => ({ x: pos.x, y: pos.y, m: 0, sit: 0, wave: 0, walk: 0, dist: 0, air: 0, dir: 1, txt: E.text ? 1 : 0, t: now() });

    function plan(from, to) {
      const list = cards(), A = list.find(c => c.el === from.card), B = list.find(c => c.el === to.card);
      const segs = [];
      if (E.text) segs.push({ d: .35, k: 'txt', to: 0 });
      segs.push({ d: 1.3, k: 'morph', to: 1 });
      let x = from.x, y = from.y;
      const walk = (tx) => { const d = Math.abs(tx - x); if (d > 1) segs.push({ d: Math.max(.25, d / (55 * k)), k: 'walk', to: [tx, y] }); x = tx; };
      const jump = (tx, ty, h) => { segs.push({ d: .55 + Math.hypot(tx - x, ty - y) / 400, k: 'jump', to: [tx, ty], h }); x = tx; y = ty; };
      if (A && B) {
        // Erst in der eigenen Kachelreihe von Kachel zu Kachel bis über das Ziel, dann hoch- oder runterspringen
        const sameRow = c => Math.abs(c.top - A.top) < 3;
        const row = list.filter(sameRow).sort((p, q) => p.l - q.l);
        const goalX = Math.abs(A.top - B.top) < 3 ? to.x : Math.max(B.l + margin(), Math.min(B.r - margin(), (B.l + B.r) / 2));
        let cur = A;
        for (let guard = 0; guard < 8; guard++) {
          const i = row.indexOf(cur);
          const here = goalX >= cur.l && goalX <= cur.r;
          if (here || i < 0) break;
          const right = goalX > cur.r, next = row[i + (right ? 1 : -1)];
          if (!next) break;
          walk(right ? cur.r - 6 * k : cur.l + 6 * k);
          jump(right ? next.l + 6 * k : next.r - 6 * k, next.top, 16 * k);
          cur = next;
        }
        if (cur !== B) {
          const lx = Math.max(cur.l + margin() * .5, Math.min(cur.r - margin() * .5, Math.max(B.l + margin(), Math.min(B.r - margin(), goalX))));
          walk(lx);
          jump(Math.max(B.l + margin(), Math.min(B.r - margin(), lx)), B.top, Math.max(0, y - B.top) + 26 * k);
        }
      } else jump(to.x, to.y, 30 * k);
      walk(to.x);
      segs.push({ d: .45, k: 'sit', to: 1 }, { d: 2.4, k: 'wave' }, { d: .45, k: 'sit', to: 0 }, { d: 1.3, k: 'morph', to: 0 });
      if (E.text) segs.push({ d: .35, k: 'txt', to: 1 });
      return segs;
    }

    function schedule() {
      const every = cfg.every === 'zufall' ? 5 + Math.random() * 10 : +cfg.every;
      nextAt = Date.now() + every * 60000;
    }
    function go() {
      if (!cfg || move) return;
      if (!pos || !pos.card.isConnected) pos = pickSpot(null);
      const to = pickSpot(pos && pos.card);
      if (!pos || !to) return;
      if (reduced.matches) { pos = to; render(restState()); schedule(); return; }
      const segs = plan(pos, to);
      move = { segs, start: restState(), t0: now(), total: segs.reduce((a, g) => a + g.d, 0), to };
      loop();
    }
    function loop() {
      cancelAnimationFrame(raf);
      if (!move) return;
      const t = now() - move.t0;
      if (t >= move.total) { pos = move.to; move = null; render(restState()); schedule(); return; }
      render(stateAt(move.segs, t, move.start, now()));
      raf = requestAnimationFrame(loop);
    }
    // Ruhezustand: leichtes Wippen mit wenigen Bildern pro Sekunde, alle paar Minuten ein Ausflug
    setInterval(() => {
      if (!cfg || move || !pos) return;
      if (!pos.card.isConnected) { pos = pickSpot(null); if (!pos) return; }
      if (!sleeping() && !reduced.matches) render(restState());
      if (Date.now() >= nextAt && !sleeping() && document.visibilityState === 'visible' && !stage.querySelector('#overlayHost > *')) go();
    }, 100);

    function apply(c, isLight) {
      const next = c && c.fig && c.fig !== 'aus' ? Object.assign({}, DEFAULTS, c) : null;
      if (next && !FONTS[next.font]) next.font = 'strich';
      const nk = JSON.stringify([next, isLight]);
      if (nk === key) return;
      key = nk; light = !!isLight;
      if (!next) { cfg = null; move = null; cancelAnimationFrame(raf); svg.innerHTML = ''; svg.style.display = 'none'; return; }
      const reschedule = !cfg || cfg.every !== next.every;
      cfg = next; k = SIZES[cfg.size] || .9; svg.style.display = '';
      move = null; cancelAnimationFrame(raf);
      build();
      if (!pos || !pos.card.isConnected) pos = pickSpot(null);
      if (pos) render(restState()); else requestAnimationFrame(() => { pos = pickSpot(null); if (pos) render(restState()); });
      if (reschedule) schedule();
    }
    return { apply, go };
  }

  window.WBMascot = { create, FONTS, FIGS, DEFAULTS };
})();
