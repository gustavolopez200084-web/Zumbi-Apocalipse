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
    bulletDamage: 50,
    baseBulletDamage: 50,
    bulletSpeed: 600,
    lastFired: 0,
    isPaused: false,
    zombieSpeed: 60,
    zombieMaxHP: 100,
    spawnRate: 2000,
    initialSpawnRate: 2000,
    turretsCount: 0,
    maxTurrets: 4,
    isPlacingTurret: false,
    turretFireRate: 800,
    turretRange: 250,
    turretBulletDamage: 50,
    upgrades: {
        fireRate: 1,
        damage: 0,
        fortify: 1,
        turretFire: 1,
        turretDmg: 1,
        turretRange: 1
    }
};

// UI Elements (updated to match new index.html)
const ui = {
    gold: document.getElementById('credit-count'),
    dmg: document.getElementById('damage-count'),
    playerHpBar: document.getElementById('player-hp-bar'),
    baseHpBar: document.getElementById('base-hp-bar'),
    wave: document.getElementById('wave-number'),
    turretLvl: document.getElementById('hud-turret-lvl'),
    shop: document.getElementById('shop-menu'),
    costs: {
        fireRate: document.getElementById('cost-fire-rate'),
        damage: document.getElementById('cost-damage'),
        repair: document.getElementById('cost-repair'),
        fortify: document.getElementById('cost-fortify'),
        turret: document.getElementById('cost-turret'),
        turretFire: document.getElementById('cost-turret-fire'),
        turretDmg: document.getElementById('cost-turret-dmg'),
        turretRange: document.getElementById('cost-turret-range')
    },
    lvls: {
        fireRate: document.getElementById('lvl-fire-rate'),
        damage: document.getElementById('lvl-damage'),
        fortify: document.getElementById('lvl-fortify'),
        turretCount: document.getElementById('turret-count'),
        turretFire: document.getElementById('lvl-turret-fire'),
        turretDmg: document.getElementById('lvl-turret-dmg'),
        turretRange: document.getElementById('lvl-turret-range')
    }
};

const game = new Phaser.Game(config);
let player, base, zombies, bullets, turretBullets, turrets, cursors, keys, lastWaveTime;

class Turret extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        this.scene = scene;
        this.lastFired = 0;

        // Visual parts
        const basePart = scene.add.circle(0, 0, 16, 0xbdc3c7);
        basePart.setStrokeStyle(2, 0x2c3e50);

        this.barrel = scene.add.rectangle(0, 0, 20, 8, 0x34495e);
        this.barrel.setOrigin(0, 0.5); // Rotate around left edge

        this.add([basePart, this.barrel]);
        scene.add.existing(this);

        // Detection range visual (semi-transparent circle)
        this.rangeCircle = scene.add.circle(0, 0, gameState.turretRange, 0xffffff, 0.05);
        this.add(this.rangeCircle);
        this.sendToBack(this.rangeCircle);
    }

    updateTurret(time) {
        if (time < this.lastFired + gameState.turretFireRate) return;

        let closest = null;
        let minDist = gameState.turretRange;

        zombies.children.iterate((zombie) => {
            if (zombie && zombie.active) {
                const dist = Phaser.Math.Distance.Between(this.x, this.y, zombie.x, zombie.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = zombie;
                }
            }
        });

        if (closest) {
            const angle = Phaser.Math.Angle.Between(this.x, this.y, closest.x, closest.y);
            this.barrel.setRotation(angle);

            this.fireBullet(angle);
            this.lastFired = time;
        }

        // Keep range circle aligned with global range
        if (this.rangeCircle.radius !== gameState.turretRange) {
            this.rangeCircle.setRadius(gameState.turretRange);
        }
    }

    fireBullet(angle) {
        let bullet = turretBullets.get(this.x, this.y, 'bullet_tex');
        if (bullet) {
            bullet.setActive(true);
            bullet.setVisible(true);
            bullet.setPosition(this.x, this.y);
            this.scene.physics.add.existing(bullet);

            bullet.body.setVelocity(
                Math.cos(angle) * gameState.turretBulletSpeed,
                Math.sin(angle) * gameState.turretBulletSpeed
            );

            this.scene.time.addEvent({
                delay: 2000,
                callback: () => { if (bullet.active) bullet.destroy(); }
            });
        }
    }
}

function preload() {
    // No external assets required as per instructions
}

