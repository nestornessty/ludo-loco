// ── Telegram WebApp init ───────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const ME = {
  id: tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 1e9),
  name: tg?.initDataUnsafe?.user?.first_name || 'Jugador',
};

// ── Board constants (mismo layout que Python) ─────────────────────────────────
const MAIN_PATH = [
  [6,0],[6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
];
const PLAYER_STARTS = [0, 13, 26, 39];
const HOME_STRETCHES = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  [[7,13],[7,12],[7,11],[7,10],[7,9]],
  [[13,7],[12,7],[11,7],[10,7],[9,7]],
];
const HOME_SLOTS = [
  [[2,2],[2,4],[4,2],[4,4]],
  [[2,10],[2,12],[4,10],[4,12]],
  [[10,10],[10,12],[12,10],[12,12]],
  [[10,2],[10,4],[12,2],[12,4]],
];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const COLORS  = ['#FFD000','#00CC44','#FF1133','#0088FF'];
const DARKS   = ['#996600','#006622','#AA0022','#0044CC'];
const LIGHTS  = ['#FFF8CC','#CCFFE0','#FFCCD4','#CCE8FF'];
const NAMES   = ['Amarillo','Verde','Rojo','Azul'];
const EMOJIS  = ['🟡','🟢','🔴','🔵'];
const HOME_AREAS = [
  [0,0,5,5],[0,9,5,14],[9,9,14,14],[9,0,14,5]
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function lighten(hex, f) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r+(255-r)*f)},${Math.round(g+(255-g)*f)},${Math.round(b+(255-b)*f)})`;
}

function getPieceCell(player, piece) {
  if (piece.pos === -1) return HOME_SLOTS[player][piece.idx];
  if (piece.pos <= 51) return MAIN_PATH[(PLAYER_STARTS[player] + piece.pos) % 52];
  if (piece.pos <= 56) return HOME_STRETCHES[player][piece.pos - 52];
  return [7, 7];
}

// ── Dado (Canvas 2D) ──────────────────────────────────────────────────────────
// Posición de los puntos para cada cara [cx%, cy%] dentro del cuadrado 0–1
const DOT_POS = {
  1: [[0.50, 0.50]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.50, 0.50], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.50, 0.50], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.50], [0.72, 0.50], [0.28, 0.78], [0.72, 0.78]],
};

function drawDiceFace(ctx, n, size, scale) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-size / 2, -size / 2);

  const r = size * 0.14;
  // Sombra exterior
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;

  // Fondo dado
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#d8d8d8');
  roundRect(ctx, 4, 4, size - 8, size - 8, r);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#bbbbbb';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Borde interior brillante
  roundRect(ctx, 10, 10, size - 20, size - 20, r * 0.7);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Puntos
  const dr = size * 0.085;
  for (const [px, py] of DOT_POS[n]) {
    const x = px * size, y = py * size;
    // Sombra del punto
    ctx.beginPath();
    ctx.arc(x + 1.5, y + 1.5, dr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    // Punto
    const dg = ctx.createRadialGradient(x - dr * 0.3, y - dr * 0.35, dr * 0.05, x, y, dr);
    dg.addColorStop(0, '#555');
    dg.addColorStop(1, '#111');
    ctx.beginPath();
    ctx.arc(x, y, dr, 0, Math.PI * 2);
    ctx.fillStyle = dg;
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function showDice3D(result, callback) {
  // Guardia: si el resultado es inválido (ej. sin movimientos posibles), saltar animación
  if (!result || result < 1 || result > 6) { callback(); return; }

  const overlay  = document.getElementById('dice-overlay');
  const canvas   = document.getElementById('dice-canvas');
  const label    = document.getElementById('dice-result-label');
  const diceEmojis = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  const ctx      = canvas.getContext('2d');
  const SIZE     = canvas.width;  // 160

  label.classList.remove('show');
  label.textContent = '';
  overlay.classList.remove('hidden');
  SFX.dice();  // sonido sincronizado con la animación

  // Parámetros de animación
  const SPIN_MS   = 1100;   // duración del giro rápido
  const startTime = performance.now();
  let   rafId;
  let   currentFace = 1;

  function animate(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / SPIN_MS, 1);   // 0 → 1

    // Intervalo de cambio de cara: rápido (2 frames) → lento (20 frames)
    const changeEvery = 2 + Math.floor(progress * 18);
    const totalFrame  = Math.floor(elapsed / (1000 / 60));
    if (totalFrame % changeEvery === 0) {
      currentFace = Math.floor(Math.random() * 6) + 1;
    }

    // En el último 10% siempre muestra el resultado final
    const face = progress > 0.90 ? result : currentFace;

    // Escala: efecto de "rebote" al aterrizar
    let scale = 1;
    if (progress > 0.88) {
      const t = (progress - 0.88) / 0.12;  // 0→1
      scale = 1 + 0.18 * Math.sin(t * Math.PI);  // sube y baja
    }

    // Pequeña rotación 2D para simular giro (no requiere preserve-3d)
    ctx.clearRect(0, 0, SIZE, SIZE);
    const tilt = (1 - progress) * 15 * Math.sin(elapsed * 0.025);
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(tilt * Math.PI / 180);
    ctx.translate(-SIZE / 2, -SIZE / 2);
    drawDiceFace(ctx, face, SIZE, scale);
    ctx.restore();

    if (progress < 1) {
      rafId = requestAnimationFrame(animate);
    } else {
      // Cara final fija + label
      drawDiceFace(ctx, result, SIZE, 1);
      label.textContent = `${diceEmojis[result - 1]}  ${result}`;
      label.classList.add('show');

      setTimeout(() => {
        overlay.classList.add('hidden');
        label.classList.remove('show');
        callback();
      }, 900);
    }
  }

  rafId = requestAnimationFrame(animate);
}

// ── Efectos de sonido: WAV sintetizado → HTMLAudioElement ─────────────────────
// Usamos HTMLAudioElement en lugar de Web Audio API porque el WebView de
// Telegram bloquea AudioContext en móvil. Los WAV se generan en memoria.
let _sfxMuted = false;

function toggleMute() {
  _sfxMuted = !_sfxMuted;
  document.getElementById('btn-mute').textContent = _sfxMuted ? '🔇' : '🔊';
  if (_bgAudio) {
    if (_sfxMuted) { _bgAudio.pause(); }
    else { _bgAudio.play().catch(() => {}); }
  }
}

const SFX = (() => {
  const SR = 22050;   // sample rate (Hz)
  const urls = {};    // blob URLs pre-generados

  // ── Síntesis PCM ─────────────────────────────────────────────────────────────

  // Tono sinusoidal con envolvente: attack rápido + decay exponencial
  function addTone(s, freq, t0, dur, vol, freqEnd = null) {
    const i0 = Math.floor(t0 * SR);
    const len = Math.floor(dur * SR);
    for (let i = 0; i < len; i++) {
      if (i0 + i >= s.length) break;
      const p   = i / len;
      const env = p < 0.06 ? p / 0.06 : Math.exp(-5.0 * (p - 0.06));
      const f   = freqEnd ? freq * Math.pow(freqEnd / freq, p) : freq;
      s[i0 + i] += Math.sin(2 * Math.PI * f * i / SR) * vol * env;
    }
  }

  // Ruido blanco con decay exponencial (impactos, whooshes, fuegos)
  function addNoise(s, t0, dur, vol, decay = 5) {
    const i0 = Math.floor(t0 * SR);
    const len = Math.floor(dur * SR);
    for (let i = 0; i < len; i++) {
      if (i0 + i >= s.length) break;
      s[i0 + i] += (Math.random() * 2 - 1) * vol * Math.exp(-decay * i / len);
    }
  }

  // Convierte Float32Array → WAV Blob URL
  function toURL(s) {
    let mx = 0;
    for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
    const gain = mx > 0 ? 0.92 / mx : 1;
    const buf  = new ArrayBuffer(44 + s.length * 2);
    const v    = new DataView(buf);
    const str  = (o, x) => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + s.length * 2, true);
    str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true);
    v.setUint16(32, 2, true);  v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, s.length * 2, true);
    for (let i = 0; i < s.length; i++)
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s[i] * gain)) * 32767, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function make(dur, fn) {
    const s = new Float32Array(Math.ceil(dur * SR));
    fn(s);
    return toURL(s);
  }

  // ── Definiciones de sonidos ──────────────────────────────────────────────────

  function build() {
    // 🎲 Dado — repiqueteo que se ralentiza + boom al aterrizar
    urls.dice = make(1.18, s => {
      [0, .07, .13, .20, .30, .42, .57, .71, .83].forEach((t, i) => {
        addNoise(s, t, 0.06, 0.55 - i * 0.045, 7);
        addTone (s, 290 + i * 20, t, 0.05, 0.18);
      });
      addNoise(s, 0.92, 0.20, 1.0, 3);
      addTone (s, 88,   0.92, 0.32, 0.85, 42);
      addTone (s, 176,  0.94, 0.24, 0.55, 68);
    });

    // 👣 Paso de ficha — click seco
    urls.step = make(0.09, s => {
      addNoise(s, 0, 0.05, 0.7, 9);
      addTone (s, 680, 0, 0.05, 0.45);
    });

    // 🚀 Sale de casa — whoosh ascendente + chispa
    urls.exitHome = make(0.65, s => {
      addTone (s, 120,  0,    0.30, 0.75, 1700);
      addNoise(s, 0,    0.30, 0.55, 3);
      addTone (s, 1046, 0.22, 0.32, 1.0);
      addTone (s, 1318, 0.28, 0.26, 0.75);
    });

    // 💥 CAPTURA — sub-bass BOOM + crack explosivo + eco
    urls.capture = make(0.88, s => {
      addTone (s, 70,  0,    0.58, 1.0, 19);   // sub-bass
      addTone (s, 44,  0,    0.62, 0.8, 15);   // sub-sub
      addNoise(s, 0,   0.10, 1.2, 2);           // crack inicial
      addNoise(s, 0.06,0.15, 0.7, 4);           // ruido grave
      addTone (s, 250, 0,    0.22, 0.65, 38);   // distorsión
      addTone (s, 50,  0.22, 0.42, 0.55, 14);  // eco grave
      addNoise(s, 0.28,0.32, 0.40, 5);          // cola
    });

    // 🎯 Ficha al centro — arpeggio brillante con armónicos
    urls.pieceHome = make(0.88, s => {
      [[523, 0], [659, .11], [784, .22], [1047, .33]].forEach(([f, t]) => {
        addTone(s, f,     t, 0.45, 0.85);
        addTone(s, f * 2, t, 0.18, 0.40);
        addTone(s, f * 3, t, 0.10, 0.20);
      });
      addNoise(s, 0.44, 0.20, 0.35, 4);
    });

    // 🔄 Turno extra — subida de 4 notas
    urls.extraTurn = make(0.58, s => {
      addTone(s, 523,  0,    0.13, 0.65);
      addTone(s, 659,  0.11, 0.13, 0.65);
      addTone(s, 784,  0.22, 0.15, 0.75);
      addTone(s, 1046, 0.33, 0.22, 0.85);
    });

    // 🏆 VICTORIA — fanfarria épica + fuegos artificiales
    urls.victory = make(2.75, s => {
      [[523,0,.13],[523,.14,.13],[523,.28,.13],[415,.42,.22],
       [523,.60,.46],[415,1.00,.22],[523,1.18,.90]].forEach(([f, t, d]) => {
        addTone(s, f,       t, d,      1.0);
        addTone(s, f * 1.5, t, d * .8, 0.50);
        addTone(s, f * 2,   t, d * .6, 0.28);
      });
      addTone(s, 60, 0, 0.52, 0.85, 34);   // sub-bass épico
      [.50, .88, 1.18, 1.50, 1.80, 2.05].forEach(t =>
        addNoise(s, t, 0.18, 0.55, 3));     // fuegos artificiales
      [[784,1.88],[880,1.98],[988,2.08],[1047,2.18],[1318,2.30]]
        .forEach(([f, t]) => addTone(s, f, t, 0.32, 0.85));
    });
  }

  // Generar todos los sonidos al cargar (solo matemáticas, instantáneo)
  try { build(); } catch(e) { console.warn('SFX build error:', e); }

  // Reproducir por nombre (crea un nuevo Audio cada vez para solapamiento)
  function play(name) {
    if (_sfxMuted || !urls[name]) return;
    try {
      const a = new Audio(urls[name]);
      a.volume = 1.0;
      a.play().catch(() => {});
    } catch(e) {}
  }

  return {
    dice()      { play('dice');      },
    step()      { play('step');      },
    exitHome()  { play('exitHome');  },
    capture()   { play('capture');   },
    pieceHome() { play('pieceHome'); },
    extraTurn() { play('extraTurn'); },
    victory()   { play('victory');   },
  };
})();

// ── Música de fondo (chiptune loop) ──────────────────────────────────────────
// Oda a la Alegría — Beethoven (dominio público) renderizada como WAV en memoria
let _bgAudio = null;

(function buildBgMusic() {
  try {
    const SR  = 22050;
    const BPM = 152;
    const E8  = 60 / BPM / 2;   // corchea en segundos (~0.197 s)

    const G4=392.00, C5=523.25, D5=587.33,
          E5=659.25, F5=698.46, G5=783.99;

    // Secuencia completa: [frecuencia, duración_en_corcheas]
    // 16 compases × 8 corcheas = 128 corcheas ≈ 25 s de loop
    const seq = [
      // ── Frase 1 (compases 1-4) ──────────────────────────────────────────
      [E5,2],[E5,2],[F5,2],[G5,2],
      [G5,2],[F5,2],[E5,2],[D5,2],
      [C5,2],[C5,2],[D5,2],[E5,2],
      [E5,3],[D5,1],[D5,4],
      // ── Frase 2 (compases 5-8) ──────────────────────────────────────────
      [E5,2],[E5,2],[F5,2],[G5,2],
      [G5,2],[F5,2],[E5,2],[D5,2],
      [C5,2],[C5,2],[D5,2],[E5,2],
      [D5,3],[C5,1],[C5,4],
      // ── Frase 3 (compases 9-12) ─────────────────────────────────────────
      [D5,2],[D5,2],[E5,2],[C5,2],
      [D5,2],[E5,1],[F5,1],[E5,2],[C5,2],
      [D5,2],[E5,1],[F5,1],[E5,2],[D5,2],
      [C5,2],[D5,2],[G4,4],
      // ── Frase 4 (compases 13-16) ────────────────────────────────────────
      [E5,2],[E5,2],[F5,2],[G5,2],
      [G5,2],[F5,2],[E5,2],[D5,2],
      [C5,2],[C5,2],[D5,2],[E5,2],
      [D5,3],[C5,1],[C5,4],
    ];

    // Calcular tamaño total del buffer
    const totalS = Math.ceil(seq.reduce((s,[,d]) => s + d * E8, 0) * SR) + 512;
    const pcm = new Float32Array(totalS);

    // Renderizar cada nota como onda triangular (sonido chiptune Game Boy)
    let t = 0;
    for (const [freq, beats] of seq) {
      const noteDur = beats * E8 * 0.86;  // 14% de silencio entre notas
      const i0  = Math.floor(t * SR);
      const len = Math.floor(noteDur * SR);
      for (let i = 0; i < len; i++) {
        if (i0 + i >= pcm.length) break;
        const p   = i / len;
        // Envolvente: attack 4%, sustain, release 28%
        const env = p < 0.04 ? p / 0.04 : p > 0.72 ? (1 - p) / 0.28 : 1.0;
        // Onda triangular
        const ph  = (freq * i / SR) % 1;
        pcm[i0+i] += (ph < 0.5 ? 4*ph - 1 : 3 - 4*ph) * 0.42 * Math.max(0, env);
      }
      t += beats * E8;
    }

    // Normalizar a 0.88 de amplitud máxima
    let mx = 0;
    for (let i = 0; i < pcm.length; i++) mx = Math.max(mx, Math.abs(pcm[i]));
    const gain = mx > 0 ? 0.88 / mx : 1;

    // Empaquetar como WAV
    const wb = new ArrayBuffer(44 + pcm.length * 2);
    const dv = new DataView(wb);
    const ws = (o, x) => { for (let i = 0; i < x.length; i++) dv.setUint8(o+i, x.charCodeAt(i)); };
    ws(0,'RIFF'); dv.setUint32(4, 36+pcm.length*2, true);
    ws(8,'WAVE'); ws(12,'fmt ');
    dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
    dv.setUint32(24,SR,true); dv.setUint32(28,SR*2,true);
    dv.setUint16(32,2,true);  dv.setUint16(34,16,true);
    ws(36,'data'); dv.setUint32(40, pcm.length*2, true);
    for (let i = 0; i < pcm.length; i++)
      dv.setInt16(44+i*2, Math.max(-1, Math.min(1, pcm[i]*gain)) * 32767, true);

    const url = URL.createObjectURL(new Blob([wb], { type:'audio/wav' }));
    _bgAudio = new Audio(url);
    _bgAudio.loop   = true;
    _bgAudio.volume = 0.28;
  } catch(e) { console.warn('Music build error:', e); }
})();

function startMusic() {
  if (_bgAudio && !_sfxMuted && _bgAudio.paused) {
    _bgAudio.play().catch(() => {});
  }
}

// ── Animación de movimiento de fichas ─────────────────────────────────────────
// pieceOverrides: { 'p_idx': [r, c] } — posición temporal durante animación
const pieceOverrides = {};
let animating = false;

function getPosCell(player, pos, pieceIdx) {
  if (pos === -1) return HOME_SLOTS[player][pieceIdx];
  if (pos <= 51)  return MAIN_PATH[(PLAYER_STARTS[player] + pos) % 52];
  if (pos <= 56)  return HOME_STRETCHES[player][pos - 52];
  return [7, 7];
}

function animatePieceMove(player, pieceIdx, fromPos, toPos, canvas, state, callback) {
  // Construir lista de posiciones intermedias
  const cells = [];
  const exitingHome = fromPos === -1;
  if (exitingHome) {
    cells.push(HOME_SLOTS[player][pieceIdx]);
    cells.push(MAIN_PATH[PLAYER_STARTS[player]]);
  } else {
    for (let p = fromPos; p <= toPos; p++) {
      cells.push(getPosCell(player, p, pieceIdx));
    }
  }

  if (cells.length <= 1) { callback(); return; }

  const key = `${player}_${pieceIdx}`;
  let step = 0;
  animating = true;

  // Sonido de salida de casa en el primer paso
  if (exitingHome) SFX.exitHome();

  function nextStep() {
    step++;
    if (step >= cells.length) {
      delete pieceOverrides[key];
      animating = false;
      callback();
      return;
    }
    pieceOverrides[key] = cells[step];
    renderBoard(canvas, state, pieceOverrides);
    // Click por cada casilla (no en salida de casa — ya tiene su propio sonido)
    if (!exitingHome || step > 1) SFX.step();
    // Vibración háptica en Telegram
    if (tg && step % 3 === 0) tg.HapticFeedback?.impactOccurred('light');
    setTimeout(nextStep, 160);
  }

  pieceOverrides[key] = cells[0];
  nextStep();
}

// ── Dibujo de estrella ─────────────────────────────────────────────────────────
function drawStar(ctx, scx, scy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * 36 - 90) * Math.PI / 180;
    const rad = i % 2 === 0 ? r : r * 0.42;
    i === 0 ? ctx.moveTo(scx + rad*Math.cos(angle), scy + rad*Math.sin(angle))
            : ctx.lineTo(scx + rad*Math.cos(angle), scy + rad*Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStarGlow(ctx, scx, scy, r, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  drawStar(ctx, scx, scy, r, color);
  ctx.restore();
}

// ── Pieza 3D ───────────────────────────────────────────────────────────────────
function drawPiece3D(ctx, pcx, pcy, pr, color, dark, num, isAnimating, isValid) {
  ctx.save();

  // Anillo dorado para movimientos válidos
  if (isValid) {
    ctx.beginPath();
    ctx.arc(pcx, pcy, pr + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFD000';
    ctx.lineWidth = Math.max(2, pr * 0.2);
    ctx.shadowColor = '#FFD000';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowColor = 'transparent';
  }

  // Glow al animar
  if (isAnimating) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1.5;
    ctx.shadowOffsetY = 3;
  }

  // Cuerpo: gradiente radial que simula esfera 3D
  const bodyGrad = ctx.createRadialGradient(
    pcx - pr*0.28, pcy - pr*0.32, pr * 0.04,
    pcx + pr*0.08, pcy + pr*0.08, pr
  );
  bodyGrad.addColorStop(0,    lighten(color, 0.6));
  bodyGrad.addColorStop(0.4,  color);
  bodyGrad.addColorStop(0.82, dark);
  bodyGrad.addColorStop(1,    '#000000');
  ctx.beginPath();
  ctx.arc(pcx, pcy, pr, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Borde
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, pr * 0.08);
  ctx.stroke();

  // Reflejo especular (punto brillante arriba-izquierda)
  const specGrad = ctx.createRadialGradient(
    pcx - pr*0.30, pcy - pr*0.35, 0,
    pcx - pr*0.30, pcy - pr*0.35, pr * 0.46
  );
  specGrad.addColorStop(0,   'rgba(255,255,255,0.88)');
  specGrad.addColorStop(0.55,'rgba(255,255,255,0.22)');
  specGrad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(pcx - pr*0.30, pcy - pr*0.35, pr * 0.46, 0, Math.PI * 2);
  ctx.fillStyle = specGrad;
  ctx.fill();

  // Número con sombra
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.shadowOffsetX = 0;
  ctx.fillStyle = 'white';
  ctx.font = `bold ${Math.max(8, Math.floor(pr * 1.05))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, pcx, pcy + pr * 0.06);
  ctx.restore();
}

