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
    fireRate: 400,
    bulletDamage: 50,
    baseBulletDamage: 50,
    bulletSpeed: 600,
    lastFired: 0,
    isStoreOpen: false,
    zombieSpeed: 60,
    spawnRate: 2000,
    initialSpawnRate: 2000,
    turretsCount: 0,
    maxTurrets: 4,
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
    wave: document.getElementById('wave-number')
};

const game = new Phaser.Game(config);
let player, base, zombies, bullets, turretBullets, turrets, cursors, keys, lastWaveTime, shopContainer, shopItems;

class Turret extends Phaser.GameObjects.Container {
    constructor(scene, x, y) {
        super(scene, x, y);
        this.scene = scene;
        this.lastFired = 0;

        const basePart = scene.add.circle(0, 0, 16, 0xbdc3c7);
        basePart.setStrokeStyle(2, 0x2c3e50);
        this.barrel = scene.add.rectangle(0, 0, 20, 8, 0x34495e);
        this.barrel.setOrigin(0, 0.5);
        this.add([basePart, this.barrel]);
        scene.add.existing(this);

        this.rangeCircle = scene.add.circle(0, 0, gameState.turretRange, 0xffffff, 0.05);
        this.add(this.rangeCircle);
        this.sendToBack(this.rangeCircle);
    }

    updateTurret(time) {
        if (time < this.lastFired + gameState.turretFireRate) return;
        let closest = null, minDist = gameState.turretRange;
        zombies.children.iterate((zombie) => {
            if (zombie && zombie.active) {
                const dist = Phaser.Math.Distance.Between(this.x, this.y, zombie.x, zombie.y);
                if (dist < minDist) { minDist = dist; closest = zombie; }
            }
        });
        if (closest) {
            const angle = Phaser.Math.Angle.Between(this.x, this.y, closest.x, closest.y);
            this.barrel.setRotation(angle);
            this.fireBullet(angle);
            this.lastFired = time;
        }
        if (this.rangeCircle.radius !== gameState.turretRange) this.rangeCircle.setRadius(gameState.turretRange);
    }

    fireBullet(angle) {
        let bullet = turretBullets.get(this.x, this.y, 'bullet_tex');
        if (bullet) {
            bullet.setActive(true).setVisible(true).setPosition(this.x, this.y);
            this.scene.physics.add.existing(bullet);
            bullet.body.setVelocity(Math.cos(angle) * 1000, Math.sin(angle) * 1000);
            this.scene.time.addEvent({ delay: 2000, callback: () => { if (bullet.active) bullet.destroy(); } });
        }
    }
}

function preload() {
    // No external assets required as per instructions
}

function create() {
    // 1. Procedural Grass Background
    const grassGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    grassGraphics.fillStyle(0x2d5a27).fillRect(0, 0, 64, 64);
    grassGraphics.fillStyle(0x1e3c1a);
    for (let i = 0; i < 8; i++) grassGraphics.fillPoint(Phaser.Math.Between(0, 64), Phaser.Math.Between(0, 64), 2);
    grassGraphics.generateTexture('grass_tex', 64, 64);
    this.add.tileSprite(400, 300, 800, 600, 'grass_tex');

    // 2. Base
    base = this.add.rectangle(400, 300, 60, 60, 0x33aaff);
    this.physics.add.existing(base, true);
    base.setStrokeStyle(4, 0x00ff88);

    // 3. Player Pro Visual
    player = this.add.container(400, 400);
    const backpack = this.add.rectangle(-10, 0, 12, 18, 0x1b4f72);
    const body = this.add.circle(0, 0, 15, 0x3498db);
    body.setStrokeStyle(2, 0x21618c);
    const visor = this.add.rectangle(6, 0, 10, 20, 0x00ffff, 0.6);
    player.barrel = this.add.rectangle(12, 0, 20, 6, 0x2c3e50).setOrigin(0, 0.5);
    player.add([backpack, body, visor, player.barrel]);
    this.physics.add.existing(player);
    player.body.setCircle(15, -15, -15).setCollideWorldBounds(true);
    player.setDepth(10);

    // 4. Bullets and Groups
    const bulletGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    bulletGraphics.fillStyle(0xffff00).fillCircle(5, 5, 5).generateTexture('bullet_tex', 10, 10);
    bullets = this.physics.add.group({ defaultKey: 'bullet_tex', maxSize: 100 });
    turretBullets = this.physics.add.group({ defaultKey: 'bullet_tex', maxSize: 100 });
    zombies = this.physics.add.group();
    turrets = this.add.group();

    // 5. Input
    cursors = this.input.keyboard.createCursorKeys();
    keys = this.input.keyboard.addKeys('W,A,S,D,P');
    this.input.keyboard.on('keydown-P', () => toggleShop.call(this));

    // 6. Collisions
    this.physics.add.collider(player, base);
    this.physics.add.overlap(bullets, zombies, damageZombie, null, this);
    this.physics.add.overlap(turretBullets, zombies, damageZombie, null, this);
    this.physics.add.overlap(zombies, base, zombieDamageBase, null, this);
    this.physics.add.overlap(zombies, player, zombieDamagePlayer, null, this);

    // 7. Loops
    this.time.addEvent({ delay: 60000, callback: scaleDifficulty, callbackScope: this, loop: true });
    this.spawnTimer = this.time.addEvent({ delay: gameState.spawnRate, callback: spawnZombie, callbackScope: this, loop: true });
    this.hpGraphics = this.add.graphics();

    // 8. In-Game Shop (Phaser UI)
    createShop.call(this);
}

