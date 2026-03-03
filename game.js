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
    credits: 0,
    wave: 1,
    difficultyScale: 1,
    baseHp: 100,
    baseMaxHp: 100,
    playerSpeed: 200,
    fireRate: 400, // ms between shots
    damage: 1,
    lastFired: 0,
    isPaused: false,
    upgrades: {
        fireRate: 1,
        damage: 1,
        speed: 1
    }
};

// UI Elements
const ui = {
    credits: document.getElementById('credit-count'),
    baseHpBar: document.getElementById('base-hp-bar'),
    wave: document.getElementById('wave-number'),
    shop: document.getElementById('shop-menu'),
    costs: {
        fireRate: document.getElementById('cost-fire-rate'),
        damage: document.getElementById('cost-damage'),
        speed: document.getElementById('cost-speed'),
        repair: document.getElementById('cost-repair')
    },
    lvls: {
        fireRate: document.getElementById('lvl-fire-rate'),
        damage: document.getElementById('lvl-damage'),
        speed: document.getElementById('lvl-speed')
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
        classType: Phaser.GameObjects.Arc,
        runChildUpdate: true
    });

    zombies = this.physics.add.group();

    // 5. Input
    cursors = this.input.keyboard.createCursorKeys();
    keys = this.input.keyboard.addKeys('W,A,S,D,P');

    // 6. Collisions
    this.physics.add.collider(player, base);
    this.physics.add.overlap(bullets, zombies, hitZombie, null, this);
    this.physics.add.overlap(zombies, base, zombieHitBase, null, this);
    this.physics.add.overlap(player, zombies, zombieHitPlayer, null, this);

    // 7. Difficulty Scaling (Every 30s)
    lastWaveTime = this.time.now;
    this.time.addEvent({
        delay: 30000,
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
        if (!zombie) return;
        const target = (Phaser.Math.Distance.Between(zombie.x, zombie.y, player.x, player.y) < 150) ? player : base;
        this.physics.moveToObject(zombie, target, 60 * gameState.difficultyScale);
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

    const zombieSize = 12 * gameState.difficultyScale;
    const zombie = this.add.circle(x, y, zombieSize, 0xff0055);
    this.physics.add.existing(zombie);
    zombie.hp = Math.ceil(2 * gameState.difficultyScale);
    zombie.setStrokeStyle(2, 0xffffff);
    zombies.add(zombie);
}

function fireBullet() {
    const angle = Phaser.Math.Angle.Between(player.x, player.y, this.input.x, this.input.y);
    const bullet = this.add.circle(player.x, player.y, 4, 0xffff00);
    this.physics.add.existing(bullet);
    
    // Set bullet velocity
    const speed = 500;
    bullet.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    
    // Auto destroy
    this.time.addEvent({
        delay: 2000,
        callback: () => bullet.destroy(),
    });
    bullets.add(bullet);
}

function hitZombie(bullet, zombie) {
    bullet.destroy();
    zombie.hp -= gameState.damage;
    
    // Visual feedback
    this.tweens.add({
        targets: zombie,
        alpha: 0.5,
        duration: 50,
        yoyo: true
    });

    if (zombie.hp <= 0) {
        gameState.credits += Math.ceil(10 * gameState.difficultyScale);
        updateUI();
        zombie.destroy();
    }
}

function zombieHitBase(zombie, base) {
    zombie.destroy();
    gameState.baseHp -= 10 * gameState.difficultyScale;
    updateUI();
    
    // Screen Shake
    this.cameras.main.shake(100, 0.01);

    if (gameState.baseHp <= 0) {
        gameOver.call(this);
    }
}

function zombieHitPlayer(player, zombie) {
    // Player just slows down zombies or takes some invisible damage for pushback
    const angle = Phaser.Math.Angle.Between(zombie.x, zombie.y, player.x, player.y);
    player.body.setVelocity(Math.cos(angle) * 500, Math.sin(angle) * 500);
}

function scaleDifficulty() {
    gameState.wave++;
    gameState.difficultyScale += 0.2;
    // Increase spawn rate
    this.spawnTimer.delay = Math.max(500, 2000 - (gameState.wave * 100));
    updateUI();
}

function updateUI() {
    ui.credits.innerText = gameState.credits;
    ui.wave.innerText = gameState.wave;
    
    const hpPercent = (gameState.baseHp / gameState.baseMaxHp) * 100;
    ui.baseHpBar.style.width = hpPercent + '%';
    
    // Visual alerts
    if (hpPercent < 30) ui.baseHpBar.style.background = '#ff0000';
    else ui.baseHpBar.style.background = 'linear-gradient(90deg, var(--secondary), #ff4d88)';
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
        if (gameState.credits >= cost) {
            gameState.credits -= cost;
            gameState.upgrades.fireRate++;
            gameState.fireRate = Math.max(100, 400 - (gameState.upgrades.fireRate * 30));
            ui.lvls.fireRate.innerText = 'LVL ' + gameState.upgrades.fireRate;
            ui.costs.fireRate.innerText = 100 * gameState.upgrades.fireRate;
            updateUI();
        }
    };

    document.getElementById('upgrade-damage').onclick = () => {
        const cost = 150 * gameState.upgrades.damage;
        if (gameState.credits >= cost) {
            gameState.credits -= cost;
            gameState.upgrades.damage++;
            gameState.damage += 0.5;
            ui.lvls.damage.innerText = 'LVL ' + gameState.upgrades.damage;
            ui.costs.damage.innerText = 150 * gameState.upgrades.damage;
            updateUI();
        }
    };

    document.getElementById('upgrade-speed').onclick = () => {
        const cost = 80 * gameState.upgrades.speed;
        if (gameState.credits >= cost) {
            gameState.credits -= cost;
            gameState.upgrades.speed++;
            gameState.playerSpeed += 20;
            ui.lvls.speed.innerText = 'LVL ' + gameState.upgrades.speed;
            ui.costs.speed.innerText = 80 * gameState.upgrades.speed;
            updateUI();
        }
    };

    document.getElementById('repair-base').onclick = () => {
        const cost = 50;
        if (gameState.credits >= cost && gameState.baseHp < gameState.baseMaxHp) {
            gameState.credits -= cost;
            gameState.baseHp = Math.min(gameState.baseMaxHp, gameState.baseHp + 25);
            updateUI();
        }
    };
}