function create() {
    // 1. Procedural Grass Background
    const grassGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    // Light green base
    grassGraphics.fillStyle(0x2d5a27);
    grassGraphics.fillRect(0, 0, 64, 64);
    // Darker dots/tufts
    grassGraphics.fillStyle(0x1e3c1a);
    for (let i = 0; i < 8; i++) {
        let gx = Phaser.Math.Between(0, 64);
        let gy = Phaser.Math.Between(0, 64);
        grassGraphics.fillPoint(gx, gy, 2);
    }
    grassGraphics.generateTexture('grass_tex', 64, 64);
    this.add.tileSprite(400, 300, 800, 600, 'grass_tex');

    // 2. Base (Central Core)
    base = this.add.rectangle(400, 300, 60, 60, 0x33aaff);
    this.physics.add.existing(base, true); // Static body
    base.setStrokeStyle(4, 0x00ff88);

    // 3. Player Pro Visual (Container)
    player = this.add.container(400, 400);

    const backpack = this.add.rectangle(-10, 0, 12, 18, 0x1b4f72);
    const body = this.add.circle(0, 0, 15, 0x3498db);
    body.setStrokeStyle(2, 0x21618c);

    // Tech Visor
    const visor = this.add.rectangle(6, 0, 10, 20, 0x00ffff, 0.6);
    visor.setStrokeStyle(1, 0xffffff);

    // Player Barrel
    player.barrel = this.add.rectangle(12, 0, 20, 6, 0x2c3e50);
    player.barrel.setOrigin(0, 0.5);

    player.add([backpack, body, visor, player.barrel]);

    this.physics.add.existing(player);
    player.body.setCircle(15, -15, -15);
    player.body.setCollideWorldBounds(true);
    player.setDepth(10); // Ensure player is above zombies and grass

    // 4. Create proper textures for objects without external assets
    const bulletGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    bulletGraphics.fillStyle(0xffff00);
    bulletGraphics.fillCircle(5, 5, 5);
    bulletGraphics.generateTexture('bullet_tex', 10, 10);

    bullets = this.physics.add.group({
        defaultKey: 'bullet_tex',
        maxSize: 100
    });

    turretBullets = this.physics.add.group({
        defaultKey: 'bullet_tex',
        maxSize: 100
    });

    // Set higher speed for turret bullets for "perfect aim"
    gameState.turretBulletSpeed = 2000;

    zombies = this.physics.add.group();
    turrets = this.add.group();

    // 5. Input
    cursors = this.input.keyboard.createCursorKeys();
    keys = this.input.keyboard.addKeys('W,A,S,D,P');

    // 5.1 Keyboard listener for Pause (P) - Fixes "freeze" bug
    this.input.keyboard.on('keydown-P', () => {
        toggleShop();
    });

    // 6. Collisions
    this.physics.add.collider(player, base);
    this.physics.add.overlap(bullets, zombies, damageZombie, null, this);
    this.physics.add.overlap(turretBullets, zombies, damageZombie, null, this);
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
        delay: gameState.spawnRate,
        callback: spawnZombie,
        callbackScope: this,
        loop: true
    });

    // 9. Input for Turret Placement
    this.input.on('pointerdown', (pointer) => {
        if (gameState.isPaused) return; // Block input when paused
        if (gameState.isPlacingTurret) {
            placeTurret.call(this, pointer.x, pointer.y);
        }
    });

    // 10. Zombie HP Bar Graphics
    this.hpGraphics = this.add.graphics();

    // UI Setup
    setupShopListeners();
}

function update(time, delta) {
    // Clear and redraw HP bars - DO THIS BEFORE EARLY RETURN so they stay visible when paused
    this.hpGraphics.clear();
    zombies.children.iterate((zombie) => {
        if (zombie && zombie.active && zombie.hp < zombie.maxHp) {
            const barWidth = 20;
            const barHeight = 4;
            const px = zombie.x - barWidth / 2;
            const py = zombie.y - 20;

            // Background
            this.hpGraphics.fillStyle(0x000000, 0.5);
            this.hpGraphics.fillRect(px, py, barWidth, barHeight);

            // Health
            const percent = zombie.hp / zombie.maxHp;
            this.hpGraphics.fillStyle(0x00ff88, 1);
            this.hpGraphics.fillRect(px, py, barWidth * percent, barHeight);
        }
    });

    // 1. Player Rotation (also before return to keep it smooth during pause if desired, 
    // but the user asked for return at the BEGINNING)
    if (gameState.isPaused) return;

    // Player Rotation: Entire Container faces the mouse
    const pointer = this.input.activePointer;
    const playerAngle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);
    player.setRotation(playerAngle);

    // Player Movement (WASD remains independent of rotation)
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

        // Face rotation towards target
        const angle = Phaser.Math.Angle.Between(zombie.x, zombie.y, target.x, target.y);
        zombie.setRotation(angle);
    });

    // Turret Logic
    turrets.children.iterate((turret) => {
        if (turret) turret.updateTurret(time);
    });
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

    // Use Container for Zombie Procedural Art
    const zombie = this.add.container(x, y);
    const zombieSize = 12;

    // 1. Body (Green)
    const body = this.add.circle(0, 0, zombieSize, 0x27ae60);
    body.setStrokeStyle(2, 0x2ecc71);

    // 2. Eyes (Black)
    const eyeR = this.add.circle(6, -4, 2, 0x000000);
    const eyeL = this.add.circle(6, 4, 2, 0x000000);

    // 3. Mouth (Black Line)
    const mouth = this.add.rectangle(8, 0, 2, 6, 0x000000);

    zombie.add([body, eyeR, eyeL, mouth]);

    // Physics required for individual tracking
    this.physics.add.existing(zombie);
    zombie.body.setCircle(zombieSize, -zombieSize, -zombieSize);

    // Animation: Pulsing Effect
    this.tweens.add({
        targets: zombie,
        scale: { from: 0.95, to: 1.05 },
        duration: 400,
        yoyo: true,
        loop: -1
    });

    zombie.maxHp = Math.floor(100 * Math.pow(1.2, gameState.wave - 1));
    zombie.hp = zombie.maxHp;
    zombie.lastDamageTime = 0;

    // Custom property to aid damage coloring
    zombie.mainBody = body;

    zombies.add(zombie);
}