function update(time, delta) {
    if (gameState.isStoreOpen) return;
    this.hpGraphics.clear();
    zombies.children.iterate((zombie) => {
        if (zombie && zombie.active && zombie.hp < zombie.maxHp) {
            const px = zombie.x - 10, py = zombie.y - 20;
            this.hpGraphics.fillStyle(0x000000, 0.5).fillRect(px, py, 20, 4);
            this.hpGraphics.fillStyle(0x00ff88, 1).fillRect(px, py, 20 * (zombie.hp / zombie.maxHp), 4);
        }
    });

    const pointer = this.input.activePointer;
    player.rotation = Phaser.Math.Angle.Between(player.x, player.y, pointer.worldX, pointer.worldY);

    player.body.setVelocity(0);
    let vx = 0, vy = 0;
    if (keys.W.isDown || cursors.up.isDown) vy = -gameState.playerSpeed;
    else if (keys.S.isDown || cursors.down.isDown) vy = gameState.playerSpeed;
    if (keys.A.isDown || cursors.left.isDown) vx = -gameState.playerSpeed;
    else if (keys.D.isDown || cursors.right.isDown) vx = gameState.playerSpeed;
    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }
    player.body.setVelocity(vx, vy);

    if (this.input.activePointer.isDown && time > gameState.lastFired) {
        fireBullet.call(this);
        gameState.lastFired = time + gameState.fireRate;
    }

    zombies.children.iterate((zombie) => {
        if (!zombie || !zombie.active) return;
        const target = (Phaser.Math.Distance.Between(zombie.x, zombie.y, player.x, player.y) < 150) ? player : base;
        this.physics.moveToObject(zombie, target, gameState.zombieSpeed);
        zombie.setRotation(Phaser.Math.Angle.Between(zombie.x, zombie.y, target.x, target.y));
    });

    turrets.children.iterate((t) => { if (t) t.updateTurret(time); });
}

function toggleShop() {
    gameState.isStoreOpen = !gameState.isStoreOpen;
    if (gameState.isStoreOpen) {
        shopContainer.setVisible(true);
        this.physics.world.pause();
    } else {
        shopContainer.setVisible(false);
        this.physics.world.resume();
    }
}

