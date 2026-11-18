/* Schnee-Effekt fürs Board (ab 1.48.0)
   Dezenter Schneefall über das ganze Board. Ein Teil der Flocken bleibt liegen:
   als schmaler Streifen am unteren Rand und als dünne Haube auf den Kachel-Oberkanten
   (im Spalt zwischen den Kacheln, verdeckt also keinen Inhalt). Ein kleiner Schneeräumer
   fährt regelmäßig unten durch und räumt alles ab.
   Ein einziges Canvas, keine Bilder. Läuft nur, solange es etwas zu bewegen gibt. */
(function () {
  const W = 1920, H = 1080;
  const BIN = 6, NB = Math.ceil(W / BIN);      // unterer Rand: Säulen à 6 px
  const MAX_BOTTOM = 12;                        // passt in den unteren Rand der Bühne (14 px)
  const MAX_TOP = 7;                            // Haube auf den Kacheln (Spalt ist 18 px)
  const PLOW_SPEED = 130;                       // px pro Sekunde

  function create(stage) {
    const cv = document.createElement('canvas');
    cv.className = 'snow-fx'; cv.width = W; cv.height = H; cv.setAttribute('aria-hidden', 'true');
    stage.append(cv);
    const ctx = cv.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');

    let flakes = [], want = 0, light = false, low = false, tops = true;
    let bottom = new Float32Array(NB);
    let caps = [];                 // { el, x, y, w, bins: Float32Array }
    let plow = null, falling = [], spray = [];
    let raf = 0, last = 0, paused = false, lastCaps = 0;

    const rnd = (a, b) => a + Math.random() * (b - a);
    function flake(top) {
      const r = rnd(1.3, 3.1);
      return { x: rnd(0, W), y: top ? rnd(-H, 0) : -10, r, vy: 22 + r * 14 + rnd(0, 10), a: rnd(.45, .85), ph: rnd(0, 6.3), sw: rnd(8, 22) };
    }

    // Kacheln vermessen (Bühnen-Koordinaten, Skalierung herausrechnen)
    function measure() {
      lastCaps = performance.now();
      const sr = stage.getBoundingClientRect(), s = sr.width / W || 1;
      const old = new Map(caps.map(c => [c.el, c]));
      caps = [];
      if (!tops) return;
      for (const el of stage.querySelectorAll('main > .card')) {
        if (el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 40) continue;
        const x = (r.left - sr.left) / s + 18, w = r.width / s - 36, y = (r.top - sr.top) / s;
        const prev = old.get(el), n = Math.max(1, Math.round(w / BIN));
        const bins = prev && prev.bins.length === n && Math.abs(prev.y - y) < 4 ? prev.bins : new Float32Array(n);
        caps.push({ el, x, y, w, bins });
      }
    }

    function addTo(bins, i, amt, max) {
      for (let k = -2; k <= 2; k++) {
        const j = i + k; if (j < 0 || j >= bins.length) continue;
        const f = [.15, .5, 1, .5, .15][k + 2];
        bins[j] = Math.min(max, bins[j] + amt * f * (1 - bins[j] / (max * 1.15)));
      }
    }
    const total = () => bottom.reduce((a, b) => a + b, 0) + caps.reduce((a, c) => a + c.bins.reduce((x, y) => x + y, 0), 0);

    function step(dt) {
      const t = performance.now() / 1000;
      // Flocken
      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i], py = f.y;
        f.y += f.vy * dt;
        f.x += Math.sin(t * .8 + f.ph) * f.sw * dt;
        if (f.x < -5) f.x += W + 10; else if (f.x > W + 5) f.x -= W + 10;
        let gone = false;
        if (tops) for (const c of caps) {
          if (py < c.y - 1 && f.y >= c.y - 1 && f.x > c.x && f.x < c.x + c.w) {
            if (Math.random() < .45) { addTo(c.bins, Math.floor((f.x - c.x) / BIN), 1.1 * f.r / 2, MAX_TOP); gone = true; }
            break;
          }
        }
        const bi = Math.min(NB - 1, Math.max(0, Math.floor(f.x / BIN)));
        if (!gone && f.y >= H - bottom[bi] - 1) { addTo(bottom, bi, 1.6 * f.r / 2, MAX_BOTTOM); gone = true; }
        if (gone) { if (flakes.length > want) flakes.splice(i, 1); else Object.assign(f, flake(false)); }
      }
      while (flakes.length < want && Math.random() < .25) flakes.push(flake(false));

      // Schnee, der von den Kacheln rutscht
      for (let i = falling.length - 1; i >= 0; i--) {
        const p = falling[i]; p.vy += 600 * dt; p.y += p.vy * dt; p.x += p.vx * dt;
        if (p.y > H) falling.splice(i, 1);
      }
      // Pulver, das der Räumer aufwirbelt
      for (let i = spray.length - 1; i >= 0; i--) {
        const p = spray[i]; p.vy += 260 * dt; p.y += p.vy * dt; p.x += p.vx * dt; p.life -= dt;
        if (p.life <= 0 || p.y > H) spray.splice(i, 1);
      }
      // Räumer
      if (plow) {
        plow.x += plow.dir * PLOW_SPEED * dt;
        const front = plow.x + plow.dir * 52;
        const bi = Math.floor(front / BIN);
        for (let k = -1; k <= 1; k++) {
          const j = bi + k;
          if (j >= 0 && j < NB && bottom[j] > .2) {
            const amt = bottom[j]; bottom[j] = 0;
            for (let n = 0; n < Math.min(3, amt); n++) spray.push({ x: front + rnd(-4, 4), y: H - rnd(4, 14), vx: plow.dir * rnd(40, 140), vy: -rnd(60, 160), life: rnd(.4, .9), r: rnd(1, 2.4) });
          }
        }
        for (const c of caps) {
          if (c.cleared) continue;
          if ((plow.dir > 0 && front > c.x + c.w / 2) || (plow.dir < 0 && front < c.x + c.w / 2)) {
            c.cleared = true;
            c.bins.forEach((v, j) => { if (v > .4) for (let n = 0; n < Math.min(2, v / 2); n++) falling.push({ x: c.x + j * BIN + rnd(0, BIN), y: c.y - v * rnd(0, 1), vx: rnd(-25, 25), vy: rnd(-40, 10), r: rnd(1.2, 2.6) }); });
            c.bins.fill(0);
          }
        }
        if (plow.x < -200 || plow.x > W + 200) { plow = null; caps.forEach(c => delete c.cleared); }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const snow = '#FFFFFF', edge = 'rgba(105,125,155,.75)';
      // liegender Schnee: weich gerundete Kontur
      const pile = (x0, base, bins) => {
        ctx.beginPath(); ctx.moveTo(x0, base);
        for (let j = 0; j < bins.length; j++) {
          const x = x0 + j * BIN + BIN / 2, y = base - bins[j];
          if (j === 0) ctx.lineTo(x0, base - bins[0] * .4);
          const nx = x0 + (j + 1) * BIN + BIN / 2, ny = base - (bins[j + 1] ?? bins[j] * .4);
          ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
        }
        ctx.lineTo(x0 + bins.length * BIN, base); ctx.closePath();
        ctx.fillStyle = snow; ctx.fill();
        if (light) { ctx.strokeStyle = edge; ctx.lineWidth = 1.3; ctx.stroke(); }
      };
      ctx.save();
      ctx.shadowColor = light ? 'rgba(50,70,100,.45)' : 'rgba(170,200,255,.35)'; ctx.shadowBlur = 5;
      for (const c of caps) if (c.bins.some(v => v > .15)) pile(c.x, c.y + 1, c.bins);
      if (bottom.some(v => v > .15)) pile(0, H, bottom);
      ctx.restore();

      // Flocken (Schatten nur auf hellem Hintergrund, damit Weiß sichtbar bleibt)
      ctx.fillStyle = snow;
      if (light) { ctx.shadowColor = 'rgba(35,55,85,.7)'; ctx.shadowBlur = 3; }
      for (const f of [...flakes, ...falling, ...spray]) {
        ctx.globalAlpha = f.a ?? .9;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      if (plow) drawPlow(plow.x, H - 3, plow.dir);
    }

    // kleiner Schneeräumer, gezeichnet aus einfachen Formen (ca. 110 × 50 px)
    function drawPlow(x, y, dir) {
      const t = performance.now() / 1000;
      ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
      const bob = Math.sin(t * 14) * .6;
      ctx.translate(0, bob);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(0, 1, 56, 4, 0, 0, 6.283); ctx.fill();
      // Auspuffwölkchen
      const puff = (t * 1.6) % 1;
      ctx.fillStyle = `rgba(200,205,210,${.5 * (1 - puff)})`; ctx.beginPath(); ctx.arc(-44 - puff * 18, -44 - puff * 16, 4 + puff * 6, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#5B6168'; ctx.fillRect(-44, -42, 4, 12);
      // Aufbau + Fahrerhaus
      ctx.fillStyle = '#F28C1B'; rr(-48, -30, 82, 20, 5); ctx.fill();
      ctx.fillStyle = '#E07A0C'; ctx.fillRect(-48, -16, 82, 4);
      ctx.fillStyle = '#F28C1B'; rr(-6, -50, 34, 22, 5); ctx.fill();
      ctx.fillStyle = '#BFE6FF'; rr(0, -46, 24, 13, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(3, -44, 6, 3);
      // Rundumleuchte
      const on = Math.floor(t * 3) % 2 === 0;
      ctx.fillStyle = on ? '#FFD23F' : '#C99A1E'; rr(6, -56, 10, 6, 2); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(255,210,63,.35)'; ctx.beginPath(); ctx.arc(11, -53, 11, 0, 6.283); ctx.fill(); }
      // Räumschild vorn, schräg, gelb-schwarz
      ctx.fillStyle = '#4A4F55'; ctx.fillRect(34, -22, 10, 4);
      ctx.save(); ctx.translate(48, -14); ctx.rotate(-.18);
      ctx.fillStyle = '#FFC93C'; rr(-4, -16, 10, 30, 3); ctx.fill();
      ctx.fillStyle = '#2B2B2B'; for (let k = -12; k < 12; k += 8) { ctx.beginPath(); ctx.moveTo(-4, k); ctx.lineTo(6, k + 4); ctx.lineTo(6, k + 7); ctx.lineTo(-4, k + 3); ctx.fill(); }
      ctx.restore();
      // Schneewalze vor dem Schild
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(58, -6, 7, 6, 0, 0, 6.283); ctx.fill();
      // Räder
      for (const wx of [-32, 18]) {
        ctx.fillStyle = '#25282C'; ctx.beginPath(); ctx.arc(wx, -9, 9, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#9AA1A9'; ctx.beginPath(); ctx.arc(wx, -9, 3.5, 0, 6.283); ctx.fill();
        ctx.strokeStyle = '#25282C'; ctx.lineWidth = 1.5; const a = t * 12;
        ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * 3.5, -9 + Math.sin(a) * 3.5); ctx.lineTo(wx - Math.cos(a) * 3.5, -9 - Math.sin(a) * 3.5); ctx.stroke();
      }
      ctx.restore();
    }
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

    function busy() { return flakes.length || falling.length || spray.length || plow; }
    function loop(now) {
      raf = 0;
      if (paused) return;
      const fps = low ? 20 : 30;
      if (now - last >= 1000 / fps - 2) {
        const dt = Math.min(.1, (now - last) / 1000 || 0); last = now;
        if (now - lastCaps > 4000) measure();
        step(dt); draw();
      }
      if (busy()) raf = requestAnimationFrame(loop); else draw();
    }
    function kick() { if (!raf && !paused) { last = performance.now(); raf = requestAnimationFrame(loop); } }

    return {
      // amount: 0 = kein Schneefall, sonst Zahl der Flocken
      set({ amount = 0, lightBg = false, lowFx = false, onTops = true } = {}) {
        light = lightBg; low = lowFx;
        if (tops !== onTops) { tops = onTops; measure(); }
        want = reduced.matches ? 0 : Math.round(amount * (low ? .5 : 1));
        if (want && !flakes.length) for (let i = 0; i < want; i++) flakes.push(flake(true));
        if (want) kick();
      },
      plow(force) {
        if (plow || reduced.matches) return false;
        measure();
        if (!force && total() < 40) return false;
        const dir = Math.random() < .5 ? 1 : -1;
        plow = { x: dir > 0 ? -120 : W + 120, dir };
        kick(); return true;
      },
      pause(p) { paused = !!p; cv.style.visibility = p ? 'hidden' : ''; if (!p) { measure(); kick(); draw(); } },
      relayout() { measure(); if (!raf) draw(); },
      clear() { bottom.fill(0); caps.forEach(c => c.bins.fill(0)); flakes = []; falling = []; spray = []; plow = null; want = 0; draw(); },
      get snowing() { return want > 0; },
      get lying() { return total(); },
    };
  }
  window.WBSnow = { create };
})();
