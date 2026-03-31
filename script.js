// ============================================================
//  ONE BUTTON HEIST — script.js
//  Retro stealth game: hold SPACE (or mouse) to move forward.
//  Avoid guard vision cones. Collect coins. Survive.
// ============================================================

// ── Canvas Setup ─────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const W = 800;   // canvas width
const H = 600;   // canvas height
canvas.width  = W;
canvas.height = H;

// ── Game Constants ────────────────────────────────────────────
const PLAYER_RADIUS    = 10;    // player circle radius (px)
const PLAYER_SPEED     = 140;   // px per second while moving
const BASE_ROT_SPEED   = 1.8;   // radians per second (base rotation)

const GUARD_SIZE       = 14;    // half-side of guard square
const GUARD_SPEED      = 60;    // px per second on patrol
const VISION_RANGE     = 160;   // how far guard sees (px)
const VISION_HALF_ANG  = 0.45;  // half of vision cone angle (radians ~52°)
const WAYPOINT_RADIUS  = 8;     // distance to "arrive" at waypoint

const COIN_RADIUS      = 7;     // coin circle radius
const COIN_COUNT       = 8;     // coins per level
const SAFE_SPAWN_DIST  = 80;    // min distance from player when spawning objects

const DIFFICULTY_EVERY = 15000; // ms between difficulty increases

// Colors
const COLOR_BG         = '#0f0f0f';
const COLOR_PLAYER     = '#00ff88';
const COLOR_PLAYER_DIR = '#ffffff';
const COLOR_GUARD      = '#ff3333';
const COLOR_VISION     = 'rgba(255, 60, 60, 0.18)';
const COLOR_VISION_EDGE= 'rgba(255, 80, 80, 0.55)';
const COLOR_COIN       = '#ffdd00';
const COLOR_COIN_GLOW  = 'rgba(255, 220, 0, 0.3)';
const COLOR_HUD        = '#00ff88';
const COLOR_GAMEOVER   = '#ff3333';
const COLOR_GRID       = 'rgba(0, 255, 136, 0.04)';

// ── Game State ────────────────────────────────────────────────
let player, guards, coins, score, gameOver, gameRunning;
let rotSpeed;          // current rotation speed (increases with difficulty)
let difficulty;        // 1, 2, 3 …
let difficultyTimer;   // ms since last difficulty increase
let lastTime;          // timestamp of last frame
let buttonHeld;        // true while spacebar or mouse button is down
let animFrameId;       // requestAnimationFrame handle

// ── Initialise / Reset ────────────────────────────────────────
function init() {
  score          = 0;
  gameOver       = false;
  gameRunning    = true;
  difficulty     = 1;
  difficultyTimer= 0;
  rotSpeed       = BASE_ROT_SPEED;
  buttonHeld     = false;
  lastTime       = null;

  // Player starts at canvas centre
  player = {
    x:     W / 2,
    y:     H / 2,
    angle: 0,      // facing direction in radians (0 = right)
  };

  // Spawn initial coins and guards
  coins  = spawnCoins(COIN_COUNT);
  guards = spawnGuards(2);   // start with 2 guards

  // Cancel any existing loop before starting a new one
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);
}

// ── Coin Spawner ──────────────────────────────────────────────
// Places N coins at random positions away from the player start.
function spawnCoins(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(randomPosition(W / 2, H / 2, SAFE_SPAWN_DIST));
  }
  return list;
}

// ── Guard Spawner ─────────────────────────────────────────────
// Creates guards with 2–3 patrol waypoints each.
function spawnGuards(count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    // Build a small patrol path of 2 or 3 random waypoints
    const numWaypoints = 2 + Math.floor(Math.random() * 2); // 2 or 3
    const waypoints = [];
    for (let w = 0; w < numWaypoints; w++) {
      waypoints.push(randomPosition(W / 2, H / 2, SAFE_SPAWN_DIST * 1.5));
    }

    list.push({
      x:          waypoints[0].x,
      y:          waypoints[0].y,
      angle:      0,             // facing direction
      waypoints:  waypoints,
      wpIndex:    1,             // next waypoint to move toward
    });
  }
  return list;
}

// ── Utility: Random Position ──────────────────────────────────
// Returns a random {x, y} inside the canvas, at least minDist from (cx, cy).
function randomPosition(cx, cy, minDist) {
  const margin = 30;
  let x, y;
  do {
    x = margin + Math.random() * (W - margin * 2);
    y = margin + Math.random() * (H - margin * 2);
  } while (dist(x, y, cx, cy) < minDist);
  return { x, y };
}

// ── Utility: Distance ─────────────────────────────────────────
function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Utility: Angle Difference (shortest arc) ─────────────────
// Returns the signed difference between two angles, clamped to [-π, π].
function angleDiff(a, b) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ── Game Loop ─────────────────────────────────────────────────
function gameLoop(timestamp) {
  // Calculate delta time (seconds) — capped at 0.1s to avoid tunnelling
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  if (gameRunning && !gameOver) {
    update(dt);
    drawGame();
  } else if (gameOver) {
    drawGame();        // keep last frame visible under game-over overlay
    drawGameOver();
    return;            // stop the loop — restart via key press
  }

  animFrameId = requestAnimationFrame(gameLoop);
}

