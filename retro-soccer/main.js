// ============================================================
//  RETRO SOCCER 3v3 — main.js
//  Vanilla JS + HTML5 Canvas. Open index.html to play.
//
//  Controls:
//    WASD / Arrow Keys  — Move
//    SPACE (hold)       — Charge shot, release to shoot
//    SHIFT              — Turbo dash (0.4s burst, 3s cooldown)
//    TAB                — Switch to nearest teammate
//    R                  — Restart after game over
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ── Dimensions ────────────────────────────────────────────────
const W = 900, H = 580;
canvas.width  = W;
canvas.height = H;

// ── Field Layout ──────────────────────────────────────────────
const FL = 70;          // field left edge
const FR = 830;         // field right edge
const FT = 55;          // field top edge
const FB = 525;         // field bottom edge
const FCX = W / 2;      // field centre x
const FCY = H / 2;      // field centre y

const GOAL_H   = 130;   // goal mouth height
const GOAL_D   = 18;    // goal depth (behind the line)
const GOAL_TOP = FCY - GOAL_H / 2;
const GOAL_BOT = FCY + GOAL_H / 2;

// ── Tuning Constants ──────────────────────────────────────────
const PLAYER_R    = 13;    // player radius
const P_SPEED     = 195;   // normal speed (px/s)
const TURBO_SPEED = 460;   // turbo speed (px/s)
const TURBO_DUR   = 0.4;   // turbo duration (s)
const TURBO_CD    = 3.0;   // turbo cooldown (s)

const BALL_R      = 9;     // ball radius
const FRICTION    = 0.988; // ball speed multiplier per frame (at 60 fps)
const SHOOT_MIN   = 320;   // min shot speed (px/s)
const SHOOT_MAX   = 800;   // max shot speed (px/s)
const SHOOT_RATE  = 1.1;   // charge fill rate (0→1 per second)
const CONTACT_V   = 260;   // speed when dribbling into ball

const AI_SPEED    = 155;   // AI movement speed
const GK_SPEED    = 175;   // goalkeeper speed
const MATCH_TIME  = 180;   // match duration (seconds)

// ── Input ─────────────────────────────────────────────────────
const keys = {};

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Tab')   { e.preventDefault(); switchPlayer(); }
  if (e.code === 'KeyR')  { if (gs.phase !== 'playing') init(); }
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space') releaseShot();
});

// ── Game State Object ─────────────────────────────────────────
const gs = {
  phase:      'playing', // 'playing' | 'goal' | 'gameover'
  score:      [0, 0],
  timer:      MATCH_TIME,
  goalTimer:  0,
  charge:     0,
  charging:   false,
  shake:      { x: 0, y: 0, mag: 0, dur: 0 },
};

let ball;
let teams;       // teams[0] = blue (left), teams[1] = red (right)
let controlled;  // the player the human controls

// ── Init / Reset ──────────────────────────────────────────────
function init() {
  gs.phase   = 'playing';
  gs.score   = [0, 0];
  gs.timer   = MATCH_TIME;
  gs.charge  = 0;
  gs.charging = false;
  resetPositions();
}

// Called after each goal (resets positions, keeps score/timer)
function resetPositions() {
  gs.goalTimer = 0;

  ball = { x: FCX, y: FCY, vx: 0, vy: 0 };

  teams = [
    buildTeam(0, '#3a8eff', FL, FR),  // blue attacks right
    buildTeam(1, '#ff3a3a', FR, FL),  // red  attacks left
  ];

  // Human controls the first blue player
  controlled = teams[0].players[0];
  controlled.human = true;
}