// ── Canvas renderer ────────────────────────────────────────────────────────────
function renderBoard(canvas, gameState, overrides = {}) {
  const size = Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight, 520);
  const CELL = Math.floor(size / 17);
  const MARGIN = Math.floor((size - 15 * CELL) / 2);
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const ccx = (r, c) => MARGIN + c * CELL + CELL / 2;
  const ccy = (r, c) => MARGIN + r * CELL + CELL / 2;
  const BX = MARGIN, BY = MARGIN, BW = 15 * CELL, BH = 15 * CELL;

  // ── Fondo oscuro del frame ──────────────────────────────────────────────────
  const fgrd = ctx.createRadialGradient(size/2, size/2, size*0.1, size/2, size/2, size*0.75);
  fgrd.addColorStop(0, '#2A1208');
  fgrd.addColorStop(1, '#0C0402');
  ctx.fillStyle = fgrd;
  ctx.fillRect(0, 0, size, size);

  // ── Sombra + superficie del tablero ────────────────────────────────────────
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#E8C880';
  ctx.fillRect(BX, BY, BW, BH);
  ctx.restore();

  // Superficie con gradiente (luz desde arriba-izquierda)
  const bgrd = ctx.createLinearGradient(BX, BY, BX + BW, BY + BH);
  bgrd.addColorStop(0, '#FFFBF2');
  bgrd.addColorStop(1, '#E4C878');
  ctx.fillStyle = bgrd;
  ctx.fillRect(BX, BY, BW, BH);

  // Borde biselado: lado claro (arriba/izquierda)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(BX, BY + BH); ctx.lineTo(BX, BY); ctx.lineTo(BX + BW, BY);
  ctx.stroke();
  // Borde oscuro (abajo/derecha)
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(BX + BW, BY); ctx.lineTo(BX + BW, BY + BH); ctx.lineTo(BX, BY + BH);
  ctx.stroke();
  // Marco exterior
  ctx.strokeStyle = '#7A4010';
  ctx.lineWidth = 3;
  ctx.strokeRect(BX, BY, BW, BH);

  // ── Áreas de casa ──────────────────────────────────────────────────────────
  for (let p = 0; p < 4; p++) {
    const [r1,c1,r2,c2] = HOME_AREAS[p];
    const W = (c2-c1+1)*CELL, H = (r2-r1+1)*CELL;
    const x = MARGIN+c1*CELL, y = MARGIN+r1*CELL;
    const col = COLORS[p], dark = DARKS[p];

    // Área exterior: tinte suave con gradiente radial
    const outerGrd = ctx.createRadialGradient(x+W/2, y+H/2, W*0.05, x+W/2, y+H/2, W*0.85);
    outerGrd.addColorStop(0, lighten(col, 0.80));
    outerGrd.addColorStop(1, lighten(col, 0.52));
    ctx.fillStyle = outerGrd;
    ctx.fillRect(x, y, W, H);
    ctx.strokeStyle = lighten(col, 0.2);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, W, H);

    // Plataforma interior elevada (con sombra y gradiente)
    const pad = CELL * 0.42, ir = CELL * 0.28;
    const iw = W - 2*pad, ih = H - 2*pad;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.40)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 4;
    const innerGrd = ctx.createLinearGradient(x+pad, y+pad, x+pad+iw, y+pad+ih);
    innerGrd.addColorStop(0, lighten(col, 0.22));
    innerGrd.addColorStop(1, col);
    roundRect(ctx, x+pad, y+pad, iw, ih, ir);
    ctx.fillStyle = innerGrd;
    ctx.fill();
    ctx.restore();

    // Borde interior + reflejo
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    roundRect(ctx, x+pad, y+pad, iw, ih, ir);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x+pad+1.5, y+pad+1.5, iw-3, ih-3, ir);
    ctx.stroke();

    // Etiqueta del color
    ctx.fillStyle = dark;
    ctx.font = `bold ${Math.max(9, CELL*0.22)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(NAMES[p], x+W/2, y+5);
  }

  // ── Cruz de caminos ─────────────────────────────────────────────────────────
  const crossGrd = ctx.createLinearGradient(BX, BY, BX+BW, BY+BH);
  crossGrd.addColorStop(0, '#FDFAF4');
  crossGrd.addColorStop(1, '#EDE4D2');
  ctx.fillStyle = crossGrd;
  ctx.fillRect(MARGIN,         MARGIN+6*CELL, 15*CELL, 3*CELL);
  ctx.fillRect(MARGIN+6*CELL,  MARGIN,        3*CELL,  15*CELL);

  // ── Pasillos de llegada ─────────────────────────────────────────────────────
  for (let p = 0; p < 4; p++) {
    const cells = HOME_STRETCHES[p];
    for (let s = 0; s < cells.length; s++) {
      const [row, col] = cells[s];
      // Progresivo: más saturado cuanto más cerca del centro (s=4 es el último)
      const t = s / (cells.length - 1);   // 0 → 1 (lejos → cerca)
      const cellGrd = ctx.createLinearGradient(
        MARGIN+col*CELL, MARGIN+row*CELL,
        MARGIN+(col+1)*CELL, MARGIN+(row+1)*CELL
      );
      cellGrd.addColorStop(0, lighten(COLORS[p], 0.55 - t * 0.45));
      cellGrd.addColorStop(1, lighten(COLORS[p], 0.35 - t * 0.35));
      ctx.fillStyle = cellGrd;
      ctx.fillRect(MARGIN+col*CELL, MARGIN+row*CELL, CELL, CELL);
      ctx.strokeStyle = lighten(COLORS[p], 0.15);
      ctx.lineWidth = 1;
      ctx.strokeRect(MARGIN+col*CELL, MARGIN+row*CELL, CELL, CELL);
    }
  }

  // ── Ruleta central ──────────────────────────────────────────────────────────
  const bx = MARGIN+6*CELL, by = MARGIN+6*CELL;
  const bx2 = MARGIN+9*CELL, by2 = MARGIN+9*CELL;
  const mx = (bx+bx2)/2, my = (by+by2)/2;
  const tris = [
    [[mx,my],[bx,by],[bx2,by]],
    [[mx,my],[bx2,by],[bx2,by2]],
    [[mx,my],[bx,by2],[bx2,by2]],
    [[mx,my],[bx,by],[bx,by2]],
  ];
  for (let i = 0; i < 4; i++) {
    const [ex, ey] = [(tris[i][1][0]+tris[i][2][0])/2, (tris[i][1][1]+tris[i][2][1])/2];
    const tGrd = ctx.createLinearGradient(mx, my, ex, ey);
    tGrd.addColorStop(0, lighten(COLORS[i], 0.55));
    tGrd.addColorStop(1, COLORS[i]);
    ctx.fillStyle = tGrd;
    ctx.beginPath();
    ctx.moveTo(tris[i][0][0], tris[i][0][1]);
    ctx.lineTo(tris[i][1][0], tris[i][1][1]);
    ctx.lineTo(tris[i][2][0], tris[i][2][1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.5;
  for (const tri of tris) {
    ctx.beginPath(); ctx.moveTo(tri[0][0],tri[0][1]); ctx.lineTo(tri[1][0],tri[1][1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tri[0][0],tri[0][1]); ctx.lineTo(tri[2][0],tri[2][1]); ctx.stroke();
  }
  // Estrella metálica central
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,220,0.6)';
  ctx.shadowBlur = 12;
  drawStar(ctx, mx, my, CELL*0.32, 'white');
  ctx.restore();

  // ── Casillas del camino principal ───────────────────────────────────────────
  for (let i = 0; i < MAIN_PATH.length; i++) {
    const [row, col] = MAIN_PATH[i];
    const x = MARGIN+col*CELL, y = MARGIN+row*CELL;
    const isStart = PLAYER_STARTS.indexOf(i);

    if (isStart >= 0) {
      const sg = ctx.createLinearGradient(x, y, x+CELL, y+CELL);
      sg.addColorStop(0, lighten(COLORS[isStart], 0.50));
      sg.addColorStop(1, lighten(COLORS[isStart], 0.25));
      ctx.fillStyle = sg;
    } else if (SAFE.has(i)) {
      ctx.fillStyle = '#FFFCE8';
    } else {
      const cg = ctx.createLinearGradient(x, y, x+CELL, y+CELL);
      cg.addColorStop(0, '#FDFAF4');
      cg.addColorStop(1, '#ECE4D2');
      ctx.fillStyle = cg;
    }
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = '#C8BAA0';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, CELL, CELL);

    if (SAFE.has(i))   drawStarGlow(ctx, x+CELL/2, y+CELL/2, CELL*0.19, '#FFD000');
    if (isStart >= 0)  drawStarGlow(ctx, x+CELL/2, y+CELL/2, CELL*0.19, COLORS[isStart]);
  }

  // ── Ranuras de casa (círculos hundidos) ─────────────────────────────────────
  for (let p = 0; p < 4; p++) {
    for (const [row, col] of HOME_SLOTS[p]) {
      const scx = ccx(row, col), scy = ccy(row, col);
      const sr = CELL * 0.33;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;
      const slotGrd = ctx.createRadialGradient(scx-sr*0.2, scy-sr*0.2, sr*0.1, scx, scy, sr);
      slotGrd.addColorStop(0, '#C0B8B0');
      slotGrd.addColorStop(1, '#8A8080');
      ctx.beginPath();
      ctx.arc(scx, scy, sr, 0, Math.PI*2);
      ctx.fillStyle = slotGrd;
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = COLORS[p];
      ctx.lineWidth = Math.max(2, CELL * 0.09);
      ctx.beginPath();
      ctx.arc(scx, scy, sr, 0, Math.PI*2);
      ctx.stroke();

      // Pequeño reflejo interior
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(scx - sr*0.1, scy - sr*0.15, sr * 0.55, Math.PI * 1.05, Math.PI * 1.75);
      ctx.stroke();
    }
  }

  if (!gameState) return;

  // ── Fichas ──────────────────────────────────────────────────────────────────
  const cp = gameState.current_player;
  const validSet = new Set(gameState.valid_moves || []);

  const cellMap = {};
  const numPlayers = gameState.player_ids.length;
  for (let p = 0; p < numPlayers; p++) {
    for (let i = 0; i < 4; i++) {
      const piece = gameState.pieces[p][i];
      const overrideKey = `${p}_${i}`;
      const [row, col] = overrides[overrideKey] || getPieceCell(p, piece);
      const key = `${row},${col}`;
      if (!cellMap[key]) cellMap[key] = [];
      cellMap[key].push({ p, piece, isAnimating: !!overrides[overrideKey] });
    }
  }

  for (const [key, group] of Object.entries(cellMap)) {
    const [row, col] = key.split(',').map(Number);
    const bcx = ccx(row, col), bcy = ccy(row, col);
    const count = group.length;
    const pr  = count > 1 ? CELL*0.21 : CELL*0.29;
    const offs = [[0,0],[-CELL*0.22,-CELL*0.22],[CELL*0.22,-CELL*0.22],[-CELL*0.22,CELL*0.22],[CELL*0.22,CELL*0.22]];

    for (let i = 0; i < group.length; i++) {
      const { p, piece, isAnimating } = group[i];
      const [ox, oy] = count > 1 ? offs[i+1] || [0,0] : [0,0];
      const pcx = bcx + ox, pcy = bcy + oy;
      const pieceR = isAnimating ? pr * 1.18 : pr;
      const isValid = gameState.phase === 'moving' && p === cp && validSet.has(piece.idx);
      drawPiece3D(ctx, pcx, pcy, pieceR, COLORS[p], DARKS[p], piece.idx+1, isAnimating, isValid);
    }
  }
}

// ── Estado de la app ───────────────────────────────────────────────────────────
let currentGameId = null;
let gameState = null;
let ws = null;

// ── API ────────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: {'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWS(gameId) {
  if (ws) ws.close();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/${gameId}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.state) {
      gameState = msg.state;
      if (msg.type === 'game_started') showGame();
      else if (msg.type === 'player_joined') updateWaiting();
      else if (msg.type === 'game_over') showEnd(msg);
      else updateGameUI();
    }
  };
  ws.onclose = () => setTimeout(() => currentGameId && connectWS(currentGameId), 2000);
}

// ── Screens ───────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goLobby() {
  if (ws) { ws.close(); ws = null; }
  currentGameId = null; gameState = null;
  showScreen('screen-lobby');
}

// ── Crear sala ────────────────────────────────────────────────────────────────
async function createGame() {
  try {
    const data = await api('POST', '/games', {user_id: ME.id, user_name: ME.name});
    currentGameId = data.game_id;
    gameState = data.state;
    connectWS(currentGameId);
    document.getElementById('waiting-code').textContent = currentGameId;
    updateWaiting();
    showScreen('screen-waiting');
  } catch(e) { toast(e.message); }
}

// ── Unirse ────────────────────────────────────────────────────────────────────
async function joinGame() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length < 4) { toast('Introduce el código de sala'); return; }
  try {
    const data = await api('POST', `/games/${code}/join`, {user_id: ME.id, user_name: ME.name});
    currentGameId = code;
    gameState = data.state;
    connectWS(currentGameId);
    if (gameState.phase !== 'waiting') { showGame(); return; }
    document.getElementById('waiting-code').textContent = currentGameId;
    updateWaiting();
    showScreen('screen-waiting');
  } catch(e) { toast(e.message); }
}

// ── Iniciar ───────────────────────────────────────────────────────────────────
async function startGame() {
  try {
    gameState = await api('POST', `/games/${currentGameId}/start`, {user_id: ME.id, user_name: ME.name});
    showGame();
  } catch(e) { toast(e.message); }
}

// ── Actualizar sala de espera ─────────────────────────────────────────────────
function updateWaiting() {
  const n = gameState.player_ids.length;
  const list = document.getElementById('waiting-players');
  list.innerHTML = gameState.player_names.map((name, i) =>
    `<div class="player-row">
      <div class="player-dot" style="background:${COLORS[i]}"></div>
      <span>${EMOJIS[i]} ${name}</span>
    </div>`
  ).join('');
  const btnStart = document.getElementById('btn-start');
  const hint = document.getElementById('waiting-hint');
  if (n >= 2) {
    btnStart.classList.remove('hidden');
    hint.textContent = `${n}/4 jugadores — ¡ya puedes iniciar!`;
  } else {
    btnStart.classList.add('hidden');
    hint.textContent = 'Esperando al menos 1 jugador más...';
  }
}

// ── Mostrar juego ─────────────────────────────────────────────────────────────
function showGame() {
  showScreen('screen-game');
  updateGameUI();
}

function updateGameUI() {
  if (!gameState) return;
  const canvas = document.getElementById('board-canvas');
  renderBoard(canvas, gameState);

  const cp = gameState.current_player;
  const cpName = gameState.player_names[cp];
  const status = document.getElementById('game-status');
  if (gameState.phase === 'rolling') {
    status.textContent = `${EMOJIS[cp]} Turno de ${cpName}`;
  } else if (gameState.phase === 'moving') {
    const d = gameState.dice_value;
    status.textContent = `${EMOJIS[cp]} ${cpName} sacó ${d} — elige ficha`;
  }

  // Players strip
  const strip = document.getElementById('players-info');
  strip.innerHTML = gameState.player_names.map((name, i) => {
    const done = gameState.pieces[i].filter(p => p.pos === 57).length;
    return `<div class="player-chip ${i === cp ? 'active' : ''}">
      <div class="player-chip-dot" style="background:${COLORS[i]}"></div>
      <span>${name} ${done > 0 ? '⭐'.repeat(done) : ''}</span>
    </div>`;
  }).join('');

  // Action buttons
  const btnRoll = document.getElementById('btn-roll');
  const pieceBtns = document.getElementById('piece-buttons');
  const isMyTurn = gameState.player_ids[cp] === ME.id;

  btnRoll.classList.add('hidden');
  pieceBtns.innerHTML = '';

  if (!isMyTurn) return;

  if (gameState.phase === 'rolling') {
    btnRoll.classList.remove('hidden');
  } else if (gameState.phase === 'moving') {
    pieceBtns.innerHTML = gameState.valid_moves.map(idx => {
      const piece = gameState.pieces[cp][idx];
      const label = piece.pos === -1 ? `Ficha ${idx+1} 🏠` : `Ficha ${idx+1} (${piece.pos})`;
      return `<button class="piece-btn" style="background:${COLORS[cp]};color:white"
              onclick="movePiece(${idx})">${label}</button>`;
    }).join('');
  }
}

// ── Tirar dado ────────────────────────────────────────────────────────────────
async function rollDice() {
  if (animating) return;
  const btn = document.getElementById('btn-roll');
  btn.disabled = true;
  try {
    const data = await api('POST', `/games/${currentGameId}/roll`, {user_id: ME.id});
    // dice_value puede ser null si advance_turn ya lo limpió (sin movimientos posibles)
    const rolledValue = data.dice_value ?? data.dice;
    showDice3D(rolledValue, () => {
      gameState = data;
      updateGameUI();
      if (data.note) toast(data.note);
      btn.disabled = false;
    });
    // Safety: si en 3s no se ejecutó el callback, forzar
    setTimeout(() => {
      if (btn.disabled) {
        gameState = data;
        updateGameUI();
        btn.disabled = false;
        document.getElementById('dice-overlay').classList.add('hidden');
      }
    }, 3000);
  } catch(e) {
    toast(e.message);
    btn.disabled = false;
  }
}

// ── Mover ficha ───────────────────────────────────────────────────────────────
async function movePiece(idx) {
  if (animating) return;
  // Deshabilitar botones durante animación
  document.querySelectorAll('.piece-btn').forEach(b => b.disabled = true);
  try {
    const cp = gameState.current_player;
    const fromPos = gameState.pieces[cp][idx].pos;
    const dice = gameState.dice_value;
    const toPos = fromPos === -1 ? 0 : Math.min(fromPos + dice, 57);

    const data = await api('POST', `/games/${currentGameId}/move/${idx}`, {user_id: ME.id});

    // Animar el movimiento antes de actualizar estado
    const canvas = document.getElementById('board-canvas');
    animatePieceMove(cp, idx, fromPos, toPos, canvas, gameState, () => {
      gameState = data;
      const ev = data.events || {};
      if (ev.captured) {
        SFX.capture();
        toast('💥 ¡Captura! +8 LULOCO');
        if (tg) tg.HapticFeedback?.notificationOccurred('error');
      } else if (ev.piece_finished) {
        SFX.pieceHome();
        toast('🎯 ¡Ficha al centro! +12 LULOCO');
        if (tg) tg.HapticFeedback?.notificationOccurred('success');
      } else if (ev.extra_turn) {
        SFX.extraTurn();
        toast('🔄 ¡Turno extra!');
      }
      updateGameUI();
    });
  } catch(e) {
    toast(e.message);
    document.querySelectorAll('.piece-btn').forEach(b => b.disabled = false);
  }
}

// ── Fin de partida ────────────────────────────────────────────────────────────
function showEnd(msg) {
  const wName = msg.winner_name || gameState?.player_names?.[msg.winner] || '?';
  document.getElementById('end-winner').textContent = `¡${wName} gana!`;
  document.getElementById('end-detail').textContent = '+100 LULOCO ganados 🎉';
  SFX.victory();
  if (tg) tg.HapticFeedback?.notificationOccurred('success');
  showScreen('screen-end');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Init: leer ?game= de la URL + arrancar música en primer gesto ─────────────
(function init() {
  const params = new URLSearchParams(location.search);
  const gameParam = params.get('game');
  if (gameParam) {
    document.getElementById('join-code').value = gameParam;
    joinGame();
  }

  // Los navegadores móviles bloquean el autoplay hasta que hay un gesto del usuario.
  // Iniciamos la música en el primer click o touch de la página.
  function onFirstGesture() {
    startMusic();
    document.removeEventListener('click',      onFirstGesture);
    document.removeEventListener('touchstart', onFirstGesture);
  }
  document.addEventListener('click',      onFirstGesture, { passive: true });
  document.addEventListener('touchstart', onFirstGesture, { passive: true });
})();