function fireBullet() {
    const pointer = this.input.activePointer;
    // Usamos pointer.worldX e worldY para garantir precisão no mapa
    const angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);

    // Pegar uma bala do grupo (pool) usando a textura gerada
    let bullet = bullets.get(player.x, player.y, 'bullet_tex');

    if (bullet) {
        bullet.setActive(true);
        bullet.setVisible(true);
        bullet.setPosition(player.x, player.y);

        // Ativar a física explicitamente para este objeto reciclado
        this.physics.add.existing(bullet);

        // Aplicar a velocidade diretamente (Correção definitiva)
        bullet.body.setVelocity(
            Math.cos(angle) * gameState.bulletSpeed,
            Math.sin(angle) * gameState.bulletSpeed
        );

        // Timer para autodesativar/destruir a bala
        this.time.addEvent({
            delay: 2000,
            callback: () => {
                if (bullet.active) {
                    bullet.destroy(); // Usamos destroy() para simplificar a limpeza
                }
            }
        });
    }
}

function damageZombie(bullet, zombie) {
    if (!zombie.active) return;
    bullet.destroy();

    const isCrit = Math.random() < 0.10;
    // Distinguish player bullet damage from turret bullet damage if needed, 
    // but here we use unified logic, choosing turretDamage if bullet came from turret bullets group.
    let damage = gameState.bulletDamage;
    if (turretBullets.contains(bullet)) {
        damage = gameState.turretBulletDamage;
    }

    if (isCrit) {
        damage *= 2;
        showCritEffect(this, zombie.x, zombie.y);
    }

    zombie.hp -= damage;
    flashRed(this, zombie.mainBody || zombie);

    if (zombie.hp <= 0) {
        gameState.gold += 20;
        updateUI();
        zombie.destroy();
    }
}

function showCritEffect(scene, x, y) {
    const text = scene.add.text(x, y - 20, 'CRÍTICO!', {
        fontSize: '16px', fontWeight: 'bold', fill: '#ffff00', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);
    scene.tweens.add({
        targets: text,
        y: y - 50,
        alpha: 0,
        duration: 800,
        onComplete: () => text.destroy()
    });
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

    // Fórmula: novoDelay = Math.max(300, delayInicial - (onda * 100))
    const initialDelay = gameState.initialSpawnRate;
    const newDelay = Math.max(300, initialDelay - (gameState.wave * 100));

    // Se a frequência aumentou, mostrar aviso
    if (newDelay < gameState.spawnRate) {
        showHordeAlert.call(this);
    }

    gameState.spawnRate = newDelay;
    this.spawnTimer.delay = gameState.spawnRate;
    updateUI();
}

function showHordeAlert() {
    const text = this.add.text(400, 100, 'HORDA AUMENTANDO!', {
        fontFamily: 'Orbitron', fontSize: '32px', fill: '#ffaa00', fontWeight: 'bold'
    }).setOrigin(0.5);

    this.tweens.add({
        targets: text,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 1.5 },
        duration: 2000,
        ease: 'Linear',
        onComplete: () => text.destroy()
    });
}

