/**
 * Zombie Defender - Core Game Logic
 * Using Phaser 3.60.0
 */

// Game Configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// Global State
const gameState = {
    gold: 0,
    wave: 1,
    difficultyScale: 1,
    baseHp: 100,
    baseMaxHp: 100,
    playerHp: 100,
    playerMaxHp: 100,
    playerSpeed: 200,
    fireRate: 400, // ms between shots
    bulletDamage: 1,
    bulletSpeed: 600,
    lastFired: 0,
    isPaused: false,
    zombieSpeed: 60,
    zombieMaxHP: 2,
    spawnRate: 2000,
    upgrades: {
        fireRate: 1,
        damage: 1,
        fortify: 1
    }
};

// UI Elements (updated to match new index.html)
const ui = {
    gold: document.getElementById('credit-count'),
    playerHpBar: document.getElementById('player-hp-bar'),
    baseHpBar: document.getElementById('base-hp-bar'),
    wave: document.getElementById('wave-number'),
    shop: document.getElementById('shop-menu'),
    costs: {
        fireRate: document.getElementById('cost-fire-rate'),
        damage: document.getElementById('cost-damage'),
        repair: document.getElementById('cost-repair'),
        fortify: document.getElementById('cost-fortify')
    },
    lvls: {
        fireRate: document.getElementById('lvl-fire-rate'),
        damage: document.getElementById('lvl-damage'),
        fortify: document.getElementById('lvl-fortify')
    }
};

const game = new Phaser.Game(config);
let player, base, zombies, bullets, cursors, keys, lastWaveTime;

function preload() {
    // No external assets required as per instructions
}

function create() {
    // 1. Background (Grid effect for depth)
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1a1a1a);
    for (let i = 0; i < 800; i += 40) {
        graphics.moveTo(i, 0);
        graphics.lineTo(i, 600);
    }
    for (let j = 0; j < 600; j += 40) {
        graphics.moveTo(0, j);
        graphics.lineTo(800, j);
    }
    graphics.strokePath();

    // 2. Base (Central Core)
    base = this.add.rectangle(400, 300, 60, 60, 0x33aaff);
    this.physics.add.existing(base, true); // Static body
    base.setStrokeStyle(4, 0x00ff88);

    // 3. Player (Hero)
    player = this.add.circle(400, 400, 15, 0x00ff88);
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);

    // 4. Groups
    bullets = this.physics.add.group({
        defaultKey: 'bullet', // Not using textures, but group needs to know it's physics-based
        maxSize: 50
    });

    zombies = this.physics.add.group();

    // 5. Input
    cursors = this.input.keyboard.createCursorKeys();
    keys = this.input.keyboard.addKeys('W,A,S,D,P');

    // 6. Collisions
    this.physics.add.collider(player, base);
    this.physics.add.overlap(bullets, zombies, damageZombie, null, this);
    // Overlap checks for damage logic
    this.physics.add.overlap(zombies, base, zombieDamageBase, null, this);
    this.physics.add.overlap(zombies, player, zombieDamagePlayer, null, this);

    // 7. Difficulty Scaling (Every 60s)
    lastWaveTime = this.time.now;
    this.time.addEvent({
        delay: 60000,
        callback: scaleDifficulty,
        callbackScope: this,
        loop: true
    });

    // 8. Zombie Spawn Loop
    this.spawnTimer = this.time.addEvent({
        delay: 2000,
        callback: spawnZombie,
        callbackScope: this,
        loop: true
    });

    // UI Setup
    setupShopListeners();
}