// ── Update (master) ───────────────────────────────────────────
function update(dt) {
  updatePlayer(dt);
  updateGuards(dt);
  updateDifficulty(dt);
  detectCollisions();
}

// ── Update: Player ────────────────────────────────────────────
// Player always rotates. Holding the button moves it forward.
function updatePlayer(dt) {
  // Always spin
  player.angle += rotSpeed * dt;

  if (buttonHeld) {
    // Move in the direction currently faced
    player.x += Math.cos(player.angle) * PLAYER_SPEED * dt;
    player.y += Math.sin(player.angle) * PLAYER_SPEED * dt;

    // Clamp to canvas bounds
    player.x = Math.max(PLAYER_RADIUS, Math.min(W - PLAYER_RADIUS, player.x));
    player.y = Math.max(PLAYER_RADIUS, Math.min(H - PLAYER_RADIUS, player.y));
  }
}

// ── Update: Guards ────────────────────────────────────────────
// Each guard walks toward its next waypoint, then advances to the next.
function updateGuards(dt) {
  for (const g of guards) {
    const target = g.waypoints[g.wpIndex];
    const dx = target.x - g.x;
    const dy = target.y - g.y;
    const d  = Math.sqrt(dx * dx + dy * dy);

    if (d < WAYPOINT_RADIUS) {
      // Reached waypoint — advance to the next (wrap around)
      g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
    } else {
      // Move toward target
      g.x    += (dx / d) * GUARD_SPEED * dt;
      g.y    += (dy / d) * GUARD_SPEED * dt;
      g.angle = Math.atan2(dy, dx);  // face the direction of travel
    }
  }
}

// ── Update: Difficulty ────────────────────────────────────────
// Every DIFFICULTY_EVERY ms: bump difficulty.
// Level 2 → faster rotation. Level 3+ → add a guard (max 5).
function updateDifficulty(dt) {
  difficultyTimer += dt * 1000; // convert to ms

  if (difficultyTimer >= DIFFICULTY_EVERY) {
    difficultyTimer = 0;
    difficulty++;

    if (difficulty === 2) {
      // Spin faster
      rotSpeed = BASE_ROT_SPEED * 1.6;
    } else if (difficulty >= 3 && guards.length < 5) {
      // Add another guard
      const extra = spawnGuards(1);
      guards.push(...extra);
    } else if (difficulty > 3) {
      // Keep ramping rotation speed
      rotSpeed = Math.min(BASE_ROT_SPEED * (1 + difficulty * 0.4), 6.0);
    }
  }
}

// ── Collision Detection ───────────────────────────────────────
function detectCollisions() {
  // Coin pickup
  for (const coin of coins) {
    if (!coin.collected && dist(player.x, player.y, coin.x, coin.y) < PLAYER_RADIUS + COIN_RADIUS) {
      coin.collected = true;
      score++;

      // Respawn a new coin elsewhere so there are always coins on the map
      coins.push(randomPosition(player.x, player.y, SAFE_SPAWN_DIST));
    }
  }

  // Guard vision cone — detected = game over
  for (const g of guards) {
    if (isInVisionCone(g, player)) {
      gameOver = true;
      gameRunning = false;
      return;
    }
  }
}

// ── Vision Cone Test ─────────────────────────────────────────
// Returns true if the player is inside the guard's vision cone.
function isInVisionCone(guard, target) {
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const d  = Math.sqrt(dx * dx + dy * dy);

  // First: distance check (outside range = not seen)
  if (d > VISION_RANGE + PLAYER_RADIUS) return false;

  // Second: angle check — is the angle to the player within the cone?
  const angleToTarget = Math.atan2(dy, dx);
  const diff = Math.abs(angleDiff(guard.angle, angleToTarget));

  return diff <= VISION_HALF_ANG;
}

// ── Draw (master) ─────────────────────────────────────────────
function drawGame() {
  // Clear
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, W, H);

  drawGrid();
  drawCoins();
  drawGuards();
  drawPlayer();
  drawHUD();
}

