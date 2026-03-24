(() => {
  "use strict";

  // =====================
  // DOM + Konfiguration
  // =====================
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const scoreLabel = document.getElementById("scoreLabel");
  const livesLabel = document.getElementById("livesLabel");
  const statusLabel = document.getElementById("statusLabel");
  const pauseButton = document.getElementById("pauseButton");

  if (!canvas || !ctx) {
    console.error("Canvas konnte nicht initialisiert werden.");
    return;
  }

  const WORLD_W = 900;
  const WORLD_H = 600;

  const SHIP_RADIUS = 14;
  const SHIP_TURN = Math.PI * 2.25;
  const SHIP_THRUST = 270;
  const SHIP_MAX_SPEED = 330;
  const SHIP_FRICTION = 0.992;
  const SHIP_SPAWN_INVUL = 1.2;

  const BULLET_SPEED = 560;
  const BULLET_LIFE = 0.95;
  const BULLET_MAX = 8;
  const FIRE_COOLDOWN = 0.14;

  const ASTEROID_BASE = 52;
  const ASTEROID_MIN = 17;

  const START_LIVES = 3;

  // =====================
  // Zustand
  // =====================
  const keys = {
    left: false,
    right: false,
    thrust: false,
    shoot: false,
  };

  const state = {
    mode: "running", // running | paused | gameover
    score: 0,
    lives: START_LIVES,
    wave: 1,
    ship: null,
    asteroids: [],
    bullets: [],
    particles: [],
    fireCooldown: 0,
    respawnTimer: 0,
    lastTime: 0,
  };

  // =====================
  // Utility
  // =====================
  const rnd = (min, max) => Math.random() * (max - min) + min;

  function wrap(entity) {
    if (entity.x < 0) entity.x += WORLD_W;
    if (entity.x >= WORLD_W) entity.x -= WORLD_W;
    if (entity.y < 0) entity.y += WORLD_H;
    if (entity.y >= WORLD_H) entity.y -= WORLD_H;
  }

  function dist2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function clampVelocity(entity, maxSpeed) {
    const len = Math.hypot(entity.vx, entity.vy);
    if (!len || len <= maxSpeed) return;
    const f = maxSpeed / len;
    entity.vx *= f;
    entity.vy *= f;
  }

  // =====================
  // Entity Factory
  // =====================
  function createShip() {
    return {
      x: WORLD_W / 2,
      y: WORLD_H / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      radius: SHIP_RADIUS,
      invul: SHIP_SPAWN_INVUL,
      active: true,
    };
  }

  function createAsteroid(x, y, radius) {
    const dir = rnd(0, Math.PI * 2);
    const speed = rnd(25, 90) * (ASTEROID_BASE / radius) * 0.7;
    const count = Math.floor(rnd(9, 15));
    const shape = [];
    for (let i = 0; i < count; i++) shape.push(rnd(0.74, 1.2));

    return {
      x,
      y,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      radius,
      rotation: rnd(0, Math.PI * 2),
      spin: rnd(-0.8, 0.8),
      shape,
    };
  }

  function createBullet(ship) {
    return {
      x: ship.x + Math.cos(ship.angle) * (ship.radius + 4),
      y: ship.y + Math.sin(ship.angle) * (ship.radius + 4),
      vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
      vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
      r: 2,
      life: BULLET_LIFE,
    };
  }

  function addExplosion(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(40, 220);
      const life = rnd(0.15, 0.45);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        maxLife: life,
        color,
      });
    }
  }

  // =====================
  // Spielstart / Reset
  // =====================
  function resetGame() {
    state.mode = "running";
    state.score = 0;
    state.lives = START_LIVES;
    state.wave = 1;
    state.ship = createShip();
    state.asteroids = [];
    state.bullets = [];
    state.particles = [];
    state.fireCooldown = 0;
    state.respawnTimer = 0;

    spawnWave(4);
    setPauseText();
    setStatus("Status: Bereit");
    updateHud();
  }

  function spawnWave(count) {
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      do {
        x = rnd(0, WORLD_W);
        y = rnd(0, WORLD_H);
      } while (Math.hypot(x - state.ship.x, y - state.ship.y) < 140);

      state.asteroids.push(createAsteroid(x, y, ASTEROID_BASE));
    }
  }

  // =====================
  // Input
  // =====================
  function bindInput() {
    function keyHandler(down, e) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "Enter"].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === "ArrowLeft") keys.left = down;
      if (e.code === "ArrowRight") keys.right = down;
      if (e.code === "ArrowUp") keys.thrust = down;
      if (e.code === "Space") keys.shoot = down;

      if (down && e.code === "Enter" && state.mode === "gameover") {
        resetGame();
      }
    }

    window.addEventListener("keydown", (e) => keyHandler(true, e));
    window.addEventListener("keyup", (e) => keyHandler(false, e));
    pauseButton.addEventListener("click", togglePause);
  }

  function togglePause() {
    if (state.mode === "gameover") return;
    state.mode = state.mode === "paused" ? "running" : "paused";
    setPauseText();
    if (state.mode === "paused") setStatus("Status: Pausiert");
    else setStatus(`Status: Welle ${state.wave}`);
  }

  function setPauseText() {
    pauseButton.textContent = state.mode === "paused" ? "Fortsetzen" : "Pause";
  }

  // =====================
  // Update
  // =====================
  function update(dt) {
    if (state.mode !== "running") return;

    updateShip(dt);
    updateBullets(dt);
    updateAsteroids(dt);
    updateParticles(dt);
    collisions();

    if (!state.asteroids.length) {
      state.wave += 1;
      spawnWave(Math.min(9, 4 + state.wave - 1));
      setStatus(`Status: Welle ${state.wave}`);
    }

    updateHud();
  }

  function updateShip(dt) {
    const ship = state.ship;

    if (!ship.active) {
      state.respawnTimer -= dt;
      if (state.respawnTimer <= 0 && state.lives > 0) {
        state.ship = createShip();
      }
      return;
    }

    if (keys.left) ship.angle -= SHIP_TURN * dt;
    if (keys.right) ship.angle += SHIP_TURN * dt;

    if (keys.thrust) {
      ship.vx += Math.cos(ship.angle) * SHIP_THRUST * dt;
      ship.vy += Math.sin(ship.angle) * SHIP_THRUST * dt;
    }

    clampVelocity(ship, SHIP_MAX_SPEED);
    ship.vx *= SHIP_FRICTION;
    ship.vy *= SHIP_FRICTION;

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    wrap(ship);

    ship.invul = Math.max(0, ship.invul - dt);

    state.fireCooldown = Math.max(0, state.fireCooldown - dt);
    if (keys.shoot && state.fireCooldown === 0 && state.bullets.length < BULLET_MAX) {
      state.bullets.push(createBullet(ship));
      state.fireCooldown = FIRE_COOLDOWN;
    }
  }

  function updateBullets(dt) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      wrap(b);
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  function updateAsteroids(dt) {
    for (const a of state.asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rotation += a.spin * dt;
      wrap(a);
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.life -= dt;
      wrap(p);
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  // =====================
  // Kollisionen
  // =====================
  function collisions() {
    // Bullet vs asteroid
    for (let bi = state.bullets.length - 1; bi >= 0; bi--) {
      const b = state.bullets[bi];
      for (let ai = state.asteroids.length - 1; ai >= 0; ai--) {
        const a = state.asteroids[ai];
        const r = b.r + a.radius;
        if (dist2(b, a) <= r * r) {
          state.bullets.splice(bi, 1);
          splitAsteroid(ai);
          addExplosion(b.x, b.y, 10, "#ffe48a");
          break;
        }
      }
    }

    // Ship vs asteroid
    const ship = state.ship;
    if (!ship.active || ship.invul > 0) return;

    for (const a of state.asteroids) {
      const r = ship.radius + a.radius * 0.78;
      if (dist2(ship, a) <= r * r) {
        onShipHit();
        break;
      }
    }
  }

  function splitAsteroid(index) {
    const a = state.asteroids[index];
    state.asteroids.splice(index, 1);

    if (a.radius > ASTEROID_BASE * 0.62) state.score += 20;
    else if (a.radius > ASTEROID_BASE * 0.38) state.score += 50;
    else state.score += 100;

    const next = a.radius * 0.58;
    if (next >= ASTEROID_MIN) {
      for (let i = 0; i < 2; i++) {
        const child = createAsteroid(a.x, a.y, next);
        child.vx += a.vx * 0.25;
        child.vy += a.vy * 0.25;
        state.asteroids.push(child);
      }
    }
  }

  function onShipHit() {
    state.ship.active = false;
    state.lives -= 1;
    state.respawnTimer = 0.9;
    addExplosion(state.ship.x, state.ship.y, 24, "#ff8888");

    if (state.lives <= 0) {
      state.mode = "gameover";
      setStatus("Status: Game Over (Enter für Neustart)");
    } else {
      setStatus("Status: Treffer! Respawn...");
    }
  }

  // =====================
  // Render
  // =====================
  function render() {
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);

    // Hintergrund
    ctx.fillStyle = "#050914";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = "#9fb4e9";
    for (let i = 0; i < 90; i++) {
      const x = (i * 97) % WORLD_W;
      const y = (i * 191) % WORLD_H;
      ctx.globalAlpha = (Math.sin(i * 6.3) + 1) * 0.14 + 0.1;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    drawAsteroids();
    drawBullets();
    drawShip();
    drawParticles();

    if (state.mode === "paused") drawPauseOverlay();
    if (state.mode === "gameover") drawGameOverOverlay();
  }

  function drawShip() {
    const s = state.ship;
    if (!s.active) return;

    const visible = s.invul > 0 ? Math.sin(performance.now() * 0.03) > 0 : true;
    if (!visible) return;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);

    ctx.strokeStyle = "#ddffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.radius + 2, 0);
    ctx.lineTo(-s.radius * 0.8, s.radius * 0.75);
    ctx.lineTo(-s.radius * 0.3, 0);
    ctx.lineTo(-s.radius * 0.8, -s.radius * 0.75);
    ctx.closePath();
    ctx.stroke();

    if (keys.thrust) {
      ctx.strokeStyle = "#ffb967";
      ctx.beginPath();
      ctx.moveTo(-s.radius * 0.85, 0);
      ctx.lineTo(-s.radius - rnd(6, 12), rnd(-4, 4));
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawAsteroids() {
    ctx.strokeStyle = "#8eb0d8";
    ctx.lineWidth = 2;

    for (const a of state.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);

      const step = (Math.PI * 2) / a.shape.length;
      ctx.beginPath();
      for (let i = 0; i < a.shape.length; i++) {
        const rad = a.radius * a.shape[i];
        const x = Math.cos(step * i) * rad;
        const y = Math.sin(step * i) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.fillStyle = "#fff2cb";
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 2.5, 2.5);
    }
    ctx.globalAlpha = 1;
  }

  function drawPauseOverlay() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = "#9fd6ff";
    ctx.textAlign = "center";
    ctx.font = "bold 48px Arial";
    ctx.fillText("PAUSE", WORLD_W / 2, WORLD_H / 2);
  }

  function drawGameOverOverlay() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff8f8f";
    ctx.font = "bold 56px Arial";
    ctx.fillText("GAME OVER", WORLD_W / 2, WORLD_H / 2 - 20);

    ctx.fillStyle = "#dfedff";
    ctx.font = "24px Arial";
    ctx.fillText(`Finaler Score: ${state.score}`, WORLD_W / 2, WORLD_H / 2 + 28);

    ctx.fillStyle = "#a8d8ff";
    ctx.font = "18px Arial";
    ctx.fillText("Drücke Enter für Neustart", WORLD_W / 2, WORLD_H / 2 + 65);
  }

  // =====================
  // HUD / Loop
  // =====================
  function updateHud() {
    scoreLabel.textContent = `Score: ${state.score}`;
    livesLabel.textContent = `Leben: ${Math.max(0, state.lives)}`;
    if (state.mode === "running" && state.ship.active && state.ship.invul <= 0) {
      statusLabel.textContent = `Status: Welle ${state.wave}`;
    }
  }

  function setStatus(text) {
    statusLabel.textContent = text;
  }

  function loop(ts) {
    if (!state.lastTime) state.lastTime = ts;
    const dt = Math.min(0.033, (ts - state.lastTime) / 1000);
    state.lastTime = ts;

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  function init() {
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    bindInput();
    resetGame();
    requestAnimationFrame(loop);
  }

  init();
})();
