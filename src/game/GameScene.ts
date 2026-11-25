import Phaser from 'phaser';
import { AudioManager } from './AudioManager';
import {
  preloadCharacterAssets,
  type CharacterAnimState,
} from './characterAssets';
import {
  getSkinSpec,
  getTrailSpec,
  type RunnerSkinId,
  type TrailStyleId,
} from './cosmetics';
import { CollisionManager } from './CollisionManager';
import { RunnerAnimator } from './RunnerAnimator';
import { SDKBridge } from './SDKBridge';
import { StorageManager } from './StorageManager';
import { generateGameTextures } from './TextureGenerator';
import type {
  ActivePowerUps,
  GameCallbacks,
  GameOverSummary,
  HudSnapshot,
  ObstacleType,
  PowerUpType,
} from './types';

interface ProjectedPoint {
  x: number;
  y: number;
  scale: number;
  roadWidth: number;
  laneWidth: number;
  u: number;
}

interface ObstacleEntity {
  id: number;
  type: ObstacleType;
  lane: number; // -1, 0, 1 (current X position in lane units)
  baseLane: number;
  z: number; // 1.0 (horizon) -> -0.08 (past camera)
  active: boolean;
  nearMissed: boolean;
  smashed: boolean;
  dronePhase: number;
  droneAmp: number;
  droneSpeed: number;
}

interface CoinEntity {
  laneX: number;
  yHeight: number;
  z: number;
  collected: boolean;
  magnetized: boolean;
  sprite: Phaser.GameObjects.Sprite;
  animOffset: number;
}

interface PowerUpEntity {
  type: PowerUpType;
  lane: number;
  z: number;
  collected: boolean;
  sprite: Phaser.GameObjects.Sprite;
  bobOffset: number;
}

interface StarDot {
  nx: number; // 0..1
  ny: number; // 0..0.34
  size: number;
  phase: number;
  color: number;
}

interface BuildingSpec {
  nx: number; // -0.1..1.1
  widthFrac: number;
  heightFrac: number;
  accentColor: number;
  windowRows: number;
  windowCols: number;
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  sprite: Phaser.GameObjects.Image;
}

interface FloatingPopup {
  text: Phaser.GameObjects.Text;
  vy: number;
  life: number;
  maxLife: number;
}

interface SpeedLine {
  angle: number;
  dist: number;
  speed: number;
  length: number;
  color: number;
}

const PLAYER_Z = 0.082;
const PERSP_K = 5.4;
const T_MIN = 1 / (1 + PERSP_K);

const BASE_SPEED = 0.29; // calmer, welcoming opening pace (~80 km/h)
const MAX_SPEED = 1.0; // intense late-game top speed (~300+ km/h)
const JUMP_VELOCITY = 2.72;
const GRAVITY = 8.2;
const SLIDE_DURATION = 0.72;

const MAGNET_DURATION = 8.5;
const MULTIPLIER_DURATION = 10.0;
const BOOST_DURATION = 5.0;

export class GameScene extends Phaser.Scene {
  private callbacks: GameCallbacks;

  // Game mode & state
  private mode: 'ATTRACT' | 'PLAYING' | 'PAUSED' | 'CRASHING' | 'GAMEOVER' = 'ATTRACT';
  private elapsedTime = 0;
  private worldScroll = 0;
  private runSpeed = BASE_SPEED;
  private distance = 0;
  private score = 0;
  private bestScore = 0;
  private isNewBest = false;
  private coinsCollected = 0;
  private coinStreak = 0;
  private coinStreakTimer = 0;
  private nearMissCount = 0;
  private obstaclesSmashed = 0;
  private topSpeedKmh = 80;
  private crashTimer = 0;
  private hudEmitAccum = 0;

  // Player state
  private targetLane = 0; // -1 | 0 | 1
  private playerLaneX = 0;
  private playerY = 0;
  private playerVy = 0;
  private isJumping = false;
  private isSliding = false;
  private slideTimer = 0;
  private jumpBufferTimer = 0;
  private fastFalling = false;
  private invulnTimer = 0;
  private hurtTimer = 0;
  private playerLaneVel = 0;
  private animSquashX = 1;
  private animSquashY = 1;
  private animGroundContact = 1;
  private animFootWeightX = 0;
  private animStrideBounce = 0;
  private boostSpeedMult = 1;
  private ghostSlotIdx = 0;
  private cameraSwayX = 0;
  private cameraDipY = 0;
  private cameraDipVel = 0;
  private cameraBreathY = 0;
  private ghostTimer = 0;
  private slideSparkTimer = 0;
  private boostTrailTimer = 0;
  private cosmeticSparkTimer = 0;

  // Articulated 60 FPS runner animator & collision/landing feedback manager
  private runnerAnimator!: RunnerAnimator;
  private collisionManager!: CollisionManager;

  // Equipped cosmetics
  private equippedSkin: RunnerSkinId = 'cyber_pulse';
  private equippedTrail: TrailStyleId = 'neon_ghost';
  private trailHistory: Array<{ laneX: number; y: number; z: number }> = [];

  // Power-ups
  private hasShield = false;
  private magnetTimer = 0;
  private multiplierTimer = 0;
  private boostTimer = 0;
  private powerUpSpawnTimer = 11;

  // Entities & pools
  private nextObstacleId = 1;
  private obstacles: ObstacleEntity[] = [];
  private coins: CoinEntity[] = [];
  private powerUps: PowerUpEntity[] = [];
  private particles: BurstParticle[] = [];
  private popups: FloatingPopup[] = [];
  private stars: StarDot[] = [];
  private buildings: BuildingSpec[] = [];
  private speedLines: SpeedLine[] = [];
  private nextWaveDist = 0.36;
  private lastSafeLane = 0;

  // Graphics & display objects
  private skyGfx!: Phaser.GameObjects.Graphics;
  private cityGfx!: Phaser.GameObjects.Graphics;
  private roadGfx!: Phaser.GameObjects.Graphics;
  private obstaclesBehindGfx!: Phaser.GameObjects.Graphics;
  private playerShadowGfx!: Phaser.GameObjects.Graphics;
  private playerTrailGfx!: Phaser.GameObjects.Graphics;
  private playerAuraGfx!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private obstaclesFrontGfx!: Phaser.GameObjects.Graphics;
  private speedLineGfx!: Phaser.GameObjects.Graphics;

  // Touch swipe state
  private pointerDownActive = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private swipeConsumed = false;

  // Bound DOM key listener for rock-solid keyboard responsiveness
  private keyDownHandler?: (e: KeyboardEvent) => void;

  constructor(callbacks: GameCallbacks) {
    super({ key: 'GameScene' });
    this.callbacks = callbacks;
  }

  preload(): void {
    preloadCharacterAssets(this);
  }

  create(): void {
    this.equippedSkin = StorageManager.getEquippedSkin();
    this.equippedTrail = StorageManager.getEquippedTrail();
    generateGameTextures(this);
    this.bestScore = StorageManager.getBestScore();

    this.initEnvironmentData();
    this.createGraphicsLayers();
    this.setupInputs();

    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupScene, this);

