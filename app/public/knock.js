// Anklopfen: dumpfe Klopfgeräusche, komplett im Browser erzeugt (keine Tondateien).
// Jeder Schlag besteht aus einem tiefen Wumms (Fingerknöchel auf Holz), dem Klang des Türblatts
// und einem kurzen Knacken, dazu etwas Raumhall. Wird am Board und zum Probehören auf der Handy-Seite benutzt.
(() => {
  const SOUNDS = [
    { name: 'Holztür', hint: 'drei Mal, ganz normal', at: [0, .27, .54], thump: 115, wood: 520, decay: .13, vol: 1 },
    { name: 'Doppelt', hint: 'zwei kurze, zwei Mal', at: [0, .16, .72, .88], thump: 125, wood: 600, decay: .11, vol: .9 },
    { name: 'Rhythmus', hint: 'klopf, klopf-klopf, klopf … klopf-klopf', at: [0, .3, .45, .6, .9, 1.5, 1.8], thump: 120, wood: 560, decay: .11, vol: .9 },
    { name: 'Zaghaft', hint: 'leise, zwei Mal', at: [0, .38], thump: 140, wood: 760, decay: .08, vol: .5 },
    { name: 'Kräftig', hint: 'mit der Faust, drei Mal', at: [0, .42, .84], thump: 78, wood: 330, decay: .22, vol: 1.25 },
    { name: 'Schwere Tür', hint: 'langsam, vier Mal', at: [0, .62, 1.24, 1.86], thump: 70, wood: 260, decay: .26, vol: 1.1 },
  ];
  let noise = null, room = null;
  function noiseBuf(ctx) {
    if (noise && noise.sampleRate === ctx.sampleRate) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }
  // Kleiner Raum: abklingendes Rauschen als Nachhall
  function roomIR(ctx) {
    if (room && room.sampleRate === ctx.sampleRate) return room;
    const n = Math.floor(ctx.sampleRate * .45); room = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = room.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2); }
    return room;
  }
  function hit(ctx, out, t, p, v) {
    // Wumms: tiefer Sinus, der schnell nach unten rutscht
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(p.thump * 1.6, t); o.frequency.exponentialRampToValueAtTime(p.thump * .7, t + p.decay);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9 * v, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + p.decay * 1.4);
    o.connect(g).connect(out); o.start(t); o.stop(t + p.decay * 1.5);
    // Türblatt: gefiltertes Rauschen
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(ctx); n.playbackRate.value = .9 + Math.random() * .2;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.wood * (.95 + Math.random() * .1); bp.Q.value = 2.2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(.8 * v, t + .002); ng.gain.exponentialRampToValueAtTime(.0001, t + p.decay * .7);
    n.connect(bp).connect(lp).connect(ng).connect(out); n.start(t, Math.random() * .3); n.stop(t + p.decay);
    // Knöchel: sehr kurzes, leises Knacken
    const c = ctx.createBufferSource(); c.buffer = noiseBuf(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
    const cg = ctx.createGain(); cg.gain.setValueAtTime(.12 * v, t); cg.gain.exponentialRampToValueAtTime(.0001, t + .012);
    c.connect(hp).connect(cg).connect(out); c.start(t, Math.random() * .3); c.stop(t + .02);
  }
  // Spielt Klopfgeräusch Nummer i (0–5) mit Lautstärke vol (0–1); gibt die Dauer in Sekunden zurück
  function play(ctx, i, vol = .8) {
    const p = SOUNDS[i] || SOUNDS[0], t0 = ctx.currentTime + .05;
    const master = ctx.createGain(); master.gain.value = Math.max(0, Math.min(1, vol)) * .9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    const dry = ctx.createGain(), wet = ctx.createGain(), conv = ctx.createConvolver();
    dry.gain.value = 1; wet.gain.value = .22; conv.buffer = roomIR(ctx);
    dry.connect(master); conv.connect(wet).connect(master); master.connect(comp).connect(ctx.destination);
    const bus = ctx.createGain(); bus.connect(dry); bus.connect(conv);
    // Kleine Unterschiede in Takt und Stärke, damit es nicht nach Maschine klingt
    p.at.forEach((a, k) => hit(ctx, bus, t0 + a + (k ? (Math.random() - .5) * .025 : 0), p, p.vol * (.85 + Math.random() * .25)));
    return p.at[p.at.length - 1] + .6;
  }
  window.WBKnock = { SOUNDS, play };
})();