function createShop() {
    shopContainer = this.add.container(400, 300).setDepth(200).setVisible(false);
    const bg = this.add.rectangle(0, 0, 400, 500, 0x000000, 0.8).setStrokeStyle(2, 0x00ff88);
    const title = this.add.text(0, -220, 'UPGRADES', { fontSize: '24px', color: '#00ff88' }).setOrigin(0.5);
    const closeBtn = this.add.text(0, 220, '[ FECHAR ]', { fontSize: '20px', color: '#fff' }).setOrigin(0.5).setInteractive();
    closeBtn.on('pointerdown', () => toggleShop.call(this));

    shopItems = this.add.container(0, 0);
    const mask = this.add.graphics().fillRect(200, 100, 400, 350).setVisible(false).createGeometryMask();
    shopItems.setMask(mask);

    const upgrades = [
        { name: 'Cadência', key: 'fireRate', base: 100 },
        { name: 'Dano', key: 'damage', base: 150 },
        { name: 'Fortificar', key: 'fortify', base: 300 },
        { name: 'Reparar (150)', key: 'repair', base: 150 },
        { name: 'Torreta (1500)', key: 'turret', base: 1500 }
    ];

    upgrades.forEach((up, i) => {
        const item = this.add.container(0, -150 + (i * 60));
        const btn = this.add.rectangle(0, 0, 350, 50, 0x333333).setInteractive();
        const txt = this.add.text(-160, 0, up.name, { fontSize: '18px' }).setOrigin(0, 0.5);
        const costTxt = this.add.text(160, 0, 'Custo: ' + up.base, { fontSize: '16px' }).setOrigin(1, 0.5);
        item.add([btn, txt, costTxt]);
        shopItems.add(item);

        btn.on('pointerdown', () => {
            if (up.key === 'repair' && gameState.gold >= 150) {
                gameState.gold -= 150;
                gameState.baseHp = Math.min(gameState.baseMaxHp, gameState.baseHp + 25);
            } else if (up.key === 'turret' && gameState.gold >= 1500 && gameState.turretsCount < 4) {
                gameState.gold -= 1500;
                const tx = Phaser.Math.Between(100, 700), ty = Phaser.Math.Between(100, 500);
                turrets.add(new Turret(this, tx, ty));
                gameState.turretsCount++;
            } else if (gameState.gold >= up.base) {
                // Simplified upgrade logic
                gameState.gold -= up.base;
                gameState[up.key] = (gameState[up.key] || 0) + 1;
            }
            updateUI();
        });
    });

    shopContainer.add([bg, title, closeBtn, shopItems]);

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
        if (gameState.isStoreOpen) {
            shopItems.y = Phaser.Math.Clamp(shopItems.y - deltaY, -100, 100);
        }
    });
}

// --- Game Functions ---

function spawnZombie() {
    if (gameState.isStoreOpen) return;
    const side = Phaser.Math.Between(0, 3);
    let x, y;
    if (side === 0) { x = Phaser.Math.Between(0, 800); y = -50; }
    else if (side === 1) { x = Phaser.Math.Between(0, 800); y = 650; }
    else if (side === 2) { x = -50; y = Phaser.Math.Between(0, 600); }
    else { x = 850; y = Phaser.Math.Between(0, 600); }

    const zombie = this.add.container(x, y);
    const body = this.add.circle(0, 0, 12, 0x27ae60).setStrokeStyle(2, 0x2ecc71);
    const eyeR = this.add.circle(6, -4, 2, 0x000000), eyeL = this.add.circle(6, 4, 2, 0x000000);
    const mouth = this.add.rectangle(8, 0, 2, 6, 0x000000);
    zombie.add([body, eyeR, eyeL, mouth]);
    this.physics.add.existing(zombie);
    zombie.body.setCircle(12, -12, -12);
    this.tweens.add({ targets: zombie, scale: { from: 0.9, to: 1.1 }, duration: 400, yoyo: true, loop: -1 });

    zombie.maxHp = Math.floor(100 * Math.pow(1.2, gameState.wave - 1));
    zombie.hp = zombie.maxHp;
    zombie.lastDamageTime = 0;
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
    let damage = turretBullets.contains(bullet) ? gameState.turretBulletDamage : gameState.bulletDamage;
    zombie.hp -= damage;
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
    // O HP dos zumbis agora é calculado dinamicamente no spawnZombie usando a Wave
    gameState.spawnRate = Math.max(200, gameState.spawnRate - 100);
    this.spawnTimer.delay = gameState.spawnRate;
    updateUI();
}

function updateUI() {
    ui.gold.innerText = gameState.gold;
    ui.dmg.innerText = gameState.bulletDamage;
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
}