// ── Build a Team ──────────────────────────────────────────────
function buildTeam(id, color, ownGoalX, attackX) {
  const isLeft = id === 0;
  const ox = isLeft ? FL : FR;   // side of field
  const dir = isLeft ? 1 : -1;

  // Starting positions: goalkeeper + 2 outfielders
  const positions = isLeft
    ? [[ox + 50, FCY], [ox + 190, FCY - 110], [ox + 190, FCY + 110]]
    : [[ox - 50, FCY], [ox - 190, FCY - 110], [ox - 190, FCY + 110]];

  return {
    id, color, ownGoalX, attackX,
    players: positions.map((pos, i) => ({
      x: pos[0], y: pos[1],
      sx: pos[0], sy: pos[1],   // spawn position
      facingX: dir, facingY: 0,
      role: i === 0 ? 'gk' : 'field',
      human: false,
      turboOn: false,
      turboDur: 0,
      turboCool: 0,
      team: id,
    })),
  };
}

// ── Switch Controlled Player ──────────────────────────────────
function switchPlayer() {
  if (gs.phase !== 'playing') return;
  let best = null, bestD = Infinity;
  for (const p of teams[0].players) {
    const d = dist(p.x, p.y, ball.x, ball.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best && best !== controlled) {
    controlled.human = false;
    controlled = best;
    controlled.human = true;
  }
}

// ── Release Shot ──────────────────────────────────────────────
function releaseShot() {
  if (!gs.charging) return;
  const charge  = gs.charge;
  gs.charge     = 0;
  gs.charging   = false;

  const d = dist(controlled.x, controlled.y, ball.x, ball.y);
  if (d > PLAYER_R + BALL_R + 30) return;  // too far to kick

  const speed = SHOOT_MIN + charge * (SHOOT_MAX - SHOOT_MIN);
  const ang   = Math.atan2(ball.y - controlled.y, ball.x - controlled.x);
  ball.vx = Math.cos(ang) * speed;
  ball.vy = Math.sin(ang) * speed;
  shake(5, 0.18);
}

// ── Screen Shake ──────────────────────────────────────────────
function shake(mag, dur) {
  gs.shake.mag = mag;
  gs.shake.dur = dur;
}

// ── UPDATE ────────────────────────────────────────────────────
let lastTime = 0;

function update(dt) {
  // -- Goal pause countdown
  if (gs.phase === 'goal') {
    gs.goalTimer -= dt;
    if (gs.goalTimer <= 0) {
      gs.phase = 'playing';
      resetPositions();
    }
    return;
  }
  if (gs.phase !== 'playing') return;

  // Shot charge
  if (keys['Space']) {
    gs.charging = true;
    gs.charge   = Math.min(1, gs.charge + dt * SHOOT_RATE);
  }

  // Screen shake update
  if (gs.shake.dur > 0) {
    gs.shake.dur -= dt;
    gs.shake.x = (Math.random() - 0.5) * gs.shake.mag * 2;
    gs.shake.y = (Math.random() - 0.5) * gs.shake.mag * 2;
  } else {
    gs.shake.x = gs.shake.y = 0;
  }

  updateHuman(dt);
  updateAI(dt);
  resolvePlayerCollisions();
  updateBall(dt);
  checkGoal();

  gs.timer -= dt;
  if (gs.timer <= 0) { gs.timer = 0; gs.phase = 'gameover'; }
}

// ── Update: Human Player ──────────────────────────────────────
function updateHuman(dt) {
  const p = controlled;
  let mx = 0, my = 0;

  if (keys['KeyW'] || keys['ArrowUp'])    my -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  my += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len; my /= len;
    p.facingX = mx; p.facingY = my;
  }

  // Turbo activation
  if (p.turboCool > 0) p.turboCool -= dt;
  if ((keys['ShiftLeft'] || keys['ShiftRight']) && !p.turboOn && p.turboCool <= 0) {
    p.turboOn  = true;
    p.turboDur = TURBO_DUR;
    p.turboCool = TURBO_CD;
  }
  if (p.turboOn) {
    p.turboDur -= dt;
    if (p.turboDur <= 0) p.turboOn = false;
  }

  const spd = p.turboOn ? TURBO_SPEED : P_SPEED;
  p.x += mx * spd * dt;
  p.y += my * spd * dt;
  clampField(p);
  contactKick(p);
}

