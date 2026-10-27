// AOK-Maskottchen: Die Buchstaben A, O, K sitzen auf einer Kachel. Alle paar Minuten setzen sie sich zu einer
// Figur zusammen, die zu einer anderen Kachel läuft, springt oder klettert, dort etwas anstellt und wieder zu „AOK“ wird.
// Charakter lieb: winken, putzen, schlafen, klettern, freuen. Charakter frech: Kachel antreten, hüpfen bis sie wackelt,
// Grimassen, einen Buchstaben aus einer Überschrift wegtreten, zurückholen und wieder einsetzen.
// Die Figur liegt in einer eigenen Ebene über den Kacheln und fängt keine Klicks ab.
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
  const lerp = (a, b, u) => a + (b - a) * u;
  const clamp = u => Math.max(0, Math.min(1, u));
  const ease = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const sstep = (a, b, u) => { const k = clamp((u - a) / (b - a)); return k * k * (3 - 2 * k); };
  const bump = (u, c, w) => Math.exp(-Math.pow((u - c) / w, 2));
  const P = (x, y) => [x, y];
  const polar = (o, len, ang) => [o[0] + Math.sin(ang) * len, o[1] + Math.cos(ang) * len]; // 0 = nach unten, PI = nach oben
  const rnd = Array.from({ length: 80 }, (_, i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1));
  const pick = list => list[Math.floor(Math.random() * list.length)];
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
  const MOODS = { lieb: 'Lieb', frech: 'Frech', gemischt: 'Gemischt' };
  const ACTS = {
    winken: { name: 'Winken', mood: 'lieb' }, putzen: { name: 'Putzen', mood: 'lieb' }, schlafen: { name: 'Schlafen', mood: 'lieb' },
    klettern: { name: 'Klettern', mood: 'lieb' }, freuen: { name: 'Freuen', mood: 'lieb' },
    treten: { name: 'Kachel antreten', mood: 'frech' }, huepfen: { name: 'Hüpfen', mood: 'frech' }, grimasse: { name: 'Grimasse', mood: 'frech' },
    buchstabe: { name: 'Buchstabe wegtreten', mood: 'frech' },
  };
  const SIZES = { klein: .42, mittel: .55, gross: .72 };
  const DEFAULTS = { fig: 'strich', color: '#7FE0AE', text: '', font: 'strich', every: 'zufall', size: 'mittel', mood: 'lieb' };

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
    const { x, y, walk: a, sit, wave, air, t, dir } = s;
    const p = s.dist * 0.28;
    const hip = P(x, lerp(y - 21 - Math.abs(Math.sin(p)) * 2 * a, y - 1, sit) + air * 4);
    const neck = P(hip[0], hip[1] - 22), sh = P(hip[0], hip[1] - 18);
    const th = Math.sin(p) * .55 * a, dang = Math.sin(t * 4) * .35 * sit * (1 - s.sleep);
    let fl = polar(hip, 21, th + dang - .5 * sit), fr = polar(hip, 21, -th - dang + .5 * sit);
    fl = [lerp(fl[0], hip[0] - 8, air), lerp(fl[1], hip[1] + 13, air)];
    fr = [lerp(fr[0], hip[0] + 8, air), lerp(fr[1], hip[1] + 13, air)];
    // Tritt mit dem vorderen Bein
    if (s.kick) { const kf = polar(hip, 21, dir * 1.35); if (dir > 0) fr = [lerp(fr[0], kf[0], s.kick), lerp(fr[1], kf[1], s.kick)]; else fl = [lerp(fl[0], kf[0], s.kick), lerp(fl[1], kf[1], s.kick)]; }
    let arm = { R: lerp(lerp(.25 - Math.sin(p) * .6 * a, 2.5, air), 1.95 + .4 * Math.sin(t * 9), wave), L: lerp(-.25 + Math.sin(p) * .6 * a, -2.5, air) };
    const front = dir > 0 ? 'R' : 'L';
    arm[front] = lerp(arm[front], dir * (.75 + .35 * Math.sin(t * 12)), s.wipe);
    arm[front] = lerp(arm[front], dir * 1.4, s.carry);
    arm.R = lerp(arm.R, 2.75 + .2 * Math.sin(t * 14), s.cheer); arm.L = lerp(arm.L, -2.75 - .2 * Math.sin(t * 14), s.cheer);
    arm.R = lerp(arm.R, 2.7 + .45 * Math.sin(p), s.climb); arm.L = lerp(arm.L, -2.7 + .45 * Math.sin(p), s.climb);
    arm.R = lerp(arm.R, .15, s.sleep); arm.L = lerp(arm.L, -.15, s.sleep);
    const head = { cx: neck[0] + dir * 2.5 * s.sleep, cy: neck[1] - 11 + 2 * s.sleep, rx: 11.5, ry: 10.5 };
    const hR = polar(sh, 17 + 3 * wave, arm.R), hL = polar(sh, 17, arm.L);
    return {
      L: [[fl, hip], [fr, hip], [P(head.cx - 3 + dir, head.cy + 4), P(head.cx + 3 + dir, head.cy + 4), .9],
          [hip, neck], [sh, hR], [sh, hL]],
      O: head, eyes: [P(head.cx - 4.5 + dir, head.cy - 1.5), P(head.cx + 4.5 + dir, head.cy - 1.5)],
      cheeks: [P(head.cx - 7.5 + dir, head.cy + 3), P(head.cx + 7.5 + dir, head.cy + 3)], er: 1.9, hand: front === 'R' ? hR : hL
    };
  }
  // Kugel: O = Körper, A = Füße und Lächeln, K = Fühler und Ärmchen
  function poseBall(s) {
    const { x, y, walk: a, sit, wave, air, t, dir } = s;
    const p = s.dist * 0.16;
    const hop = Math.abs(Math.sin(p)) * 11 * a;
    const breathe = Math.sin(t * 1.6) * .04 * s.sleep;
    const sq = (1 - Math.abs(Math.sin(p))) * .12 * a - air * .06 + Math.sin(t * 3) * .02 * (1 - s.sleep);
    const rx = 17 * (1 + sq + breathe), ry = 17 * (1 - sq + breathe);
    const c = P(x, lerp(y - 6 - ry - hop, y - 9, sit) - air * 2);
    const ft = lerp(y - hop, y + 9, sit), sway = Math.sin(t * 4) * 2.5 * sit * (1 - s.sleep);
    const tucked = air > .05 || hop > 2;
    let fl = tucked ? P(c[0] - 7, c[1] + ry + 5) : P(c[0] - 8 + sway, ft);
    let fr = tucked ? P(c[0] + 7, c[1] + ry + 5) : P(c[0] + 8 - sway, ft);
    if (s.kick) { const kf = P(c[0] + dir * (rx + 6), c[1] + ry - 2); if (dir > 0) fr = [lerp(fr[0], kf[0], s.kick), lerp(fr[1], kf[1], s.kick)]; else fl = [lerp(fl[0], kf[0], s.kick), lerp(fl[1], kf[1], s.kick)]; }
    const flap = Math.sin(t * 14) * 5 * (a + air);
    let hR = P(lerp(c[0] + rx + 9, c[0] + rx + 6, wave), lerp(c[1] - 2 + flap, c[1] - 18 + Math.sin(t * 9) * 5, wave));
    let hL = P(c[0] - rx - 9, c[1] - 2 - flap);
    const set = (h, q, u) => P(lerp(h[0], q[0], u), lerp(h[1], q[1], u));
    const fH = P(c[0] + dir * (rx + 6), c[1] + ry * .6 + Math.sin(t * 12) * 3), cH = P(c[0] + dir * (rx + 5), c[1] - 6);
    if (dir > 0) { hR = set(set(hR, fH, s.wipe), cH, s.carry); } else { hL = set(set(hL, fH, s.wipe), cH, s.carry); }
    const up = Math.sin(t * 14) * 3;
    hR = set(hR, P(c[0] + rx + 4, c[1] - ry - 4 + up), Math.max(s.cheer, s.climb)); hL = set(hL, P(c[0] - rx - 4, c[1] - ry - 4 - up), Math.max(s.cheer, s.climb));
    hR = set(hR, P(c[0] + rx + 3, c[1] + 6), s.sleep); hL = set(hL, P(c[0] - rx - 3, c[1] + 6), s.sleep);
    const tip = P(c[0] + Math.sin(t * 5) * 4 * (1 - s.sleep) - dir * 3 * a + dir * 6 * s.sleep, c[1] - ry - 11 + 4 * s.sleep);
    return {
      L: [[P(c[0] - 7, c[1] + ry - 3), fl], [P(c[0] + 7, c[1] + ry - 3), fr], [P(c[0] - 5 + dir * 2, c[1] + 5), P(c[0] + 5 + dir * 2, c[1] + 5), .7],
          [P(c[0], c[1] - ry), tip], [P(c[0] + rx, c[1] + 1), hR], [P(c[0] - rx, c[1] + 1), hL]],
      O: { cx: c[0], cy: c[1], rx, ry }, eyes: [P(c[0] - 6 + dir * 2, c[1] - 4), P(c[0] + 6 + dir * 2, c[1] - 4)],
      cheeks: [P(c[0] - 11 + dir * 2, c[1] + 2), P(c[0] + 11 + dir * 2, c[1] + 2)], er: 2.8, tip, hand: dir > 0 ? hR : hL
    };
  }
  // Kätzchen: O = Körper, A und K = Ohren, K-Stiel = Schwanz, A-Strich = Mündchen
  function poseCat(s) {
    const { x, y, walk: a, sit, wave, air, t, dir } = s;
    const p = s.dist * 0.2;
    const hop = Math.abs(Math.sin(p)) * 7 * a;
    const sq = Math.sin(t * 2.5) * .02 + (1 - Math.abs(Math.sin(p))) * .08 * a + Math.sin(t * 1.6) * .03 * s.sleep;
    const rx = 17 * (1 + sq), ry = 14 * (1 - sq);
    const c = P(x + dir * 7 * s.kick + Math.sin(t * 12) * 2 * s.wipe, lerp(y - ry - 1 - hop, y - 8, sit) - air * 3);
    const tw = Math.max(wave, s.cheer) * Math.max(0, Math.sin(t * 7)) * 3;
    const flat = s.sleep * 4 + s.grim * 3; // Ohren legen sich an
    const eL = P(c[0] - 11 - flat, c[1] - ry - 11 - tw + flat * 1.5), eR = P(c[0] + 11 + flat, c[1] - ry - 11 + flat * 1.5);
    const back = -dir, wag = Math.sin(t * (wave || s.cheer ? 9 : 4)) * (wave || s.cheer ? 7 : 4) * (1 - s.sleep * .8);
    const tb = P(c[0] + back * (rx - 2), c[1] + 6);
    const tt = sit > .5 ? P(tb[0] + back * 4 + wag * .6, c[1] + 28) : P(tb[0] + back * 13, c[1] - 9 + wag);
    return {
      L: [[P(c[0] - 15, c[1] - 6), eL, -.1], [P(c[0] + 15, c[1] - 6), eR, .1], [P(c[0] - 3.5 + dir * 2, c[1] + 4), P(c[0] + 3.5 + dir * 2, c[1] + 4), .9],
          [tb, tt, back * (sit > .5 ? -.3 : .5)], [eL, P(c[0] - 4, c[1] - ry + 1)], [eR, P(c[0] + 4, c[1] - ry + 1)]],
      O: { cx: c[0], cy: c[1], rx, ry }, eyes: [P(c[0] - 7 + dir * 2, c[1] - 3), P(c[0] + 7 + dir * 2, c[1] - 3)],
      cheeks: [P(c[0] - 11 + dir * 2, c[1] + 3), P(c[0] + 11 + dir * 2, c[1] + 3)], er: 2.4, hand: P(c[0] + dir * (rx + 2), c[1] + ry * .6)
    };
  }
  // Lichtgeist: Umriss aus Punkten
  function ghostShape(s) {
    const { walk: a, sit, air, t, dir } = s;
    const x = s.x + dir * 6 * s.kick + Math.sin(t * 12) * 2 * s.wipe, y = s.y;
    const hov = Math.sin(t * 3) * 2.5 * (1 - sit);
    const top = lerp(y - 46 + hov - air * 4, y - 26, sit), r = 13, bot = lerp(y - 12 + hov, y + 2, sit), lean = -dir * 4 * a;
    const seg = [];
    for (let i = 0; i <= 24; i++) { const g = Math.PI + Math.PI * i / 24; seg.push(P(x + Math.cos(g) * r, top + r + Math.sin(g) * r)); }
    seg.push(P(x + r + lean, bot));
    for (let i = 0; i <= 18; i++) { const u = i / 18; seg.push(P(x + r - 2 * r * u + lean, bot + Math.sin(u * Math.PI * 3 + t * 8) * 3 * (1 - sit * .7))); }
    seg.push(P(x - r, top + r));
    return { seg, O: { cx: x, cy: top + r, rx: r, ry: r }, eyes: [P(x - 4.5 + dir * 2, top + 13), P(x + 4.5 + dir * 2, top + 13)], cheeks: [P(x - 9 + dir * 2, top + 18), P(x + 9 + dir * 2, top + 18)], mouth: P(x + dir * 2, top + 19), hand: P(x + dir * 16, top + 22) };
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
    for (const key of ['tip', 'hand', 'mouth']) if (g[key]) g[key] = f(g[key]);
    return g;
  }

  // ---------- Ablauf ----------
  const ACT_KEYS = ['wave', 'wipe', 'sleep', 'cheer', 'kick', 'grim', 'climb'];
  function stateAt(segs, t, start, clock, k) {
    const s = { x: start.x, y: start.y, m: 0, sit: 0, walk: 0, dist: 0, air: 0, dir: start.dir || 1, txt: start.txt, t: clock, carry: 0, ins: 0, act: '' };
    for (const a of ACT_KEYS) s[a] = 0;
    for (const g of segs) {
      const u = clamp(t / g.d), x0 = s.x, y0 = s.y;
      if (g.carry !== undefined && t > 0) s.carry = g.carry;
      if (g.dir && t > 0) s.dir = g.dir;
      if (g.k === 'morph') s.m = lerp(s.m, g.to, ease(u));
      if (g.k === 'sit') s.sit = lerp(s.sit, g.to, ease(u));
      if (g.k === 'txt') s.txt = lerp(s.txt, g.to, ease(u));
      if (g.k === 'act' && t > 0 && t < g.d) {
        const env = sstep(0, .12, u) * (1 - sstep(.88, 1, u)), at = t;
        s.act = g.name;
        if (g.name === 'wave') s.wave = env;
        if (g.name === 'wipe') { s.wipe = env; s.x = x0 + Math.sin(at * 2.2) * 10 * k * env; s.walk = .5 * env; s.dist += Math.abs(Math.cos(at * 2.2)) * 3; if (Math.cos(at * 2.2) !== 0) s.dir = Math.sign(Math.cos(at * 2.2)); }
        if (g.name === 'sleep') s.sleep = sstep(0, .1, u) * (1 - sstep(.92, 1, u));
        if (g.name === 'cheer') { s.cheer = env; const hop = Math.abs(Math.sin(at * 7)) * 10 * k * env; s.y -= hop; s.air = clamp(hop / (10 * k)) * .6; }
        if (g.name === 'kick') s.kick = Math.max(bump(u, .3, .06), bump(u, .7, .06));
        if (g.name === 'kick1') s.kick = bump(u, .5, .08);
        if (g.name === 'stomp') { const h = Math.abs(Math.sin(u * Math.PI * 3)) * 12 * k; s.y -= h; s.air = clamp(h / (12 * k)) * .8; }
        if (g.name === 'grim') { s.grim = env; s.x = x0 + Math.sin(at * 22) * 1.2 * k * env; }
        if (g.name === 'insert') s.ins = ease(u);
        if (g.name === 'look') s.dir = Math.sin(at * 3) > 0 ? 1 : -1;
      }
      if (g.k === 'act' && g.name === 'insert' && t >= g.d) { s.ins = 1; s.carry = 0; }
      if (g.k === 'walk' || g.k === 'jump' || g.k === 'climb') {
        const uu = g.k === 'jump' ? ease(u) : u;
        s.x = lerp(x0, g.to[0], uu); s.y = lerp(y0, g.to[1], uu);
        if (g.k !== 'climb' && Math.abs(g.to[0] - x0) > .5) s.dir = Math.sign(g.to[0] - x0);
        if (g.k === 'jump') { s.y -= 4 * uu * (1 - uu) * g.h; if (t > 0 && t < g.d) s.air = Math.sin(Math.PI * u); }
        if (g.k !== 'jump' && t > 0 && t < g.d) s.walk = sstep(0, .15, u) * (1 - sstep(.85, 1, u));
        if (g.k === 'climb') { if (t > 0 && t < g.d) s.climb = s.walk; s.dist += Math.abs(s.y - y0); }
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
    let ctx = { incident: false, visitor: false };
    let E = {};                // SVG-Elemente der aktuellen Figur
    let pos = null;            // Ruheplatz { x, y, card }
    let move = null;           // laufende Bewegung { segs, start, t0, total, to, events, cleanup }
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
      E.tongue = el('ellipse', { rx: 2 * k / 1.35, ry: 2.8 * k / 1.35, fill: '#FF5C7A', opacity: 0 }, E.fig);
      E.tip = cfg.fig === 'kugel' ? el('circle', { r: 3 * k / 1.35, fill: FC, opacity: 0 }, E.fig) : null;
      // Zubehör: Putzlappen, Glitzer, Zzz, getragener Buchstabe
      E.rag = el('rect', { width: (9 * k).toFixed(1), height: (5 * k).toFixed(1), rx: (1.5 * k).toFixed(1), fill: '#F2F5F7', opacity: 0 }, svg);
      E.sparks = [0, 1, 2].map(() => el('path', { d: '', fill: '#FFFFFF', opacity: 0 }, svg));
      E.zzz = [0, 1, 2].map(i => { const z = el('text', { fill: LC, 'font-size': ((10 + i * 3) * k).toFixed(1), 'font-weight': 700, opacity: 0, style: "font-family:'Segoe UI',system-ui,sans-serif" }, svg); z.textContent = 'z'; return z; });
      E.held = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', opacity: 0 }, svg);
    }

    function render(s) {
      const t = s.t, x = s.x, y = s.y;
      const lp = scaleGeo(letterPose(x, y, reduced.matches ? 0 : t), x, y, k);
      const blinkOpen = (t % 3.1) < .12 ? .15 : 1, eyeOn = sstep(.8, 1, s.m);
      const shut = Math.max(s.sleep, 0);
      const eyeOpen = i => Math.min(blinkOpen, 1 - .9 * shut, (s.grim > .3 && i === (s.dir > 0 ? 1 : 0)) ? .15 : 1);
      const strokes = E.text ? 1 - s.txt : 1;
      E.fig.setAttribute('opacity', strokes.toFixed(2));
      if (E.text) {
        E.text.setAttribute('x', x.toFixed(1)); E.text.setAttribute('y', (y + (reduced.matches ? 0 : Math.sin(t * 2.4) * 1.2)).toFixed(1));
        E.text.setAttribute('opacity', s.txt.toFixed(2));
      }
      E.shadow.setAttribute('cx', x.toFixed(1)); E.shadow.setAttribute('cy', (y + 1).toFixed(1));
      E.shadow.setAttribute('rx', (lerp(30, 14, s.m) * k).toFixed(1));
      E.shadow.setAttribute('opacity', (.25 * s.m * (1 - s.air) * (1 - s.sit) * (1 - s.climb)).toFixed(2));

      let fp;
      if (E.dots) {
        fp = scaleGeo(ghostShape(s), x, y, k);
        const a = letterPoints(lp, E.dots.length), b = sampleChain(fp.seg, E.dots.length);
        E.dots.forEach((d, i) => {
          const u = ease(clamp(s.m * 1.5 - rnd[i] * .5)), swirl = Math.sin(Math.PI * u) * 22 * k;
          d.setAttribute('cx', (lerp(a[i][0], b[i][0], u) + Math.cos(i * 2.4 + t) * swirl).toFixed(1));
          d.setAttribute('cy', (lerp(a[i][1], b[i][1], u) + Math.sin(i * 2.4 + t) * swirl).toFixed(1));
          d.setAttribute('fill', mix(E.LC, E.FC, u));
          d.setAttribute('opacity', ((.8 + .2 * Math.sin(t * 5 + i * 1.7)) * (1 - .4 * s.sleep)).toFixed(2));
        });
        E.eyes.forEach((e, i) => { e.setAttribute('cx', fp.eyes[i][0]); e.setAttribute('cy', fp.eyes[i][1]); e.setAttribute('rx', 1.8 * k); e.setAttribute('ry', 2.4 * k * eyeOpen(i)); e.setAttribute('opacity', eyeOn); });
        E.cheeks.forEach((c, i) => { c.setAttribute('cx', fp.cheeks[i][0]); c.setAttribute('cy', fp.cheeks[i][1]); c.setAttribute('opacity', eyeOn * .7); });
      } else {
        fp = scaleGeo(POSES[cfg.fig](s), x, y, k);
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
          const q = fp.eyes[i], o = eyeOpen(i);
          e.setAttribute('cx', q[0].toFixed(1)); e.setAttribute('cy', q[1].toFixed(1)); e.setAttribute('rx', er); e.setAttribute('ry', er * 1.2 * o); e.setAttribute('opacity', eyeOn);
          E.hl[i].setAttribute('cx', (q[0] + er * .35).toFixed(1)); E.hl[i].setAttribute('cy', (q[1] - er * .45).toFixed(1)); E.hl[i].setAttribute('r', er * .38); E.hl[i].setAttribute('opacity', o > .5 ? eyeOn : 0);
          E.cheeks[i].setAttribute('cx', fp.cheeks[i][0].toFixed(1)); E.cheeks[i].setAttribute('cy', fp.cheeks[i][1].toFixed(1)); E.cheeks[i].setAttribute('opacity', eyeOn * .75);
        });
        if (E.tip) { E.tip.setAttribute('cx', fp.tip[0].toFixed(1)); E.tip.setAttribute('cy', fp.tip[1].toFixed(1)); E.tip.setAttribute('opacity', eyeOn); }
        fp.mouth = P((fp.L[2][0][0] + fp.L[2][1][0]) / 2, (fp.L[2][0][1] + fp.L[2][1][1]) / 2);
      }
      // Zunge bei der Grimasse
      E.tongue.setAttribute('cx', fp.mouth[0].toFixed(1)); E.tongue.setAttribute('cy', (fp.mouth[1] + 2.4 * k).toFixed(1));
      E.tongue.setAttribute('opacity', (sstep(.2, .5, s.grim) * eyeOn).toFixed(2));
      // Putzlappen und Glitzer
      const h = fp.hand;
      E.rag.setAttribute('x', (h[0] - 4.5 * k).toFixed(1)); E.rag.setAttribute('y', (Math.min(h[1], y - 2.5 * k) - 2.5 * k).toFixed(1));
      E.rag.setAttribute('opacity', (s.wipe * eyeOn).toFixed(2));
      E.sparks.forEach((sp, i) => {
        const ph = (t * .9 + i / 3) % 1, sx = x + (i - 1) * 12 * k + Math.sin(i * 7) * 4 * k, sy = y - 3 * k - ph * 8 * k, r = (1.5 + 2 * Math.sin(Math.PI * ph)) * k;
        sp.setAttribute('d', `M${sx} ${sy - r}L${sx + r * .3} ${sy - r * .3}L${sx + r} ${sy}L${sx + r * .3} ${sy + r * .3}L${sx} ${sy + r}L${sx - r * .3} ${sy + r * .3}L${sx - r} ${sy}L${sx - r * .3} ${sy - r * .3}Z`);
        sp.setAttribute('opacity', (s.wipe * Math.sin(Math.PI * ph)).toFixed(2));
      });
      // Zzz beim Schlafen
      E.zzz.forEach((z, i) => {
        const ph = (t * .35 + i / 3) % 1;
        z.setAttribute('x', (fp.O.cx + s.dir * (fp.O.rx + (4 + ph * 10) * k)).toFixed(1)); z.setAttribute('y', (fp.O.cy - fp.O.ry - ph * 18 * k).toFixed(1));
        z.setAttribute('opacity', (s.sleep * Math.sin(Math.PI * ph)).toFixed(2));
      });
      // Getragener oder eingesetzter Buchstabe
      if (move && move.letter && (s.carry || (s.ins > 0 && s.ins < 1))) {
        const L = move.letter, hx = h[0], hy = h[1] - L.size * .35;
        const u = s.ins, lx = lerp(hx, L.x, u), ly = lerp(hy, L.y, u) - Math.sin(Math.PI * u) * 14 * k;
        E.held.setAttribute('x', lx.toFixed(1)); E.held.setAttribute('y', ly.toFixed(1));
        E.held.setAttribute('transform', `rotate(${(Math.sin(t * 6) * 12 * (1 - u)).toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})`);
        E.held.setAttribute('opacity', 1);
      } else E.held.setAttribute('opacity', 0);
    }

    // Kacheln als Sitzplätze (in 1/3 Board-Pixeln)
    const unit = () => { const sr = stage.getBoundingClientRect(); return { sr, sc: sr.width / 1920 }; };
    function cards() {
      const { sr, sc } = unit();
      if (!sc) return [];
      return [...stage.querySelectorAll('main > .card')].map(c => {
        const r = c.getBoundingClientRect();
        return { el: c, l: (r.left - sr.left) / sc / 3, r: (r.right - sr.left) / sc / 3, top: (r.top - sr.top) / sc / 3, bottom: (r.bottom - sr.top) / sc / 3 };
      }).filter(c => c.r - c.l > 60);
    }
    const margin = () => 40 * k;
    const spotOn = c => ({ x: lerp(c.l + margin(), c.r - margin(), Math.random()), y: c.top, card: c.el });
    function pickSpot(exclude, filter) {
      const list = cards(); if (!list.length) return null;
      let options = list.filter(c => c.el !== exclude && (!filter || filter(c)));
      if (!options.length) options = list.filter(c => c.el !== exclude);
      if (!options.length) options = list;
      return spotOn(pick(options));
    }
    const restState = () => ({ x: pos.x, y: pos.y, m: 0, sit: 0, walk: 0, dist: 0, air: 0, dir: 1, txt: E.text ? 1 : 0, t: now(), carry: 0, ins: 0, wave: 0, wipe: 0, sleep: 0, cheer: 0, kick: 0, grim: 0, climb: 0 });

    // Kachel wackeln lassen (springt immer von selbst in die Ausgangslage zurück)
    function wobble(card, dir, strength = 1) {
      if (!card || !card.animate) return;
      const o = { transformOrigin: '50% 100%' };
      card.animate([{ ...o, transform: 'none' }, { ...o, transform: `translateX(${dir * 10 * strength}px) rotate(${dir * 1.3 * strength}deg)` },
        { ...o, transform: `translateX(${-dir * 4 * strength}px) rotate(${-dir * .5 * strength}deg)` }, { ...o, transform: 'none' }], { duration: 650, easing: 'ease-out' });
    }

    // Einen Buchstaben aus der Überschrift einer Kachel wählen und in ein eigenes Element packen
    function grabLetter(cardEl) {
      const h3 = cardEl.querySelector('h3'); if (!h3) return null;
      const nodes = [...h3.childNodes].filter(n => n.nodeType === 3 && /[A-Za-zÄÖÜäöü]/.test(n.nodeValue));
      if (!nodes.length) return null;
      const node = pick(nodes), idx = [...node.nodeValue].map((c, i) => /[A-Za-zÄÖÜäöü]/.test(c) ? i : -1).filter(i => i >= 0);
      const i = pick(idx);
      const after = node.splitText(i); after.splitText(1);
      const span = document.createElement('span');
      span.style.display = 'inline-block';
      after.replaceWith(span); span.append(after);
      const { sr, sc } = unit(), r = span.getBoundingClientRect(), cs = getComputedStyle(span);
      const shown = cs.textTransform === 'uppercase' ? after.nodeValue.toUpperCase() : after.nodeValue;
      E.held.textContent = shown;
      E.held.setAttribute('font-size', (parseFloat(cs.fontSize) / 3).toFixed(1));
      E.held.setAttribute('fill', cs.color); E.held.setAttribute('font-weight', cs.fontWeight);
      E.held.style.fontFamily = cs.fontFamily;
      return {
        span, x: (r.left + r.width / 2 - sr.left) / sc / 3, y: (r.top + r.height / 2 - sr.top) / sc / 3, size: parseFloat(cs.fontSize) / 3,
        restore() { if (span.isConnected) { span.replaceWith(after); after.parentNode && after.parentNode.normalize(); } }
      };
    }

    function moodNow() {
      if (ctx.incident) return 'ruhig';
      const m = cfg.mood || 'lieb';
      if (ctx.visitor && m !== 'lieb') return 'lieb';
      return m === 'gemischt' ? (Math.random() < .5 ? 'lieb' : 'frech') : m;
    }

    function plan(from, to, opts = {}) {
      const list = cards(), A = list.find(c => c.el === from.card), B = list.find(c => c.el === to.card);
      const mood = opts.mood || moodNow();
      const act = opts.act || pick({ ruhig: ['winken'], lieb: ['winken', 'putzen', 'schlafen'], frech: ['treten', 'huepfen', 'grimasse', 'buchstabe'] }[mood]);
      const climbUp = opts.climb ?? (mood === 'lieb');
      const segs = [], events = [];
      let total = 0;
      const add = (...g) => { for (const x of g) { segs.push(x); total += x.d; } };
      const at = (offset, fn) => events.push({ at: total + offset, fn });
      if (E.text) add({ d: .35, k: 'txt', to: 0 });
      add({ d: 1.3, k: 'morph', to: 1 });
      let x = from.x, y = from.y;
      const walk = (tx, extra = {}) => { const d = Math.abs(tx - x); if (d > 1) add({ d: Math.max(.25, d / (80 * k)), k: 'walk', to: [tx, y], ...extra }); x = tx; };
      const jump = (tx, ty, h, extra = {}) => { add({ d: .55 + Math.hypot(tx - x, ty - y) / 400, k: 'jump', to: [tx, ty], h, ...extra }); x = tx; y = ty; };
      const climb = (tx, ty) => { add({ d: Math.max(.5, Math.abs(ty - y) / (28 * k)), k: 'climb', to: [tx, ty] }); x = tx; y = ty; };
      if (A && B && A !== B) {
        // Erst in der eigenen Kachelreihe von Kachel zu Kachel bis unter oder über das Ziel, dann hoch oder runter
        const row = list.filter(c => Math.abs(c.top - A.top) < 3).sort((p, q) => p.l - q.l);
        const goalX = Math.abs(A.top - B.top) < 3 ? to.x : Math.max(B.l + margin(), Math.min(B.r - margin(), (B.l + B.r) / 2));
        let cur = A;
        const seen = new Set([A]);
        for (let guard = 0; guard < 8; guard++) {
          const i = row.indexOf(cur);
          if ((goalX >= cur.l && goalX <= cur.r) || i < 0) break;
          const right = goalX > cur.r, next = row[i + (right ? 1 : -1)];
          if (!next || seen.has(next)) break; // Ziel liegt in einer Lücke zwischen zwei Kacheln
          seen.add(next);
          walk(right ? cur.r - 6 * k : cur.l + 6 * k);
          jump(right ? next.l + 6 * k : next.r - 6 * k, next.top, 16 * k);
          cur = next;
        }
        if (cur !== B) {
          if (climbUp && B.top < y - 3) {
            // In der Lücke neben der Zielkachel hochklettern
            const gapL = B.l - 3, gapR = B.r + 3;
            const cx = (gapL > 6 && (Math.abs(gapL - x) <= Math.abs(gapR - x) || gapR > 634)) ? gapL : gapR;
            walk(Math.max(cur.l + 4 * k, Math.min(cur.r - 4 * k, cx)));
            climb(cx, B.top);
            jump(cx < B.l ? B.l + margin() : B.r - margin(), B.top, 10 * k);
          } else {
            const lx = Math.max(cur.l + margin() * .5, Math.min(cur.r - margin() * .5, Math.max(B.l + margin(), Math.min(B.r - margin(), goalX))));
            walk(lx);
            jump(Math.max(B.l + margin(), Math.min(B.r - margin(), lx)), B.top, Math.max(0, y - B.top) + 26 * k);
          }
        }
      } else if (!A || !B) jump(to.x, to.y, 30 * k);

      // Was am Ziel passiert
      let letter = null;
      if (act === 'buchstabe' && B) letter = grabLetter(B.el);
      if (letter) {
        // Zum näheren Bildschirmrand treten, Figur steht dafür auf der anderen Seite des Buchstabens
        const dir = letter.x < 320 ? -1 : 1;
        walk(Math.max(B.l + 14 * k, Math.min(B.r - 14 * k, letter.x - dir * 8 * k)));
        add({ d: .5, k: 'act', name: 'look', dir });
        at(.6, () => {
          const off = dir > 0 ? (640 - letter.x + 30) * 3 : -(letter.x + 30) * 3;
          letter.anim = letter.span.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${off * .5}px,-240px) rotate(${dir * 400}deg)`, opacity: 1, offset: .55 },
            { transform: `translate(${off}px,-60px) rotate(${dir * 760}deg)`, opacity: 1 }], { duration: 1100, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
        });
        add({ d: 1.2, k: 'act', name: 'kick1', dir });
        add({ d: 1.1, k: 'act', name: 'look' });
        const sx = x, sy = y;
        jump(dir > 0 ? 690 : -50, y - 30, 40 * k, { dir });
        add({ d: 1.4, k: 'idle' });
        jump(sx, sy, 40 * k, { carry: 1, dir: -dir });
        add({ d: .3, k: 'act', name: 'look', dir, carry: 1 });
        add({ d: 1.0, k: 'act', name: 'insert', carry: 1 });
        at(0, () => { if (letter.anim) letter.anim.cancel(); letter.span.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }); });
        add({ d: .9, k: 'act', name: 'wave' });
      } else {
        walk(to.x);
        const sitAct = (d, name) => add({ d: .45, k: 'sit', to: 1 }, { d, k: 'act', name }, { d: .45, k: 'sit', to: 0 });
        if (act === 'putzen') add({ d: 4.2, k: 'act', name: 'wipe' });
        else if (act === 'schlafen') sitAct(7, 'sleep');
        else if (act === 'freuen') add({ d: 2.2, k: 'act', name: 'cheer' });
        else if (act === 'treten') { const d = x < (B ? (B.l + B.r) / 2 : x) ? -1 : 1; add({ d: .3, k: 'act', name: 'look', dir: d }); at(2.2 * .3 + .05, () => wobble(B && B.el, d)); at(2.2 * .7 + .05, () => wobble(B && B.el, d, 1.3)); add({ d: 2.2, k: 'act', name: 'kick', dir: d }); add({ d: .8, k: 'act', name: 'grim' }); }
        else if (act === 'huepfen') { [1, 2, 3].forEach(i => at(2.4 * i / 3 - .02, () => wobble(B && B.el, i % 2 ? 1 : -1, .8))); add({ d: 2.4, k: 'act', name: 'stomp' }); }
        else if (act === 'grimasse') add({ d: 2.6, k: 'act', name: 'grim' });
        else sitAct(2.4, 'wave');
      }
      add({ d: 1.3, k: 'morph', to: 0 });
      if (E.text) add({ d: .35, k: 'txt', to: 1 });
      return { segs, events, letter, total, to: { x, y, card: B ? B.el : to.card } };
    }

    function schedule() {
      const every = cfg.every === 'zufall' ? 5 + Math.random() * 10 : +cfg.every;
      nextAt = Date.now() + every * 60000;
    }
    function stop() {
      cancelAnimationFrame(raf);
      if (move && move.letter) { if (move.letter.anim) move.letter.anim.cancel(); move.letter.restore(); }
      move = null;
    }
    function start(p) {
      move = { ...p, start: restState(), t0: now() };
      move.events.sort((a, b) => a.at - b.at);
      loop();
    }
    // opts.act: bestimmte Aktion (Test-Knöpfe), opts.target: 'oben' für Klettern, 'hier' bleibt auf der Kachel
    function go(opts = {}) {
      if (!cfg) return;
      if (move) stop();
      if (!pos || !pos.card.isConnected) pos = pickSpot(null);
      if (!pos) return;
      let to;
      const list = cards(), here = list.find(c => c.el === pos.card);
      if (opts.target === 'hier' && here) to = { x: pos.x, y: pos.y, card: pos.card };
      else if (opts.target === 'oben') {
        const higher = list.filter(c => here && c.top < here.top - 3);
        if (!higher.length) {
          // Schon oben: erst runter auf eine untere Kachel, dann hochklettern
          const lower = pickSpot(pos.card, c => here && c.top > here.top + 3);
          if (lower) { pos = lower; render(restState()); }
          return go(opts);
        }
        to = spotOn(pick(higher));
      } else if (opts.near && here) {
        // Test-Ablauf: zur nächstgelegenen passenden Kachel, damit man nicht lange warten muss
        const others = list.filter(c => c !== here && (!opts.filter || opts.filter(c)));
        const dist = c => Math.hypot(Math.max(0, c.l - pos.x, pos.x - c.r), c.top - here.top);
        to = others.length ? spotOn(others.sort((a, b) => dist(a) - dist(b))[0]) : null;
      } else to = pickSpot(pos.card, opts.filter);
      if (!to) return;
      if (reduced.matches) { pos = { x: to.x, y: to.y, card: to.card }; render(restState()); schedule(); return; }
      start(plan(pos, to, { act: opts.act, climb: opts.target === 'oben' ? true : undefined, mood: opts.mood }));
    }
    function loop() {
      cancelAnimationFrame(raf);
      if (!move) return;
      const t = now() - move.t0;
      while (move.events.length && move.events[0].at <= t) { try { move.events.shift().fn(); } catch {} }
      if (t >= move.total) {
        if (move.letter) move.letter.restore();
        pos = move.to; move = null; render(restState()); schedule(); return;
      }
      render(stateAt(move.segs, t, move.start, now(), k));
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
      if (!next) { stop(); cfg = null; svg.innerHTML = ''; svg.style.display = 'none'; return; }
      const reschedule = !cfg || cfg.every !== next.every;
      stop();
      cfg = next; k = SIZES[cfg.size] || .55; svg.style.display = '';
      build();
      if (!pos || !pos.card.isConnected) pos = pickSpot(null);
      if (pos) render(restState()); else requestAnimationFrame(() => { pos = pickSpot(null); if (pos) render(restState()); });
      if (reschedule) schedule();
    }
    // Hinweise vom Board: Störung aktiv, Besuchermodus; Aufgabe erledigt = kurz freuen
    function context(c) { ctx = Object.assign(ctx, c); }
    function cheer() {
      if (!cfg || move || ctx.incident || sleeping() || reduced.matches || cfg.mood === 'frech') return;
      if (!pos || !pos.card.isConnected) return;
      start(plan(pos, { x: pos.x, y: pos.y, card: pos.card }, { act: 'freuen' }));
    }
    function test(name) {
      if (!cfg) return;
      if (name === 'klettern') return go({ target: 'oben', act: 'winken' });
      if (name === 'freuen') { if (move) stop(); if (!pos) pos = pickSpot(null); return pos && start(plan(pos, { x: pos.x, y: pos.y, card: pos.card }, { act: 'freuen' })); }
      const hasText = c => [...(c.el.querySelector('h3')?.childNodes || [])].some(n => n.nodeType === 3 && /[A-Za-zÄÖÜäöü]/.test(n.nodeValue));
      return go({ act: name, near: true, filter: name === 'buchstabe' ? hasText : null });
    }
    return { apply, go, test, cheer, context };
  }

  window.WBMascot = { create, FONTS, FIGS, MOODS, ACTS, DEFAULTS };
})();
