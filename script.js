(() => {
  "use strict";

  // =============================
  // Konfiguration
  // =============================
  const CONFIG = {
    world: { width: 900, height: 600 },
    ship: {
      radius: 14,
      turnSpeed: Math.PI * 2.2,
      thrust: 260,
      friction: 0.992,
      maxSpeed: 320,
      invulnerableTime: 1.4,
      fireCooldown: 0.16,
      muzzleFlashTime: 0.06,
    },
    bullet: {
      speed: 520,
      life: 0.95,
      radius: 2,
      maxShots: 8,
    },
    asteroid: {
      baseRadius: 52,
      minRadius: 18,
      vertexCount: { min: 9, max: 15 },
      speed: { min: 25, max: 90 },
      spawnCount: 4,
    },
    gameplay: {
      startingLives: 3,
      hitPause: 0.45,
      respawnDelay: 0.9,
      scoreBySize: {
        large: 20,
        medium: 50,
        small: 100,
      },
    },
  };

  // =============================
  // Globale Spielzustände
  // =============================
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const scoreLabel = document.getElementById("scoreLabel");
  const livesLabel = document.getElementById("livesLabel");
  const statusLabel = document.getElementById("statusLabel");
  const pauseButton = document.getElementById("pauseButton");

  const input = {
    left: false,
    right: false,
    thrust: false,
    shoot: false,
  };

  const game = {
    state: "running", // running | paused | gameover
    score: 0,
    lives: CONFIG.gameplay.startingLives,
    timeScale: 1,
    pauseTimer: 0,
    respawnTimer: 0,
    wave: 1,
    ship: null,
    bullets: [],
    asteroids: [],
    particles: [],
    lastTime: 0,
  };

  // =============================
  // Utility-Funktionen
  // =============================
  const rand = (min, max) => Math.random() * (max - min) + min;

  const wrapPosition = (entity) => {
    if (entity.x < 0) entity.x += CONFIG.world.width;
    if (entity.x >= CONFIG.world.width) entity.x -= CONFIG.world.width;
    if (entity.y < 0) entity.y += CONFIG.world.height;
    if (entity.y >= CONFIG.world.height) entity.y -= CONFIG.world.height;
  };

  const distanceSquared = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  const clampMagnitude = (vx, vy, maxLen) => {
    const len = Math.hypot(vx, vy);
    if (len <= maxLen || len === 0) return { vx, vy };
    const scale = maxLen / len;
    return { vx: vx * scale, vy: vy * scale };
  };

  // =============================
  // Entity-Erzeugung
  // =============================
  function createShip() {
    return {
      x: CONFIG.world.width / 2,
      y: CONFIG.world.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      radius: CONFIG.ship.radius,
      invulnerable: CONFIG.ship.invulnerableTime,
      fireCooldown: 0,
      muzzleFlash: 0,
      active: true,
    };
  }

  function createAsteroid(x, y, radius) {
    const angle = rand(0, Math.PI * 2);
    const speedFactor = (radius / CONFIG.asteroid.baseRadius) * 0.8 + 0.6;
    const speed = rand(CONFIG.asteroid.speed.min, CONFIG.asteroid.speed.max) / speedFactor;

    const vertexCount = Math.floor(
      rand(CONFIG.asteroid.vertexCount.min, CONFIG.asteroid.vertexCount.max + 1)
    );

    const shape = [];
    for (let i = 0; i < vertexCount; i++) {
      shape.push(rand(0.74, 1.18));
    }

    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      angle: rand(0, Math.PI * 2),
      spin: rand(-0.7, 0.7),
      shape,
    };
  }

  function createBullet(ship) {
    const px = ship.x + Math.cos(ship.angle) * (ship.radius + 4);
    const py = ship.y + Math.sin(ship.angle) * (ship.radius + 4);

    return {
      x: px,
      y: py,
      vx: ship.vx + Math.cos(ship.angle) * CONFIG.bullet.speed,
      vy: ship.vy + Math.sin(ship.angle) * CONFIG.bullet.speed,
      life: CONFIG.bullet.life,
      radius: CONFIG.bullet.radius,
    };
  }

  function createExplosion(x, y, amount, color = "#ffd37f") {
    for (let i = 0; i < amount; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(40, 220);
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.18, 0.48),
        maxLife: 0,
        color,
      });
      game.particles[game.particles.length - 1].maxLife = game.particles[game.particles.length - 1].life;
    }
  }

  // =============================
  // Spielinitialisierung
  // =============================
  function startNewGame() {
    game.state = "running";
    game.score = 0;
    game.lives = CONFIG.gameplay.startingLives;
    game.timeScale = 1;
    game.pauseTimer = 0;
    game.respawnTimer = 0;
    game.wave = 1;
    game.ship = createShip();
    game.bullets = [];
    game.asteroids = [];
    game.particles = [];

    spawnWave(CONFIG.asteroid.spawnCount);
    setPauseButtonLabel();
    setStatus("Status: Bereit");
    updateHud();
  }

  function spawnWave(count) {
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      do {
        x = rand(0, CONFIG.world.width);
        y = rand(0, CONFIG.world.height);
      } while (Math.hypot(x - game.ship.x, y - game.ship.y) < 140);

      game.asteroids.push(createAsteroid(x, y, CONFIG.asteroid.baseRadius));
    }
  }

  // =============================
  // Input Handling
  // =============================
  function bindInput() {
    const handle = (isDown, event) => {
      const key = event.code;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "Enter"].includes(key)) {
        event.preventDefault();
      }

      if (key === "ArrowLeft") input.left = isDown;
      if (key === "ArrowRight") input.right = isDown;
      if (key === "ArrowUp") input.thrust = isDown;
      if (key === "Space") input.shoot = isDown;

      if (isDown && key === "Enter" && game.state === "gameover") {
        startNewGame();
      }
    };

    window.addEventListener("keydown", (event) => handle(true, event));
    window.addEventListener("keyup", (event) => handle(false, event));
    pauseButton.addEventListener("click", togglePause);
  }

  function togglePause() {
    if (game.state === "gameover") return;
    game.state = game.state === "paused" ? "running" : "paused";

    if (game.state === "paused") {
      setStatus("Status: Pausiert");
    } else {
      setStatus(`Status: Welle ${game.wave}`);
    }
    setPauseButtonLabel();
  }

  function setPauseButtonLabel() {
    pauseButton.textContent = game.state === "paused" ? "Fortsetzen" : "Pause";
  }

  // =============================
  // Update-Schritte
  // =============================
  function update(dt) {
    if (game.state !== "running") return;

    if (game.pauseTimer > 0) {
      game.pauseTimer -= dt;
      dt *= 0.25;
      if (game.pauseTimer <= 0) {
        game.timeScale = 1;
      }
    }

    updateShip(dt);
    updateBullets(dt);
    updateAsteroids(dt);
    updateParticles(dt);
    handleCollisions();
    handleWaveProgress();
    updateHud();
  }

  function updateShip(dt) {
    const ship = game.ship;
    if (!ship.active) {
      game.respawnTimer -= dt;
      if (game.respawnTimer <= 0 && game.lives > 0) {
        game.ship = createShip();
      }
      return;
    }

    if (input.left) ship.angle -= CONFIG.ship.turnSpeed * dt;
    if (input.right) ship.angle += CONFIG.ship.turnSpeed * dt;

    if (input.thrust) {
      ship.vx += Math.cos(ship.angle) * CONFIG.ship.thrust * dt;
      ship.vy += Math.sin(ship.angle) * CONFIG.ship.thrust * dt;
      ship.muzzleFlash = Math.max(ship.muzzleFlash, CONFIG.ship.muzzleFlashTime * 0.7);
    }

    const clamped = clampMagnitude(ship.vx, ship.vy, CONFIG.ship.maxSpeed);
    ship.vx = clamped.vx * CONFIG.ship.friction;
    ship.vy = clamped.vy * CONFIG.ship.friction;

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    wrapPosition(ship);

    ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
    ship.muzzleFlash = Math.max(0, ship.muzzleFlash - dt);

    if (input.shoot && ship.fireCooldown <= 0 && game.bullets.length < CONFIG.bullet.maxShots) {
      game.bullets.push(createBullet(ship));
      ship.fireCooldown = CONFIG.ship.fireCooldown;
      ship.muzzleFlash = CONFIG.ship.muzzleFlashTime;
    }
  }

  function updateBullets(dt) {
    for (const bullet of game.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      wrapPosition(bullet);
      bullet.life -= dt;
    }

    game.bullets = game.bullets.filter((bullet) => bullet.life > 0);
  }

  function updateAsteroids(dt) {
    for (const asteroid of game.asteroids) {
      asteroid.x += asteroid.vx * dt;
      asteroid.y += asteroid.vy * dt;
      asteroid.angle += asteroid.spin * dt;
      wrapPosition(asteroid);
    }
  }

  function updateParticles(dt) {
    for (const p of game.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.life -= dt;
      wrapPosition(p);
    }

    game.particles = game.particles.filter((p) => p.life > 0);
  }

  // =============================
  // Kollisionen & Entity-Management
  // =============================
  function handleCollisions() {
    // Kugeln auf Asteroiden
    for (let bi = game.bullets.length - 1; bi >= 0; bi--) {
      const bullet = game.bullets[bi];
      let hit = false;

      for (let ai = game.asteroids.length - 1; ai >= 0; ai--) {
        const asteroid = game.asteroids[ai];
        const hitRadius = asteroid.radius + bullet.radius;

        if (distanceSquared(bullet, asteroid) <= hitRadius * hitRadius) {
          splitAsteroid(ai);
          game.bullets.splice(bi, 1);
          createExplosion(bullet.x, bullet.y, 10, "#ffee9f");
          hit = true;
          break;
        }
      }

      if (hit) continue;
    }

    // Schiff auf Asteroiden
    const ship = game.ship;
    if (!ship.active || ship.invulnerable > 0) return;

    for (const asteroid of game.asteroids) {
      const r = ship.radius + asteroid.radius * 0.78;
      if (distanceSquared(ship, asteroid) <= r * r) {
        onShipHit();
        break;
      }
    }
  }

  function splitAsteroid(index) {
    const asteroid = game.asteroids[index];
    game.asteroids.splice(index, 1);

    const nextRadius = asteroid.radius * 0.58;
    let gained = CONFIG.gameplay.scoreBySize.large;

    if (asteroid.radius <= CONFIG.asteroid.baseRadius * 0.62) gained = CONFIG.gameplay.scoreBySize.medium;
    if (asteroid.radius <= CONFIG.asteroid.baseRadius * 0.38) gained = CONFIG.gameplay.scoreBySize.small;
    game.score += gained;

    if (nextRadius >= CONFIG.asteroid.minRadius) {
      for (let i = 0; i < 2; i++) {
        const child = createAsteroid(asteroid.x, asteroid.y, nextRadius);
        child.vx += asteroid.vx * 0.3;
        child.vy += asteroid.vy * 0.3;
        game.asteroids.push(child);
      }
    }
  }

  function onShipHit() {
    const ship = game.ship;
    ship.active = false;
    game.lives -= 1;
    createExplosion(ship.x, ship.y, 28, "#ff8a8a");
    game.pauseTimer = CONFIG.gameplay.hitPause;
    game.respawnTimer = CONFIG.gameplay.respawnDelay;

    if (game.lives <= 0) {
      game.state = "gameover";
      setStatus("Status: Game Over (Enter für Neustart)");
    } else {
      setStatus("Status: Treffer! Respawn...");
    }
  }

  function handleWaveProgress() {
    if (game.asteroids.length > 0 || game.state !== "running") return;

    game.wave += 1;
    const count = CONFIG.asteroid.spawnCount + Math.min(5, game.wave - 1);
    spawnWave(count);
    setStatus(`Status: Welle ${game.wave}`);
  }

  // =============================
  // Rendering
  // =============================
  function render() {
    drawBackground();
    drawAsteroids();
    drawBullets();
    drawShip();
    drawParticles();

    if (game.state === "gameover") {
      drawGameOverOverlay();
    }
    if (game.state === "paused") {
      drawPauseOverlay();
    }
  }

  function drawBackground() {
    ctx.clearRect(0, 0, CONFIG.world.width, CONFIG.world.height);
    ctx.fillStyle = "#04070f";
    ctx.fillRect(0, 0, CONFIG.world.width, CONFIG.world.height);

    // Kleine statische Sterne für Retro-Feeling
    ctx.fillStyle = "#9db8ff";
    for (let i = 0; i < 85; i++) {
      const x = (i * 97) % CONFIG.world.width;
      const y = (i * 191) % CONFIG.world.height;
      const alpha = (Math.sin(i * 7.23) + 1) * 0.16 + 0.12;
      ctx.globalAlpha = alpha;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawShip() {
    const ship = game.ship;
    if (!ship.active) return;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    const blink = ship.invulnerable > 0 ? Math.sin(performance.now() * 0.025) > 0 : true;
    if (!blink) {
      ctx.restore();
      return;
    }

    ctx.strokeStyle = "#d7ffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ship.radius + 2, 0);
    ctx.lineTo(-ship.radius * 0.8, ship.radius * 0.75);
    ctx.lineTo(-ship.radius * 0.34, 0);
    ctx.lineTo(-ship.radius * 0.8, -ship.radius * 0.75);
    ctx.closePath();
    ctx.stroke();

    // Schub- bzw. Mündungs-Effekt
    if (input.thrust || ship.muzzleFlash > 0) {
      ctx.strokeStyle = "#ffb867";
      ctx.beginPath();
      const flare = ship.radius + rand(4, 11);
      ctx.moveTo(-ship.radius * 0.88, 0);
      ctx.lineTo(-flare, rand(-4, 4));
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawAsteroids() {
    ctx.strokeStyle = "#8cb0d4";
    ctx.lineWidth = 2;

    for (const asteroid of game.asteroids) {
      ctx.save();
      ctx.translate(asteroid.x, asteroid.y);
      ctx.rotate(asteroid.angle);

      const step = (Math.PI * 2) / asteroid.shape.length;
      ctx.beginPath();
      asteroid.shape.forEach((distortion, i) => {
        const a = i * step;
        const r = asteroid.radius * distortion;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.fillStyle = "#fff6cf";
    for (const bullet of game.bullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 2.3, 2.3);
    }
    ctx.globalAlpha = 1;
  }

  function drawGameOverOverlay() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.fillRect(0, 0, CONFIG.world.width, CONFIG.world.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff8383";
    ctx.font = "bold 56px 'Trebuchet MS', sans-serif";
    ctx.fillText("GAME OVER", CONFIG.world.width / 2, CONFIG.world.height / 2 - 16);

    ctx.fillStyle = "#dbe9ff";
    ctx.font = "24px 'Trebuchet MS', sans-serif";
    ctx.fillText(`Finaler Score: ${game.score}`, CONFIG.world.width / 2, CONFIG.world.height / 2 + 32);

    ctx.fillStyle = "#9dd6ff";
    ctx.font = "18px 'Trebuchet MS', sans-serif";
    ctx.fillText("Drücke Enter für Neustart", CONFIG.world.width / 2, CONFIG.world.height / 2 + 70);
  }

  function drawPauseOverlay() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, CONFIG.world.width, CONFIG.world.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#9dd6ff";
    ctx.font = "bold 46px 'Trebuchet MS', sans-serif";
    ctx.fillText("PAUSE", CONFIG.world.width / 2, CONFIG.world.height / 2);
  }

  // =============================
  // HUD / Status
  // =============================
  function updateHud() {
    scoreLabel.textContent = `Score: ${game.score}`;
    livesLabel.textContent = `Leben: ${Math.max(game.lives, 0)}`;
    if (game.state === "running" && game.ship.active && game.ship.invulnerable <= 0) {
      statusLabel.textContent = `Status: Welle ${game.wave}`;
    }
  }

  function setStatus(text) {
    statusLabel.textContent = text;
  }

  // =============================
  // Game Loop
  // =============================
  function gameLoop(timestamp) {
    if (!game.lastTime) game.lastTime = timestamp;

    const dt = Math.min(0.033, (timestamp - game.lastTime) / 1000);
    game.lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
  }

  // =============================
  // Start
  // =============================
  function init() {
    canvas.width = CONFIG.world.width;
    canvas.height = CONFIG.world.height;
    bindInput();
    startNewGame();
    requestAnimationFrame(gameLoop);
  }

  init();
})();