// ── Update: AI Players ────────────────────────────────────────
function updateAI(dt) {
  const allPlayers = [...teams[0].players, ...teams[1].players];

  for (const p of allPlayers) {
    if (p.human) continue;

    const team    = teams[p.team];
    const isLeft  = p.team === 0;
    let tx, ty;

    if (p.role === 'gk') {
      // Goalkeeper: hug own goal line, track ball vertically
      tx = isLeft ? FL + 42 : FR - 42;
      ty = clamp(ball.y, GOAL_TOP + 15, GOAL_BOT - 15);

      // Charge out if ball is very close to goal
      const goalX = team.ownGoalX;
      if (dist(ball.x, ball.y, goalX, FCY) < 140) {
        tx = ball.x;
        ty = ball.y;
      }
    } else {
      // Outfielder state machine
      const ballInOwnHalf = isLeft ? ball.x < FCX : ball.x > FCX;

      if (ballInOwnHalf) {
        // Defending: chase ball directly
        tx = ball.x + (isLeft ? -20 : 20);
        ty = ball.y;
      } else {
        // Attacking: position near opponent goal, one stays offset
        const offY = (allPlayers.indexOf(p) % 2 === 0) ? -90 : 90;
        tx = isLeft ? FR - 100 : FL + 100;
        ty = FCY + offY;
        // If close enough to ball, go for it
        if (dist(p.x, p.y, ball.x, ball.y) < 160) {
          tx = ball.x;
          ty = ball.y;
        }
      }
    }

    // Move toward target
    const dx = tx - p.x, dy = ty - p.y;
    const d  = Math.hypot(dx, dy);
    if (d > 5) {
      const spd = p.role === 'gk' ? GK_SPEED : AI_SPEED;
      p.x += (dx / d) * spd * dt;
      p.y += (dy / d) * spd * dt;
      p.facingX = dx / d;
      p.facingY = dy / d;
    }

    // AI shoots toward opponent goal when very close to ball
    const bd = dist(p.x, p.y, ball.x, ball.y);
    if (bd < PLAYER_R + BALL_R + 5) {
      const goalX  = team.attackX;
      const ang    = Math.atan2(FCY - ball.y, goalX - ball.x);
      const spd2   = Math.hypot(ball.vx, ball.vy);
      if (spd2 < 200) {
        // Only kick if ball is slow (don't fight a fast ball)
        ball.vx = Math.cos(ang) * (280 + Math.random() * 120);
        ball.vy = Math.sin(ang) * (280 + Math.random() * 120) + (Math.random() - 0.5) * 60;
      }
    }

    clampField(p);
    contactKick(p);
  }
}

// ── Contact Kick (dribble physics) ────────────────────────────
// When any player overlaps the ball, separate them and nudge ball.
function contactKick(p) {
  const dx = ball.x - p.x;
  const dy = ball.y - p.y;
  const d  = Math.hypot(dx, dy);
  const md = PLAYER_R + BALL_R;

  if (d < md && d > 0) {
    const nx = dx / d, ny = dy / d;
    // Push ball outside overlap
    ball.x = p.x + nx * md;
    ball.y = p.y + ny * md;
    // If ball is nearly still, give it the player's dribble touch
    if (Math.hypot(ball.vx, ball.vy) < 80) {
      ball.vx = nx * CONTACT_V;
      ball.vy = ny * CONTACT_V;
    }
  }
}

// ── Player–Player Collisions ──────────────────────────────────
function resolvePlayerCollisions() {
  const all = [...teams[0].players, ...teams[1].players];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d  = Math.hypot(dx, dy);
      const md = PLAYER_R * 2;
      if (d < md && d > 0) {
        const overlap = (md - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        clampField(a);
        clampField(b);
      }
    }
  }
}