function update(time, delta) {
    if (gameState.isPaused) return;

    // Player Movement
    player.body.setVelocity(0);
    let vx = 0;
    let vy = 0;

    if (keys.W.isDown || cursors.up.isDown) vy = -gameState.playerSpeed;
    else if (keys.S.isDown || cursors.down.isDown) vy = gameState.playerSpeed;

    if (keys.A.isDown || cursors.left.isDown) vx = -gameState.playerSpeed;
    else if (keys.D.isDown || cursors.right.isDown) vx = gameState.playerSpeed;

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
        vx *= 0.7071;
        vy *= 0.7071;
    }
    player.body.setVelocity(vx, vy);

    // Shooting
    if (this.input.activePointer.isDown && time > gameState.lastFired) {
        fireBullet.call(this);
        gameState.lastFired = time + gameState.fireRate;
    }

    // AI Logic (Zombies move towards center/player)
    zombies.children.iterate((zombie) => {
        if (!zombie || !zombie.active) return;
        const target = (Phaser.Math.Distance.Between(zombie.x, zombie.y, player.x, player.y) < 150) ? player : base;
        this.physics.moveToObject(zombie, target, gameState.zombieSpeed);
    });

    // Pause Check
    if (Phaser.Input.Keyboard.JustDown(keys.P)) {
        toggleShop();
    }
}

// --- Game Functions ---

function spawnZombie() {
    if (gameState.isPaused) return;

    // Pick a side (Top, Bottom, Left, Right)
    const side = Phaser.Math.Between(0, 3);
    let x, y;
    if (side === 0) { x = Phaser.Math.Between(0, 800); y = -50; }
    else if (side === 1) { x = Phaser.Math.Between(0, 800); y = 650; }
    else if (side === 2) { x = -50; y = Phaser.Math.Between(0, 600); }
    else { x = 850; y = Phaser.Math.Between(0, 600); }

    const zombieSize = 12;
    const zombie = this.add.circle(x, y, zombieSize, 0xff0055);
    this.physics.add.existing(zombie);
    zombie.hp = gameState.zombieMaxHP;
    zombie.lastDamageTime = 0; // For continuous damage tracking
    zombie.setStrokeStyle(2, 0xffffff);
    zombies.add(zombie);
}

function fireBullet() {
    const pointer = this.input.activePointer;
    const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);

    // Criar o projétil
    const bullet = this.add.circle(player.x, player.y, 5, 0xffff00);
    this.physics.add.existing(bullet);

    // Aplicar velocidade baseada na rotação (Correção Gemini)
    this.physics.velocityFromRotation(angle, gameState.bulletSpeed, bullet.body.velocity);

    // Destruição automática para evitar memory leak
    this.time.addEvent({
        delay: 2000,
        callback: () => {
            if (bullet) bullet.destroy();
        }
    });

    bullets.add(bullet);
}

function damageZombie(bullet, zombie) {
    bullet.destroy();
    zombie.hp -= gameState.bulletDamage;

    // Visual feedback
    flashRed(this, zombie);

    if (zombie.hp <= 0) {
        gameState.gold += 20;
        updateUI();
        zombie.destroy();
    }
}

function flashRed(scene, target) {
    if (target.isFlashing) return;
    target.isFlashing = true;
    const originalFill = target.fillColor;
    target.fillColor = 0xff3333;
    scene.tweens.add({
        targets: target,
        alpha: 0.5,
        duration: 100,
        yoyo: true,
        onComplete: () => {
            target.fillColor = originalFill;
            target.alpha = 1;
            target.isFlashing = false;
        }
    });
}

function zombieDamageBase(baseObj, zombie) {
    // Continuous damage: 10 HP per second
    // delta time approx 16.6ms, 10/60 = 0.166 per frame?
    // Better: use a timestamp
    const now = game.loop.time;
    if (now > zombie.lastDamageTime + 1000) {
        gameState.baseHp -= 10;
        zombie.lastDamageTime = now;
        flashRed(this, base);
        this.cameras.main.shake(100, 0.005);
        updateUI();

        if (gameState.baseHp <= 0) {
            gameOver.call(this);
        }
    }
}

function zombieDamagePlayer(playerObj, zombie) {
    const now = game.loop.time;
    if (now > zombie.lastDamageTime + 1000) {
        gameState.playerHp -= 10;
        zombie.lastDamageTime = now;
        flashRed(this, player);
        updateUI();

        if (gameState.playerHp <= 0) {
            gameOver.call(this);
        }
    }
}