    this.enterAttractMode();
    SDKBridge.loadingFinished();
  }

  private initEnvironmentData(): void {
    this.stars = [];
    const starColors = [0xffffff, 0x00f0ff, 0xc77dff, 0xff70a6];
    for (let i = 0; i < 75; i++) {
      this.stars.push({
        nx: Math.random(),
        ny: Math.random() * 0.34,
        size: 0.9 + Math.random() * 1.9,
        phase: Math.random() * Math.PI * 2,
        color: starColors[i % starColors.length],
      });
    }

    this.buildings = [];
    const accents = [0x00f0ff, 0x9d4edd, 0xff2a85, 0x4cc9f0];
    let x = -0.06;
    let idx = 0;
    while (x < 1.08) {
      const w = 0.032 + Math.random() * 0.052;
      // Leave center horizon sun silhouette slightly more open
      const distFromCenter = Math.abs(x + w * 0.5 - 0.5);
      const maxH = distFromCenter < 0.14 ? 0.065 : 0.145;
      const h = 0.035 + Math.random() * maxH;
      this.buildings.push({
        nx: x,
        widthFrac: w,
        heightFrac: h,
        accentColor: accents[idx % accents.length],
        windowRows: Math.max(2, Math.floor(h * 70)),
        windowCols: Math.max(2, Math.floor(w * 90)),
      });
      x += w * (0.85 + Math.random() * 0.35);
      idx++;
    }

    this.speedLines = [];
    for (let i = 0; i < 24; i++) {
      this.speedLines.push({
        angle: Math.random() * Math.PI * 2,
        dist: 0.18 + Math.random() * 0.55,
        speed: 0.65 + Math.random() * 0.85,
        length: 0.06 + Math.random() * 0.12,
        color: i % 3 === 0 ? 0xff2a85 : i % 2 === 0 ? 0x00f0ff : 0x9d4edd,
      });
    }
  }

  private createGraphicsLayers(): void {
    this.skyGfx = this.add.graphics().setDepth(0);
    this.cityGfx = this.add.graphics().setDepth(5);
    this.roadGfx = this.add.graphics().setDepth(10);
    this.obstaclesBehindGfx = this.add.graphics().setDepth(400);
    this.playerShadowGfx = this.add.graphics().setDepth(490);
    this.playerTrailGfx = this.add.graphics().setDepth(493);
    this.playerAuraGfx = this.add.graphics().setDepth(495);

    this.runnerAnimator = new RunnerAnimator(this);
    this.collisionManager = new CollisionManager(this);
    this.playerSprite = this.add
      .sprite(0, 0, this.runnerAnimator.getTextureKey())
      .setOrigin(0.5, 0.968)
      .setDepth(500);

    this.obstaclesFrontGfx = this.add.graphics().setDepth(600);
    this.speedLineGfx = this.add.graphics().setDepth(750);
  }

  private setupInputs(): void {
    // Keyboard handler
    this.keyDownHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const code = e.code;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code)) {
        e.preventDefault();
      }

      if (code === 'KeyM') {
        const muted = AudioManager.toggleMute();
        this.callbacks.onMuteToggle(muted);
        return;
      }

      if (code === 'Escape' || code === 'KeyP') {
        if (this.mode === 'PLAYING') {
          this.pauseGame();
        } else if (this.mode === 'PAUSED') {
          this.resumeGame();
        }
        return;
      }

      if (this.mode !== 'PLAYING') return;

      AudioManager.unlock();

      if (code === 'ArrowLeft' || code === 'KeyA') {
        this.moveLane(-1);
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        this.moveLane(1);
      } else if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') {
        this.triggerJump();
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        this.triggerSlide();
      }
    };
    window.addEventListener('keydown', this.keyDownHandler, { passive: false });

    // Pointer / Touch swipe gestures on the Phaser canvas
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.mode !== 'PLAYING') return;
      AudioManager.unlock();
      this.pointerDownActive = true;
      this.pointerStartX = pointer.x;
      this.pointerStartY = pointer.y;
      this.swipeConsumed = false;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.mode !== 'PLAYING' || !this.pointerDownActive || this.swipeConsumed) return;
      const dx = pointer.x - this.pointerStartX;
      const dy = pointer.y - this.pointerStartY;
      const threshold = 26;

      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

      this.swipeConsumed = true;
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.moveLane(dx < 0 ? -1 : 1);
      } else {
        if (dy < 0) {
          this.triggerJump();
        } else {
          this.triggerSlide();
        }
      }
    });

    this.input.on('pointerup', () => {
      this.pointerDownActive = false;
      this.swipeConsumed = false;
    });

    this.input.on('pointerupoutside', () => {
      this.pointerDownActive = false;
      this.swipeConsumed = false;
    });
  }

  private cleanupScene(): void {
    if (this.keyDownHandler) {
      window.removeEventListener('keydown', this.keyDownHandler);
      this.keyDownHandler = undefined;
    }
    this.scale.off('resize', this.handleResize, this);
    this.runnerAnimator?.destroy();
    this.collisionManager?.destroy();
    this.clearAllEntities();
  }

  private handleResize(): void {
    // Immediate redraw even when paused so resizing never leaves a blank or distorted frame
    this.renderFrame();
  }

  // ---- PUBLIC CONTROL API (called from React UI) ----

  public setCosmetics(skinId: RunnerSkinId, trailId: TrailStyleId): void {
    this.equippedSkin = skinId;
    this.equippedTrail = trailId;
    this.trailHistory = [];

    const skin = getSkinSpec(skinId);
    const previewState: CharacterAnimState =
      this.mode === 'GAMEOVER'
        ? this.isNewBest
          ? 'VICTORY'
          : 'DEATH'
        : this.isJumping
          ? 'JUMP'
          : this.isSliding
            ? 'SLIDE'
            : 'RUN';

    const currentScrollRate =
      this.mode === 'PLAYING'
        ? this.runSpeed * this.boostSpeedMult * 1.65
        : this.mode === 'ATTRACT'
          ? this.runSpeed * 1.4
          : 0;

    this.runnerAnimator.triggerJumpImpulse();
    this.runnerAnimator.updateAndDraw({
      dt: 0.016,
      elapsed: this.elapsedTime,
      groundScrollRate: currentScrollRate,
      laneVel: this.playerLaneVel,
      playerY: this.playerY,
      playerVy: this.playerVy,
      isJumping: this.isJumping,
      isSliding: this.isSliding,
      isBoosting: this.boostTimer > 0,
      animState: previewState,
      skin,
    });

    const p = this.project(this.playerLaneX, this.playerY + 0.14, PLAYER_Z);
    this.spawnShockwave(p.x, p.y, skin.trimNum);
    this.spawnBurst(p.x, p.y, skin.trimNum, 16, 1.15);
    this.spawnBurst(p.x, p.y, skin.coreNum, 10, 0.95);
  }

  public enterAttractMode(): void {
    this.clearAllEntities();
    this.trailHistory = [];
    this.mode = 'ATTRACT';
    this.runSpeed = 0.34;
    this.targetLane = 0;
    this.playerLaneX = 0;
    this.playerLaneVel = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.invulnTimer = 0;
    this.hurtTimer = 0;
    this.hasShield = false;
    this.magnetTimer = 0;
    this.multiplierTimer = 0;
    this.boostTimer = 0;
    this.animSquashX = 1;
    this.animSquashY = 1;
    this.animGroundContact = 1;
    this.animFootWeightX = 0;
    this.animStrideBounce = 0;
    this.cameraDipY = 0;
    this.cameraDipVel = 0;
    this.cameraBreathY = 0;
    this.boostSpeedMult = 1;
    this.runnerAnimator.reset();
    this.playerSprite.setVisible(true).setAlpha(1).setRotation(0);
    this.cameras.main.resetFX();
    AudioManager.setMusicDucked(true);
    SDKBridge.gameplayStop();
  }

  public startNewGame(): void {
    this.clearAllEntities();
    this.cameras.main.resetFX();

    this.mode = 'PLAYING';
    this.runSpeed = BASE_SPEED;
    this.distance = 0;
    this.score = 0;
    this.bestScore = StorageManager.getBestScore();
    this.isNewBest = false;
    this.coinsCollected = 0;
    this.coinStreak = 0;
    this.coinStreakTimer = 0;
    this.nearMissCount = 0;
    this.obstaclesSmashed = 0;
    this.topSpeedKmh = 80;
    this.crashTimer = 0;
    this.hudEmitAccum = 0;

    this.targetLane = 0;
    this.playerLaneX = 0;
    this.playerY = 0;
    this.playerVy = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.jumpBufferTimer = 0;
    this.fastFalling = false;
    this.invulnTimer = 0;
    this.hurtTimer = 0;
    this.cameraSwayX = 0;
    this.ghostTimer = 0;
    this.slideSparkTimer = 0;
    this.boostTrailTimer = 0;

    this.hasShield = false;
    this.magnetTimer = 0;
    this.multiplierTimer = 0;
    this.boostTimer = 0;
    this.powerUpSpawnTimer = 9 + Math.random() * 4;
    this.nextWaveDist = 0.62;
    this.lastSafeLane = 0;
    this.trailHistory = [];
    this.playerLaneVel = 0;
    this.animSquashX = 1;
    this.animSquashY = 1;
    this.animGroundContact = 1;
    this.animFootWeightX = 0;
    this.animStrideBounce = 0;
    this.cameraDipY = 0;
    this.cameraDipVel = 0;
    this.cameraBreathY = 0;
    this.boostSpeedMult = 1;
    this.runnerAnimator.reset();

    this.playerSprite
      .setVisible(true)
      .setAlpha(1)
      .setRotation(0)
      .setTexture(this.runnerAnimator.getTextureKey());

    // Spawn an inviting opening coin trail straight down the center lane
    for (let i = 0; i < 5; i++) {
      this.spawnCoin(0, 0.07, 0.42 + i * 0.085);
    }

    AudioManager.unlock();
    AudioManager.setMusicDucked(false);
    AudioManager.setMusicIntensity(0);
    AudioManager.startMusic();
    SDKBridge.gameplayStart();

    this.emitHudSnapshot(true);
  }

  public pauseGame(): void {
    if (this.mode !== 'PLAYING') return;
    this.mode = 'PAUSED';
    AudioManager.setMusicDucked(true);
    SDKBridge.gameplayStop();
    this.callbacks.onPauseToggle(true);
  }

  public resumeGame(): void {
    if (this.mode !== 'PAUSED') return;
    this.mode = 'PLAYING';
    AudioManager.unlock();
    AudioManager.setMusicDucked(false);
    SDKBridge.gameplayStart();
    this.callbacks.onPauseToggle(false);
  }

  public mobileAction(action: 'LEFT' | 'RIGHT' | 'JUMP' | 'SLIDE'): void {
    if (this.mode !== 'PLAYING') return;
    AudioManager.unlock();
    if (action === 'LEFT') this.moveLane(-1);
    else if (action === 'RIGHT') this.moveLane(1);
    else if (action === 'JUMP') this.triggerJump();
    else if (action === 'SLIDE') this.triggerSlide();
  }

  // ---- PLAYER ACTIONS ----

  private moveLane(dir: -1 | 1): void {
    const next = Phaser.Math.Clamp(this.targetLane + dir, -1, 1);
    if (next === this.targetLane) return;
    this.targetLane = next;
    AudioManager.playLaneSwitch(dir);
    this.spawnAfterimage(this.getActiveTrailColor());
  }

  private triggerJump(): void {
    if (!this.isJumping) {
      this.executeJump();
    } else {
      // Queue jump if player presses right before touching down
      this.jumpBufferTimer = 0.15;
    }
  }

  private executeJump(): void {
    this.isJumping = true;
    this.isSliding = false;
    this.slideTimer = 0;
    this.fastFalling = false;
    this.jumpBufferTimer = 0;
    this.playerVy = JUMP_VELOCITY;
    this.runnerAnimator.triggerJumpImpulse();
    AudioManager.playJump();

    const p = this.project(this.playerLaneX, 0, PLAYER_Z);
    const skin = getSkinSpec(this.equippedSkin);
    this.spawnBurst(p.x, p.y, skin.trimNum, 10, 1.0);
  }

  private triggerSlide(): void {
    if (this.isJumping) {
      // Fast-fall slam straight into a slide!
      this.fastFalling = true;
      this.playerVy = Math.min(this.playerVy, -4.4);
      AudioManager.playSlide();
      return;
    }

    if (!this.isSliding) {
      this.isSliding = true;
      this.slideTimer = SLIDE_DURATION;
      this.runnerAnimator.triggerSlideImpulse();
      AudioManager.playSlide();
      const p = this.project(this.playerLaneX, 0, PLAYER_Z);
      const skin = getSkinSpec(this.equippedSkin);
      this.spawnBurst(p.x, p.y, skin.coreNum, 8, 0.9);
    } else {
      // Refresh slide slightly if held/tapped again near end
      this.slideTimer = Math.max(this.slideTimer, 0.32);
    }
  }

  // ---- MAIN LOOP ----

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);

    if (this.mode === 'PAUSED') {
      return;
    }

    this.elapsedTime += dt;

    if (this.mode === 'ATTRACT') {
      const attractScrollRate = this.runSpeed * 1.4;
      this.worldScroll += attractScrollRate * dt;
      // Smooth auto lane cruise in attract mode (exponential easing prevents frame-1 velocity spike)
      const prevLane = this.playerLaneX;
      const waveLane = Math.sin(this.elapsedTime * 0.55) * 0.55;
      this.playerLaneX = Phaser.Math.Linear(this.playerLaneX, waveLane, 1 - Math.exp(-6 * dt));
      this.playerLaneVel = (this.playerLaneX - prevLane) / Math.max(0.001, dt);
      const attractTargetRot = Phaser.Math.Clamp(this.playerLaneVel * 0.04, -0.12, 0.12);
      this.playerSprite.setRotation(
        Phaser.Math.Linear(this.playerSprite.rotation, attractTargetRot, 1 - Math.exp(-14 * dt))
      );
      this.cameraSwayX = -this.playerLaneX * this.scale.width * 0.018;

      const skin = getSkinSpec(this.equippedSkin);
      const animOut = this.runnerAnimator.updateAndDraw({
        dt,
        elapsed: this.elapsedTime,
        groundScrollRate: attractScrollRate,
        laneVel: this.playerLaneVel,
        playerY: 0,
        playerVy: 0,
        isJumping: false,
        isSliding: false,
        isBoosting: false,
        animState: 'RUN',
        skin,
      });
      this.animSquashX = animOut.squashX;
      this.animSquashY = animOut.squashY;
      this.animGroundContact = animOut.groundContactFactor;
      this.animFootWeightX = animOut.footWeightX;
      this.animStrideBounce = animOut.strideBounceNorm;
      this.updateCameraVerticalPolish(dt, false, 0.25);
      if (animOut.footStrikeSide !== 0) {
        const footP = this.project(this.playerLaneX + animOut.footStrikeSide * 0.09, 0, PLAYER_Z);
        this.spawnBurst(footP.x, footP.y + 2, skin.trimNum, 2, 0.36);
      }

      this.updateCosmeticTrail(dt, this.runSpeed);
      this.updateParticles(dt);
      this.updateSpeedLines(dt, 0.25);
      this.renderFrame();
      return;
    }

    if (this.mode === 'CRASHING') {
      this.crashTimer -= dt;
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      // Settle runner smoothly onto the road while transitioning HURT -> DEATH
      this.playerY = Phaser.Math.Linear(this.playerY, 0, 1 - Math.exp(-12 * dt));
      this.playerSprite.setRotation(
        Phaser.Math.Linear(this.playerSprite.rotation, 0, 1 - Math.exp(-14 * dt))
      );

      const skin = getSkinSpec(this.equippedSkin);
      const crashAnimOut = this.runnerAnimator.updateAndDraw({
        dt,
        elapsed: this.elapsedTime,
        groundScrollRate: 0,
        laneVel: 0,
        playerY: this.playerY,
        playerVy: 0,
        isJumping: false,
        isSliding: false,
        isBoosting: false,
        animState: this.hurtTimer > 0 ? 'HURT' : 'DEATH',
        skin,
      });
      this.animSquashX = crashAnimOut.squashX;
      this.animSquashY = crashAnimOut.squashY;

      this.updateParticles(dt);
      this.updatePopups(dt);
      this.renderFrame();
      if (this.crashTimer <= 0) {
        this.finalizeGameOver();
      }
      return;
    }

    if (this.mode === 'GAMEOVER') {
      const skin = getSkinSpec(this.equippedSkin);
      const endAnimOut = this.runnerAnimator.updateAndDraw({
        dt,
        elapsed: this.elapsedTime,
        groundScrollRate: 0,
        laneVel: 0,
        playerY: 0,
        playerVy: 0,
        isJumping: false,
        isSliding: false,
        isBoosting: false,
        animState: this.isNewBest ? 'VICTORY' : 'DEATH',
        skin,
      });
      this.animSquashX = endAnimOut.squashX;
      this.animSquashY = endAnimOut.squashY;
      this.animGroundContact = 1;

      this.updateParticles(dt);
      this.updatePopups(dt);
      this.renderFrame();
      return;
    }

    // ---- PLAYING MODE ----
    this.updateDifficultyAndSpeed(dt);
    const targetBoostMult = this.boostTimer > 0 ? 1.58 : 1.0;
    this.boostSpeedMult = Phaser.Math.Linear(
      this.boostSpeedMult,
      targetBoostMult,
      1 - Math.exp(-14 * dt)
    );
    const effectiveSpeed = this.runSpeed * this.boostSpeedMult;

    this.worldScroll += effectiveSpeed * dt * 1.65;
    const distDelta = effectiveSpeed * dt * 52;
    this.distance += distDelta;

    const currentMult = this.multiplierTimer > 0 ? 2 : 1;
    this.score += distDelta * 1.6 * currentMult;

    if (Math.floor(this.score) > this.bestScore && this.bestScore > 0 && !this.isNewBest) {
      this.isNewBest = true;
      this.callbacks.onBannerEvent('NEW HIGH SCORE!', 'gold');
      SDKBridge.happyTime(0.75);
    }

    const speedKmh = Math.round(80 + (effectiveSpeed - BASE_SPEED) * 315);
    if (speedKmh > this.topSpeedKmh) this.topSpeedKmh = speedKmh;

    this.updateTimers(dt);
    this.updatePlayerPhysics(dt, effectiveSpeed);
    this.updateCosmeticTrail(dt, effectiveSpeed);
    this.updateSpawning(dt, effectiveSpeed);
    this.updateEntitiesAndCollisions(dt, effectiveSpeed, currentMult);
    this.updateParticles(dt);
    this.updatePopups(dt);
    this.updateSpeedLines(dt, (effectiveSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED));

    this.renderFrame();

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitHudSnapshot(false);
    }
  }

  private updateDifficultyAndSpeed(dt: number): void {
    // Gentle onboarding warm-up for the first 260m, then progressive ramp into high-speed overdrive
    const earlyProgress = Math.min(1, this.distance / 260);
    const lateDistance = Math.max(0, this.distance - 260);
    const targetSpeed = Math.min(
      MAX_SPEED,
      BASE_SPEED + earlyProgress * 0.1 + Math.sqrt(lateDistance) * 0.0155
    );
    this.runSpeed = Phaser.Math.Linear(this.runSpeed, targetSpeed, Math.min(1, dt * 2.2));
    const norm = Phaser.Math.Clamp(
      (this.runSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED),
      0,
      1
    );
    AudioManager.setMusicIntensity(this.boostTimer > 0 ? 1 : norm);
  }

  private updateTimers(dt: number): void {
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.magnetTimer > 0) this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    if (this.multiplierTimer > 0) this.multiplierTimer = Math.max(0, this.multiplierTimer - dt);
    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      if (this.boostTimer === 0) {
        // Brief grace period after boost ends so player isn't blindsided
        this.invulnTimer = Math.max(this.invulnTimer, 0.9);
      }
    }
    if (this.coinStreakTimer > 0) {
      this.coinStreakTimer -= dt;
      if (this.coinStreakTimer <= 0) this.coinStreak = 0;
    }
  }

  private updatePlayerPhysics(dt: number, effectiveSpeed: number): void {
    // Snappy exponential lane interpolation without final-frame velocity snap jitter
    const prevLaneX = this.playerLaneX;
    this.playerLaneX = Phaser.Math.Linear(
      this.playerLaneX,
      this.targetLane,
      1 - Math.exp(-20 * dt)
    );
    const laneDelta = this.playerLaneX - prevLaneX;
    if (Math.abs(this.playerLaneX - this.targetLane) < 0.002) {
      this.playerLaneX = this.targetLane;
      this.playerLaneVel = 0;
    } else {
      this.playerLaneVel = laneDelta / Math.max(0.001, dt);
    }

    // Subtle dt-independent outer pivot lean complementing the anatomical rig lean
    const targetRot = Phaser.Math.Clamp(this.playerLaneVel * 0.02, -0.11, 0.11);
    this.playerSprite.setRotation(
      Phaser.Math.Linear(this.playerSprite.rotation, targetRot, 1 - Math.exp(-16 * dt))
    );

    // Dynamic subtle camera parallax sway
    const desiredSway = -this.playerLaneX * this.scale.width * 0.024;
    this.cameraSwayX = Phaser.Math.Linear(this.cameraSwayX, desiredSway, 1 - Math.exp(-10 * dt));

    // Jump & gravity
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= dt;
    }

    const skin = getSkinSpec(this.equippedSkin);

    if (this.isJumping) {
      const grav = this.fastFalling ? GRAVITY * 2.2 : GRAVITY;
      this.playerVy -= grav * dt;
      this.playerY += this.playerVy * dt;

      if (this.playerY <= 0) {
        const wasFastFalling = this.fastFalling;
        this.playerY = 0;
        this.playerVy = 0;
        this.isJumping = false;
        this.runnerAnimator.triggerLandingImpact(wasFastFalling ? 1.45 : 1.0);
        this.cameraDipVel += wasFastFalling ? 115 : 68;

        const landP = this.project(this.playerLaneX, 0, PLAYER_Z);
        this.collisionManager.emitJumpLandingFeedback({
          footX: landP.x,
          footY: landP.y + 2 * landP.scale,
          scale: landP.scale,
          primaryColor: skin.trimNum,
          accentColor: skin.coreNum,
          wasFastFalling,
        });
        this.spawnLandingRipple(
          landP.x,
          landP.y + 2,
          wasFastFalling ? skin.coreNum : skin.trimNum,
          landP.scale * (wasFastFalling ? 1.25 : 0.92)
        );

        if (wasFastFalling) {
          this.fastFalling = false;
          this.isSliding = true;
          this.slideTimer = SLIDE_DURATION;
        } else if (this.jumpBufferTimer > 0) {
          this.executeJump();
        }
      }
    }

    // Slide timer & friction sparks
    if (this.isSliding) {
      this.slideTimer -= dt;
      this.slideSparkTimer -= dt;
      if (this.slideSparkTimer <= 0) {
        this.slideSparkTimer = 0.04;
        const p = this.project(this.playerLaneX, 0, PLAYER_Z);
        this.spawnBurst(p.x, p.y + 2, skin.coreNum, 2, 0.58);
      }
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    // Boost trail & afterimages
    if (this.boostTimer > 0) {
      this.boostTrailTimer -= dt;
      if (this.boostTrailTimer <= 0) {
        this.boostTrailTimer = 0.04;
        this.spawnAfterimage(0x38f9d7);
        const p = this.project(this.playerLaneX, this.playerY, PLAYER_Z);
        this.spawnBurst(p.x, p.y - 18 * p.scale, 0x38f9d7, 3, 0.8);
      }
    } else if (Math.abs(this.playerLaneX - this.targetLane) > 0.25) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = 0.05;
        this.spawnAfterimage(this.getActiveTrailColor());
      }
    }

    // Drive velocity-synchronized sprite animation & footstep contact sparks
    const groundScrollRate = effectiveSpeed * 1.65;
    const animState: CharacterAnimState =
      this.hurtTimer > 0
        ? 'HURT'
        : this.isJumping
          ? 'JUMP'
          : this.isSliding
            ? 'SLIDE'
            : 'RUN';

    const animOut = this.runnerAnimator.updateAndDraw({
      dt,
      elapsed: this.elapsedTime,
      groundScrollRate,
      laneVel: this.playerLaneVel,
      playerY: this.playerY,
      playerVy: this.playerVy,
      isJumping: this.isJumping,
      isSliding: this.isSliding,
      isBoosting: this.boostTimer > 0,
      animState,
      skin,
    });
    this.animSquashX = animOut.squashX;
    this.animSquashY = animOut.squashY;
    this.animGroundContact = animOut.groundContactFactor;
    this.animFootWeightX = animOut.footWeightX;
    this.animStrideBounce = animOut.strideBounceNorm;

    const speedNorm = Phaser.Math.Clamp(
      (effectiveSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED),
      0,
      1.3
    );
    this.updateCameraVerticalPolish(dt, animState === 'RUN', speedNorm);

    if (animOut.footStrikeSide !== 0) {
      const footP = this.project(this.playerLaneX + animOut.footStrikeSide * 0.09, 0, PLAYER_Z);
      this.spawnBurst(footP.x, footP.y + 2, skin.trimNum, 2, 0.44);
    }
  }

  private updateCameraVerticalPolish(dt: number, isRunning: boolean, speedNorm: number): void {
    // Soft damped landing dip spring (subtle tactile weight on touchdown, zero jarring shake)
    const dipForce = -170 * this.cameraDipY - 20 * this.cameraDipVel;
    this.cameraDipVel += dipForce * dt;
    this.cameraDipY = Phaser.Math.Clamp(this.cameraDipY + this.cameraDipVel * dt, -3, 10);
    if (Math.abs(this.cameraDipY) < 0.02 && Math.abs(this.cameraDipVel) < 0.1) {
      this.cameraDipY = 0;
      this.cameraDipVel = 0;
    }

    // Subtle stride-synced vertical micro-horizon breath during active running
    const targetBreath = isRunning ? this.animStrideBounce * (1.2 + speedNorm * 1.1) : 0;
    this.cameraBreathY = Phaser.Math.Linear(
      this.cameraBreathY,
      targetBreath,
      1 - Math.exp(-14 * dt)
    );
  }

  private spawnLandingRipple(x: number, y: number, color: number, scaleBase: number): void {
    const ring = this.add
      .image(x, y, 'particle_ring')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(491)
      .setScale(0.35 * scaleBase, 0.11 * scaleBase)
      .setAlpha(0.75);

    this.tweens.add({
      targets: ring,
      scaleX: 1.45 * scaleBase,
      scaleY: 0.36 * scaleBase,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private getActiveTrailColor(): number {
    if (this.equippedTrail === 'prism_overdrive') {
      const hue = (this.elapsedTime * 0.45) % 1;
      return Phaser.Display.Color.HSLToColor(hue, 1, 0.58).color;
    }
    return getTrailSpec(this.equippedTrail).primaryNum;
  }

  private updateCosmeticTrail(dt: number, speed: number): void {
    // Advance existing trail ribbon samples behind the runner
    for (let i = this.trailHistory.length - 1; i >= 0; i--) {
      this.trailHistory[i].z -= speed * dt * 0.62;
      if (this.trailHistory[i].z < -0.05) {
        this.trailHistory.splice(i, 1);
      }
    }

    if (
      this.equippedTrail === 'solar_ribbon' ||
      this.equippedTrail === 'prism_overdrive'
    ) {
      this.trailHistory.unshift({
        laneX: this.playerLaneX,
        y: this.playerY + (this.isSliding ? 0.03 : 0.05),
        z: PLAYER_Z - 0.004,
      });
      if (this.trailHistory.length > 22) {
        this.trailHistory.pop();
      }
    }

    // Continuous spark emitter for Plasma Sparks & Prism Overdrive
    if (
      this.equippedTrail === 'plasma_sparks' ||
      this.equippedTrail === 'prism_overdrive'
    ) {
      this.cosmeticSparkTimer -= dt;
      if (this.cosmeticSparkTimer <= 0) {
        this.cosmeticSparkTimer = this.equippedTrail === 'plasma_sparks' ? 0.045 : 0.06;
        const p = this.project(this.playerLaneX, this.playerY + 0.04, PLAYER_Z);
        const trailSpec = getTrailSpec(this.equippedTrail);
        const color =
          this.equippedTrail === 'prism_overdrive'
            ? this.getActiveTrailColor()
            : Math.random() < 0.55
              ? trailSpec.primaryNum
              : trailSpec.secondaryNum;
        this.spawnBurst(p.x + (Math.random() - 0.5) * 18 * p.scale, p.y, color, 1, 0.45);
      }
    }
  }

  // ---- FAIR PROCEDURAL PATTERN SPAWNER ----

  private updateSpawning(dt: number, effectiveSpeed: number): void {
    this.nextWaveDist -= effectiveSpeed * dt;
    this.powerUpSpawnTimer -= dt;

    if (this.nextWaveDist <= 0) {
      this.spawnNextWave();
      // Generous wave spacing early on, tightening progressively as speed builds
      const speedFactor = Phaser.Math.Clamp(
        (this.runSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED),
        0,
        1
      );
      this.nextWaveDist = Phaser.Math.Linear(0.68, 0.34, speedFactor) + Math.random() * 0.1;
    }

    if (this.powerUpSpawnTimer <= 0) {
      this.powerUpSpawnTimer = 12 + Math.random() * 6;
      this.spawnRandomPowerUp();
    }
  }

  private spawnNextWave(): void {
    const lanes = [-1, 0, 1];
    const roll = Math.random();

    // Progressive 4-phase difficulty gating by distance
    const isWarmup = this.distance < 220;
    const canSpawnHighGate = this.distance >= 130;
    const canSpawnDouble = this.distance >= 240;
    const canSpawnCombo = this.distance >= 440;
    const canSpawnDrone = this.distance >= 680;

    // Probability of dual-lane walls scales smoothly with distance
    const doubleWallChance = Phaser.Math.Clamp(0.28 + (this.distance - 240) / 1400, 0.28, 0.58);

    if (canSpawnDrone && roll < 0.16) {
      // Moving drone patrolling across lanes + safe flank coins
      const startLane = Math.random() < 0.5 ? -0.5 : 0.5;
      this.spawnObstacle('DRONE', startLane, 1.0, {
        dronePhase: Math.random() * Math.PI * 2,
        droneAmp: 0.72,
        droneSpeed: 1.95 + Math.random() * 0.85,
      });
      const coinLane = startLane < 0 ? 1 : -1;
      for (let i = 0; i < 4; i++) {
        this.spawnCoin(coinLane, 0.07, 0.96 + i * 0.055);
      }
      this.lastSafeLane = coinLane;
      return;
    }

    if (canSpawnCombo && roll < 0.3) {
      // Rhythm combo: Jump over LOW barrier -> Slide under HIGH laser gate!
      const lane = lanes[Math.floor(Math.random() * 3)];
      this.spawnObstacle('LOW', lane, 0.96);
      this.spawnObstacle('HIGH', lane, 1.28);

      // Add a blocker in one other lane to encourage taking the stylish combo line
      const otherLanes = lanes.filter((l) => l !== lane);
      const blockLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
      this.spawnObstacle('FULL', blockLane, 0.96);

      // Parabolic coin arc over the LOW barrier!
      this.spawnJumpCoinArc(lane, 0.96);
      // Low coin line under the HIGH laser gate!
      for (let i = 0; i < 3; i++) {
        this.spawnCoin(lane, 0.06, 1.22 + i * 0.055);
      }
      this.lastSafeLane = lane;
      this.nextWaveDist += 0.25;
      return;
    }

    if (canSpawnDouble && roll < 0.3 + doubleWallChance) {
      // Dual-lane obstacle wall — ALWAYS leaves 1 open lane
      const openLane = this.pickFairNextLane();
      const blockedLanes = lanes.filter((l) => l !== openLane);

      for (const bLane of blockedLanes) {
        const typeRoll = Math.random();
        const type: ObstacleType =
          typeRoll < 0.44 ? 'FULL' : typeRoll < 0.73 ? 'LOW' : 'HIGH';
        this.spawnObstacle(type, bLane, 1.0);
      }

      // Coin trail through the open lane
      for (let i = 0; i < 5; i++) {
        this.spawnCoin(openLane, 0.07, 0.92 + i * 0.055);
      }
      this.lastSafeLane = openLane;
      return;
    }

    // Simple, readable single-lane obstacle with clear guiding coins
    const mainLane = lanes[Math.floor(Math.random() * 3)];
    const tRoll = Math.random();
    let type: ObstacleType;
    if (isWarmup && !canSpawnHighGate) {
      // First 130m: alternate simple dodgeable monoliths & jump hurdles
      type = tRoll < 0.52 ? 'FULL' : 'LOW';
    } else if (isWarmup) {
      type = tRoll < 0.36 ? 'LOW' : tRoll < 0.68 ? 'HIGH' : 'FULL';
    } else {
      type = tRoll < 0.38 ? 'LOW' : tRoll < 0.72 ? 'HIGH' : 'FULL';
    }

    this.spawnObstacle(type, mainLane, 1.0);

    if (type === 'LOW') {
      this.spawnJumpCoinArc(mainLane, 1.0);
    } else if (type === 'HIGH') {
      for (let i = 0; i < 4; i++) {
        this.spawnCoin(mainLane, 0.06, 0.93 + i * 0.05);
      }
    } else {
      const openLanes = lanes.filter((l) => l !== mainLane);
      const coinLane = openLanes[Math.floor(Math.random() * openLanes.length)];
      for (let i = 0; i < 5; i++) {
        this.spawnCoin(coinLane, 0.07, 0.92 + i * 0.055);
      }
      this.lastSafeLane = coinLane;
    }
  }

  private pickFairNextLane(): number {
    // Prefer adjacent or same lane so transitions at high speed feel great
    const candidates = [-1, 0, 1].filter((l) => Math.abs(l - this.lastSafeLane) <= 1);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private spawnJumpCoinArc(lane: number, centerZ: number): void {
    const offsets = [-0.09, -0.045, 0, 0.045, 0.09];
    const heights = [0.12, 0.28, 0.37, 0.28, 0.12];
    for (let i = 0; i < offsets.length; i++) {
      this.spawnCoin(lane, heights[i], centerZ + offsets[i]);
    }
  }

  private spawnObstacle(
    type: ObstacleType,
    lane: number,
    z: number,
    droneOpts?: { dronePhase: number; droneAmp: number; droneSpeed: number }
  ): void {
    this.obstacles.push({
      id: this.nextObstacleId++,
      type,
      lane,
      baseLane: lane,
      z,
      active: true,
      nearMissed: false,
      smashed: false,
      dronePhase: droneOpts?.dronePhase ?? 0,
      droneAmp: droneOpts?.droneAmp ?? 0,
      droneSpeed: droneOpts?.droneSpeed ?? 0,
    });
  }

  private spawnCoin(laneX: number, yHeight: number, z: number): void {
    const sprite = this.add.sprite(-200, -200, 'coin_0').setDepth(440);
    this.coins.push({
      laneX,
      yHeight,
      z,
      collected: false,
      magnetized: false,
      sprite,
      animOffset: Math.random() * 6,
    });
  }

  private spawnRandomPowerUp(): void {
    const pool: PowerUpType[] = this.hasShield
      ? ['MAGNET', 'MULTIPLIER', 'BOOST']
      : ['SHIELD', 'MAGNET', 'MULTIPLIER', 'BOOST'];
    const type = pool[Math.floor(Math.random() * pool.length)];

    const spawnZ = 1.02;
    const allLanes = [-1, 0, 1];
    const clearLanes = allLanes.filter(
      (l) => !this.obstacles.some((o) => Math.abs(o.lane - l) < 0.6 && Math.abs(o.z - spawnZ) < 0.18)
    );
    const candidateLanes = clearLanes.length > 0 ? clearLanes : allLanes;
    const lane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];

    const texKey =
      type === 'SHIELD'
        ? 'powerup_shield'
        : type === 'MAGNET'
          ? 'powerup_magnet'
          : type === 'MULTIPLIER'
            ? 'powerup_multiplier'
            : 'powerup_boost';

    const sprite = this.add.sprite(-200, -200, texKey).setDepth(460);
    this.powerUps.push({
      type,
      lane,
      z: spawnZ,
      collected: false,
      sprite,
      bobOffset: Math.random() * Math.PI * 2,
    });
  }

  // ---- ENTITIES & COLLISION DETECTION ----

  private updateEntitiesAndCollisions(dt: number, effectiveSpeed: number, currentMult: number): void {
    // 1. Obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z -= effectiveSpeed * dt;

      if (obs.type === 'DRONE') {
        obs.dronePhase += obs.droneSpeed * dt;
        obs.lane = Phaser.Math.Clamp(
          obs.baseLane + Math.sin(obs.dronePhase) * obs.droneAmp,
          -1,
          1
        );
      }

      if (obs.active && !obs.smashed) {
        const collisionOutcome = this.collisionManager.evaluateObstacleCollision({
          obstacleType: obs.type,
          obstacleLane: obs.lane,
          obstacleZ: obs.z,
          nearMissed: obs.nearMissed,
          playerLaneX: this.playerLaneX,
          playerY: this.playerY,
          playerZ: PLAYER_Z,
          isSliding: this.isSliding,
          isBoosting: this.boostTimer > 0,
        });

        if (collisionOutcome === 'HIT') {
          if (this.boostTimer > 0) {
            // Hyper-Boost smashes straight through obstacles!
            this.smashObstacle(obs, 100 * currentMult);
          } else if (this.invulnTimer <= 0) {
            if (this.hasShield) {
              this.consumeShieldOnHit(obs);
            } else {
              this.triggerCrash(obs);
              return;
            }
          }
        } else if (collisionOutcome === 'NEAR_MISS') {
          // Exciting Near-Miss bonus!
          obs.nearMissed = true;
          this.nearMissCount += 1;
          const bonus = 50 * currentMult;
          this.score += bonus;
          AudioManager.playNearMiss();
          const p = this.project(this.playerLaneX, this.playerY + 0.3, PLAYER_Z);
          this.spawnFloatingText(p.x, p.y - 26, `NEAR MISS +${bonus}`, '#00f0ff');
        }
      }

      if (obs.z < -0.09) {
        this.obstacles.splice(i, 1);
      }
    }

    // 2. Coins (including Magnet attraction!)
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.z -= effectiveSpeed * dt;

      if (!coin.collected) {
        if (this.magnetTimer > 0 && coin.z < 0.56 && coin.z > PLAYER_Z - 0.04) {
          coin.magnetized = true;
        }

        if (coin.magnetized) {
          coin.laneX = Phaser.Math.Linear(coin.laneX, this.playerLaneX, 1 - Math.exp(-15 * dt));
          coin.yHeight = Phaser.Math.Linear(
            coin.yHeight,
            this.playerY + 0.14,
            1 - Math.exp(-15 * dt)
          );
          coin.z = Phaser.Math.Linear(coin.z, PLAYER_Z, 1 - Math.exp(-9 * dt));
        }

        const zDiff = Math.abs(coin.z - PLAYER_Z);
        const xDiff = Math.abs(coin.laneX - this.playerLaneX);
        const playerCenterY = this.isSliding ? 0.08 : this.playerY + 0.16;
        const yDiff = Math.abs(coin.yHeight - playerCenterY);

        if (zDiff < 0.055 && xDiff < 0.52 && yDiff < 0.27) {
          coin.collected = true;
          this.coinsCollected += 1;
          this.coinStreak += 1;
          this.coinStreakTimer = 1.4;
          const pts = 15 * currentMult;
          this.score += pts;
          AudioManager.playCoin(this.coinStreak - 1);

          const p = this.project(coin.laneX, coin.yHeight, Math.max(PLAYER_Z, coin.z));
          this.spawnBurst(p.x, p.y, 0xffd166, 7, 0.75);
          if (this.coinStreak % 5 === 0) {
            this.spawnFloatingText(p.x, p.y - 24, `+${pts} x${this.coinStreak}`, '#ffd166');
          }
        }
      }

      if (coin.collected || coin.z < -0.07) {
        coin.sprite.destroy();
        this.coins.splice(i, 1);
      }
    }

    // 3. Power-Ups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.z -= effectiveSpeed * dt;

      if (!pu.collected) {
        const zDiff = Math.abs(pu.z - PLAYER_Z);
        const xDiff = Math.abs(pu.lane - this.playerLaneX);
        if (zDiff < 0.058 && xDiff < 0.55) {
          pu.collected = true;
          this.activatePowerUp(pu.type);
        }
      }

      if (pu.collected || pu.z < -0.07) {
        pu.sprite.destroy();
        this.powerUps.splice(i, 1);
      }
    }
  }

  private activatePowerUp(type: PowerUpType): void {
    AudioManager.playPowerUp();
    const p = this.project(this.playerLaneX, this.playerY + 0.18, PLAYER_Z);

    if (type === 'SHIELD') {
      this.hasShield = true;
      this.spawnBurst(p.x, p.y, 0x00f0ff, 18, 1.3);
      this.spawnShockwave(p.x, p.y, 0x00f0ff);
      this.callbacks.onBannerEvent('ENERGY SHIELD ACTIVE', 'cyan');
    } else if (type === 'MAGNET') {
      this.magnetTimer = MAGNET_DURATION;
      this.spawnBurst(p.x, p.y, 0xff2a85, 18, 1.3);
      this.spawnShockwave(p.x, p.y, 0xff2a85);
      this.callbacks.onBannerEvent('COIN MAGNET ACTIVE', 'pink');
    } else if (type === 'MULTIPLIER') {
      this.multiplierTimer = MULTIPLIER_DURATION;
      this.spawnBurst(p.x, p.y, 0xc77dff, 18, 1.3);
      this.spawnShockwave(p.x, p.y, 0xc77dff);
      this.callbacks.onBannerEvent('2X SCORE MULTIPLIER', 'purple');
    } else if (type === 'BOOST') {
      this.boostTimer = BOOST_DURATION;
      this.spawnBurst(p.x, p.y, 0x38f9d7, 22, 1.5);
      this.spawnShockwave(p.x, p.y, 0x38f9d7);
      this.cameras.main.shake(180, 0.006);
      this.callbacks.onBannerEvent('HYPER BOOST OVERDRIVE!', 'cyan');
    }
    this.emitHudSnapshot(true);
  }

  private smashObstacle(obs: ObstacleEntity, bonusPoints: number): void {
    obs.smashed = true;
    obs.active = false;
    this.obstaclesSmashed += 1;
    this.score += bonusPoints;
    AudioManager.playShieldBreak();
    this.cameras.main.shake(120, 0.008);

    const p = this.project(obs.lane, 0.15, Math.max(PLAYER_Z, obs.z));
    this.spawnBurst(p.x, p.y, 0x00f0ff, 18, 1.4);
    this.spawnBurst(p.x, p.y, 0xff2a85, 12, 1.2);
    this.spawnFloatingText(p.x, p.y - 36, `SMASH +${bonusPoints}`, '#38f9d7');
  }

  private consumeShieldOnHit(obs: ObstacleEntity): void {
    this.hasShield = false;
    this.invulnTimer = 1.35;
    this.hurtTimer = 0.42;
    obs.active = false;
    obs.smashed = true;
    this.runnerAnimator.triggerHurtImpulse();

    // Also clear any immediately overlapping obstacles so player lands safely
    for (const other of this.obstacles) {
      if (Math.abs(other.z - PLAYER_Z) < 0.14) {
        other.active = false;
        other.smashed = true;
      }
    }

    AudioManager.playShieldBreak();
    this.cameras.main.shake(220, 0.014);

    const p = this.project(this.playerLaneX, this.playerY + 0.15, PLAYER_Z);
    this.spawnShockwave(p.x, p.y, 0x00f0ff);
    this.spawnBurst(p.x, p.y, 0x00f0ff, 26, 1.5);
    this.spawnFloatingText(p.x, p.y - 42, 'SHIELD ABSORBED!', '#00f0ff');
    this.emitHudSnapshot(true);
  }

  private triggerCrash(obs: ObstacleEntity): void {
    obs.active = false;
    this.mode = 'CRASHING';
    this.crashTimer = 0.82;
    this.hurtTimer = 0.3;
    this.runnerAnimator.triggerHurtImpulse();

    AudioManager.playCollision();
    AudioManager.setMusicDucked(true);
    SDKBridge.gameplayStop();

    this.cameras.main.shake(320, 0.022);
    this.cameras.main.flash(180, 255, 42, 133, false);

    const p = this.project(this.playerLaneX, this.playerY + 0.14, PLAYER_Z);
    this.spawnShockwave(p.x, p.y, 0xff2a85);
    this.spawnBurst(p.x, p.y, 0xff2a85, 28, 1.7);
    this.spawnBurst(p.x, p.y, 0x00f0ff, 20, 1.4);
    this.playerSprite.setVisible(true).setAlpha(1);
  }

  private finalizeGameOver(): void {
    this.mode = 'GAMEOVER';

    const finalScore = Math.floor(this.score);
    const finalDist = Math.floor(this.distance);
    const prevBest = StorageManager.getBestScore();
    const updatedBest = StorageManager.setBestScore(finalScore);
    StorageManager.setBestDistance(finalDist);
    StorageManager.addDistance(finalDist);
    StorageManager.addCoins(this.coinsCollected);
    StorageManager.incrementRuns();
    StorageManager.addNearMisses(this.nearMissCount);
    StorageManager.addObstaclesSmashed(this.obstaclesSmashed);
    StorageManager.recordTopSpeedKmh(this.topSpeedKmh);

    const { newlyUnlocked } = StorageManager.evaluateAchievements();
    if (newlyUnlocked.length > 0) {
      AudioManager.playPurchase();
    }

    const isNewBest = finalScore > prevBest && finalScore > 0;
    this.isNewBest = isNewBest;
    this.bestScore = updatedBest;

    const summary: GameOverSummary = {
      score: finalScore,
      bestScore: updatedBest,
      isNewBest,
      distance: finalDist,
      coins: this.coinsCollected,
      nearMissCount: this.nearMissCount,
      topSpeedKmh: this.topSpeedKmh,
      newlyUnlockedBadges: newlyUnlocked,
    };

    this.callbacks.onGameOver(summary);
  }

  // ---- EFFECTS & PARTICLES ----

  private spawnBurst(x: number, y: number, color: number, count: number, speedScale: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 140) break;
      const angle = Math.random() * Math.PI * 2;
      const spd = (80 + Math.random() * 260) * speedScale;
      const tex = i % 2 === 0 ? 'particle_spark' : 'particle_glow';
      const sprite = this.add
        .image(x, y, tex)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(700);
      const size = 0.35 + Math.random() * 0.65;
      sprite.setScale(size);

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 45,
        life: 0.28 + Math.random() * 0.32,
        maxLife: 0.6,
        size,
        color,
        sprite,
      });
    }
  }

  private spawnShockwave(x: number, y: number, color: number): void {
    const ring = this.add
      .image(x, y, 'particle_ring')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(710)
      .setScale(0.35)
      .setAlpha(0.95);

    this.tweens.add({
      targets: ring,
      scale: 2.8,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private spawnAfterimage(tint = 0x00f0ff): void {
    if (!this.playerSprite.visible) return;
    const slotKey = `runner_ghost_slot_${this.ghostSlotIdx}`;
    this.ghostSlotIdx = (this.ghostSlotIdx + 1) % 6;
    const frozenKey = this.runnerAnimator.copySnapshotTo(this, slotKey);

    const ghost = this.add
      .sprite(this.playerSprite.x, this.playerSprite.y, frozenKey)
      .setOrigin(this.playerSprite.originX, this.playerSprite.originY)
      .setScale(this.playerSprite.scaleX, this.playerSprite.scaleY)
      .setRotation(this.playerSprite.rotation)
      .setTint(tint)
      .setAlpha(0.46)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(492);

    this.tweens.add({
      targets: ghost,
      alpha: 0,
      scaleX: ghost.scaleX * 1.12,
      scaleY: ghost.scaleY * 0.94,
      duration: 210,
      ease: 'Quad.easeOut',
      onComplete: () => ghost.destroy(),
    });
  }

  private spawnFloatingText(x: number, y: number, label: string, color: string): void {
    const text = this.add
      .text(x, y, label, {
        fontFamily: '"Chakra Petch", sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color,
        stroke: '#060714',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(760);

    this.popups.push({
      text,
      vy: -72,
      life: 0.72,
      maxLife: 0.72,
    });
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt;
      const ratio = p.life / p.maxLife;
      p.sprite.setPosition(p.x, p.y);
      p.sprite.setAlpha(Math.min(1, ratio * 1.4));
      p.sprite.setScale(p.size * (0.4 + ratio * 0.6));
    }
  }

  private updatePopups(dt: number): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      if (pop.life <= 0) {
        pop.text.destroy();
        this.popups.splice(i, 1);
        continue;
      }
      pop.text.y += pop.vy * dt;
      pop.text.setAlpha(Math.min(1, (pop.life / pop.maxLife) * 1.5));
    }
  }

  private updateSpeedLines(dt: number, intensity: number): void {
    const speedMult = 1 + intensity * 1.8 + (this.boostTimer > 0 ? 1.6 : 0);
    for (const sl of this.speedLines) {
      sl.dist += sl.speed * dt * speedMult;
      if (sl.dist > 1.15) {
        sl.dist = 0.16 + Math.random() * 0.25;
        sl.angle = Math.random() * Math.PI * 2;
      }
    }
  }

  // ---- PERSPECTIVE PROJECTION & RENDERING ----

  private getViewportMetrics() {
    const w = this.scale.width;
    const h = this.scale.height;
    const isPortrait = h > w * 1.05;
    const verticalResponse = this.cameraDipY + this.cameraBreathY;
    const horizonY = h * (isPortrait ? 0.29 : 0.33) + verticalResponse;
    const bottomY = h * 0.99 + this.cameraDipY * 0.4;
    const vanishX = w * 0.5 + this.cameraSwayX;
    const roadBottomWidth = isPortrait ? w * 0.96 : Math.min(w * 0.68, h * 0.96);
    const roadTopWidth = roadBottomWidth * 0.092;
    return { w, h, horizonY, bottomY, vanishX, roadBottomWidth, roadTopWidth };
  }

  private project(laneX: number, yHeight: number, z: number): ProjectedPoint {
    const { horizonY, bottomY, vanishX, roadBottomWidth, roadTopWidth } = this.getViewportMetrics();
    const clampedZ = Math.max(-0.075, z);
    const t = 1 / (1 + clampedZ * PERSP_K);
    const u = (t - T_MIN) / (1 - T_MIN);

    const roadWidth = roadTopWidth + (roadBottomWidth - roadTopWidth) * u;
    const laneWidth = roadWidth / 3;
    const x = vanishX + laneX * laneWidth;
    const groundY = horizonY + (bottomY - horizonY) * u;
    const y = groundY - yHeight * (roadWidth * 0.44);
    const scale = roadWidth / 520;

    return { x, y, scale, roadWidth, laneWidth, u };
  }

  private renderFrame(): void {
    this.renderSkyAndSun();
    this.renderCitySkyline();
    this.renderNeonHighway();
    this.renderEntities();
    this.renderPlayer();
    this.renderSpeedLines();
  }

  private renderSkyAndSun(): void {
    const { w, h, horizonY, vanishX } = this.getViewportMetrics();
    const g = this.skyGfx;
    g.clear();

    // Multi-band cosmic midnight-violet sky gradient
    const skyColors = [0x050612, 0x090b21, 0x130f33, 0x241247, 0x3b1557];
    const bandH = horizonY / skyColors.length;
    for (let i = 0; i < skyColors.length; i++) {
      g.fillStyle(skyColors[i], 1);
      g.fillRect(0, i * bandH, w, bandH + 2);
    }

    // Ground void beneath horizon
    g.fillStyle(0x060716, 1);
    g.fillRect(0, horizonY, w, h - horizonY);

    // Subtle neon purple-pink atmospheric glow along the horizon
    g.fillStyle(0x9d4edd, 0.16);
    g.fillEllipse(vanishX, horizonY, w * 0.85, horizonY * 0.55);
    g.fillStyle(0xff2a85, 0.12);
    g.fillEllipse(vanishX, horizonY, w * 0.52, horizonY * 0.34);

    // Twinkling stars
    for (const s of this.stars) {
      const alpha = 0.35 + 0.65 * Math.abs(Math.sin(this.elapsedTime * 1.8 + s.phase));
      const sx = ((s.nx * w + this.cameraSwayX * 0.25) % w + w) % w;
      const sy = s.ny * h;
      g.fillStyle(s.color, alpha);
      g.fillCircle(sx, sy, s.size);
    }

    // Retro-futuristic glowing synthwave sun resting on horizon
    const sunRadius = Math.min(w, h) * 0.115;
    const sunPulse = 1 + Math.sin(this.elapsedTime * 3.2) * 0.025;
    const sunY = horizonY - sunRadius * 0.22;

    // Outer sun halo
    g.fillStyle(0xff2a85, 0.14);
    g.fillCircle(vanishX, sunY, sunRadius * 1.48 * sunPulse);
    g.fillStyle(0x9d4edd, 0.12);
    g.fillCircle(vanishX, sunY, sunRadius * 1.85 * sunPulse);

    // Core sun disc (two-tone gradient approximation)
    g.fillStyle(0xff2a85, 0.92);
    g.fillCircle(vanishX, sunY, sunRadius);
    g.fillStyle(0xff9e00, 0.65);
    g.fillCircle(vanishX, sunY - sunRadius * 0.28, sunRadius * 0.68);

    // Classic synthwave horizontal scanline cutouts across lower half of sun
    g.fillStyle(0x241247, 0.92);
    for (let i = 0; i < 5; i++) {
      const cutY = sunY + sunRadius * (0.1 + i * 0.18);
      const cutH = Math.max(2, sunRadius * (0.04 + i * 0.018));
      g.fillRect(vanishX - sunRadius - 4, cutY, sunRadius * 2 + 8, cutH);
    }
  }

  private renderCitySkyline(): void {
    const { w, h, horizonY } = this.getViewportMetrics();
    const g = this.cityGfx;
    g.clear();

    // Distant jagged mountain wireframe ridge behind skyline
    g.lineStyle(1.5, 0x9d4edd, 0.45);
    g.beginPath();
    const segments = 14;
    for (let i = 0; i <= segments; i++) {
      const px = (i / segments) * w;
      const ridge =
        i % 2 === 0
          ? 0
          : Math.sin(i * 1.7 + 0.5) * h * 0.045 + h * 0.048;
      const py = horizonY - Math.abs(ridge);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.strokePath();

    // Futuristic neon cyber-city buildings
    const parallaxShift = this.cameraSwayX * 0.45;
    for (const b of this.buildings) {
      const bx = b.nx * w + parallaxShift;
      const bw = b.widthFrac * w;
      const bh = b.heightFrac * h;
      const by = horizonY - bh;

      // Building dark silhouette
      g.fillStyle(0x0b0d24, 0.95);
      g.fillRect(bx, by, bw, bh + 2);

      // Luminous top neon trim
      g.lineStyle(1.5, b.accentColor, 0.65);
      g.strokeRect(bx, by, bw, bh);

      // Subtle glowing window strips
      g.fillStyle(b.accentColor, 0.35);
      const padX = Math.max(3, bw * 0.16);
      const stepY = bh / (b.windowRows + 1);
      for (let r = 1; r <= b.windowRows; r++) {
        if ((r + Math.floor(bx)) % 2 === 0) {
          g.fillRect(bx + padX, by + r * stepY, bw - padX * 2, Math.max(1.5, stepY * 0.25));
        }
      }
    }

    // Crisp horizon laser line
    g.lineStyle(2.5, 0x00f0ff, 0.85);
    g.lineBetween(0, horizonY, w, horizonY);
  }

  private renderNeonHighway(): void {
    const { w, horizonY, bottomY, vanishX, roadBottomWidth, roadTopWidth } =
      this.getViewportMetrics();
    const g = this.roadGfx;
    g.clear();

    // 1. Outrun glowing purple cyber-grid & illuminated roadside terrain planes
    const gridCount = 12;
    const gridScroll = this.worldScroll % 1;
    for (let i = 0; i < gridCount; i++) {
      const z = 1 - (i + gridScroll) / gridCount;
      const p = this.project(0, 0, z);
      const alpha = 0.1 + p.u * 0.3;
      g.lineStyle(1 + p.u * 0.85, 0x9d4edd, alpha);
      g.lineBetween(0, p.y, w, p.y);
    }

    // Radial perspective floor grid lines extending outward from horizon
    g.lineStyle(1.1, 0x7b2cbf, 0.3);
    for (let k = -6; k <= 6; k++) {
      if (Math.abs(k) <= 1) continue;
      const topX = vanishX + k * (roadTopWidth * 0.82);
      const botX = vanishX + k * (roadBottomWidth * 0.62);
      g.lineBetween(topX, horizonY, botX, bottomY);
    }

    // 2. Elevated metallic roadside cyber-shoulders flanking both edges of the road
    const topLeft = vanishX - roadTopWidth * 0.5;
    const topRight = vanishX + roadTopWidth * 0.5;
    const botLeft = vanishX - roadBottomWidth * 0.5;
    const botRight = vanishX + roadBottomWidth * 0.5;

    const shoulderTopL = vanishX - roadTopWidth * 0.82;
    const shoulderBotL = vanishX - roadBottomWidth * 0.82;
    const shoulderTopR = vanishX + roadTopWidth * 0.82;
    const shoulderBotR = vanishX + roadBottomWidth * 0.82;

    g.fillStyle(0x111334, 0.88);
    g.beginPath();
    g.moveTo(shoulderTopL, horizonY);
    g.lineTo(topLeft, horizonY);
    g.lineTo(botLeft, bottomY);
    g.lineTo(shoulderBotL, bottomY);
    g.closePath();
    g.fillPath();

    g.beginPath();
    g.moveTo(topRight, horizonY);
    g.lineTo(shoulderTopR, horizonY);
    g.lineTo(shoulderBotR, bottomY);
    g.lineTo(botRight, bottomY);
    g.closePath();
    g.fillPath();

    // Outer shoulder magenta neon trim rails
    g.lineStyle(2, 0xff2a85, 0.55);
    g.lineBetween(shoulderTopL, horizonY, shoulderBotL, bottomY);
    g.lineBetween(shoulderTopR, horizonY, shoulderBotR, bottomY);

    // 3. Main futuristic highway surface trapezoid
    g.fillStyle(0x090d24, 0.98);
    g.beginPath();
    g.moveTo(topLeft, horizonY);
    g.lineTo(topRight, horizonY);
    g.lineTo(botRight, bottomY);
    g.lineTo(botLeft, bottomY);
    g.closePath();
    g.fillPath();

    // Center lane subtle luminous highlight
    g.fillStyle(0x14193d, 0.58);
    g.beginPath();
    g.moveTo(vanishX - roadTopWidth / 6, horizonY);
    g.lineTo(vanishX + roadTopWidth / 6, horizonY);
    g.lineTo(vanishX + roadBottomWidth / 6, bottomY);
    g.lineTo(vanishX - roadBottomWidth / 6, bottomY);
    g.closePath();
    g.fillPath();

    // Active lane highlight under player when playing
    if (this.mode === 'PLAYING') {
      const laneEdgeL = this.targetLane - 0.5;
      const laneEdgeR = this.targetLane + 0.5;
      const tlX = vanishX + laneEdgeL * (roadTopWidth / 3);
      const trX = vanishX + laneEdgeR * (roadTopWidth / 3);
      const blX = vanishX + laneEdgeL * (roadBottomWidth / 3);
      const brX = vanishX + laneEdgeR * (roadBottomWidth / 3);
      const tintColor = this.boostTimer > 0 ? 0x38f9d7 : 0x00f0ff;
      g.fillStyle(tintColor, this.boostTimer > 0 ? 0.14 : 0.08);
      g.beginPath();
      g.moveTo(tlX, horizonY);
      g.lineTo(trX, horizonY);
      g.lineTo(brX, bottomY);
      g.lineTo(blX, bottomY);
      g.closePath();
      g.fillPath();
    }

    // 4. Scrolling neon horizontal road ribs, glowing curb markers & lane speed chevrons
    const stripCount = 14;
    const stripScroll = (this.worldScroll * 1.5) % 1;
    const stripBaseIdx = Math.floor(this.worldScroll * 1.5);
    for (let i = 0; i < stripCount; i++) {
      const z = 1 - (i + stripScroll) / stripCount;
      if (z < 0.01) continue;
      const pCenter = this.project(0, 0, z);
      const halfW = pCenter.roadWidth * 0.5;

      // Cross-road pulse line
      g.lineStyle(1 + pCenter.u * 1.5, 0x3a0ca3, 0.25 + pCenter.u * 0.35);
      g.lineBetween(pCenter.x - halfW, pCenter.y, pCenter.x + halfW, pCenter.y);

      // Rhythmic glowing energy curb bars along both road shoulders
      const segIdx = stripBaseIdx - i;
      const curbColor = ((segIdx % 2) + 2) % 2 === 0 ? 0x00f0ff : 0xff2a85;
      const curbW = Math.max(4, pCenter.laneWidth * 0.24);
      const curbH = Math.max(1.5, pCenter.u * 4.5);
      g.fillStyle(curbColor, 0.4 + pCenter.u * 0.55);
      g.fillRect(pCenter.x - halfW - curbW - 2, pCenter.y - curbH * 0.5, curbW, curbH);
      g.fillRect(pCenter.x + halfW + 2, pCenter.y - curbH * 0.5, curbW, curbH);

      // Glowing directional speed chevrons in lanes every 2nd strip
      if (i % 2 === 0 && pCenter.u > 0.06) {
        const chevAlpha = Math.min(0.42, pCenter.u * 0.42);
        const chevColor = this.boostTimer > 0 ? 0x38f9d7 : 0x00f0ff;
        g.lineStyle(Math.max(1, pCenter.u * 2.2), chevColor, chevAlpha);
        for (const lane of [-1, 0, 1]) {
          const cx = vanishX + lane * pCenter.laneWidth;
          const cw = pCenter.laneWidth * 0.19;
          const ch = Math.max(2, pCenter.u * 10);
          g.beginPath();
          g.moveTo(cx - cw, pCenter.y + ch);
          g.lineTo(cx, pCenter.y - ch * 0.4);
          g.lineTo(cx + cw, pCenter.y + ch);
          g.strokePath();
        }
      }
    }

    // 5. Inner lane dividers (glowing purple-cyan rails)
    for (const divider of [-0.5, 0.5]) {
      const tx = vanishX + divider * (roadTopWidth / 3);
      const bx = vanishX + divider * (roadBottomWidth / 3);
      g.lineStyle(4, 0x9d4edd, 0.3);
      g.lineBetween(tx, horizonY, bx, bottomY);
      g.lineStyle(1.6, 0x00f0ff, 0.78);
      g.lineBetween(tx, horizonY, bx, bottomY);
    }

    // 6. Outer highway glowing neon guardrails
    g.lineStyle(11, 0x00f0ff, 0.24);
    g.lineBetween(topLeft, horizonY, botLeft, bottomY);
    g.lineBetween(topRight, horizonY, botRight, bottomY);

    g.lineStyle(3.4, 0x00f0ff, 0.96);
    g.lineBetween(topLeft, horizonY, botLeft, bottomY);
    g.lineBetween(topRight, horizonY, botRight, bottomY);

    // 7. Rich multi-layered animated cyber-corridor along BOTH sides of the highway
    //    Drawn strictly far-to-near so nearer towers, billboards, and arches overlap cleanly!
    const propCount = 11;
    const scrollUnits = this.worldScroll * 1.15;
    const scrollFrac = scrollUnits % 1;
    const baseWorldIdx = Math.floor(scrollUnits);
    const palette = [0x00f0ff, 0xff2a85, 0x9d4edd, 0xffbe0b, 0x38f9d7];

    for (let i = 0; i < propCount; i++) {
      const z = 1 - (i + scrollFrac) / propCount;
      if (z < 0.015) continue;

      // Stable deterministic ID for this roadside slot as it scrolls toward camera
      const slotId = baseWorldIdx + (propCount - i);
      const hashL = Math.abs((slotId * 73 + 19) % 100);
      const hashR = Math.abs((slotId * 137 + 41) % 100);
      const colorL = palette[hashL % palette.length];
      const colorR = palette[hashR % palette.length];
      const depthAlpha = Phaser.Math.Clamp(0.28 + (1 - z) * 0.95, 0.28, 1);

      // A) Outer Cyber-Skyscraper Monoliths flanking far left & right
      for (const side of [-1, 1] as const) {
        const sideHash = side === -1 ? hashL : hashR;
        const accent = side === -1 ? colorL : colorR;
        const outerP = this.project(side * 3.15, 0, z);
        const towerW = Math.max(8, outerP.laneWidth * (0.72 + (sideHash % 4) * 0.14));
        const towerH = outerP.roadWidth * (0.48 + (sideHash % 6) * 0.11);
        const tx = side === -1 ? outerP.x - towerW * 0.55 : outerP.x - towerW * 0.45;
        const ty = outerP.y - towerH;

        // Tower silhouette + subtle illuminated road-facing side bevel
        g.fillStyle(0x0c0e29, 0.95 * depthAlpha);
        g.fillRect(tx, ty, towerW, towerH);

        const bevelW = Math.max(2, towerW * 0.22);
        const bevelX = side === -1 ? tx + towerW - bevelW : tx;
        g.fillStyle(0x191d4a, 0.92 * depthAlpha);
        g.fillRect(bevelX, ty, bevelW, towerH);

        // Luminous neon vertical edge & rooftop trim
        g.lineStyle(Math.max(1.2, outerP.scale * 2.4), accent, 0.78 * depthAlpha);
        g.strokeRect(tx, ty, towerW, towerH);

        // Lit horizontal cyber-window bands
        const winRows = 4 + (sideHash % 4);
        const stepY = towerH / (winRows + 1);
        const winH = Math.max(1.5, stepY * 0.24);
        g.fillStyle(accent, 0.45 * depthAlpha);
        for (let r = 1; r <= winRows; r++) {
          if ((r + sideHash) % 3 !== 0) {
            g.fillRect(tx + towerW * 0.16, ty + r * stepY, towerW * 0.68, winH);
          }
        }

        // Rooftop antenna beacon on taller towers
        if (sideHash % 2 === 0 && outerP.u > 0.08) {
          const antX = tx + towerW * 0.5;
          const antH = towerH * 0.18;
          g.lineStyle(Math.max(1, outerP.scale * 1.8), accent, 0.8 * depthAlpha);
          g.lineBetween(antX, ty, antX, ty - antH);
          const blink = 0.5 + 0.5 * Math.sin(this.elapsedTime * 7 + slotId);
          g.fillStyle(accent, blink * depthAlpha);
          g.fillCircle(antX, ty - antH, Math.max(1.8, outerP.scale * 4));
        }
      }

      // B) Mid-ground Roadside Holographic Neon Billboards & Energy Towers (both sides!)
      for (const side of [-1, 1] as const) {
        const sideHash = side === -1 ? hashL : hashR;
        const accent = side === -1 ? colorR : colorL;
        const midP = this.project(side * 2.02, 0, z);
        const isBillboard = (slotId + (side === -1 ? 0 : 1)) % 2 === 0;

        if (isBillboard) {
          // Futuristic Floating Holographic Cyber-Billboard on twin support struts
          const boardW = Math.max(10, midP.laneWidth * 0.58);
          const boardH = Math.max(8, midP.roadWidth * 0.19);
          const poleH = midP.roadWidth * 0.2;
          const bx = midP.x - boardW * 0.5;
          const by = midP.y - poleH - boardH;

          // Support strut
          g.fillStyle(0x1b204d, 0.95 * depthAlpha);
          const strutW = Math.max(2, midP.scale * 7);
          g.fillRect(midP.x - strutW * 0.5, midP.y - poleH, strutW, poleH);

          // Holographic glow aura behind sign
          g.fillStyle(accent, 0.2 * depthAlpha);
          g.fillRoundedRect(
            bx - 3 * midP.scale,
            by - 3 * midP.scale,
            boardW + 6 * midP.scale,
            boardH + 6 * midP.scale,
            Math.max(2, 5 * midP.scale)
          );

          // Dark glass sign body + crisp neon frame
          g.fillStyle(0x0b102d, 0.92 * depthAlpha);
          g.fillRoundedRect(bx, by, boardW, boardH, Math.max(2, 4 * midP.scale));
          g.lineStyle(Math.max(1.4, midP.scale * 2.8), accent, 0.92 * depthAlpha);
          g.strokeRoundedRect(bx, by, boardW, boardH, Math.max(2, 4 * midP.scale));

          // Animated neon graphic bars / cyber glyph inside billboard
          const scan = 0.72 + 0.28 * Math.sin(this.elapsedTime * 8 + slotId + side);
          g.fillStyle(accent, 0.85 * scan * depthAlpha);
          g.fillRect(bx + boardW * 0.14, by + boardH * 0.22, boardW * 0.72, Math.max(2, boardH * 0.16));
          g.fillStyle(0xffffff, 0.8 * depthAlpha);
          g.fillRect(bx + boardW * 0.14, by + boardH * 0.5, boardW * 0.48, Math.max(1.5, boardH * 0.11));
          g.fillStyle(sideHash % 2 === 0 ? 0xff2a85 : 0x00f0ff, 0.85 * depthAlpha);
          g.fillRect(bx + boardW * 0.14, by + boardH * 0.72, boardW * 0.62, Math.max(1.5, boardH * 0.1));
        } else {
          // Futuristic Angled Neon Light Pylon + Energy Wing
          const pH = midP.roadWidth * 0.32;
          const pillarW = Math.max(3, midP.scale * 13);
          g.fillStyle(0x14183d, 0.95 * depthAlpha);
          g.fillRect(midP.x - pillarW * 0.5, midP.y - pH, pillarW, pH);
          g.fillStyle(accent, 0.92 * depthAlpha);
          g.fillRect(midP.x - pillarW * 0.22, midP.y - pH * 0.96, pillarW * 0.44, pH * 0.88);

          // Glowing overhead light arm curving slightly toward the road
          const armEndX = midP.x - side * midP.laneWidth * 0.3;
          const armEndY = midP.y - pH * 0.93;
          g.lineStyle(Math.max(2, midP.scale * 4.5), accent, 0.9 * depthAlpha);
          g.lineBetween(midP.x, midP.y - pH, armEndX, armEndY);
          g.fillStyle(0xffffff, 0.85 * depthAlpha);
          g.fillCircle(armEndX, armEndY, Math.max(1.8, midP.scale * 3.8));
        }
      }

      // C) Periodic Sweeping Futuristic Overhead Neon Highway Arches (every 4th slot)
      if (((slotId % 4) + 4) % 4 === 0 && z > 0.04) {
        const archL = this.project(-1.68, 0, z);
        const archR = this.project(1.68, 0, z);
        const archTopL = this.project(-1.38, 0.78, z);
        const archTopR = this.project(1.38, 0.78, z);
        const archPeak = this.project(0, 0.88, z);
        const archColor = ((Math.floor(slotId / 4) % 2) + 2) % 2 === 0 ? 0x00f0ff : 0x9d4edd;

        // Wide soft neon glow rib
        g.lineStyle(Math.max(3, archL.scale * 11), archColor, 0.22 * depthAlpha);
        g.beginPath();
        g.moveTo(archL.x, archL.y);
        g.lineTo(archTopL.x, archTopL.y);
        g.lineTo(archPeak.x, archPeak.y);
        g.lineTo(archTopR.x, archTopR.y);
        g.lineTo(archR.x, archR.y);
        g.strokePath();

        // Crisp glowing core arch frame
        g.lineStyle(Math.max(1.5, archL.scale * 3.8), archColor, 0.88 * depthAlpha);
        g.beginPath();
        g.moveTo(archL.x, archL.y);
        g.lineTo(archTopL.x, archTopL.y);
        g.lineTo(archPeak.x, archPeak.y);
        g.lineTo(archTopR.x, archTopR.y);
        g.lineTo(archR.x, archR.y);
        g.strokePath();

        // Central overhead white beacon accent
        g.fillStyle(0xffffff, 0.85 * depthAlpha);
        g.fillRect(
          archPeak.x - archL.laneWidth * 0.22,
          archPeak.y - Math.max(1.5, archL.scale * 2.5),
          archL.laneWidth * 0.44,
          Math.max(2, archL.scale * 4)
        );
      }
    }
  }

  private renderEntities(): void {
    this.obstaclesBehindGfx.clear();
    this.obstaclesFrontGfx.clear();

    // Sort obstacles far-to-near (largest z drawn first!)
    const sorted = [...this.obstacles].sort((a, b) => b.z - a.z);

    for (const obs of sorted) {
      if (obs.smashed || obs.z > 1.01 || obs.z < -0.06) continue;
      // Overhead HIGH gates draw on front layer when right at player so runner visually slides UNDER them!
      const isFront =
        obs.z < PLAYER_Z || (obs.type === 'HIGH' && obs.z < PLAYER_Z + 0.045);
      const gfx = isFront ? this.obstaclesFrontGfx : this.obstaclesBehindGfx;
      this.drawObstacle(gfx, obs);
    }

    // Update Coin sprites
    for (const coin of this.coins) {
      if (coin.collected || coin.z > 1.01) {
        coin.sprite.setVisible(false);
        continue;
      }
      const bob = Math.sin(this.elapsedTime * 6 + coin.animOffset) * 0.025;
      const p = this.project(coin.laneX, coin.yHeight + bob, coin.z);
      const frame = Math.floor(this.elapsedTime * 12 + coin.animOffset) % 6;
      coin.sprite
        .setVisible(true)
        .setTexture(`coin_${frame}`)
        .setPosition(p.x, p.y)
        .setScale(Math.max(0.1, p.scale * 0.62))
        .setDepth(coin.z >= PLAYER_Z ? 420 + (1 - coin.z) * 60 : 620 + (1 - coin.z) * 60);
    }

    // Update Power-Up sprites
    for (const pu of this.powerUps) {
      if (pu.collected || pu.z > 1.01) {
        pu.sprite.setVisible(false);
        continue;
      }
      const bob = Math.sin(this.elapsedTime * 5 + pu.bobOffset) * 0.045;
      const p = this.project(pu.lane, 0.17 + bob, pu.z);
      const pulse = 1 + Math.sin(this.elapsedTime * 8 + pu.bobOffset) * 0.08;
      pu.sprite
        .setVisible(true)
        .setPosition(p.x, p.y)
        .setScale(Math.max(0.14, p.scale * 0.72 * pulse))
        .setDepth(pu.z >= PLAYER_Z ? 450 + (1 - pu.z) * 40 : 640 + (1 - pu.z) * 40);
    }
  }

  private drawObstacle(g: Phaser.GameObjects.Graphics, obs: ObstacleEntity): void {
    const p = this.project(obs.lane, 0, obs.z);
    const laneW = p.laneWidth;
    // High early-distance visibility so players spot incoming barriers immediately
    const alpha = Phaser.Math.Clamp(0.46 + p.u * 2.1, 0.46, 1);
    const pulse = 0.84 + 0.16 * Math.sin(this.elapsedTime * 14 + obs.id);

    // High-contrast warning floor glow strip projecting slightly ahead of the obstacle
    const frontP = this.project(obs.lane, 0, Math.max(-0.04, obs.z - 0.048));
    const padColor =
      obs.type === 'LOW'
        ? 0xffbe0b
        : obs.type === 'HIGH'
          ? 0x00f0ff
          : 0xff2957;

    g.fillStyle(padColor, (obs.type === 'HIGH' ? 0.2 : 0.28) * alpha * pulse);
    g.beginPath();
    g.moveTo(p.x - laneW * 0.44, p.y);
    g.lineTo(p.x + laneW * 0.44, p.y);
    g.lineTo(frontP.x + frontP.laneWidth * 0.44, frontP.y);
    g.lineTo(frontP.x - frontP.laneWidth * 0.44, frontP.y);
    g.closePath();
    g.fillPath();

    // Crisp leading ground warning edge bar
    g.lineStyle(Math.max(1.5, 3 * p.scale), padColor, 0.85 * alpha);
    g.lineBetween(
      frontP.x - frontP.laneWidth * 0.42,
      frontP.y,
      frontP.x + frontP.laneWidth * 0.42,
      frontP.y
    );

    // Deep grounding contact shadow beneath obstacle
    g.fillStyle(0x000000, 0.58 * alpha);
    g.fillEllipse(p.x, p.y, laneW * 0.9, Math.max(5, laneW * 0.16));

    if (obs.type === 'LOW') {
      // JUMP-OVER NEON HURDLE (High-contrast Electric Amber + Cyan with crisp white rim!)
      const w = laneW * 0.88;
      const h = p.roadWidth * 0.135;
      const left = p.x - w * 0.5;
      const top = p.y - h;
      const radius = Math.max(3, 7 * p.scale);

      // Luminous amber-cyan outer halo
      g.fillStyle(0xffbe0b, 0.34 * alpha * pulse);
      g.fillRoundedRect(left - 6 * p.scale, top - 6 * p.scale, w + 12 * p.scale, h + 9 * p.scale, radius);

      // High-visibility armored base with bright gold top cap
      g.fillStyle(0x1f2854, 0.98 * alpha);
      g.fillRoundedRect(left, top, w, h, radius);

      // Vivid electric amber caution hazard stripes across front panel
      const stripeCount = 5;
      const stripeStep = (w * 0.78) / stripeCount;
      g.fillStyle(0xffbe0b, 0.96 * alpha);
      for (let s = 0; s < stripeCount; s++) {
        if (s % 2 === 0) {
          g.fillRect(left + w * 0.11 + s * stripeStep, top + h * 0.52, stripeStep * 0.72, h * 0.38);
        }
      }

      // Bright cyan plasma upper beam + white-hot core
      g.fillStyle(0x00f0ff, 0.98 * alpha);
      g.fillRect(left + w * 0.05, top + h * 0.1, w * 0.9, h * 0.36);
      g.fillStyle(0xffffff, 0.95 * alpha);
      g.fillRect(left + w * 0.09, top + h * 0.2, w * 0.82, h * 0.15);

      // Bright yellow-gold outer anchor posts
      g.fillStyle(0xffd166, 0.98 * alpha);
      g.fillRect(left, top, w * 0.11, h);
      g.fillRect(left + w * 0.89, top, w * 0.11, h);

      // Crisp bright white-cyan outer border
      g.lineStyle(Math.max(1.8, 3.2 * p.scale), 0xffffff, 0.92 * alpha);
      g.strokeRoundedRect(left, top, w, h, radius);

      // Bold pulsing double upward JUMP chevrons floating directly above hurdle
      const bob = Math.sin(this.elapsedTime * 10 + obs.id) * 3 * p.scale;
      const cw = w * 0.16;
      const ch = h * 0.3;
      for (let c = 0; c < 2; c++) {
        const cy = top - ch * (0.45 + c * 0.75) + bob;
        g.lineStyle(Math.max(2, 4 * p.scale), c === 0 ? 0x00f0ff : 0xffd166, alpha);
        g.beginPath();
        g.moveTo(p.x - cw, cy);
        g.lineTo(p.x, cy - ch * 0.85);
        g.lineTo(p.x + cw, cy);
        g.strokePath();
      }
    } else if (obs.type === 'HIGH') {
      // SLIDE-UNDER OVERHEAD LASER GATE (Bright Magenta/White beams + Clear Cyan Slide Tunnel!)
      const w = laneW * 0.94;
      const totalH = p.roadWidth * 0.36;
      const gapH = p.roadWidth * 0.16;
      const beamH = totalH - gapH;
      const left = p.x - w * 0.5;
      const top = p.y - totalH;
      const postW = Math.max(4, w * 0.125);

      // Illuminated left & right structural pylons
      g.fillStyle(0x281854, 0.98 * alpha);
      g.fillRect(left, top, postW, totalH);
      g.fillRect(left + w - postW, top, postW, totalH);

      // Bright neon edge strips on inner & outer sides of posts
      g.lineStyle(Math.max(1.8, 3 * p.scale), 0xff4da6, 0.98 * alpha);
      g.strokeRect(left, top, postW, totalH);
      g.strokeRect(left + w - postW, top, postW, totalH);

      // Glowing beacon caps atop both posts
      g.fillStyle(0xffbe0b, 0.95 * alpha * pulse);
      g.fillRect(left - 1, top - 4 * p.scale, postW + 2, Math.max(3, 6 * p.scale));
      g.fillRect(left + w - postW - 1, top - 4 * p.scale, postW + 2, Math.max(3, 6 * p.scale));

      // Intense magenta-pink glow aura around overhead barrier
      g.fillStyle(0xff2a85, 0.4 * alpha * pulse);
      g.fillRect(left + postW - 6 * p.scale, top - 6 * p.scale, w - postW * 2 + 12 * p.scale, beamH + 12 * p.scale);

      // Solid bright-bordered overhead beam housing
      g.fillStyle(0x47114f, 0.98 * alpha);
      g.fillRect(left + postW, top, w - postW * 2, beamH * 0.48);
      g.lineStyle(Math.max(1.8, 3 * p.scale), 0xffffff, 0.9 * alpha);
      g.strokeRect(left + postW, top, w - postW * 2, beamH * 0.48);

      // Twin blazing hot-pink & white-core laser bars across lower half of beam
      g.fillStyle(0xff2a85, 0.98 * alpha * pulse);
      g.fillRect(left + postW, top + beamH * 0.52, w - postW * 2, beamH * 0.22);
      g.fillRect(left + postW, top + beamH * 0.8, w - postW * 2, beamH * 0.2);

      g.fillStyle(0xffffff, 0.96 * alpha);
      g.fillRect(left + postW, top + beamH * 0.59, w - postW * 2, beamH * 0.09);
      g.fillRect(left + postW, top + beamH * 0.86, w - postW * 2, beamH * 0.08);

      // Pulsing double downward SLIDE chevrons pointing into the open cyan tunnel
      const cw = w * 0.14;
      for (let c = 0; c < 2; c++) {
        const cy = top + beamH * (0.14 + c * 0.18);
        g.lineStyle(Math.max(2, 3.6 * p.scale), c === 0 ? 0xffffff : 0x00f0ff, alpha);
        g.beginPath();
        g.moveTo(p.x - cw, cy);
        g.lineTo(p.x, cy + Math.max(4, 9 * p.scale));
        g.lineTo(p.x + cw, cy);
        g.strokePath();
      }
    } else if (obs.type === 'FULL') {
      // FULL-HEIGHT CYBER WALL / MONOLITH (Unmistakable Crimson-White Blocked Barrier!)
      const w = laneW * 0.86;
      const h = p.roadWidth * 0.36;
      const left = p.x - w * 0.5;
      const top = p.y - h;
      const radius = Math.max(3, 8 * p.scale);

      // Strong crimson-magenta hazard bloom
      g.fillStyle(0xff2957, 0.36 * alpha * pulse);
      g.fillRoundedRect(
        left - 7 * p.scale,
        top - 7 * p.scale,
        w + 14 * p.scale,
        h + 11 * p.scale,
        radius
      );

      // High-contrast deep plum-crimson armored chassis
      g.fillStyle(0x2d1038, 0.99 * alpha);
      g.fillRoundedRect(left, top, w, h, radius);

      // Bright top crimson-amber warning header bar
      g.fillStyle(0xff2957, 0.96 * alpha);
      g.fillRect(left + w * 0.05, top + h * 0.05, w * 0.9, h * 0.14);
      g.fillStyle(0xffd166, 0.92 * alpha);
      g.fillRect(left + w * 0.16, top + h * 0.09, w * 0.68, h * 0.055);

      // Thick bright outer neon wall frame + crisp inner white highlight
      g.lineStyle(Math.max(2.4, 4.4 * p.scale), 0xff2957, 0.98 * alpha);
      g.strokeRoundedRect(left, top, w, h, radius);
      g.lineStyle(Math.max(1.2, 2 * p.scale), 0xffffff, 0.82 * alpha);
      g.strokeRoundedRect(
        left + 2 * p.scale,
        top + 2 * p.scale,
        w - 4 * p.scale,
        h - 4 * p.scale,
        radius
      );

      // Bold blazing crimson + white "X" blocked barrier emblem
      const padX = w * 0.2;
      const padY = h * 0.27;
      g.lineStyle(Math.max(3.5, 8 * p.scale), 0xff2957, 0.95 * alpha);
      g.lineBetween(left + padX, top + padY, left + w - padX, top + h - padY * 0.55);
      g.lineBetween(left + w - padX, top + padY, left + padX, top + h - padY * 0.55);

      g.lineStyle(Math.max(1.6, 3.2 * p.scale), 0xffffff, 0.95 * alpha);
      g.lineBetween(left + padX, top + padY, left + w - padX, top + h - padY * 0.55);
      g.lineBetween(left + w - padX, top + padY, left + padX, top + h - padY * 0.55);

      // Pulsing rooftop hazard strobe beacon
      g.fillStyle(0xff2957, 0.95 * alpha * pulse);
      g.fillCircle(p.x, top - 4 * p.scale, Math.max(3, 7 * p.scale));
      g.fillStyle(0xffffff, 0.92 * alpha);
      g.fillCircle(p.x, top - 4 * p.scale, Math.max(1.5, 3.2 * p.scale));
    } else {
      // MOVING CYBER DRONE SWEEPER (High-visibility crimson/cyan scanner + floor beam!)
      const hoverH = p.roadWidth * 0.16;
      const hoverY = p.y - hoverH + Math.sin(this.elapsedTime * 10 + obs.id) * 4 * p.scale;
      const rX = laneW * 0.42;
      const rY = p.roadWidth * 0.085;

      // Downward scanning laser cone so player immediately tracks its lane on the road
      g.fillStyle(0xff2957, 0.26 * alpha * pulse);
      g.beginPath();
      g.moveTo(p.x - rX * 0.32, hoverY + rY * 0.5);
      g.lineTo(p.x + rX * 0.32, hoverY + rY * 0.5);
      g.lineTo(p.x + laneW * 0.42, p.y);
      g.lineTo(p.x - laneW * 0.42, p.y);
      g.closePath();
      g.fillPath();

      // Bright wingtip hazard flares
      g.fillStyle(0xffbe0b, 0.92 * alpha * pulse);
      g.fillCircle(p.x - rX, hoverY, Math.max(3, 6 * p.scale));
      g.fillCircle(p.x + rX, hoverY, Math.max(3, 6 * p.scale));

      // Armored sleek wing body with crisp white-crimson rim
      g.fillStyle(0x2b134a, 0.99 * alpha);
      g.fillEllipse(p.x, hoverY, rX * 2, rY * 1.65);

      g.lineStyle(Math.max(2.2, 4 * p.scale), 0xff2957, 0.98 * alpha);
      g.strokeEllipse(p.x, hoverY, rX * 2, rY * 1.65);

      // Sweeping glowing electric-cyan & white eye visor
      g.fillStyle(0x00f0ff, 0.98 * alpha);
      g.fillRect(p.x - rX * 0.68, hoverY - rY * 0.26, rX * 1.36, rY * 0.52);
      g.fillStyle(0xffffff, 0.96 * alpha);
      g.fillCircle(p.x, hoverY, Math.max(3, rY * 0.38));
    }
  }

  private renderPlayer(): void {
    const shadowGfx = this.playerShadowGfx;
    const trailGfx = this.playerTrailGfx;
    const auraGfx = this.playerAuraGfx;
    shadowGfx.clear();
    trailGfx.clear();
    auraGfx.clear();

    if (!this.playerSprite.visible) return;

    const skin = getSkinSpec(this.equippedSkin);
    const trailSpec = getTrailSpec(this.equippedTrail);

    // Render ribbon trails (Solar Ribbon & Prism Overdrive)
    if (
      (this.equippedTrail === 'solar_ribbon' || this.equippedTrail === 'prism_overdrive') &&
      this.trailHistory.length >= 2
    ) {
      for (const footOffset of [-0.14, 0.14]) {
        for (let i = 0; i < this.trailHistory.length - 1; i++) {
          const a = this.trailHistory[i];
          const b = this.trailHistory[i + 1];
          const pa = this.project(a.laneX + footOffset, a.y, a.z);
          const pb = this.project(b.laneX + footOffset, b.y, b.z);
          const fade = 1 - i / this.trailHistory.length;

          const segColor =
            this.equippedTrail === 'prism_overdrive'
              ? Phaser.Display.Color.HSLToColor((this.elapsedTime * 0.55 + i * 0.045) % 1, 1, 0.56)
                  .color
              : i % 2 === 0
                ? trailSpec.primaryNum
                : trailSpec.secondaryNum;

          trailGfx.lineStyle(Math.max(2, 10 * pa.scale * fade), segColor, 0.3 * fade);
          trailGfx.lineBetween(pa.x, pa.y, pb.x, pb.y);
          trailGfx.lineStyle(Math.max(1.2, 4 * pa.scale * fade), 0xffffff, 0.72 * fade);
          trailGfx.lineBetween(pa.x, pa.y, pb.x, pb.y);
        }
      }
    }

    const groundP = this.project(this.playerLaneX, 0, PLAYER_Z);
    const bodyP = this.project(this.playerLaneX, this.playerY, PLAYER_Z);

    // Dynamic ground shadow tracks supporting foot & modulates cleanly with jump height and stride flight
    const jumpFade = Phaser.Math.Clamp(1 - this.playerY * 1.45, 0.26, 1);
    const shadowFactor = jumpFade * (this.isJumping ? 1 : this.animGroundContact);
    const shadowShiftX = this.isJumping ? 0 : this.animFootWeightX * groundP.laneWidth * 0.065;
    const shadowWMult = this.isSliding ? 1.22 : 1.0;

    shadowGfx.fillStyle(0x000000, 0.6 * shadowFactor);
    shadowGfx.fillEllipse(
      groundP.x + shadowShiftX,
      groundP.y + 4 * groundP.scale,
      groundP.laneWidth * 0.62 * shadowFactor * shadowWMult,
      Math.max(6, groundP.laneWidth * 0.145 * shadowFactor)
    );
    // Subtle neon ground reflection under runner's glowing sneakers
    const underGlow =
      this.boostTimer > 0 ? 0x38f9d7 : this.isSliding ? skin.coreNum : skin.trimNum;
    shadowGfx.fillStyle(underGlow, 0.34 * shadowFactor);
    shadowGfx.fillEllipse(
      groundP.x + shadowShiftX,
      groundP.y + 2 * groundP.scale,
      groundP.laneWidth * 0.46 * shadowFactor * shadowWMult,
      Math.max(4, groundP.laneWidth * 0.095 * shadowFactor)
    );

    // Heroic visual presence in lower-middle viewport without obscuring upcoming obstacles
    const baseScale = bodyP.scale * 0.94;
    this.playerSprite
      .setPosition(bodyP.x, bodyP.y)
      .setScale(baseScale * this.animSquashX, baseScale * this.animSquashY);

    // Invulnerability flicker after shield break
    if (this.invulnTimer > 0) {
      const blink = Math.floor(this.elapsedTime * 18) % 2 === 0;
      this.playerSprite.setAlpha(blink ? 0.5 : 1);
    } else {
      this.playerSprite.setAlpha(1);
    }

    // Visual power-up auras around player
    const auraCenterY = bodyP.y - (this.isSliding ? 34 : 76) * baseScale;
    const auraR = (this.isSliding ? 56 : 74) * baseScale;

    if (this.hasShield) {
      const pulse = 1 + Math.sin(this.elapsedTime * 6) * 0.05;
      auraGfx.fillStyle(0x00f0ff, 0.14);
      auraGfx.fillCircle(bodyP.x, auraCenterY, auraR * pulse);
      auraGfx.lineStyle(Math.max(2, 3.5 * baseScale), 0x00f0ff, 0.88);
      auraGfx.strokeCircle(bodyP.x, auraCenterY, auraR * pulse);
    }

    if (this.magnetTimer > 0) {
      const ringPhase = (this.elapsedTime * 2.2) % 1;
      const magR = auraR * (1.7 - ringPhase * 0.85);
      auraGfx.lineStyle(Math.max(1.5, 2.5 * baseScale), 0xff2a85, (1 - ringPhase) * 0.8);
      auraGfx.strokeCircle(bodyP.x, auraCenterY, magR);
    }

    if (this.multiplierTimer > 0) {
      auraGfx.lineStyle(Math.max(1.5, 2.5 * baseScale), 0xc77dff, 0.65);
      auraGfx.strokeCircle(bodyP.x, auraCenterY, auraR * 1.15);
    }

    if (this.boostTimer > 0) {
      auraGfx.fillStyle(0x38f9d7, 0.22);
      auraGfx.fillEllipse(bodyP.x, auraCenterY, auraR * 1.5, auraR * 1.9);
    }
  }

  private renderSpeedLines(): void {
    const g = this.speedLineGfx;
    g.clear();

    const speedNorm =
      this.mode === 'PLAYING'
        ? Math.max(0, (this.runSpeed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED))
        : 0;
    const boostBoost = this.boostTimer > 0 ? 0.65 : 0;
    const visibility = Math.min(0.85, speedNorm * 0.45 + boostBoost);
    if (visibility < 0.08) return;

    const { w, h, horizonY, vanishX } = this.getViewportMetrics();
    const maxR = Math.hypot(w, h) * 0.72;

    for (const sl of this.speedLines) {
      const r1 = sl.dist * maxR;
      const r2 = (sl.dist + sl.length * (1 + boostBoost)) * maxR;
      const x1 = vanishX + Math.cos(sl.angle) * r1;
      const y1 = horizonY + Math.sin(sl.angle) * r1;
      const x2 = vanishX + Math.cos(sl.angle) * r2;
      const y2 = horizonY + Math.sin(sl.angle) * r2;

      g.lineStyle(this.boostTimer > 0 ? 2.4 : 1.5, sl.color, visibility * 0.55);
      g.lineBetween(x1, y1, x2, y2);
    }
  }

  // ---- HUD & CLEANUP HELPERS ----

  private emitHudSnapshot(forceBestCheck: boolean): void {
    const effectiveSpeed = this.boostTimer > 0 ? this.runSpeed * 1.58 : this.runSpeed;
    const speedKmh = Math.round(80 + (effectiveSpeed - BASE_SPEED) * 315);
    const activePowerUps: ActivePowerUps = {
      shield: this.hasShield,
      magnetRemaining: this.magnetTimer,
      magnetDuration: MAGNET_DURATION,
      multiplierRemaining: this.multiplierTimer,
      multiplierDuration: MULTIPLIER_DURATION,
      boostRemaining: this.boostTimer,
      boostDuration: BOOST_DURATION,
    };

    const currentScore = Math.floor(this.score);
    const displayBest = forceBestCheck
      ? Math.max(this.bestScore, currentScore)
      : Math.max(this.bestScore, currentScore);

    this.callbacks.onHudUpdate({
      score: currentScore,
      bestScore: displayBest,
      distance: Math.floor(this.distance),
      coins: this.coinsCollected,
      speedKmh,
      multiplier: this.multiplierTimer > 0 ? 2 : 1,
      isNewBest: this.isNewBest,
      nearMissCount: this.nearMissCount,
      activePowerUps,
    });
  }

  private clearAllEntities(): void {
    this.obstacles = [];

    for (const coin of this.coins) {
      coin.sprite.destroy();
    }
    this.coins = [];

    for (const pu of this.powerUps) {
      pu.sprite.destroy();
    }
    this.powerUps = [];

    for (const p of this.particles) {
      p.sprite.destroy();
    }
    this.particles = [];

    for (const pop of this.popups) {
      pop.text.destroy();
    }
    this.popups = [];

    this.collisionManager?.clear();
    this.tweens.killAll();
  }
}