// ── Draw: Subtle Grid ─────────────────────────────────────────
// Gives the canvas a retro terminal look.
function drawGrid() {
  const step = 40;
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth   = 1;

  for (let x = 0; x <= W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

// ── Draw: Player ──────────────────────────────────────────────
// Green circle with a white direction indicator line.
function drawPlayer() {
  // Glow effect via shadow
  ctx.shadowColor = COLOR_PLAYER;
  ctx.shadowBlur  = 15;

  // Body
  ctx.beginPath();
  ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_PLAYER;
  ctx.fill();

  // Direction line (shows where player will move)
  ctx.strokeStyle = COLOR_PLAYER_DIR;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(
    player.x + Math.cos(player.angle) * (PLAYER_RADIUS + 8),
    player.y + Math.sin(player.angle) * (PLAYER_RADIUS + 8)
  );
  ctx.stroke();

  ctx.shadowBlur = 0; // reset shadow
}

// ── Draw: Guards ──────────────────────────────────────────────
// Red square body + semi-transparent vision cone arc.
function drawGuards() {
  for (const g of guards) {
    // ── Vision Cone ──────────────────────────────────────────
    ctx.save();

    // Fill the cone
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.arc(g.x, g.y, VISION_RANGE,
      g.angle - VISION_HALF_ANG,
      g.angle + VISION_HALF_ANG
    );
    ctx.closePath();
    ctx.fillStyle   = COLOR_VISION;
    ctx.fill();

    // Cone outline
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.arc(g.x, g.y, VISION_RANGE,
      g.angle - VISION_HALF_ANG,
      g.angle + VISION_HALF_ANG
    );
    ctx.closePath();
    ctx.strokeStyle = COLOR_VISION_EDGE;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.restore();

    // ── Guard Body ───────────────────────────────────────────
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.angle);

    ctx.shadowColor = COLOR_GUARD;
    ctx.shadowBlur  = 12;

    ctx.fillStyle   = COLOR_GUARD;
    ctx.fillRect(-GUARD_SIZE, -GUARD_SIZE, GUARD_SIZE * 2, GUARD_SIZE * 2);

    // Direction nub (small white rectangle poking out the front)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(GUARD_SIZE - 4, -3, 8, 6);

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ── Draw: Coins ───────────────────────────────────────────────
// Yellow glowing circles.
function drawCoins() {
  for (const coin of coins) {
    if (coin.collected) continue;

    ctx.save();

    // Outer glow
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, COIN_RADIUS + 5, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_COIN_GLOW;
    ctx.fill();

    // Coin body
    ctx.shadowColor = COLOR_COIN;
    ctx.shadowBlur  = 12;
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, COIN_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle   = COLOR_COIN;
    ctx.fill();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(coin.x - 2, coin.y - 2, COIN_RADIUS * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 200, 0.6)';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ── Draw: HUD ─────────────────────────────────────────────────
// Score top-left, difficulty top-right, hold-hint at bottom.
function drawHUD() {
  ctx.font      = '16px "Courier New", monospace';
  ctx.fillStyle = COLOR_HUD;
  ctx.textAlign = 'left';

  // Score
  ctx.fillText(`SCORE: ${score}`, 16, 28);

  // Difficulty level
  ctx.textAlign = 'right';
  ctx.fillText(`LVL: ${difficulty}`, W - 16, 28);

  // Hold hint at the bottom
  ctx.textAlign  = 'center';
  ctx.fillStyle  = 'rgba(0, 255, 136, 0.45)';
  ctx.font       = '13px "Courier New", monospace';
  ctx.fillText('HOLD SPACE / CLICK to move', W / 2, H - 14);
}

// ── Draw: Game Over Overlay ───────────────────────────────────
function drawGameOver() {
  // Dark translucent overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, W, H);

  // "CAUGHT!" heading
  ctx.textAlign   = 'center';
  ctx.shadowColor = COLOR_GAMEOVER;
  ctx.shadowBlur  = 25;
  ctx.fillStyle   = COLOR_GAMEOVER;
  ctx.font        = 'bold 56px "Courier New", monospace';
  ctx.fillText('CAUGHT!', W / 2, H / 2 - 60);

  // Final score
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = '#ffffff';
  ctx.font        = '24px "Courier New", monospace';
  ctx.fillText(`SCORE: ${score}`, W / 2, H / 2);

  // Restart prompt
  ctx.shadowColor = COLOR_HUD;
  ctx.fillStyle   = COLOR_HUD;
  ctx.font        = '18px "Courier New", monospace';
  ctx.fillText('Press  R  to try again', W / 2, H / 2 + 50);

  ctx.shadowBlur  = 0;
}

// ── Input: Keyboard ───────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();      // prevent page scroll
    buttonHeld = true;
  }
  if ((e.key === 'r' || e.key === 'R') && gameOver) {
    init();                  // restart
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    buttonHeld = false;
  }
});

// ── Input: Mouse / Touch ──────────────────────────────────────
canvas.addEventListener('mousedown', () => { buttonHeld = true;  });
canvas.addEventListener('mouseup',   () => { buttonHeld = false; });
canvas.addEventListener('mouseleave',() => { buttonHeld = false; });

// Touch support for mobile
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); buttonHeld = true;  }, { passive: false });
canvas.addEventListener('touchend',   (e) => { e.preventDefault(); buttonHeld = false; }, { passive: false });

// Restart on canvas click when game over
canvas.addEventListener('click', () => {
  if (gameOver) init();
});

// ── Kick Off ──────────────────────────────────────────────────
init();
