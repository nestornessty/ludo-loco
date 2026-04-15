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
const COLORS  = ['#FFD700','#22CC44','#FF4444','#3399FF'];
const DARKS   = ['#CC8800','#117722','#BB1111','#1155BB'];
const LIGHTS  = ['#FFF5B0','#B0FFB0','#FFB0B0','#B0CCFF'];
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

// ── Dado 3D ───────────────────────────────────────────────────────────────────
// Rotaciones finales para mostrar cada cara al frente
const FACE_ROTATIONS = {
  1: [0,    0,   0],
  2: [0,   -90,  0],
  3: [-90,  0,   0],
  4: [90,   0,   0],
  5: [0,    90,  0],
  6: [0,   180,  0],
};

function showDice3D(result, callback) {
  const overlay = document.getElementById('dice-overlay');
  const cube    = document.getElementById('dice-3d');
  const label   = document.getElementById('dice-result-label');
  const diceEmojis = ['⚀','⚁','⚂','⚃','⚄','⚅'];

  // 1. Reset instantáneo sin transición
  cube.style.transition = 'none';
  cube.style.transform  = 'rotateX(0deg) rotateY(0deg) rotateZ(0deg)';
  label.classList.remove('show');
  label.textContent = '';
  overlay.classList.remove('hidden');

  // 2. Forzar reflow para que el reset se aplique
  cube.getBoundingClientRect();

  // 3. Una sola transición: muchas vueltas + aterrizaje en la cara correcta
  const [fx, fy] = FACE_ROTATIONS[result];
  const totalX = 5 * 360 + fx;   // 5 vueltas + cara final
  const totalY = 7 * 360 + fy;
  const totalZ = 2 * 360;

  cube.style.transition = 'transform 1.6s cubic-bezier(0.23, 1, 0.32, 1)';
  cube.style.transform  = `rotateX(${totalX}deg) rotateY(${totalY}deg) rotateZ(${totalZ}deg)`;

  // 4. Mostrar resultado cuando casi termina
  setTimeout(() => {
    label.textContent = `${diceEmojis[result-1]}  ${result}`;
    label.classList.add('show');
  }, 1200);

  // 5. Cerrar overlay y continuar juego
  setTimeout(() => {
    overlay.classList.add('hidden');
    label.classList.remove('show');
    callback();
  }, 2000);
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
  if (fromPos === -1) {
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
    // Vibración suave en Telegram
    if (tg && step % 3 === 0) tg.HapticFeedback?.impactOccurred('light');
    setTimeout(nextStep, 160);
  }

  pieceOverrides[key] = cells[0];
  nextStep();
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * 36 - 90) * Math.PI / 180;
    const rad = i % 2 === 0 ? r : r * 0.42;
    i === 0 ? ctx.moveTo(cx + rad*Math.cos(angle), cy + rad*Math.sin(angle))
            : ctx.lineTo(cx + rad*Math.cos(angle), cy + rad*Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Canvas renderer ────────────────────────────────────────────────────────────
function renderBoard(canvas, gameState, overrides = {}) {
  const size = Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight, 500);
  const CELL = Math.floor(size / 17);
  const MARGIN = Math.floor((size - 15 * CELL) / 2);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = (r, c) => MARGIN + c * CELL + CELL / 2;
  const cy = (r, c) => MARGIN + r * CELL + CELL / 2;

  // Frame
  ctx.fillStyle = '#2A1608';
  ctx.fillRect(0, 0, size, size);

  // Board background
  ctx.fillStyle = '#F2E0BC';
  ctx.fillRect(MARGIN, MARGIN, 15*CELL, 15*CELL);

  // Home areas
  for (let p = 0; p < 4; p++) {
    const [r1,c1,r2,c2] = HOME_AREAS[p];
    const W = (c2-c1+1)*CELL, H = (r2-r1+1)*CELL;
    const x = MARGIN+c1*CELL, y = MARGIN+r1*CELL;
    ctx.fillStyle = lighten(COLORS[p], 0.55);
    ctx.fillRect(x, y, W, H);
    const pad = CELL * 0.5;
    ctx.fillStyle = lighten(COLORS[p], 0.2);
    ctx.fillRect(x+pad, y+pad, W-2*pad, H-2*pad);
    ctx.strokeStyle = DARKS[p]; ctx.lineWidth = 2;
    ctx.strokeRect(x+pad, y+pad, W-2*pad, H-2*pad);
    // Label
    ctx.fillStyle = DARKS[p];
    ctx.font = `bold ${Math.max(9, CELL*0.22)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(NAMES[p], x+W/2, y+4);
  }

  // Cross background
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(MARGIN, MARGIN+6*CELL, 15*CELL, 3*CELL);
  ctx.fillRect(MARGIN+6*CELL, MARGIN, 3*CELL, 15*CELL);

  // Home stretches
  for (let p = 0; p < 4; p++) {
    for (const [r,c] of HOME_STRETCHES[p]) {
      ctx.fillStyle = lighten(COLORS[p], 0.4);
      ctx.fillRect(MARGIN+c*CELL, MARGIN+r*CELL, CELL, CELL);
      ctx.strokeStyle = COLORS[p]; ctx.lineWidth = 1;
      ctx.strokeRect(MARGIN+c*CELL, MARGIN+r*CELL, CELL, CELL);
    }
  }

  // Center pinwheel
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
    ctx.fillStyle = COLORS[i];
    ctx.beginPath();
    ctx.moveTo(tris[i][0][0],tris[i][0][1]);
    ctx.lineTo(tris[i][1][0],tris[i][1][1]);
    ctx.lineTo(tris[i][2][0],tris[i][2][1]);
    ctx.closePath(); ctx.fill();
  }
  // White lines between triangles
  ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
  for (const tri of tris) { ctx.beginPath(); ctx.moveTo(tri[0][0],tri[0][1]); ctx.lineTo(tri[1][0],tri[1][1]); ctx.stroke(); ctx.beginPath(); ctx.moveTo(tri[0][0],tri[0][1]); ctx.lineTo(tri[2][0],tri[2][1]); ctx.stroke(); }
  drawStar(ctx, mx, my, CELL*0.28, 'white');

  // Path squares
  for (let i = 0; i < MAIN_PATH.length; i++) {
    const [r,c] = MAIN_PATH[i];
    const x = MARGIN+c*CELL, y = MARGIN+r*CELL;
    const isStart = PLAYER_STARTS.indexOf(i);
    if (isStart >= 0) {
      ctx.fillStyle = lighten(COLORS[isStart], 0.3);
    } else if (SAFE.has(i)) {
      ctx.fillStyle = '#FFFBE0';
    } else {
      ctx.fillStyle = '#FAFAFA';
    }
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = '#CCCCCC'; ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, CELL, CELL);
    if (SAFE.has(i)) drawStar(ctx, x+CELL/2, y+CELL/2, CELL*0.2, '#FFD700');
    if (isStart >= 0) drawStar(ctx, x+CELL/2, y+CELL/2, CELL*0.2, COLORS[isStart]);
  }

  // Home slots (empty circles)
  for (let p = 0; p < 4; p++) {
    for (const [r,c] of HOME_SLOTS[p]) {
      ctx.beginPath();
      ctx.arc(cx(r,c), cy(r,c), CELL*0.33, 0, Math.PI*2);
      ctx.fillStyle = '#CCCCCC'; ctx.fill();
      ctx.strokeStyle = COLORS[p]; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  if (!gameState) return;

  // Pieces (con soporte de overrides para animación)
  const cellMap = {};
  const numPlayers = gameState.player_ids.length;
  for (let p = 0; p < numPlayers; p++) {
    for (let i = 0; i < 4; i++) {
      const piece = gameState.pieces[p][i];
      const overrideKey = `${p}_${i}`;
      const [r,c] = overrides[overrideKey] || getPieceCell(p, piece);
      const key = `${r},${c}`;
      if (!cellMap[key]) cellMap[key] = [];
      cellMap[key].push({p, piece, isAnimating: !!overrides[overrideKey]});
    }
  }

  for (const [key, group] of Object.entries(cellMap)) {
    const [r,c] = key.split(',').map(Number);
    const bcx = cx(r,c), bcy = cy(r,c);
    const count = group.length;
    const pr = count > 1 ? CELL*0.22 : CELL*0.28;
    const offs = [[0,0],[-CELL*0.22,-CELL*0.22],[CELL*0.22,-CELL*0.22],[-CELL*0.22,CELL*0.22],[CELL*0.22,CELL*0.22]];

    for (let i = 0; i < group.length; i++) {
      const {p, piece, isAnimating} = group[i];
      const [ox,oy] = count>1 ? offs[i+1]||[0,0] : [0,0];
      const pcx = bcx+ox, pcy = bcy+oy;
      const animR = isAnimating ? pr * 1.15 : pr; // ligeramente más grande al moverse

      // Glow si está animando
      if (isAnimating) {
        ctx.save();
        ctx.shadowColor = COLORS[p];
        ctx.shadowBlur = 18;
      }
      // Shadow
      ctx.beginPath(); ctx.arc(pcx+2, pcy+2, animR, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      // Body
      ctx.beginPath(); ctx.arc(pcx, pcy, animR, 0, Math.PI*2);
      ctx.fillStyle = COLORS[p]; ctx.fill();
      ctx.strokeStyle = DARKS[p]; ctx.lineWidth = Math.max(1.5, CELL*0.05); ctx.stroke();
      // Highlight
      ctx.beginPath(); ctx.arc(pcx-animR*0.28, pcy-animR*0.28, animR*0.32, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
      // Number
      ctx.fillStyle = 'white';
      ctx.font = `bold ${Math.max(8,Math.floor(animR*1.1))}px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(piece.idx+1, pcx, pcy);
      if (isAnimating) ctx.restore();
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
    showDice3D(data.dice_value, () => {
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
      if (ev.captured) toast('💥 ¡Captura! +8 LULOCO');
      else if (ev.piece_finished) toast('🎯 ¡Ficha al centro! +12 LULOCO');
      else if (ev.extra_turn) toast('🔄 ¡Turno extra!');
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

// ── Init: leer ?game= de la URL ───────────────────────────────────────────────
(function init() {
  const params = new URLSearchParams(location.search);
  const gameParam = params.get('game');
  if (gameParam) {
    document.getElementById('join-code').value = gameParam;
    joinGame();
  }
})();
