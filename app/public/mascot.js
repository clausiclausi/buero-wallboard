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
  const FIGS = { strich: 'Strichmännchen', kugel: 'Kugel', katze: 'Kätzchen', mieze: 'Katze (echt)', hund: 'Hündchen', geist: 'Lichtgeist' };
  const MOODS = { lieb: 'Lieb', frech: 'Frech', gemischt: 'Gemischt' };
  const ACTS = {
    winken: { name: 'Winken', mood: 'lieb' }, putzen: { name: 'Putzen', mood: 'lieb' }, schlafen: { name: 'Schlafen', mood: 'lieb' },
    klettern: { name: 'Klettern', mood: 'lieb' }, freuen: { name: 'Freuen', mood: 'lieb' },
    treten: { name: 'Kachel antreten', mood: 'frech' }, huepfen: { name: 'Hüpfen', mood: 'frech' }, grimasse: { name: 'Grimasse', mood: 'frech' },
    buchstabe: { name: 'Buchstabe wegtreten', mood: 'frech' }, schieben: { name: 'Kachel schieben', mood: 'frech' },
    strecken: { name: 'Gähnen und Strecken', mood: 'lieb' }, spazieren: { name: 'Spaziergang-Hinweis', mood: 'info' },
    klopfen: { name: 'Termin-Klopfen', mood: 'info' },
    tanzen: { name: 'Freitags-Tänzchen', mood: 'info' }, eis: { name: 'Eis bei Hitze', mood: 'info' }, schirm: { name: 'Schirm bei Regen', mood: 'info' },
  };
  // Mitgebrachtes zu besonderen Aktionen: Eis in der Hand, Schirm über dem Kopf, Noten beim Tanzen
  const PROPS = { eis: 'eis', schirm: 'schirm', tanzen: 'noten' };
  const PROP_SVG = {
    eis: `<path d="M-3.2 0 L3.2 0 L0 9.5 Z" fill="#E2A55B" stroke="#1B1410" stroke-width=".5" stroke-linejoin="round"/><path d="M-2 2.2 L1.4 5.6 M-.6 0.4 L2.4 3.4 M2 2.2 L-1.4 5.6 M.6 0.4 L-2.4 3.4" stroke="#B9783A" stroke-width=".45"/>
      <circle cx="0" cy="-2.4" r="3.5" fill="#FF9EB5" stroke="#1B1410" stroke-width=".5"/><circle cx="0" cy="-6.6" r="3" fill="#8FE3C0" stroke="#1B1410" stroke-width=".5"/><circle cx=".7" cy="-9.9" r="1.1" fill="#E0403A" stroke="#1B1410" stroke-width=".4"/>`,
    schirm: `<path d="M0 -11 L0 9 Q0 12 -3 11.2" stroke="#5A3E2B" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M-12 0 Q-12 -10.5 0 -11.5 Q12 -10.5 12 0 Q9 -2.6 6 0 Q3 -2.6 0 0 Q-3 -2.6 -6 0 Q-9 -2.6 -12 0 Z" fill="#4A86E8" stroke="#1B1410" stroke-width=".6" stroke-linejoin="round"/>
      <path d="M0 -11.5 Q-4 -6 -6 0 M0 -11.5 Q4 -6 6 0" stroke="#2F62B8" stroke-width=".6" fill="none"/><circle cx="0" cy="-12" r="1" fill="#2F62B8"/>`,
    noten: `<g stroke="#1B1410" stroke-width=".5"><ellipse cx="-4" cy="2" rx="2.2" ry="1.6" fill="#FFFFFF" transform="rotate(-20 -4 2)"/><path d="M-2 1.6 L-2 -8 Q1 -6.5 1.5 -4" fill="none" stroke="#FFFFFF" stroke-width="1.1" stroke-linecap="round"/>
      <ellipse cx="4" cy="-1" rx="2" ry="1.5" fill="#FFE27A" transform="rotate(-20 4 -1)"/><path d="M5.8 -1.4 L5.8 -10 L10 -11 L10 -3" fill="none" stroke="#FFE27A" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="8.2" cy="-2.6" rx="2" ry="1.5" fill="#FFE27A" transform="rotate(-20 8.2 -2.6)"/></g>`,
  };
  const SIZES = { klein: .42, mittel: .55, gross: .72 };
  // Welche Deko gerade passt: Kürbis vor Halloween, Nikolausmütze im Advent, Wollmütze im Winter, Hasenohren zu Ostern
  function season(d = new Date()) {
    const m = d.getMonth() + 1, day = d.getDate();
    if (m === 10 && day >= 20) return 'kuerbis';
    if (m === 12 && day <= 26) return 'nikolaus';
    if (m === 12 || m <= 2) return 'muetze';
    const y = d.getFullYear(), a = y % 19, b = Math.floor(y / 100), c = y % 100, h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
    const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - c % 4) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
    const easter = new Date(y, Math.floor((h + l - 7 * mm + 114) / 31) - 1, ((h + l - 7 * mm + 114) % 31) + 1);
    if (Math.abs(d - easter) < 7 * 864e5) return 'hase';
    return '';
  }
  const OUT = 'stroke="#1B1410" stroke-width="0.09" stroke-linejoin="round"';
  const DECO = {
    nikolaus: `<path d="M-1.05 -0.05 Q-0.75 -1.45 0.45 -1.55 Q1.3 -1.55 1.6 -0.7 Q1.1 -1.05 0.75 -0.85 Q0.98 -0.45 1.05 -0.05 Z" fill="#E0403A" ${OUT}/>
      <rect x="-1.18" y="-0.3" width="2.36" height="0.46" rx="0.23" fill="#FFFFFF" ${OUT}/><circle cx="1.6" cy="-0.68" r="0.27" fill="#FFFFFF" ${OUT}/>`,
    muetze: `<path d="M-1.02 0 Q-1.02 -1.3 0 -1.3 Q1.02 -1.3 1.02 0 Z" fill="#4A86E8" ${OUT}/>
      <path d="M-0.55 -1.12 L-0.55 -0.2 M0 -1.3 L0 -0.2 M0.55 -1.12 L0.55 -0.2" stroke="#2F62B8" stroke-width="0.12" fill="none"/>
      <rect x="-1.12" y="-0.32" width="2.24" height="0.46" rx="0.18" fill="#2F62B8" ${OUT}/><circle cx="0" cy="-1.38" r="0.3" fill="#FFFFFF" ${OUT}/>`,
    kuerbis: `<path d="M0 -1.25 Q0.05 -1.55 0.25 -1.62" stroke="#3E7D32" stroke-width="0.16" fill="none" stroke-linecap="round"/>
      <ellipse cx="-0.42" cy="-0.6" rx="0.55" ry="0.62" fill="#F08A24" ${OUT}/><ellipse cx="0.42" cy="-0.6" rx="0.55" ry="0.62" fill="#F08A24" ${OUT}/>
      <ellipse cx="0" cy="-0.62" rx="0.5" ry="0.66" fill="#F79A35" ${OUT}/><path d="M0.12 -1.25 q0.4 -0.25 0.6 0.02 q-0.35 0.12 -0.6 -0.02z" fill="#5FAE45"/>`,
    hase: `<ellipse cx="-0.45" cy="-1.25" rx="0.28" ry="0.8" fill="#FFFFFF" ${OUT} transform="rotate(-12 -0.45 -1.25)"/><ellipse cx="-0.45" cy="-1.22" rx="0.12" ry="0.55" fill="#FFB3C1" transform="rotate(-12 -0.45 -1.22)"/>
      <ellipse cx="0.45" cy="-1.25" rx="0.28" ry="0.8" fill="#FFFFFF" ${OUT} transform="rotate(12 0.45 -1.25)"/><ellipse cx="0.45" cy="-1.22" rx="0.12" ry="0.55" fill="#FFB3C1" transform="rotate(12 0.45 -1.22)"/>`,
  };
  const DEFAULTS = { fig: 'strich', color: '#7FE0AE', text: '', font: 'strich', every: 'zufall', size: 'mittel', mood: 'lieb', alerts: true, walk: '09:55', deco: true };

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
    arm.R = lerp(arm.R, 2.95, s.stretch); arm.L = lerp(arm.L, -2.95, s.stretch);
    const tapA = s.tap >= 0 && s.tap < .35 ? .55 * (1 - s.tap / .35) : 0;
    arm[front] = lerp(arm[front], dir * (2.05 - tapA), s.knock);
    arm.R = lerp(arm.R, dir * 1.55, s.push); arm.L = lerp(arm.L, dir * 1.4, s.push);
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
    hR = set(hR, P(c[0] + rx + 2, c[1] - ry - 6), s.stretch); hL = set(hL, P(c[0] - rx - 2, c[1] - ry - 6), s.stretch);
    const kH = P(c[0] + dir * (rx + 5 - (s.tap >= 0 && s.tap < .35 ? 4 * (1 - s.tap / .35) : 0)), c[1] - ry * .5);
    if (dir > 0) hR = set(hR, kH, s.knock); else hL = set(hL, kH, s.knock);
    hR = set(hR, P(c[0] + dir * (rx + 7), c[1] + 2), s.push); hL = set(hL, P(c[0] + dir * (rx + 7), c[1] - 6), s.push);
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
    const rx = 17 * (1 + sq + .12 * s.stretch + .1 * s.push), ry = 14 * (1 - sq - .08 * s.stretch);
    const c = P(x + dir * 7 * s.kick + Math.sin(t * 12) * 2 * s.wipe + dir * 4 * s.push + dir * (s.tap >= 0 && s.tap < .35 ? 3 * (1 - s.tap / .35) : 0) * s.knock, lerp(y - ry - 1 - hop, y - 8, sit) - air * 3);
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
  // ---------- Gezeichnete Tiere: echte Katze und Hündchen (Seitenansicht, Blick nach rechts, Pfoten bei 0/0) ----------
  // Beine, Schwanz, Kopf, Ohr und Augen sind eigene Gruppen und werden pro Bild gedreht.
  const SPRITES = {
    mieze: {
      head: [18.5, -31], headR: 10, neck: [13, -27], tail: [-17, -21], ear: null,
      hips: { lf1: [12, -17], lf2: [10, -16], lb1: [-14, -20], lb2: [-12, -17] },
      svg: (B = '#8E8781', D = '#4F4945', W = '#F4EFEA', F = '#6F6964') => `
        <g data-p="tail"><path d="M-17 -21 C-26 -23 -31 -33 -27 -44" fill="none" stroke="${B}" stroke-width="4.4" stroke-linecap="round"/>
          <path d="M-24.4 -31 l3.6 -1.4 M-27.6 -37 l3.8 0" stroke="${D}" stroke-width="1.6" stroke-linecap="round"/><path d="M-27.6 -41 L-27 -44" stroke="${D}" stroke-width="4.4" stroke-linecap="round"/></g>
        <g data-p="lf2"><path d="M10 -16 L10 -1" stroke="${F}" stroke-width="4.4" stroke-linecap="round"/></g>
        <g data-p="lb2"><path d="M-12 -17 Q-15 -9 -11 -1" fill="none" stroke="${F}" stroke-width="4.8" stroke-linecap="round"/></g>
        <ellipse cx="-1" cy="-21" rx="19" ry="9.5" fill="${B}"/>
        <path d="M-12 -29.6 q2.4 5 0 9.6 M-6 -30.4 q2.4 5 0 9.6 M0 -30.4 q2.4 5 0 9.6 M6 -29.6 q2 4 0 8 M-17.4 -25 q3 3 2 7.4" stroke="${D}" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".6"/>
        <ellipse cx="2" cy="-13.4" rx="12" ry="2.6" fill="${W}" opacity=".55"/>
        <g data-p="lb1"><path d="M-14 -20 Q-19 -10 -13.5 -1" fill="none" stroke="${B}" stroke-width="5.4" stroke-linecap="round"/><path d="M-16.6 -12 l3 1" stroke="${D}" stroke-width="1.3" stroke-linecap="round" opacity=".6"/><ellipse cx="-12.6" cy="-1" rx="3.3" ry="1.6" fill="${W}"/></g>
        <g data-p="lf1"><path d="M12 -17 L12.6 -1" stroke="${B}" stroke-width="4.9" stroke-linecap="round"/><path d="M10.4 -9 h4 M10.6 -6 h3.8" stroke="${D}" stroke-width="1.1" stroke-linecap="round" opacity=".55"/><ellipse cx="13.6" cy="-1" rx="3.1" ry="1.5" fill="${W}"/></g>
        <ellipse cx="13.4" cy="-19.4" rx="6" ry="7.2" fill="${W}"/>
        <g data-p="head">
          <path d="M-8.4 -3.6 L-6.6 -15.4 L-0.6 -8.2 Z" fill="${B}" stroke="${D}" stroke-width=".7" stroke-linejoin="round"/><path d="M-6.8 -6 L-6.2 -12.4 L-3 -8.2 Z" fill="#E7A2A6"/>
          <path d="M2 -8.4 L8.4 -15.4 L9.4 -3.8 Z" fill="${B}" stroke="${D}" stroke-width=".7" stroke-linejoin="round"/><path d="M4.2 -8.2 L7.8 -12.6 L8.2 -6 Z" fill="#E7A2A6"/>
          <ellipse cx="0.6" cy="-1" rx="10.2" ry="8.8" fill="${B}"/>
          <path d="M-1.2 -9.2 v3.2 M1.4 -9.6 v3.4 M4 -9.2 v3" stroke="${D}" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M-8.6 0.6 q2.6 .6 4 -1 M-8.8 3 q2.6 .2 3.8 -1" stroke="${D}" stroke-width="1" fill="none" stroke-linecap="round" opacity=".6"/>
          <ellipse cx="6.2" cy="3.2" rx="5.2" ry="3.7" fill="${W}"/>
          <g data-p="eye1"><ellipse cx="0.4" cy="-1.6" rx="2.5" ry="2.2" fill="#9CC23F" stroke="#2E2A26" stroke-width=".5"/><ellipse cx="0.7" cy="-1.6" rx=".55" ry="1.9" fill="#111"/><circle cx="1.4" cy="-2.5" r=".55" fill="#fff"/></g>
          <g data-p="eye2"><ellipse cx="6.4" cy="-1.6" rx="2.2" ry="2.1" fill="#9CC23F" stroke="#2E2A26" stroke-width=".5"/><ellipse cx="6.7" cy="-1.6" rx=".5" ry="1.8" fill="#111"/><circle cx="7.3" cy="-2.4" r=".5" fill="#fff"/></g>
          <path d="M8.8 1.2 l2.4 -.3 l-1.1 1.6 z" fill="#E28C98" stroke="#9C5C62" stroke-width=".3"/>
          <path d="M10.1 2.6 q-.6 1.5 -2.1 1.3 M10.1 2.6 q.5 1.4 1.7 1.1" stroke="#5A4038" stroke-width=".55" fill="none" stroke-linecap="round"/>
          <ellipse data-p="tongue" cx="9.6" cy="5" rx="1.3" ry="1.9" fill="#FF6F86" opacity="0"/>
          <path d="M8.6 3 l7.4 -1.8 M8.6 3.6 l7.6 .4 M8.2 4.2 l6.6 2.2 M4 3 l-5 -1 M4 3.8 l-5 .6" stroke="#FFFFFF" stroke-width=".35" opacity=".85" stroke-linecap="round"/>
        </g>`,
    },
    hund: {
      head: [15, -29], headR: 11, neck: [10, -23], tail: [-14, -19], ear: [-4, -9],
      hips: { lf1: [10, -13], lf2: [8, -12], lb1: [-11, -13], lb2: [-9.5, -12] },
      svg: (B = '#DCA367', D = '#8A552A', W = '#FFF8EE', F = '#BD8550') => `
        <g data-p="tail"><path d="M-14 -19 Q-21 -24 -20.4 -31.4" fill="none" stroke="${B}" stroke-width="3.8" stroke-linecap="round"/><path d="M-20.6 -29 L-20.4 -31.4" stroke="${W}" stroke-width="3.8" stroke-linecap="round"/></g>
        <g data-p="lf2"><path d="M8 -12 L8 -1" stroke="${F}" stroke-width="4.8" stroke-linecap="round"/></g>
        <g data-p="lb2"><path d="M-9.5 -12 L-9.5 -1" stroke="${F}" stroke-width="5" stroke-linecap="round"/></g>
        <ellipse cx="-1" cy="-16" rx="15.4" ry="8.8" fill="${B}"/>
        <path d="M-9 -23.6 q6 -3 12 -1.6 q-2 5 -7 5.4 q-4 0 -5 -3.8z" fill="${D}" opacity=".85"/>
        <ellipse cx="1" cy="-11.6" rx="10.4" ry="3.6" fill="${W}"/>
        <g data-p="lb1"><path d="M-11 -13.4 L-11.4 -1" stroke="${B}" stroke-width="5.6" stroke-linecap="round"/><ellipse cx="-10.4" cy="-.8" rx="3.5" ry="1.8" fill="${W}"/></g>
        <g data-p="lf1"><path d="M10 -13 L10.2 -1" stroke="${B}" stroke-width="5.4" stroke-linecap="round"/><ellipse cx="11.2" cy="-.8" rx="3.3" ry="1.7" fill="${W}"/></g>
        <path d="M7.4 -23.4 q4.6 4.4 10 2.8" stroke="#E04848" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="12.6" cy="-19.6" r="1.6" fill="#F2C94C" stroke="#B88A1C" stroke-width=".4"/>
        <g data-p="head">
          <ellipse cx="1" cy="-1" rx="11.2" ry="10.2" fill="${B}"/>
          <path d="M3.2 -11 q-1.4 6 1 9.4 q4 1.2 6.2 -1 q-1 -5.4 -3.4 -8.4 z" fill="${W}"/>
          <ellipse cx="7.8" cy="3.6" rx="6.2" ry="4.6" fill="${W}"/>
          <ellipse cx="3.2" cy="3.4" rx="1.8" ry="1.1" fill="#FF9FB0" opacity=".55"/>
          <g data-p="eye1"><ellipse cx="1" cy="-2.6" rx="2.7" ry="3" fill="#2A1D14"/><circle cx="1.9" cy="-3.7" r="1" fill="#fff"/><circle cx=".3" cy="-1.6" r=".45" fill="#fff" opacity=".8"/></g>
          <g data-p="eye2"><ellipse cx="7.4" cy="-2.6" rx="2.4" ry="2.8" fill="#2A1D14"/><circle cx="8.2" cy="-3.6" r=".9" fill="#fff"/></g>
          <path d="M-0.8 -6.6 q1.6 -1.4 3.4 -.4 M5.8 -6.6 q1.6 -1.2 3.2 0" stroke="${D}" stroke-width=".7" fill="none" stroke-linecap="round"/>
          <ellipse cx="12.8" cy="1.4" rx="2.2" ry="1.7" fill="#2B2B2B"/><ellipse cx="12.2" cy=".9" rx=".7" ry=".45" fill="#fff" opacity=".7"/>
          <path d="M12.2 3 q-.4 2.2 -3.2 2.2 M12.2 3 q.4 1.6 1.8 1.4" stroke="#4A3426" stroke-width=".7" fill="none" stroke-linecap="round"/>
          <path data-p="tongue" d="M9.6 5 q.4 4.2 2.3 3.8 q1.5 -.4 .9 -3.8 z" fill="#FF7A8A" stroke="#D85468" stroke-width=".3" opacity="0"/>
          <g data-p="ear"><path d="M-4 -9.4 q-8.4 .8 -7.6 11.6 q2.2 4.2 5.6 1.2 q1 -6.6 2 -12.8 z" fill="${D}"/></g>
        </g>`,
    },
  };
  // Zeichnet ein Tier für den Zustand s; liefert Kopf und Pfote für Deko, Sprechblase und Klopf-Ringe
  function drawSprite(E, kind, s, x, y, kk, blink) {
    const S = SPRITES[kind], P2 = E.sp, t = s.t, a = s.walk, dir = s.dir || 1;
    const ph = s.dist * (kind === 'hund' ? .42 : .34);
    const swing = Math.sin(ph) * 30 * a + Math.sin(t * 10) * 18 * s.climb;
    const bob = Math.abs(Math.sin(ph)) * 1.2 * a;
    const lift = (n, deg) => { const h = S.hips[n]; P2[n].setAttribute('transform', `rotate(${deg.toFixed(1)} ${h[0]} ${h[1]})`); };
    const front = -70 * s.wave + Math.sin(t * 9) * 14 * s.wave - (40 - Math.sin(t * 12) * 25) * s.wipe - 60 * Math.max(s.carry, s.knock) - 75 * s.push - 30 * s.stretch;
    const tuck = 35 * s.air;
    lift('lf1', swing + front - tuck);
    lift('lb2', swing + tuck - 85 * s.sit);
    lift('lf2', -swing - 75 * s.push - 30 * s.stretch - tuck);
    lift('lb1', -swing + 60 * s.kick + tuck - 85 * s.sit);
    // Schwanz: Katze schwingt langsam, Hund wedelt
    const happy = Math.max(s.wave, s.cheer, a * .5);
    const wag = kind === 'hund' ? Math.sin(t * (9 + 9 * happy)) * (14 + 14 * happy) * (1 - s.sleep * .8) : Math.sin(t * 1.8) * 9 + Math.sin(t * 7) * 12 * happy - 30 * s.sit;
    P2.tail.setAttribute('transform', `rotate(${wag.toFixed(1)} ${S.tail[0]} ${S.tail[1]})`);
    // Kopf: nickt beim Laufen, senkt sich im Schlaf, kippt bei der Grimasse
    const nod = Math.sin(ph * 2) * 3 * a + 18 * s.sleep - 10 * s.cheer + Math.sin(t * 20) * 4 * s.grim - 12 * s.stretch;
    P2.head.setAttribute('transform', `translate(${S.head[0]} ${(S.head[1] + bob * .5).toFixed(1)}) rotate(${nod.toFixed(1)} ${S.neck[0] - S.head[0]} ${S.neck[1] - S.head[1]})`);
    const open = Math.min(blink, 1 - .9 * Math.max(s.sleep, s.stretch * .9));
    // Augen um ihren Mittelpunkt zusammenkneifen (Blinzeln, Schlafen)
    for (const eye of [P2.eye1, P2.eye2]) eye.style.transform = `scaleY(${Math.max(.08, open).toFixed(2)})`;
    P2.tongue.setAttribute('opacity', Math.max(s.grim, kind === 'hund' ? Math.max(s.cheer, a * .8) : 0).toFixed(2));
    if (P2.ear) P2.ear.setAttribute('transform', `rotate(${(Math.sin(ph) * 10 * a - 25 * s.air + 8 * s.sleep).toFixed(1)} ${S.ear[0]} ${S.ear[1]})`);
    // Ganzer Körper: Sitzen kippt nach hinten, Strecken zieht lang, Blick in Laufrichtung
    const sitRot = -16 * s.sit, sx = 1 + .1 * s.stretch, sy = 1 - .06 * s.stretch + Math.sin(t * 1.6) * .015 * s.sleep;
    const ox = x + dir * (7 * s.kick + Math.sin(t * 12) * 2 * s.wipe + 4 * s.push) * kk;
    P2.root.setAttribute('transform', `translate(${ox.toFixed(1)} ${(y - bob * kk + 4 * s.sit * kk).toFixed(1)}) scale(${(dir * kk).toFixed(3)} ${kk.toFixed(3)}) rotate(${sitRot.toFixed(1)} -12 0) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`);
    const hx = ox + dir * S.head[0] * kk, hy = y + (S.head[1] - bob + 4 * s.sit) * kk;
    const ph1 = S.hips.lf1, rad = (swing + front) * Math.PI / 180, len = -ph1[1];
    const paw = P(ox + dir * (ph1[0] - Math.sin(rad) * len) * kk, y + (ph1[1] + Math.cos(rad) * len) * kk);
    return { O: { cx: hx, cy: hy, rx: S.headR * kk, ry: S.headR * kk * .9 }, hand: paw, mouth: P(hx + dir * 9 * kk, hy + 4 * kk) };
  }
  // Die gezeichneten Tiere nutzen die Kätzchen-Striche nur für die Verwandlung aus den Buchstaben
  const POSES = { strich: poseStick, kugel: poseBall, katze: poseCat, mieze: poseCat, hund: poseCat };

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
  const ACT_KEYS = ['wave', 'wipe', 'sleep', 'cheer', 'kick', 'grim', 'climb', 'stretch', 'knock', 'push'];
  function stateAt(segs, t, start, clock, k) {
    const s = { x: start.x, y: start.y, m: start.m || 0, sit: 0, walk: 0, dist: 0, air: 0, dir: start.dir || 1, txt: start.txt, t: clock, carry: 0, ins: 0, act: '', zoom: 1, tap: -1, say: '' };
    for (const a of ACT_KEYS) s[a] = 0;
    for (const g of segs) {
      const u = clamp(t / g.d), x0 = s.x, y0 = s.y;
      if (g.carry !== undefined && t > 0) s.carry = g.carry;
      if (g.dir && t > 0) s.dir = g.dir;
      if (g.say !== undefined && t > 0) s.say = g.say;
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
        if (g.name === 'stretch') s.stretch = sstep(0, .3, u) * (1 - sstep(.75, 1, u));
        if (g.name === 'knock') {
          // Nach vorne kommen (größer werden) und an die Scheibe klopfen
          s.knock = env; s.zoom = 1 + 1.3 * sstep(0, .18, u) * (1 - sstep(.86, 1, u));
          if (u >= .25 && u <= .8) s.tap = ((at - .25 * g.d) % .32) / .32;
        }
        if (g.name === 'push') {
          s.push = env;
          const sh = u < .22 ? ease(u / .22) : u < .8 ? 1 : 1 - ease((u - .8) / .2);
          s.x = x0 + (g.dir || s.dir) * 13 * sh; s.walk = u < .22 ? .6 : 0; s.dist += u < .22 ? 2 : 0;
        }
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
    let ctx = { incident: false, visitor: false, avoid: [] };
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
      E.sp = null;
      if (SPRITES[cfg.fig]) {
        // Gezeichnetes Tier in natürlichen Fellfarben, mit weichem Schatten statt Leuchten
        E.fig.style.filter = 'drop-shadow(0 1px 1.2px rgba(0,0,0,.35))';
        const root = el('g', { opacity: 0 }, E.fig);
        root.innerHTML = SPRITES[cfg.fig].svg();
        E.sp = { root };
        root.querySelectorAll('[data-p]').forEach(n => { E.sp[n.dataset.p] = n; });
        for (const eye of [E.sp.eye1, E.sp.eye2]) { eye.style.transformBox = 'fill-box'; eye.style.transformOrigin = '50% 50%'; }
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
      E.prop = el('g', { opacity: 0 }, svg); E.propKind = '';
      E.yawn = el('ellipse', { fill: '#3A1F1A', opacity: 0 }, E.fig);
      // Jahreszeiten-Deko auf dem Kopf, gezeichnet für einen Kopf mit Radius 1
      E.deco = el('g', { opacity: 0 }, E.fig);
      E.decoKind = cfg.deco === false ? '' : season();
      E.deco.innerHTML = DECO[E.decoKind] || '';
      E.rings = [0, 1].map(() => el('circle', { fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.2, opacity: 0 }, svg));
      E.bubble = el('g', { opacity: 0 }, svg);
      E.bRect = el('rect', { rx: 5, fill: '#FFFFFF' }, E.bubble);
      E.bTail = el('path', { fill: '#FFFFFF' }, E.bubble);
      E.bText = el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#14201B', 'font-size': 8.5, 'font-weight': 600, style: "font-family:'Segoe UI',system-ui,sans-serif" }, E.bubble);
      E.bSaid = '';
      // Unsichtbare Fläche zum Anfassen, liegt über allem
      E.hit = el('ellipse', { fill: 'transparent', style: 'pointer-events:all;cursor:grab;touch-action:none' }, svg);
      E.hit.addEventListener('pointerdown', grab);
    }

    let lastTap = -1;
    function render(s) {
      const t = s.t, x = s.x, y = s.y, kk = k * (s.zoom || 1);
      if (E.hit) { E.hit.setAttribute('cx', x.toFixed(1)); E.hit.setAttribute('cy', (y - 16 * k).toFixed(1)); E.hit.setAttribute('rx', (42 * k).toFixed(1)); E.hit.setAttribute('ry', (26 * k).toFixed(1)); }
      const lp = scaleGeo(letterPose(x, y, reduced.matches ? 0 : t), x, y, k);
      const blinkOpen = (t % 3.1) < .12 ? .15 : 1, eyeOn = sstep(.8, 1, s.m);
      const shut = Math.max(s.sleep, s.stretch * .9);
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
        fp = scaleGeo(ghostShape(s), x, y, kk);
        const a = letterPoints(lp, E.dots.length), b = sampleChain(fp.seg, E.dots.length);
        E.dots.forEach((d, i) => {
          const u = ease(clamp(s.m * 1.5 - rnd[i] * .5)), swirl = Math.sin(Math.PI * u) * 22 * k;
          d.setAttribute('cx', (lerp(a[i][0], b[i][0], u) + Math.cos(i * 2.4 + t) * swirl).toFixed(1));
          d.setAttribute('cy', (lerp(a[i][1], b[i][1], u) + Math.sin(i * 2.4 + t) * swirl).toFixed(1));
          d.setAttribute('fill', mix(E.LC, E.FC, u)); d.setAttribute('r', (2.3 * kk / 1.35).toFixed(2));
          d.setAttribute('opacity', ((.8 + .2 * Math.sin(t * 5 + i * 1.7)) * (1 - .4 * s.sleep)).toFixed(2));
        });
        E.eyes.forEach((e, i) => { e.setAttribute('cx', fp.eyes[i][0]); e.setAttribute('cy', fp.eyes[i][1]); e.setAttribute('rx', 1.8 * kk); e.setAttribute('ry', 2.4 * kk * eyeOpen(i)); e.setAttribute('opacity', eyeOn); });
        E.cheeks.forEach((c, i) => { c.setAttribute('cx', fp.cheeks[i][0]); c.setAttribute('cy', fp.cheeks[i][1]); c.setAttribute('opacity', eyeOn * .7); });
      } else {
        fp = scaleGeo(POSES[cfg.fig](s), x, y, kk);
        const mi = i => ease(clamp((s.m - i * .055) / (1 - 6 * .055)));
        const lift = (i, u) => -Math.sin(Math.PI * u) * (14 + 6 * rnd[i]) * k;
        E.lines.forEach((ln, i) => {
          const u = mi(i), A = lp.L[i], B = fp.L[i], dy = lift(i, u);
          ln.setAttribute('d', curve(P(lerp(A[0][0], B[0][0], u), lerp(A[0][1], B[0][1], u) + dy), P(lerp(A[1][0], B[1][0], u), lerp(A[1][1], B[1][1], u) + dy), lerp(A[2], B[2], u)));
          ln.setAttribute('stroke', mix(E.LC, E.FC, u)); ln.setAttribute('stroke-width', (E.sw * s.zoom).toFixed(2));
        });
        // Mund wird dunkel und dünn, sobald er im Gesicht sitzt
        const um = sstep(.7, 1, mi(2));
        E.lines[2].setAttribute('stroke', mix(mix(E.LC, E.FC, mi(2)), '#1B1410', um));
        E.lines[2].setAttribute('stroke-width', (lerp(E.sw, E.sw * .6, um) * s.zoom).toFixed(2));
        E.oval.setAttribute('stroke-width', (E.sw * s.zoom).toFixed(2));
        const uo = mi(6), dy = lift(6, uo);
        E.oval.setAttribute('cx', lerp(lp.O.cx, fp.O.cx, uo).toFixed(1)); E.oval.setAttribute('cy', (lerp(lp.O.cy, fp.O.cy, uo) + dy).toFixed(1));
        E.oval.setAttribute('rx', lerp(lp.O.rx, fp.O.rx, uo).toFixed(1)); E.oval.setAttribute('ry', lerp(lp.O.ry, fp.O.ry, uo).toFixed(1));
        E.oval.setAttribute('stroke', mix(E.LC, E.FC, uo)); E.oval.setAttribute('fill-opacity', (.92 * uo).toFixed(2));
        const er = fp.er * kk * .8;
        E.eyes.forEach((e, i) => {
          const q = fp.eyes[i], o = eyeOpen(i);
          e.setAttribute('cx', q[0].toFixed(1)); e.setAttribute('cy', q[1].toFixed(1)); e.setAttribute('rx', er); e.setAttribute('ry', er * 1.2 * o); e.setAttribute('opacity', eyeOn);
          E.hl[i].setAttribute('cx', (q[0] + er * .35).toFixed(1)); E.hl[i].setAttribute('cy', (q[1] - er * .45).toFixed(1)); E.hl[i].setAttribute('r', er * .38); E.hl[i].setAttribute('opacity', o > .5 ? eyeOn : 0);
          E.cheeks[i].setAttribute('cx', fp.cheeks[i][0].toFixed(1)); E.cheeks[i].setAttribute('cy', fp.cheeks[i][1].toFixed(1)); E.cheeks[i].setAttribute('opacity', eyeOn * .75);
          E.cheeks[i].setAttribute('rx', (3 * kk / 1.35).toFixed(2)); E.cheeks[i].setAttribute('ry', (1.8 * kk / 1.35).toFixed(2));
        });
        if (E.tip) { E.tip.setAttribute('cx', fp.tip[0].toFixed(1)); E.tip.setAttribute('cy', fp.tip[1].toFixed(1)); E.tip.setAttribute('opacity', eyeOn); }
        fp.mouth = P((fp.L[2][0][0] + fp.L[2][1][0]) / 2, (fp.L[2][0][1] + fp.L[2][1][1]) / 2);
        if (E.sp) {
          // Striche verschmelzen zur Katzenform und blenden dann ins gezeichnete Tier über
          const show = sstep(.5, .92, s.m);
          E.lines.forEach(ln => ln.setAttribute('opacity', (1 - show).toFixed(2)));
          E.oval.setAttribute('opacity', (1 - show).toFixed(2));
          [...E.eyes, ...E.hl, ...E.cheeks].forEach(e => e.setAttribute('opacity', 0));
          if (E.tip) E.tip.setAttribute('opacity', 0);
          E.sp.root.setAttribute('opacity', show.toFixed(2));
          const g = drawSprite(E, cfg.fig, s, x, y, kk, blinkOpen);
          fp.O = g.O; fp.hand = g.hand; fp.mouth = g.mouth; fp.spr = true;
        }
      }
      // Deko sitzt oben auf dem Kopf und kippt beim Laufen leicht mit
      if (E.decoKind) {
        let hx, hy, r;
        if (fp.O) { hx = fp.O.cx; r = fp.O.rx * (cfg.fig === 'kugel' || cfg.fig === 'katze' ? .8 : 1); hy = fp.O.cy - fp.O.ry * (E.decoKind === 'kuerbis' ? .78 : .55); }
        else { hx = (fp.eyes[0][0] + fp.eyes[1][0]) / 2; hy = fp.eyes[0][1] - 5 * kk; r = 7 * kk; }
        const tilt = (s.dir || 1) * (6 + Math.sin(t * 3) * 3 * s.walk);
        E.deco.setAttribute('transform', `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${r.toFixed(2)})`);
        E.deco.setAttribute('opacity', (eyeOn * (1 - s.stretch * .8)).toFixed(2));
      }
      // Zunge bei der Grimasse
      E.tongue.setAttribute('cx', fp.mouth[0].toFixed(1)); E.tongue.setAttribute('cy', (fp.mouth[1] + 2.4 * k).toFixed(1));
      E.tongue.setAttribute('opacity', (fp.spr ? 0 : sstep(.2, .5, s.grim) * eyeOn).toFixed(2));
      // Gähnen: Mund geht auf
      E.yawn.setAttribute('cx', fp.mouth[0].toFixed(1)); E.yawn.setAttribute('cy', (fp.mouth[1] + .5 * kk).toFixed(1));
      E.yawn.setAttribute('rx', (2.6 * kk * s.stretch).toFixed(2)); E.yawn.setAttribute('ry', (3.4 * kk * s.stretch).toFixed(2));
      E.yawn.setAttribute('opacity', (fp.spr ? 0 : sstep(.1, .4, s.stretch) * eyeOn).toFixed(2));
      // Klopfen: Ringe an der Hand, Bildschirm zuckt kurz
      E.rings.forEach((r, i) => {
        const tp = s.tap < 0 ? -1 : (s.tap + i * .5) % 1;
        r.setAttribute('cx', fp.hand[0].toFixed(1)); r.setAttribute('cy', fp.hand[1].toFixed(1));
        r.setAttribute('r', (2 + Math.max(0, tp) * 14 * k).toFixed(1)); r.setAttribute('opacity', tp < 0 ? 0 : ((1 - tp) * .8).toFixed(2));
      });
      if (s.tap >= 0 && lastTap > s.tap && stage.parentElement && stage.parentElement.animate) {
        stage.parentElement.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(3px,-2px)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(0,0)' }], { duration: 140 });
      }
      lastTap = s.tap;
      // Sprechblase über dem Kopf
      if (s.say) {
        if (E.bSaid !== s.say) { E.bText.textContent = s.say; E.bSaid = s.say; E.bW = E.bText.getComputedTextLength() + 14; }
        const w = E.bW, hgt = 16, headTop = fp.O.cy - fp.O.ry;
        const bx = Math.max(w / 2 + 4, Math.min(636 - w / 2, fp.O.cx)), by = Math.max(4, headTop - hgt - 8 * k);
        E.bRect.setAttribute('x', (bx - w / 2).toFixed(1)); E.bRect.setAttribute('y', by.toFixed(1)); E.bRect.setAttribute('width', w.toFixed(1)); E.bRect.setAttribute('height', hgt);
        const tx = Math.max(bx - w / 2 + 6, Math.min(bx + w / 2 - 6, fp.O.cx));
        E.bTail.setAttribute('d', `M${tx - 4} ${by + hgt - .5}L${tx + 4} ${by + hgt - .5}L${tx + 1} ${by + hgt + 5}Z`);
        E.bText.setAttribute('x', bx.toFixed(1)); E.bText.setAttribute('y', (by + hgt / 2 + .5).toFixed(1));
        E.bubble.setAttribute('opacity', eyeOn.toFixed(2));
      } else E.bubble.setAttribute('opacity', 0);
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
      // Eis, Schirm oder Noten, solange die Figur zu sehen ist
      if (move && move.prop) {
        const kind = move.prop, up = kind === 'schirm', notes = kind === 'noten';
        const px = up ? fp.O.cx + s.dir * (fp.O.rx + 6 * k) : notes ? fp.O.cx + s.dir * (fp.O.rx + 8 * k) : h[0], py = up ? fp.O.cy - fp.O.ry + 4 * k : notes ? fp.O.cy - 2 * k - Math.abs(Math.sin(t * 3)) * 6 * k : h[1] - 3 * k;
        if (E.propKind !== kind) { E.prop.innerHTML = PROP_SVG[kind] || ''; E.propKind = kind; }
        const sc = (up ? 1.6 : notes ? 1.2 : 1.25) * k, rot = (up ? -s.dir * 14 : 0) + Math.sin(t * (notes ? 5 : 2)) * (up ? 4 : 10);
        E.prop.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sc.toFixed(2)})`);
        E.prop.setAttribute('opacity', eyeOn.toFixed(2));
      } else E.prop.setAttribute('opacity', 0);
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
      let options = list.filter(c => c.el !== exclude && !ctx.avoid.includes(c.el) && (!filter || filter(c)));
      if (!options.length) options = list.filter(c => c.el !== exclude);
      if (!options.length) options = list;
      return spotOn(pick(options));
    }
    const restState = () => ({ x: pos.x, y: pos.y, m: 0, sit: 0, walk: 0, dist: 0, air: 0, dir: 1, txt: E.text ? 1 : 0, t: now(), carry: 0, ins: 0, wave: 0, wipe: 0, sleep: 0, cheer: 0, kick: 0, grim: 0, climb: 0, stretch: 0, knock: 0, push: 0, tap: -1, zoom: 1 });

    // Kachel wackeln lassen (springt immer von selbst in die Ausgangslage zurück)
    function wobble(card, dir, strength = 1) {
      if (!card || !card.animate) return;
      const o = { transformOrigin: '50% 100%' };
      card.animate([{ ...o, transform: 'none' }, { ...o, transform: `translateX(${dir * 10 * strength}px) rotate(${dir * 1.3 * strength}deg)` },
        { ...o, transform: `translateX(${-dir * 4 * strength}px) rotate(${-dir * .5 * strength}deg)` }, { ...o, transform: 'none' }], { duration: 650, easing: 'ease-out' });
    }

    // Kachel ein Stück wegschieben oder schief hängen lassen, danach zurück in die Ausgangslage
    function shove(card, dir, ms, px, deg) {
      if (!card || !card.animate) return;
      const o = { transformOrigin: '50% 100%' };
      card.animate([{ ...o, transform: 'none' }, { ...o, transform: `translateX(${dir * px}px) rotate(${dir * deg}deg)`, offset: .22 },
        { ...o, transform: `translateX(${dir * px}px) rotate(${dir * deg}deg)`, offset: .8 }, { ...o, transform: 'none' }], { duration: ms, easing: 'ease-in-out' });
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
      const act = opts.act || pick({ ruhig: ['winken'], lieb: ['winken', 'putzen', 'schlafen'], frech: ['treten', 'huepfen', 'grimasse', 'buchstabe', 'schieben'] }[mood]);
      const climbUp = opts.climb ?? (mood === 'lieb');
      const segs = [], events = [];
      let total = 0;
      const add = (...g) => { for (const x of g) { segs.push(x); total += x.d; } };
      const at = (offset, fn) => events.push({ at: total + offset, fn });
      if (!opts.fig) { if (E.text) add({ d: .35, k: 'txt', to: 0 }); add({ d: 1.3, k: 'morph', to: 1 }); }
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
      } else if (act === 'schieben' && B) {
        // An die Kante laufen und die Kachel ein Stück zur Seite schieben
        const d = to.x < (B.l + B.r) / 2 ? 1 : -1;
        walk(d > 0 ? B.l + 10 * k : B.r - 10 * k);
        add({ d: .4, k: 'act', name: 'look', dir: d });
        at(.05, () => shove(B.el, d, 3600, 40, 1.6));
        add({ d: 3.6, k: 'act', name: 'push', dir: d });
        add({ d: 1, k: 'act', name: 'grim' });
      } else {
        walk(to.x);
        const iAct = segs.length;
        const sitAct = (d, name) => add({ d: .45, k: 'sit', to: 1 }, { d, k: 'act', name }, { d: .45, k: 'sit', to: 0 });
        if (act === 'putzen') add({ d: 4.2, k: 'act', name: 'wipe' });
        else if (act === 'schlafen') sitAct(7, 'sleep');
        else if (act === 'freuen') add({ d: 2.2, k: 'act', name: 'cheer' });
        else if (act === 'treten') { const d = x < (B ? (B.l + B.r) / 2 : x) ? -1 : 1; add({ d: .3, k: 'act', name: 'look', dir: d }); at(2.2 * .3 + .05, () => wobble(B && B.el, d, 1.4)); at(2.2 * .7 + .05, () => shove(B && B.el, d, 2600, 14, 2.2)); add({ d: 2.2, k: 'act', name: 'kick', dir: d }); add({ d: 1.2, k: 'act', name: 'grim' }); }
        else if (act === 'huepfen') { [1, 2].forEach(i => at(2.4 * i / 3 - .02, () => wobble(B && B.el, i % 2 ? 1 : -1, 1.1))); at(2.38, () => shove(B && B.el, Math.random() < .5 ? 1 : -1, 3000, 6, 2.6)); add({ d: 2.4, k: 'act', name: 'stomp' }); add({ d: 1.4, k: 'act', name: 'grim' }); }
        else if (act === 'strecken') add({ d: 3.4, k: 'act', name: 'stretch' }, { d: 1.6, k: 'act', name: 'wave' });
        else if (act === 'klopfen') add({ d: 4.2, k: 'act', name: 'knock', dir: x > 320 ? -1 : 1 }, { d: 1.2, k: 'act', name: 'wave' });
        else if (act === 'grimasse') add({ d: 2.6, k: 'act', name: 'grim' });
        else if (act === 'spazieren') add({ d: 4, k: 'act', name: 'wave' }, { d: .6, k: 'act', name: 'look' });
        else if (act === 'tanzen') { const x0 = x; [1, -1, 1, -1, 1, -1].forEach(d => jump(x0 + d * 7 * k, y, (6 + Math.random() * 4) * k)); jump(x0, y, 10 * k); add({ d: 1.8, k: 'act', name: 'cheer' }, { d: 1, k: 'act', name: 'wave' }); }
        else if (act === 'eis' || act === 'schirm') add({ d: .4, k: 'act', name: 'look' }, { d: 4.6, k: 'act', name: 'wave' }, { d: .8, k: 'act', name: 'cheer' });
        else sitAct(2.4, 'wave');
        if (opts.say && segs[iAct]) segs[iAct].say = opts.say;
      }
      add({ d: 1.3, k: 'morph', to: 0, say: '' });
      if (E.text) add({ d: .35, k: 'txt', to: 1 });
      return { segs, events, letter, total, prop: PROPS[act] || '', to: { x, y, card: B ? B.el : to.card } };
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
    function start(p, from) {
      move = { ...p, start: { ...restState(), ...(from || {}) }, t0: now() };
      move.events.sort((a, b) => a.at - b.at);
      loop();
    }
    // opts.act: bestimmte Aktion (Test-Knöpfe), opts.target: 'oben' für Klettern, 'hier' bleibt auf der Kachel
    function go(opts = {}) {
      if (!cfg || fling) return;
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
      if (!cfg || move || fling || !pos) return;
      if (!pos.card.isConnected) { pos = pickSpot(null); if (!pos) return; }
      if (!sleeping() && !reduced.matches) render(restState());
      if (Date.now() >= nextAt && !sleeping() && document.visibilityState === 'visible' && !stage.querySelector('#overlayHost > *')) go();
    }, 100);

    // ---------- Anfassen: antippen, ziehen und werfen ----------
    let fling = null;
    const toSvg = e => { const { sr, sc } = unit(); return { x: (e.clientX - sr.left) / sc / 3, y: (e.clientY - sr.top) / sc / 3 }; };
    const TAP_SAY = ['Hihi, das kitzelt!', 'Hallo!', 'Huch!', 'Hey, du!', 'Noch mal!', 'Hab dich gesehen!'];
    function grab(e) {
      if (!cfg || !pos || stage.classList.contains('arranging')) return;
      e.preventDefault(); e.stopPropagation();
      try { E.hit.setPointerCapture(e.pointerId); } catch {}
      const p = toSvg(e), t = now();
      // Laufende Bewegung beenden, Figur bleibt da, wo sie gerade ist
      let cur = restState();
      if (move) { const st = stateAt(move.segs, t - move.t0, move.start, t, k); cur = { ...cur, x: st.x, y: st.y, m: st.m, txt: st.txt }; stop(); }
      fling = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t0: t, moved: false, held: true, x: cur.x, y: cur.y, m: cur.m, txt: cur.txt,
        ox: cur.x - p.x, oy: cur.y - p.y, vx: 0, vy: 0, hist: [{ t, x: p.x, y: p.y }], dir: 1, last: t, bounces: 0 };
      E.hit.style.cursor = 'grabbing';
      flingLoop();
    }
    function onMove(e) {
      if (!fling || !fling.held || e.pointerId !== fling.id) return;
      if (Math.hypot(e.clientX - fling.sx, e.clientY - fling.sy) > 8) fling.moved = true;
      const p = toSvg(e), t = now();
      if (Math.abs(p.x + fling.ox - fling.x) > .5) fling.dir = Math.sign(p.x + fling.ox - fling.x);
      fling.x = p.x + fling.ox; fling.y = p.y + fling.oy;
      fling.hist.push({ t, x: p.x, y: p.y }); while (fling.hist.length > 2 && t - fling.hist[0].t > .1) fling.hist.shift();
    }
    function onUp(e) {
      if (!fling || !fling.held || e.pointerId !== fling.id) return;
      fling.held = false; E.hit.style.cursor = 'grab';
      if (!fling.moved && now() - fling.t0 < .5) {
        // Nur angetippt: an Ort und Stelle reagieren
        fling = null; render(restState());
        const mood = moodNow();
        return here(mood === 'frech' ? pick(['grimasse', 'huepfen', 'freuen']) : pick(['freuen', 'winken', 'strecken']), pick(TAP_SAY));
      }
      // Wurf: Schwung aus den letzten Zentimetern der Bewegung
      const h = fling.hist, a = h[0], b = h[h.length - 1], dt = Math.max(.016, b.t - a.t);
      fling.vx = Math.max(-1500, Math.min(1500, (b.x - a.x) / dt)); fling.vy = Math.max(-1500, Math.min(1500, (b.y - a.y) / dt));
      if (reduced.matches) { fling.vx = fling.vy = 0; }
      fling.last = now();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    function land(c, x, y, how) {
      const f = fling; fling = null;
      if (c) { pos = { x: Math.max(c.l + 12 * k, Math.min(c.r - 12 * k, x)), y: c.top, card: c.el }; }
      else {
        // Unten aufgeschlagen: auf die nächste Kachel der unteren Reihe springen
        const list = cards(), low = Math.max(...list.map(c => c.top));
        const near = list.filter(c => c.top > low - 3).sort((a, b) => Math.abs((a.l + a.r) / 2 - x) - Math.abs((b.l + b.r) / 2 - x))[0];
        pos = near ? { x: Math.max(near.l + 12 * k, Math.min(near.r - 12 * k, x)), y: near.top, card: near.el } : pickSpot(null) || pos;
      }
      const from = { x: f.x, y: f.y, m: f.m, txt: f.txt, dir: f.dir };
      const say = how === 'hart' ? pick(['Uff!', 'Aua!', 'Huii!', 'Nochmal!']) : pick(['Danke!', 'Gelandet!', 'Puh!']);
      const p = plan({ x: f.x, y: f.y, card: c ? c.el : null }, { x: pos.x, y: pos.y, card: pos.card }, { act: how === 'hart' ? pick(['grimasse', 'freuen']) : 'winken', say, fig: true });
      if (c) wobble(c.el, f.vx >= 0 ? 1 : -1, Math.min(1.4, .4 + Math.abs(f.vy) / 600));
      start(p, from);
    }
    function flingLoop() {
      if (!fling) return;
      const f = fling, t = now(), dt = Math.min(.05, t - f.last); f.last = t;
      f.m = Math.min(1, f.m + dt * 4); f.txt = Math.max(0, f.txt - dt * 6);
      if (!f.held) {
        // Flugbahn mit Schwerkraft, prallt von den Bildschirmrändern ab
        const py = f.y;
        f.vy += 900 * dt; f.vx *= Math.pow(.6, dt);
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (Math.abs(f.vx) > 5) f.dir = Math.sign(f.vx);
        if (f.x < 12 * k) { f.x = 12 * k; f.vx = -f.vx * .6; }
        if (f.x > 640 - 12 * k) { f.x = 640 - 12 * k; f.vx = -f.vx * .6; }
        if (f.y < 30 * k) { f.y = 30 * k; f.vy = Math.abs(f.vy) * .5; }
        if (f.vy > 0) {
          // Auf einer Kachel gelandet?
          const c = cards().find(c => py <= c.top && f.y >= c.top && f.x >= c.l - 8 && f.x <= c.r + 8);
          if (c) { f.y = c.top; return land(c, f.x, f.y, f.vy > 380 ? 'hart' : 'weich'); }
        }
        if (f.y > 356) {
          f.y = 356; f.vy = -Math.abs(f.vy) * .55; f.bounces++;
          if (f.bounces > 2 || Math.abs(f.vy) < 120) return land(null, f.x, f.y, 'hart');
        }
      }
      render({ ...restState(), x: f.x, y: f.y, m: f.m, txt: f.txt, dir: f.dir, air: f.held ? .9 : .6, grim: f.held ? 0 : .5, t });
      raf = requestAnimationFrame(flingLoop);
    }

    function apply(c, isLight) {
      const next = c && c.fig && c.fig !== 'aus' ? Object.assign({}, DEFAULTS, c) : null;
      if (next && !FONTS[next.font]) next.font = 'strich';
      const nk = JSON.stringify([next, isLight]);
      if (nk === key) return;
      key = nk; light = !!isLight;
      fling = null;
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
      if (!cfg || move || fling || ctx.incident || sleeping() || reduced.matches || cfg.mood === 'frech') return;
      if (!pos || !pos.card.isConnected) return;
      start(plan(pos, { x: pos.x, y: pos.y, card: pos.card }, { act: 'freuen' }));
    }
    // Ohne Ortswechsel: an Ort und Stelle Figur werden, etwas tun oder sagen, wieder AOK werden
    function here(act, say) {
      if (!cfg || reduced.matches || fling) return;
      if (move) stop();
      if (!pos || !pos.card.isConnected) pos = pickSpot(null);
      if (!pos) return;
      start(plan(pos, { x: pos.x, y: pos.y, card: pos.card }, { act, say }));
    }
    const alert = (mins, time) => here('klopfen', `Termin in ${mins} Minuten (${time} Uhr)`);
    const announce = (text, act) => here(act, text);
    function test(name) {
      if (!cfg) return;
      if (name === 'klopfen') return alert(10, '10:30');
      if (name === 'spazieren') return announce('Wir gehen gleich spazieren?', 'spazieren');
      if (name === 'strecken') return announce('Guten Morgen!', 'strecken');
      if (name === 'tanzen') return announce('Freitag! Schönes Wochenende!', 'tanzen');
      if (name === 'eis') return announce('28 Grad! Zeit für ein Eis?', 'eis');
      if (name === 'schirm') return announce('Gleich Regen: Schirm nicht vergessen!', 'schirm');
      if (name === 'klettern') return go({ target: 'oben', act: 'winken' });
      if (name === 'freuen') { if (move) stop(); if (!pos) pos = pickSpot(null); return pos && start(plan(pos, { x: pos.x, y: pos.y, card: pos.card }, { act: 'freuen' })); }
      const hasText = c => [...(c.el.querySelector('h3')?.childNodes || [])].some(n => n.nodeType === 3 && /[A-Za-zÄÖÜäöü]/.test(n.nodeValue));
      return go({ act: name, near: true, filter: name === 'buchstabe' ? hasText : null });
    }
    return { apply, go, test, cheer, context, alert, announce };
  }

  window.WBMascot = { create, FONTS, FIGS, MOODS, ACTS, DEFAULTS };
})();