// Removed old collision handlers as they are replaced by zombieDamage functions above.

function scaleDifficulty() {
    gameState.wave++;
    gameState.zombieSpeed += 5;
    gameState.zombieMaxHP += 10;
    gameState.spawnRate = Math.max(200, gameState.spawnRate - 100);
    this.spawnTimer.delay = gameState.spawnRate;
    updateUI();
}

function updateUI() {
    ui.gold.innerText = gameState.gold;
    ui.wave.innerText = gameState.wave;

    const baseHpPercent = (gameState.baseHp / gameState.baseMaxHp) * 100;
    ui.baseHpBar.style.width = Math.max(0, baseHpPercent) + '%';

    const playerHpPercent = (gameState.playerHp / gameState.playerMaxHp) * 100;
    ui.playerHpBar.style.width = Math.max(0, playerHpPercent) + '%';

    // Visual alerts for base
    if (baseHpPercent < 30) ui.baseHpBar.style.background = '#ff0000';
    else ui.baseHpBar.style.background = 'linear-gradient(90deg, #33aaff, #00ff88)';
}

function gameOver() {
    this.physics.pause();
    gameState.isPaused = true;
    const overText = this.add.text(400, 300, 'GAME OVER', {
        fontFamily: 'Orbitron', fontSize: '64px', fill: '#ff0055'
    }).setOrigin(0.5);

    this.add.text(400, 380, 'Clique para Reiniciar', {
        fontFamily: 'Orbitron', fontSize: '24px', fill: '#fff'
    }).setOrigin(0.5);

    this.input.on('pointerdown', () => {
        window.location.reload();
    });
}

// --- Shop Logic ---

function toggleShop() {
    gameState.isPaused = !gameState.isPaused;
    if (gameState.isPaused) {
        ui.shop.classList.add('active');
        game.scene.scenes[0].physics.pause();
    } else {
        ui.shop.classList.remove('active');
        game.scene.scenes[0].physics.resume();
    }
}

function setupShopListeners() {
    document.getElementById('btn-close-shop').onclick = toggleShop;

    document.getElementById('upgrade-fire-rate').onclick = () => {
        const cost = 100 * gameState.upgrades.fireRate;
        if (gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.upgrades.fireRate++;
            gameState.fireRate = Math.max(80, 400 - (gameState.upgrades.fireRate * 40));
            ui.lvls.fireRate.innerText = 'LVL ' + gameState.upgrades.fireRate;
            ui.costs.fireRate.innerText = 100 * gameState.upgrades.fireRate;
            updateUI();
        }
    };

    document.getElementById('upgrade-damage').onclick = () => {
        const cost = 150 * gameState.upgrades.damage;
        if (gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.upgrades.damage++;
            gameState.bulletDamage += 1;
            gameState.bulletSpeed += 50; // Extra speed!
            ui.lvls.damage.innerText = 'LVL ' + gameState.upgrades.damage;
            ui.costs.damage.innerText = 150 * gameState.upgrades.damage;
            updateUI();
        }
    };

    document.getElementById('fortify-base').onclick = () => {
        const cost = 300 * gameState.upgrades.fortify;
        if (gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.upgrades.fortify++;
            gameState.baseMaxHp += 50;
            gameState.baseHp += 50; // Increase current too
            ui.lvls.fortify.innerText = 'LVL ' + gameState.upgrades.fortify;
            ui.costs.fortify.innerText = 300 * gameState.upgrades.fortify;
            updateUI();
        }
    };

    document.getElementById('repair-base').onclick = () => {
        const cost = 150;
        if (gameState.gold >= cost && gameState.baseHp < gameState.baseMaxHp) {
            gameState.gold -= cost;
            gameState.baseHp = Math.min(gameState.baseMaxHp, gameState.baseHp + Math.floor(gameState.baseMaxHp * 0.25));
            updateUI();
        }
    };
}