function updateUI() {
    ui.gold.innerText = gameState.gold;
    ui.dmg.innerText = gameState.bulletDamage;
    ui.wave.innerText = gameState.wave;

    const turretLvlMax = Math.max(gameState.upgrades.turretFire, gameState.upgrades.turretDmg, gameState.upgrades.turretRange);
    ui.turretLvl.innerText = 'LV. ' + turretLvlMax;

    const baseHpPercent = (gameState.baseHp / gameState.baseMaxHp) * 100;
    ui.baseHpBar.style.width = Math.max(0, baseHpPercent) + '%';

    const playerHpPercent = (gameState.playerHp / gameState.playerMaxHp) * 100;
    ui.playerHpBar.style.width = Math.max(0, playerHpPercent) + '%';

    // Update Turret Shop Info
    ui.lvls.turretCount.innerText = `${gameState.turretsCount}/${gameState.maxTurrets}`;

    const buyTurretItem = document.getElementById('buy-turret');
    const turretUpgradeSection = document.getElementById('turret-upgrades-section');

    // Show turret upgrades ONLY if at least one turret is owned
    if (gameState.turretsCount > 0) {
        turretUpgradeSection.style.display = 'block';
    } else {
        turretUpgradeSection.style.display = 'none'; // Hide if no turrets
    }

    if (gameState.gold < 1500 || gameState.turretsCount >= gameState.maxTurrets) {
        buyTurretItem.style.opacity = '0.5';
        buyTurretItem.style.cursor = 'not-allowed';
    } else {
        buyTurretItem.style.opacity = '1';
        buyTurretItem.style.cursor = 'pointer';
    }

    // Update Turret Upgrade Costs etc.
    ui.lvls.turretFire.innerText = `LVL ${gameState.upgrades.turretFire}`;
    ui.costs.turretFire.innerText = 800 * gameState.upgrades.turretFire;

    ui.lvls.turretDmg.innerText = `LVL ${gameState.upgrades.turretDmg}`;
    ui.costs.turretDmg.innerText = 1200 * gameState.upgrades.turretDmg;

    ui.lvls.turretRange.innerText = `LVL ${gameState.upgrades.turretRange}`;
    ui.costs.turretRange.innerText = 600 * gameState.upgrades.turretRange;

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
    const scene = game.scene.scenes[0];

    if (gameState.isPaused) {
        ui.shop.style.display = 'block';
        ui.shop.classList.add('active'); // Keep class for possible transitions
        scene.physics.world.pause();
    } else {
        ui.shop.style.display = 'none';
        ui.shop.classList.remove('active');
        scene.physics.world.resume();
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
        const cost = 150 * (gameState.upgrades.damage + 1);
        if (gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.upgrades.damage++;
            // Cálculo: currentDamage = 50 + (upgradeLevel * 25)
            gameState.bulletDamage = gameState.baseBulletDamage + (gameState.upgrades.damage * 25);
            gameState.bulletSpeed += 30; // Pequeno bônus de velocidade
            ui.lvls.damage.innerText = 'LVL ' + (gameState.upgrades.damage + 1);
            ui.costs.damage.innerText = 150 * (gameState.upgrades.damage + 2);
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

    document.getElementById('buy-turret').onclick = () => {
        if (gameState.gold >= 1500 && gameState.turretsCount < gameState.maxTurrets && !gameState.isPlacingTurret) {
            gameState.gold -= 1500;
            gameState.isPlacingTurret = true;
            toggleShop(); // Close shop to place
            updateUI();

            // Helpful instruction
            const msg = game.scene.scenes[0].add.text(400, 550, 'Clique no mapa para posicionar a Torreta', {
                fontFamily: 'Orbitron', fontSize: '18px', fill: '#ffffff'
            }).setOrigin(0.5);
            game.scene.scenes[0].time.addEvent({ delay: 3000, callback: () => msg.destroy() });
        }
    };

    // Turret Upgrade Listeners
    document.getElementById('upgrade-turret-fire').onclick = () => {
        const cost = 800 * gameState.upgrades.turretFire;
        if (gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.upgrades.turretFire++;
            gameState.turretFireRate = Math.max(200, 800 - (gameState.upgrades.turretFire * 100));
            updateUI();
        }
    };

    document.getElementById('upgrade-turret-dmg').onclick = () => {
        const cost = 1200 * gameState.upgrades.turretDmg;
        if (gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.upgrades.turretDmg++;
            gameState.turretBulletDamage += 25;
            updateUI();
        }
    };

    document.getElementById('upgrade-turret-range').onclick = () => {
        const cost = 600 * gameState.upgrades.turretRange;
        if (gameState.gold >= cost) {
            gameState.gold -= cost;
            gameState.upgrades.turretRange++;
            gameState.turretRange += 50;
            updateUI();
        }
    };
}

function placeTurret(x, y) {
    const turret = new Turret(this, x, y);
    turrets.add(turret);
    gameState.turretsCount++;
    gameState.isPlacingTurret = false;
    updateUI();
}