// ── Ball Physics ──────────────────────────────────────────────
function updateBall(dt) {
  // Frame-rate independent friction
  const f = Math.pow(FRICTION, dt * 60);
  ball.vx *= f;
  ball.vy *= f;

  // Stop jitter below threshold
  if (Math.hypot(ball.vx, ball.vy) < 5) { ball.vx = 0; ball.vy = 0; }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Top / bottom walls
  if (ball.y - BALL_R < FT) { ball.y = FT + BALL_R; ball.vy =  Math.abs(ball.vy) * 0.72; }
  if (ball.y + BALL_R > FB) { ball.y = FB - BALL_R; ball.vy = -Math.abs(ball.vy) * 0.72; }

  // Left / right walls — allow ball into goal mouth
  const inGoalMouth = ball.y > GOAL_TOP && ball.y < GOAL_BOT;
  if (!inGoalMouth) {
    if (ball.x - BALL_R < FL) { ball.x = FL + BALL_R; ball.vx =  Math.abs(ball.vx) * 0.72; }
    if (ball.x + BALL_R > FR) { ball.x = FR - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.72; }
  }
}

// ── Goal Detection ────────────────────────────────────────────
function checkGoal() {
  const inMouth = ball.y > GOAL_TOP && ball.y < GOAL_BOT;
  if (!inMouth) return;

  if (ball.x - BALL_R < FL - GOAL_D) goalScored(1);  // red scores
  if (ball.x + BALL_R > FR + GOAL_D) goalScored(0);  // blue scores
}

function goalScored(team) {
  gs.score[team]++;
  gs.phase     = 'goal';
  gs.goalTimer = 2.8;
  shake(10, 0.5);
}

// ── Helpers ───────────────────────────────────────────────────
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function clamp(v, lo, hi)     { return Math.max(lo, Math.min(hi, v)); }
function clampField(p) {
  p.x = clamp(p.x, FL + p.radius || FL + PLAYER_R, FR - (p.radius || PLAYER_R));
  p.y = clamp(p.y, FT + PLAYER_R, FB - PLAYER_R);
}

// ── RENDER ────────────────────────────────────────────────────
function render() {
  ctx.save();
  ctx.translate(gs.shake.x, gs.shake.y);

  drawField();
  drawGoals();
  drawShotIndicator();
  drawPlayers();
  drawBall();
  drawHUD();

  if (gs.phase === 'goal')     drawGoalOverlay();
  if (gs.phase === 'gameover') drawGameOver();

  ctx.restore();
}

// ── Draw: Field ───────────────────────────────────────────────
function drawField() {
  // Outside area (dark)
  ctx.fillStyle = '#0e0e0e';
  ctx.fillRect(0, 0, W, H);

  // Alternating grass stripes
  const fw = FR - FL;
  const sw = fw / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1d7030' : '#1a6828';
    ctx.fillRect(FL + i * sw, FT, sw, FB - FT);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth   = 2;

  // Border
  ctx.strokeRect(FL, FT, FR - FL, FB - FT);

  // Halfway line
  ctx.beginPath(); ctx.moveTo(FCX, FT); ctx.lineTo(FCX, FB); ctx.stroke();

  // Centre circle
  ctx.beginPath(); ctx.arc(FCX, FCY, 62, 0, Math.PI * 2); ctx.stroke();

  // Centre spot
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(FCX, FCY, 3, 0, Math.PI * 2); ctx.fill();

  // Penalty areas
  const pw = 105, ph = 230;
  ctx.strokeRect(FL,      FCY - ph / 2, pw, ph);
  ctx.strokeRect(FR - pw, FCY - ph / 2, pw, ph);

  // Penalty spots
  ctx.beginPath(); ctx.arc(FL + 70, FCY, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(FR - 70, FCY, 3, 0, Math.PI * 2); ctx.fill();
}

// ── Draw: Goals ───────────────────────────────────────────────
function drawGoals() {
  // Left goal
  ctx.fillStyle   = 'rgba(60,140,255,0.12)';
  ctx.fillRect(FL - GOAL_D, GOAL_TOP, GOAL_D, GOAL_H);
  ctx.strokeStyle = '#6af';
  ctx.lineWidth   = 2;
  ctx.strokeRect(FL - GOAL_D, GOAL_TOP, GOAL_D, GOAL_H);

  // Right goal
  ctx.fillStyle   = 'rgba(255,60,60,0.12)';
  ctx.fillRect(FR, GOAL_TOP, GOAL_D, GOAL_H);
  ctx.strokeStyle = '#f66';
  ctx.lineWidth   = 2;
  ctx.strokeRect(FR, GOAL_TOP, GOAL_D, GOAL_H);
}

// ── Draw: Shot Power Ring ─────────────────────────────────────
function drawShotIndicator() {
  if (!gs.charging || gs.charge <= 0) return;
  const p = controlled;
  const d = dist(p.x, p.y, ball.x, ball.y);
  if (d > PLAYER_R + BALL_R + 35) return;

  // Ring around ball showing charge level
  const hue = 120 - gs.charge * 120;  // green → red
  ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.9)`;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * gs.charge);
  ctx.stroke();
}

// ── Draw: Players ─────────────────────────────────────────────
function drawPlayers() {
  for (let t = 0; t < 2; t++) {
    const color = teams[t].color;
    for (const p of teams[t].players) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x + 3, p.y + 5, PLAYER_R, PLAYER_R * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Turbo aura
      if (p.turboOn) {
        ctx.strokeStyle = '#ffee00';
        ctx.lineWidth   = 3;
        ctx.shadowColor = '#ffee00';
        ctx.shadowBlur  = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER_R + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Body ring (white = controlled, color = AI)
      ctx.strokeStyle = p.human ? '#ffffff' : 'rgba(255,255,255,0.4)';
      ctx.fillStyle   = p.human ? lighten(color, 0.25) : color;
      ctx.lineWidth   = p.human ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // GK badge (small square inside)
      if (p.role === 'gk') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      }

      // Facing dot
      ctx.fillStyle = p.human ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(
        p.x + p.facingX * (PLAYER_R - 4),
        p.y + p.facingY * (PLAYER_R - 4),
        2.5, 0, Math.PI * 2
      );
      ctx.fill();
    }
  }
}

// ── Draw: Ball ────────────────────────────────────────────────
function drawBall() {
  // Motion blur trail
  const spd = Math.hypot(ball.vx, ball.vy);
  if (spd > 200) {
    const trailLen = Math.min(spd / 800, 1);
    const tx = ball.x - (ball.vx / spd) * 18 * trailLen;
    const ty = ball.y - (ball.vy / spd) * 18 * trailLen;
    const grad = ctx.createLinearGradient(tx, ty, ball.x, ball.y);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.25)');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = BALL_R * 1.5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ball.x, ball.y);
    ctx.stroke();
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(ball.x + 3, ball.y + 6, BALL_R, BALL_R * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball body
  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = '#555';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Panel lines (simple retro soccer ball look)
  ctx.strokeStyle = 'rgba(80,80,80,0.5)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R * 0.55, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Draw: HUD ─────────────────────────────────────────────────
function drawHUD() {
  // Scorebar backdrop
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, W, 50);

  ctx.textAlign = 'center';

  // Blue team label + score
  ctx.fillStyle = '#3a8eff';
  ctx.font      = 'bold 20px monospace';
  ctx.fillText('BLUE', FCX - 130, 30);
  ctx.fillStyle = '#fff';
  ctx.font      = 'bold 24px monospace';
  ctx.fillText(gs.score[0], FCX - 55, 32);

  // Dash
  ctx.fillStyle = '#aaa';
  ctx.font      = '20px monospace';
  ctx.fillText('–', FCX, 32);

  // Red team score + label
  ctx.fillStyle = '#fff';
  ctx.font      = 'bold 24px monospace';
  ctx.fillText(gs.score[1], FCX + 55, 32);
  ctx.fillStyle = '#ff3a3a';
  ctx.font      = 'bold 20px monospace';
  ctx.fillText('RED', FCX + 130, 30);

  // Timer (turns red in last 30 seconds)
  const mins = Math.floor(gs.timer / 60);
  const secs = Math.floor(gs.timer % 60).toString().padStart(2, '0');
  ctx.fillStyle = gs.timer < 30 ? '#ff5555' : 'rgba(255,255,255,0.75)';
  ctx.font      = '14px monospace';
  ctx.fillText(`${mins}:${secs}`, FCX, 46);

  // Turbo bar (bottom left)
  drawTurboBar();

  // Controls hint — shown only in first 12 seconds
  if (gs.timer > MATCH_TIME - 12) {
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.font      = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WASD: Move   SPACE: Shoot   SHIFT: Turbo   TAB: Switch player', FCX, H - 10);
  }
}

function drawTurboBar() {
  const p   = controlled;
  const bx  = 14, by = H - 30, bw = 90, bh = 12;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx, by, bw, bh);

  let fill, label;
  if (p.turboOn) {
    fill  = '#ffee00';
    label = 'TURBO!';
  } else if (p.turboCool > 0) {
    const pct = 1 - p.turboCool / TURBO_CD;
    fill  = `hsl(${Math.round(pct * 50)}, 90%, 55%)`;
    ctx.fillStyle = fill;
    ctx.fillRect(bx, by, bw * pct, bh);
    label = 'TURBO';
  } else {
    fill  = '#ffee00';
    label = 'TURBO RDY';
  }

  if (p.turboOn || p.turboCool <= 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(bx, by, bw, bh);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = '#fff';
  ctx.font      = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, bx + 2, by + bh - 2);
}

// ── Draw: Goal Overlay ────────────────────────────────────────
function drawGoalOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#ffdd00';
  ctx.font        = 'bold 72px monospace';
  ctx.shadowColor = '#ff8800';
  ctx.shadowBlur  = 28;
  ctx.fillText('GOAL!', FCX, FCY - 10);

  ctx.shadowBlur  = 0;
  ctx.fillStyle   = '#fff';
  ctx.font        = '26px monospace';
  ctx.fillText(`${gs.score[0]}  –  ${gs.score[1]}`, FCX, FCY + 42);
}

// ── Draw: Game Over ───────────────────────────────────────────
function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, W, H);

  const blueWins = gs.score[0] > gs.score[1];
  const draw     = gs.score[0] === gs.score[1];
  const msg      = draw ? 'DRAW!' : (blueWins ? 'BLUE WINS!' : 'RED WINS!');
  const col      = draw ? '#ffdd00' : (blueWins ? '#3a8eff' : '#ff3a3a');

  ctx.textAlign   = 'center';
  ctx.fillStyle   = col;
  ctx.font        = 'bold 58px monospace';
  ctx.shadowColor = col;
  ctx.shadowBlur  = 24;
  ctx.fillText(msg, FCX, FCY - 28);
  ctx.shadowBlur  = 0;

  ctx.fillStyle = '#fff';
  ctx.font      = '26px monospace';
  ctx.fillText(`${gs.score[0]}  –  ${gs.score[1]}`, FCX, FCY + 28);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font      = '16px monospace';
  ctx.fillText('Press  R  to play again', FCX, FCY + 76);
}

// ── Utility: Lighten a hex color ──────────────────────────────
function lighten(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const to255 = v => Math.min(255, Math.round(v + (255 - v) * amount));
  return `rgb(${to255(r)},${to255(g)},${to255(b)})`;
}

// ── Game Loop ─────────────────────────────────────────────────
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

// ── Start ─────────────────────────────────────────────────────
init();
requestAnimationFrame(gameLoop);
