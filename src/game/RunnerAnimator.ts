import Phaser from 'phaser';
import {
  CHARACTER_SPRITE_KEYS,
  createSkinRecoloredCanvas,
  type CharacterAnimState,
  type CharacterSpriteKey,
} from './characterAssets';
import type { RunnerSkinId, RunnerSkinSpec } from './cosmetics';

export interface RunnerAnimInput {
  dt: number;
  elapsed: number;
  /** Exact worldScroll rate (scroll units/sec) matching the scrolling highway beneath the runner's feet */
  groundScrollRate: number;
  laneVel: number; // lateral lane velocity (-10..+10)
  playerY: number;
  playerVy: number;
  isJumping: boolean;
  isSliding: boolean;
  isBoosting: boolean;
  animState: CharacterAnimState;
  skin: RunnerSkinSpec;
}

export interface RunnerAnimOutput {
  footStrikeSide: -1 | 1 | 0; // Emits -1 (left) or 1 (right) on exact foot touchdown
  squashX: number;
  squashY: number;
  /** 1.0 when foot is firmly planted on asphalt, ~0.84 at airborne sprint flight apex */
  groundContactFactor: number;
  /** -1 (left) to +1 (right) weight transfer under the active supporting foot */
  footWeightX: number;
  /** -1..+1 smooth stride vertical oscillation for subtle camera breath */
  strideBounceNorm: number;
}

interface RigPalette {
  hoodieHi: string;
  hoodieMid: string;
  hoodieLo: string;
  hoodieRim: string;
  accentHex: string;
  accentSecondary: string;
  pantHi: string;
  pantMid: string;
  pantLo: string;
  shoeUpperHi: string;
  shoeUpperLo: string;
  shoeSoleGlow: string;
  shoeAccent: string;
  skinHi: string;
  skinMid: string;
  skinLo: string;
  gloveHi: string;
  gloveLo: string;
  outline: string;
}

interface LegPose {
  side: -1 | 1;
  hipX: number;
  hipY: number;
  kneeX: number;
  kneeY: number;
  ankleX: number;
  ankleY: number;
  zDepth: number; // <0 reaching forward away from camera, >0 kicking back toward camera
  soleReveal: number; // 0 = rear heel view on ground, 1 = glowing cyan sneaker sole facing camera
  footTilt: number; // radians
  scale: number;
}

interface ArmPose {
  side: -1 | 1;
  shoulderX: number;
  shoulderY: number;
  elbowX: number;
  elbowY: number;
  handX: number;
  handY: number;
  zDepth: number; // <0 swinging forward past chest (behind torso), >0 pumping back toward camera (front)
  scale: number;
  openPalm: boolean;
}

const CANVAS_W = 256;
const CANVAS_H = 256;
const TEX_KEY = 'runner_live_canvas';
const GROUND_LINE_Y = 248;
const TWO_PI = Math.PI * 2;

// Biomechanical velocity-to-cadence calibration synchronized with GameScene worldScroll
// Reference opening scroll rate = BASE_SPEED (0.29) * 1.65 = 0.4785 scroll units/sec
const REF_GROUND_SCROLL_RATE = 0.4785;
// Full 2-step sprint cycles per second at opening speed (1.52 cycles/s = 3.04 energetic strides/s)
const BASE_CYCLES_PER_SEC = 1.52;
const MAX_CYCLES_PER_SEC = 3.35;
// Real sprinting increases both stride frequency (~v^0.54) and stride length (~v^0.46)
const STRIDE_FREQ_EXPONENT = 0.54;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function getRigPalette(skin: RunnerSkinSpec): RigPalette {
  const baseSkin = {
    skinHi: '#f4b089',
    skinMid: '#d9845c',
    skinLo: '#9b4f38',
    gloveHi: '#272c4a',
    gloveLo: '#0f1224',
    outline: '#090a1a',
  };

  switch (skin.id) {
    case 'solar_flare':
      return {
        ...baseSkin,
        hoodieHi: '#ff9e1b',
        hoodieMid: '#d94e14',
        hoodieLo: '#611809',
        hoodieRim: '#ffd166',
        accentHex: '#ff5400',
        accentSecondary: '#ffbe0b',
        pantHi: '#2c1f24',
        pantMid: '#181014',
        pantLo: '#0b0709',
        shoeUpperHi: '#4a2015',
        shoeUpperLo: '#1c0a07',
        shoeSoleGlow: '#ffd166',
        shoeAccent: '#ff5400',
      };
    case 'phantom_violet':
      return {
        ...baseSkin,
        hoodieHi: '#a653f5',
        hoodieMid: '#5c1aa8',
        hoodieLo: '#250854',
        hoodieRim: '#e0aaff',
        accentHex: '#ff2a85',
        accentSecondary: '#c77dff',
        pantHi: '#251c42',
        pantMid: '#140e29',
        pantLo: '#080514',
        shoeUpperHi: '#3d1973',
        shoeUpperLo: '#160830',
        shoeSoleGlow: '#e0aaff',
        shoeAccent: '#ff2a85',
      };
    case 'emerald_surge':
      return {
        ...baseSkin,
        hoodieHi: '#00e6a8',
        hoodieMid: '#008c6e',
        hoodieLo: '#043832',
        hoodieRim: '#38f9d7',
        accentHex: '#00ff87',
        accentSecondary: '#00f0ff',
        pantHi: '#172e33',
        pantMid: '#0c1c21',
        pantLo: '#050d10',
        shoeUpperHi: '#0d4a46',
        shoeUpperLo: '#051f21',
        shoeSoleGlow: '#38f9d7',
        shoeAccent: '#00ff87',
      };
    case 'prism_nova':
      return {
        ...baseSkin,
        hoodieHi: '#f4f8ff',
        hoodieMid: '#a7bce8',
        hoodieLo: '#536599',
        hoodieRim: '#00f0ff',
        accentHex: '#ffd166',
        accentSecondary: '#ff2a85',
        pantHi: '#353e63',
        pantMid: '#1d233d',
        pantLo: '#0d1021',
        shoeUpperHi: '#c8d8ff',
        shoeUpperLo: '#4f6294',
        shoeSoleGlow: '#00f0ff',
        shoeAccent: '#ffd166',
      };
    case 'cyber_pulse':
    default:
      return {
        ...baseSkin,
        hoodieHi: '#248bff',
        hoodieMid: '#0e49db',
        hoodieLo: '#071d78',
        hoodieRim: '#00f0ff',
        accentHex: '#b14cff',
        accentSecondary: '#ff2a85',
        pantHi: '#262b4d',
        pantMid: '#14172e',
        pantLo: '#080a18',
        shoeUpperHi: '#1d2d6e',
        shoeUpperLo: '#0c1130',
        shoeSoleGlow: '#00f5ff',
        shoeAccent: '#a855f7',
      };
  }
}

/**
 * 60/120 FPS Hybrid Painted-Head/Hood + 3D-Shaded Articulated Skeletal Runner Animator.
 * Combines the exact 3D-rendered spiky hair & folded hood extracted from the character sheet
 * with a continuous, dt-independent biomechanical skeletal rig for RUN, JUMP, SLIDE, IDLE,
 * and lane banking — plus high-resolution painted reaction poses for HURT, VICTORY, and DEATH.
 */
export class RunnerAnimator {
  private scene: Phaser.Scene;
  private canvasTex: Phaser.Textures.CanvasTexture;
  private ctx: CanvasRenderingContext2D;

  // Cached skin-recolored painted parts / end-state sprites
  private frameCache = new Map<string, HTMLCanvasElement>();

  // Velocity-locked continuous stride state (radians 0..2π)
  private stridePhase = 0;
  private prevStrideHalf = 0; // 0 = first half (0..π), 1 = second half (π..2π)
  private smoothScrollRate = REF_GROUND_SCROLL_RATE;
  private bankSmooth = 0;
  private currentState: CharacterAnimState = 'RUN';
  private stateTime = 0;

  // Smooth continuous state blend weights (zero snapping between RUN / JUMP / SLIDE / IDLE)
  private jumpBlend = 0;
  private slideBlend = 0;
  private idleBlend = 0;
  private airFactorSmooth = 0;
  private jumpLeadSide: -1 | 1 = 1;
  private slideSide: -1 | 1 = 1;

  // Secondary cloth & landing spring dynamics
  private landComp = 0;
  private landCompVel = 0;
  private hoodLagY = 0;
  private hoodLagVel = 0;

  // Subtle global squash-and-stretch spring exported to GameScene sprite
  private squashAmt = 0;
  private squashVel = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (scene.textures.exists(TEX_KEY)) {
      scene.textures.remove(TEX_KEY);
    }
    const tex = scene.textures.createCanvas(TEX_KEY, CANVAS_W, CANVAS_H);
    if (!tex) {
      throw new Error('Failed to create live runner canvas texture');
    }
    this.canvasTex = tex;
    this.ctx = tex.getContext();
    this.reset();
  }

  public getTextureKey(): string {
    return TEX_KEY;
  }

  public destroy(): void {
    this.frameCache.clear();
  }

  public copySnapshotTo(scene: Phaser.Scene, targetKey: string): string {
    const dest = scene.textures.exists(targetKey)
      ? (scene.textures.get(targetKey) as Phaser.Textures.CanvasTexture)
      : scene.textures.createCanvas(targetKey, CANVAS_W, CANVAS_H);
    if (!dest) return TEX_KEY;

    const dCtx = dest.getContext();
    dCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    dCtx.drawImage(this.canvasTex.getCanvas(), 0, 0);
    dest.refresh();
    return targetKey;
  }

  public reset(): void {
    this.stridePhase = 0.15;
    this.prevStrideHalf = 0;
    this.smoothScrollRate = REF_GROUND_SCROLL_RATE;
    this.bankSmooth = 0;
    this.currentState = 'RUN';
    this.stateTime = 0;
    this.jumpBlend = 0;
    this.slideBlend = 0;
    this.idleBlend = 0;
    this.airFactorSmooth = 0;
    this.jumpLeadSide = 1;
    this.slideSide = 1;
    this.landComp = 0;
    this.landCompVel = 0;
    this.hoodLagY = 0;
    this.hoodLagVel = 0;
    this.squashAmt = 0;
    this.squashVel = 0;
  }

  public triggerJumpImpulse(): void {
    this.jumpLeadSide = this.jumpLeadSide === 1 ? -1 : 1;
    this.squashAmt = -0.11;
    this.squashVel = -0.55;
    this.hoodLagVel += 42;
  }

  public triggerLandingImpact(intensity = 1.0): void {
    const clamped = clamp(intensity, 0.7, 1.5);
    this.landComp = Math.min(1.0, 0.65 * clamped);
    this.landCompVel = 3.2 * clamped;
    this.squashAmt = Math.min(0.18, 0.12 * clamped);
    this.squashVel = 0.42 * clamped;
    this.hoodLagVel -= 55 * clamped;
  }

  public triggerSlideImpulse(): void {
    this.slideSide = this.bankSmooth < -0.15 ? -1 : this.bankSmooth > 0.15 ? 1 : this.slideSide === 1 ? -1 : 1;
    this.squashAmt = 0.08;
    this.squashVel = 0.2;
    this.hoodLagVel -= 32;
  }

  public triggerHurtImpulse(): void {
    this.squashAmt = 0.2;
    this.squashVel = 0.85;
  }

  public updateAndDraw(input: RunnerAnimInput): RunnerAnimOutput {
    const { dt, elapsed, groundScrollRate, laneVel, playerVy, isBoosting, animState, skin } = input;
    const safeDt = clamp(dt, 0.0001, 0.05);

    // 1. Track phase-aware state changes
    if (animState !== this.currentState) {
      const prevState = this.currentState;
      this.currentState = animState;
      this.stateTime = 0;

      if (animState === 'RUN') {
        if (prevState === 'JUMP') {
          // Land cleanly right onto the contact phase of the alternating foot
          this.stridePhase = this.jumpLeadSide === 1 ? 0.08 : Math.PI + 0.08;
          this.prevStrideHalf = this.stridePhase < Math.PI ? 0 : 1;
        } else if (prevState === 'SLIDE') {
          // Spring out of slide directly into a powerful drive stride
          this.stridePhase = this.slideSide === 1 ? Math.PI * 0.68 : Math.PI * 1.68;
          this.prevStrideHalf = this.stridePhase < Math.PI ? 0 : 1;
        }
      }
    } else {
      this.stateTime += safeDt;
    }

    // 2. Smooth velocity tracking (strictly dt-independent)
    const targetRate = Math.max(0, groundScrollRate);
    this.smoothScrollRate = lerp(
      this.smoothScrollRate,
      targetRate,
      1 - Math.exp(-15 * safeDt)
    );
    const speedIntensity = clamp((this.smoothScrollRate - 0.36) / 1.35, 0, 1);

    // 3. Advance velocity-locked continuous sprint phase
    let footStrikeSide: -1 | 1 | 0 = 0;
    if (animState === 'RUN' && this.smoothScrollRate > 0.01) {
      const speedRatio = this.smoothScrollRate / REF_GROUND_SCROLL_RATE;
      const cyclesPerSec = clamp(
        BASE_CYCLES_PER_SEC * Math.pow(speedRatio, STRIDE_FREQ_EXPONENT),
        0,
        MAX_CYCLES_PER_SEC
      );

      this.stridePhase = (this.stridePhase + safeDt * cyclesPerSec * TWO_PI) % TWO_PI;
      const half = this.stridePhase < Math.PI ? 0 : 1;
      if (half !== this.prevStrideHalf) {
        this.prevStrideHalf = half;
        // Left strikes at phase 0 (half 0), Right strikes at phase π (half 1)
        footStrikeSide = half === 0 ? -1 : 1;
      }
    }

    // 4. Smooth continuous blend weights (eliminates harsh pose pops)
    const jumpRate = animState === 'JUMP' ? 24 : 18;
    const slideRate = animState === 'SLIDE' ? 22 : 14;
    const idleRate = 12;

    this.jumpBlend = lerp(this.jumpBlend, animState === 'JUMP' ? 1 : 0, 1 - Math.exp(-jumpRate * safeDt));
    this.slideBlend = lerp(this.slideBlend, animState === 'SLIDE' ? 1 : 0, 1 - Math.exp(-slideRate * safeDt));
    this.idleBlend = lerp(this.idleBlend, animState === 'IDLE' ? 1 : 0, 1 - Math.exp(-idleRate * safeDt));

    const targetAir = animState === 'JUMP' ? clamp(playerVy / 2.72, -1, 1) : 0;
    this.airFactorSmooth = lerp(this.airFactorSmooth, targetAir, 1 - Math.exp(-16 * safeDt));

    // 5. Smooth lateral lane-switch banking inside the rig
    const targetBank =
      animState === 'DEATH' || animState === 'VICTORY' || animState === 'HURT'
        ? 0
        : clamp(laneVel * 0.2, -1, 1);
    this.bankSmooth = lerp(this.bankSmooth, targetBank, 1 - Math.exp(-15 * safeDt));

    // 6. Damped springs for landing knee compression, hood secondary cloth bounce, and subtle squash
    {
      const f = -180 * this.landComp - 18 * this.landCompVel;
      this.landCompVel += f * safeDt;
      this.landComp += this.landCompVel * safeDt;
      if (Math.abs(this.landComp) < 0.002 && Math.abs(this.landCompVel) < 0.01) {
        this.landComp = 0;
        this.landCompVel = 0;
      }
    }

    const strideBounceNorm =
      animState === 'RUN' ? Math.sin(this.stridePhase * 2 - 0.65) : 0;
    const targetHoodOffset =
      -strideBounceNorm * (2.6 + speedIntensity * 2.2) -
      this.airFactorSmooth * 5.0 * this.jumpBlend -
      speedIntensity * 2.5;
    {
      const hf = (targetHoodOffset - this.hoodLagY) * 145 - this.hoodLagVel * 14;
      this.hoodLagVel += hf * safeDt;
      this.hoodLagY = clamp(this.hoodLagY + this.hoodLagVel * safeDt, -11, 9);
    }

    {
      const sf = -210 * this.squashAmt - 18 * this.squashVel;
      this.squashVel += sf * safeDt;
      this.squashAmt += this.squashVel * safeDt;
      if (Math.abs(this.squashAmt) < 0.002 && Math.abs(this.squashVel) < 0.01) {
        this.squashAmt = 0;
        this.squashVel = 0;
      }
    }

    const squashX = 1 + this.squashAmt * 0.45;
    const squashY = 1 - this.squashAmt * 0.52;

    // Ground contact factor & lateral weight shift for shadow anchoring
    const runContact = 0.91 + 0.09 * Math.max(0, -strideBounceNorm);
    const groundContactFactor =
      animState === 'RUN' ? runContact : animState === 'SLIDE' ? 1.0 : 0.95;
    // Left foot planted during 0..π (-1), Right foot planted during π..2π (+1)
    const footWeightX =
      animState === 'RUN'
        ? -Math.sin(this.stridePhase) * 0.85
        : animState === 'SLIDE'
          ? this.slideSide * 0.35
          : 0;

    // 7. Render frame to live 256×256 canvas texture
    this.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (animState === 'HURT' || animState === 'VICTORY' || animState === 'DEATH') {
      this.drawReactionSpriteFrame(animState, elapsed, isBoosting, skin);
    } else {
      this.drawArticulatedRunner(elapsed, speedIntensity, isBoosting, animState, skin);
    }
    this.canvasTex.refresh();

    return {
      footStrikeSide,
      squashX,
      squashY,
      groundContactFactor,
      footWeightX,
      strideBounceNorm,
    };
  }

  private getDrawablePart(
    spriteKey: CharacterSpriteKey,
    skinId: RunnerSkinId,
    allowRecolor: boolean
  ): HTMLImageElement | HTMLCanvasElement | null {
    if (!this.scene.textures.exists(spriteKey)) return null;
    const sourceImage = this.scene.textures.get(spriteKey).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement
      | null;
    if (!sourceImage) return null;

    if (!allowRecolor || skinId === 'cyber_pulse') {
      return sourceImage;
    }

    const cacheKey = `${spriteKey}|${skinId}`;
    const cached = this.frameCache.get(cacheKey);
    if (cached) return cached;

    const recolored = createSkinRecoloredCanvas(sourceImage, skinId);
    this.frameCache.set(cacheKey, recolored);
    return recolored;
  }

  // ============================================================================
  // 1. 60/120 FPS ARTICULATED BIOMECHANICAL SKELETAL RIG (IDLE / RUN / JUMP / SLIDE)
  // ============================================================================

  private drawArticulatedRunner(
    elapsed: number,
    speedIntensity: number,
    isBoosting: boolean,
    animState: CharacterAnimState,
    skin: RunnerSkinSpec
  ): void {
    const ctx = this.ctx;
    const pal = getRigPalette(skin);
    const cx = CANVAS_W * 0.5;
    const phase = this.stridePhase;
    const activeSpeed = clamp(speedIntensity + (isBoosting ? 0.35 : 0), 0, 1.25);

    const runWeight = clamp(1 - Math.max(this.jumpBlend, this.slideBlend, this.idleBlend), 0, 1);

    // ---- A. CORE SPINE, PELVIS & FORWARD SPRINT POSTURE ----
    // Double-frequency athletic sprint bounce: lowest at mid-stance absorption, highest at flight
    const bounceWave = Math.sin(phase * 2 - 0.65);
    const runBounceY = -bounceWave * (6.2 + activeSpeed * 4.4);
    const idleBreath = Math.sin(elapsed * 3.4);

    // Subtle athletic weight transfer over supporting leg (never wide sideways waddling)
    const runHipSwayX = -Math.sin(phase) * (3.6 + activeSpeed * 1.4);
    const bankX = this.bankSmooth * 9.5;
    const slideShiftX = this.slideSide * 10 * this.slideBlend;

    // Athletic forward sprint lean: visually compresses torso height and lowers shoulders forward
    const forwardLean = (0.34 + activeSpeed * 0.42) * runWeight + 0.18 * this.jumpBlend;
    const landDropY = Math.max(0, this.landComp) * 19;

    // Hip center position (standing ≈ 156, sprinting ≈ 158..164 with lean, sliding ≈ 218!)
    const baseHipY =
      157 +
      forwardLean * 7 +
      runBounceY * runWeight +
      idleBreath * 1.4 * this.idleBlend -
      this.airFactorSmooth * 6 * this.jumpBlend +
      landDropY;
    const hipY = lerp(baseHipY, GROUND_LINE_Y - 30, this.slideBlend);
    const hipX = cx + runHipSwayX * runWeight + bankX * 0.5 + slideShiftX;

    // Counter-rotation between pelvis and shoulders creates vivid 3D sprinting momentum
    const torsoTwist = Math.cos(phase) * (5.2 + activeSpeed * 2.8) * runWeight;
    const shoulderRoll =
      Math.cos(phase) * (0.065 + activeSpeed * 0.03) * runWeight +
      this.bankSmooth * 0.14 +
      this.slideSide * 0.34 * this.slideBlend;

    // Spine vector (pelvis -> shoulders)
    const torsoLen = lerp(
      55 - forwardLean * 11 - landDropY * 0.25,
      44,
      this.slideBlend
    );
    const torsoLeanX =
      this.bankSmooth * 11 -
      torsoTwist * 0.28 -
      this.slideSide * 26 * this.slideBlend;

    const shoulderMidX = hipX + torsoLeanX;
    const shoulderMidY = hipY - torsoLen;

    // Neck & head position (head stays upright & focused down the highway!)
    const headDropForLean = forwardLean * 6.5;
    const headX = shoulderMidX + this.bankSmooth * 3.5 - this.slideSide * 5 * this.slideBlend;
    const headY =
      shoulderMidY -
      6 +
      headDropForLean +
      Math.sin(phase * 2 - 1.15) * 1.8 * runWeight +
      5 * this.slideBlend;
    const headTilt =
      this.bankSmooth * 0.1 +
      Math.cos(phase) * 0.025 * runWeight -
      this.slideSide * 0.14 * this.slideBlend;

    // ---- B. SOLVE LEGS (RUN <-> JUMP <-> SLIDE <-> IDLE BLENDED CONTINUOUSLY) ----
    const leftLeg = this.solveLegPose(
      -1,
      hipX,
      hipY,
      phase,
      activeSpeed,
      landDropY,
      runWeight
    );
    const rightLeg = this.solveLegPose(
      1,
      hipX,
      hipY,
      (phase + Math.PI) % TWO_PI,
      activeSpeed,
      landDropY,
      runWeight
    );

    // ---- C. SOLVE ARMS (CONTRALATERAL TO LEGS! Left Arm = phase + π, Right Arm = phase) ----
    const leftArm = this.solveArmPose(
      -1,
      shoulderMidX,
      shoulderMidY,
      shoulderRoll,
      torsoTwist,
      (phase + Math.PI) % TWO_PI,
      activeSpeed,
      runWeight
    );
    const rightArm = this.solveArmPose(
      1,
      shoulderMidX,
      shoulderMidY,
      shoulderRoll,
      torsoTwist,
      phase,
      activeSpeed,
      runWeight
    );

    // ---- D. BACK LUMINOUS NEON AURA & HIGH-SPEED MOTION POLISH ----
    this.drawBackAura(ctx, hipX, shoulderMidY + 34, activeSpeed, isBoosting, animState, skin);

    if ((animState === 'JUMP' && this.airFactorSmooth > -0.15) || isBoosting) {
      this.drawSneakerJets(ctx, leftLeg, rightLeg, elapsed, isBoosting, skin);
    }

    // ---- E. DEPTH-SORTED 3D LAYER RENDERING ----
    // 1. Far arms swinging forward past chest (zDepth < 0) draw BEHIND torso
    const armsSorted = [leftArm, rightArm].sort((a, b) => a.zDepth - b.zDepth);
    for (const arm of armsSorted) {
      if (arm.zDepth < 0) {
        this.drawArm(ctx, arm, pal, isBoosting);
      }
    }

    // 2. Legs sorted far-to-near by zDepth (forward-reaching leg behind, rear-kicking leg closer!)
    const legsSorted = [leftLeg, rightLeg].sort((a, b) => a.zDepth - b.zDepth);
    for (const leg of legsSorted) {
      this.drawLegAndSneaker(ctx, leg, pal, isBoosting);
    }

    // 3. Pelvis / Jogger Hip Seat connecting both thighs cleanly beneath the hoodie hem
    this.drawPelvisJoin(ctx, hipX, hipY, pal, torsoTwist, this.slideBlend, this.slideSide);

    // 4. Sculpted 3D Electric-Blue Futuristic Hoodie Torso with glowing back V-bar
    this.drawHoodieTorso(
      ctx,
      hipX,
      hipY,
      shoulderMidX,
      shoulderMidY,
      shoulderRoll,
      torsoTwist,
      forwardLean,
      pal,
      isBoosting
    );

    // 5. Painted Folded Hood with secondary spring physics (skin-recolored!)
    this.drawFoldedHood(
      ctx,
      shoulderMidX,
      shoulderMidY,
      shoulderRoll,
      forwardLean,
      skin.id,
      pal
    );

    // 6. Painted 3D Spiky Head (always natural hair & skin tone — never recolored!)
    this.drawPaintedHead(ctx, headX, headY, headTilt, forwardLean, this.slideBlend);

    // 7. Near arms pumping powerfully back toward camera (zDepth >= 0) draw IN FRONT of torso/hip!
    for (const arm of armsSorted) {
      if (arm.zDepth >= 0) {
        this.drawArm(ctx, arm, pal, isBoosting);
      }
    }

    // 8. Subtle high-speed slipstream & slide friction streaks
    if (this.slideBlend > 0.25) {
      this.drawSlideGroundGlow(ctx, cx, this.slideBlend, this.slideSide, skin);
    } else if (activeSpeed > 0.45 && animState === 'RUN') {
      this.drawSprintSpeedWisps(ctx, cx, shoulderMidY, activeSpeed, elapsed, skin);
    }
  }

  private solveLegPose(
    side: -1 | 1,
    hipX: number,
    hipY: number,
    legPhase: number,
    speedIntensity: number,
    landDropY: number,
    runWeight: number
  ): LegPose {
    const p = ((legPhase % TWO_PI) + TWO_PI) % TWO_PI;
    const hipSocketX = hipX + side * 10.5;
    const hipSocketY = hipY + 3;

    // 1. RUN TARGET POSE (Continuous biomechanical stance + rear sole-flip kickback + high knee recovery)
    let rKneeX = hipSocketX + side * 4;
    let rKneeY = hipSocketY + 42;
    let rAnkleX = hipSocketX + side * 3;
    let rAnkleY = GROUND_LINE_Y - 11;
    let rZ = 0;
    let rSole = 0;
    let rTilt = 0;

    if (p < Math.PI) {
      // STANCE PHASE: foot plants ahead (z < 0), absorbs mid-stance, drives back along perspective road!
      const st = p / Math.PI;
      rZ = lerp(-0.62, 0.86, st);

      // Keep sneaker firmly anchored on perspective asphalt plane until toe-off at st > 0.74
      const toeOff = smoothstep(0.74, 1.0, st);
      const groundY = GROUND_LINE_Y - 12 + rZ * 4.8;
      rAnkleY = groundY - toeOff * toeOff * (14 + speedIntensity * 5);
      rAnkleX = hipSocketX + side * (2.6 + rZ * 2.2) - this.bankSmooth * 3.5;

      // Knee absorbs weight cleanly at mid-stance, extends powerfully into toe-off
      const absorb = Math.sin(st * Math.PI);
      rKneeX = lerp(hipSocketX, rAnkleX, 0.52) + side * (3.2 + absorb * 3.5);
      rKneeY = lerp(hipSocketY, rAnkleY, 0.48) + absorb * (5.5 + speedIntensity * 2.5);

      rSole = smoothstep(0.7, 1.0, st) * 0.52;
      rTilt = side * (0.04 - st * 0.06);
    } else {
      // SWING PHASE: explosive rear heel kickback (revealing glowing sole!) -> high forward knee drive -> strike
      const sw = (p - Math.PI) / Math.PI;

      if (sw < 0.38) {
        // Rear kickback apex: foot whips HIGH and BACK toward the camera!
        const t = smoothstep(0, 0.38, sw);
        rZ = lerp(0.86, 1.08, Math.sin(t * Math.PI * 0.65));
        const kickLift = Math.sin(t * Math.PI * 0.55) * (34 + speedIntensity * 14);
        rAnkleY = GROUND_LINE_Y - 24 - kickLift;
        rAnkleX = hipSocketX + side * (5.5 + t * 2.2);

        // Knee drops slightly back & bends cleanly while heel curls up behind thigh
        rKneeX = hipSocketX + side * (5.2 + t * 1.4);
        rKneeY = hipSocketY + 40 - t * 4;

        rSole = lerp(0.52, 0.98, t);
        rTilt = -side * (0.08 + t * 0.08);
      } else if (sw < 0.82) {
        // High knee forward recovery drive: knee lifts dynamically ahead (z goes negative)
        const t = (sw - 0.38) / 0.44;
        const ease = smoothstep(0, 1, t);
        rZ = lerp(1.04, -0.78, ease);

        // Knee visibly lifts UP and forward as the leg swings through
        const kneeLift = Math.sin(t * Math.PI) * (16 + speedIntensity * 9);
        rKneeX = hipSocketX + side * (6.2 - ease * 3.2);
        rKneeY = hipSocketY + 34 - kneeLift;

        // Foot stays tucked behind knee during mid-swing, then begins extending forward
        const footLift = (1 - ease) * (32 + speedIntensity * 12) + Math.sin(t * Math.PI) * 14;
        rAnkleX = hipSocketX + side * (6.5 - ease * 4.2);
        rAnkleY = GROUND_LINE_Y - 16 - footLift;

        rSole = lerp(0.96, 0.08, smoothstep(0.05, 0.72, t));
        rTilt = side * lerp(-0.12, 0.06, ease);
      } else {
        // Pre-strike snap-down onto the asphalt right at sw = 1.0 (p = 0)
        const t = (sw - 0.82) / 0.18;
        const ease = smoothstep(0, 1, t);
        rZ = lerp(-0.78, -0.62, ease);

        rAnkleX = hipSocketX + side * (2.3 + ease * 0.3);
        rAnkleY = lerp(GROUND_LINE_Y - 24, GROUND_LINE_Y - 12 + rZ * 4.8, ease);

        rKneeX = lerp(hipSocketX, rAnkleX, 0.5) + side * 3.0;
        rKneeY = lerp(hipSocketY + 26, lerp(hipSocketY, rAnkleY, 0.48), ease);

        rSole = lerp(0.08, 0, ease);
        rTilt = side * 0.04;
      }
    }

    // Apply landing compression knee bend during RUN recovery
    if (landDropY > 0.5 && runWeight > 0.1) {
      rKneeX += side * landDropY * 0.32;
      rKneeY += landDropY * 0.25;
      rAnkleY = Math.min(GROUND_LINE_Y - 10, rAnkleY + landDropY * 0.35);
    }

    // 2. IDLE POSE (Athletic ready stance, both feet squarely planted)
    const iKneeX = hipSocketX + side * 3.2;
    const iKneeY = hipSocketY + 42;
    const iAnkleX = hipSocketX + side * 4.5;
    const iAnkleY = GROUND_LINE_Y - 11;
    const iZ = 0;
    const iSole = 0;
    const iTilt = side * 0.05;

    // 3. JUMP POSE (Dynamic velocity-reactive Takeoff -> Parkour Apex Tuck -> Descent Reach)
    const isLead = side === this.jumpLeadSide;
    const air = this.airFactorSmooth; // +1 takeoff, 0 apex, -1 descent
    const apexAmt = clamp(1 - Math.abs(air) * 1.15, 0, 1);
    const descentAmt = clamp(-air, 0, 1);

    let jKneeX: number;
    let jKneeY: number;
    let jAnkleX: number;
    let jAnkleY: number;
    let jZ: number;
    let jSole: number;
    let jTilt: number;

    if (isLead) {
      // Lead leg drives high into crisp parkour knee tuck at apex, then reaches down on descent
      jKneeX = hipSocketX + side * (11 + apexAmt * 5 - descentAmt * 5);
      jKneeY = hipSocketY + lerp(16, 40, descentAmt) - apexAmt * 8;
      jAnkleX = hipSocketX + side * (8 + apexAmt * 4 - descentAmt * 3);
      jAnkleY = hipSocketY + lerp(44, 78, descentAmt) - apexAmt * 12;
      jZ = lerp(-0.55, -0.1, descentAmt);
      jSole = 0.25 + apexAmt * 0.35 - descentAmt * 0.2;
      jTilt = side * 0.14;
    } else {
      // Trail leg extends back on takeoff, bends up toward camera at apex showing glowing sole, reaches down to land
      jKneeX = hipSocketX + side * (8 + apexAmt * 4);
      jKneeY = hipSocketY + lerp(44, 34, apexAmt) + descentAmt * 4;
      jAnkleX = hipSocketX + side * (12 + apexAmt * 6 - descentAmt * 6);
      jAnkleY = hipSocketY + lerp(80, 56, apexAmt) + descentAmt * 14;
      jZ = lerp(0.85, 0.2, descentAmt);
      jSole = clamp(0.65 + apexAmt * 0.3 - descentAmt * 0.45, 0, 1);
      jTilt = -side * 0.18;
    }

    // 4. SLIDE POSE (Low parkour baseball slide: lead leg extended out, trailing leg tucked!)
    const isSlideLead = side === this.slideSide;
    let sKneeX: number;
    let sKneeY: number;
    let sAnkleX: number;
    let sAnkleY: number;
    let sZ: number;
    let sSole: number;
    let sTilt: number;

    if (isSlideLead) {
      // Lead leg kicks far out low along the asphalt
      sKneeX = hipSocketX + side * 24;
      sKneeY = GROUND_LINE_Y - 22;
      sAnkleX = hipSocketX + side * 52;
      sAnkleY = GROUND_LINE_Y - 12;
      sZ = -0.35;
      sSole = 0.25;
      sTilt = side * 0.55;
    } else {
      // Trailing leg tucks tightly underneath & back toward camera
      sKneeX = hipSocketX + side * 19;
      sKneeY = GROUND_LINE_Y - 18;
      sAnkleX = hipSocketX - side * 8;
      sAnkleY = GROUND_LINE_Y - 14;
      sZ = 0.72;
      sSole = 0.85;
      sTilt = -side * 0.38;
    }

    // 5. BLEND SMOOTHLY ACROSS ALL STATES
    let kneeX = lerp(rKneeX, iKneeX, this.idleBlend);
    let kneeY = lerp(rKneeY, iKneeY, this.idleBlend);
    let ankleX = lerp(rAnkleX, iAnkleX, this.idleBlend);
    let ankleY = lerp(rAnkleY, iAnkleY, this.idleBlend);
    let zDepth = lerp(rZ, iZ, this.idleBlend);
    let soleReveal = lerp(rSole, iSole, this.idleBlend);
    let footTilt = lerp(rTilt, iTilt, this.idleBlend);

    if (this.jumpBlend > 0.001) {
      kneeX = lerp(kneeX, jKneeX, this.jumpBlend);
      kneeY = lerp(kneeY, jKneeY, this.jumpBlend);
      ankleX = lerp(ankleX, jAnkleX, this.jumpBlend);
      ankleY = lerp(ankleY, jAnkleY, this.jumpBlend);
      zDepth = lerp(zDepth, jZ, this.jumpBlend);
      soleReveal = lerp(soleReveal, jSole, this.jumpBlend);
      footTilt = lerp(footTilt, jTilt, this.jumpBlend);
    }

    if (this.slideBlend > 0.001) {
      kneeX = lerp(kneeX, sKneeX, this.slideBlend);
      kneeY = lerp(kneeY, sKneeY, this.slideBlend);
      ankleX = lerp(ankleX, sAnkleX, this.slideBlend);
      ankleY = lerp(ankleY, sAnkleY, this.slideBlend);
      zDepth = lerp(zDepth, sZ, this.slideBlend);
      soleReveal = lerp(soleReveal, sSole, this.slideBlend);
      footTilt = lerp(footTilt, sTilt, this.slideBlend);
    }

    // Perspective foreshortening: closer trailing limbs grow subtly larger, forward limbs slightly smaller
    const scale = clamp(1 + zDepth * 0.13, 0.88, 1.15);

    return {
      side,
      hipX: hipSocketX,
      hipY: hipSocketY,
      kneeX,
      kneeY,
      ankleX,
      ankleY,
      zDepth,
      soleReveal: clamp(soleReveal, 0, 1),
      footTilt,
      scale,
    };
  }

  private solveArmPose(
    side: -1 | 1,
    shoulderMidX: number,
    shoulderMidY: number,
    shoulderRoll: number,
    torsoTwist: number,
    armPhase: number,
    speedIntensity: number,
    runWeight: number
  ): ArmPose {
    const halfShoulderW = 24;
    const shoulderX = shoulderMidX + side * halfShoulderW * Math.cos(shoulderRoll) - torsoTwist * 0.25;
    const shoulderY = shoulderMidY + 5 + side * halfShoulderW * Math.sin(shoulderRoll);

    // 1. RUN TARGET POSE (Powerful contralateral ~95° bent-elbow sprint pumping!)
    // armZ > 0 = pumping BACK toward camera (drawn in FRONT); armZ < 0 = driving FORWARD (drawn BEHIND torso)
    const armZ = -Math.cos(armPhase);
    const pumpAmp = 1 + speedIntensity * 0.34;
    const rearAmt = clamp(armZ, 0, 1);
    const fwdAmt = clamp(-armZ, 0, 1);

    // Elbow swings strongly back-and-up when rear, and drives athletically forward-up beside ribs when forward
    const rElbowX =
      shoulderX +
      side * (12.0 + rearAmt * (7.2 * pumpAmp) - fwdAmt * 1.2) +
      this.bankSmooth * 4 * runWeight;
    const rElbowY =
      shoulderY +
      24.5 -
      rearAmt * (14.0 * pumpAmp) +
      fwdAmt * 3.5;

    // Forearm bent athletically ~95°: hand drives upward/inward past waist on rear pump, high past shoulder on forward drive
    const rHandX =
      rElbowX +
      side * (rearAmt * 2.5 + fwdAmt * 3.0) -
      side * 3.2;
    const rHandY =
      rElbowY +
      15.5 -
      rearAmt * (6.0 * pumpAmp) -
      fwdAmt * (16.5 * pumpAmp);

    // 2. IDLE POSE (Relaxed futuristic runner stance)
    const iElbowX = shoulderX + side * 6.5;
    const iElbowY = shoulderY + 26;
    const iHandX = shoulderX + side * 8.5;
    const iHandY = shoulderY + 49;
    const iZ = 0.08;

    // 3. JUMP POSE (Dynamic upward lift on takeoff -> wide athletic parkour balance at apex!)
    const isLeadSide = side === this.jumpLeadSide;
    const air = this.airFactorSmooth;
    const spread = 1 - Math.abs(air) * 0.35;
    const jElbowX = shoulderX + side * (18 + spread * 12);
    const jElbowY = shoulderY + (isLeadSide ? -4 : 6) - air * 12;
    const jHandX = jElbowX + side * (16 + spread * 10);
    const jHandY = jElbowY + (isLeadSide ? -10 : 8) - air * 8;
    const jZ = isLeadSide ? -0.35 : 0.65;

    // 4. SLIDE POSE (Inside gloved hand braces on asphalt for stability; outside arm sweeps stylishly!)
    const isSupportHand = side === -this.slideSide;
    let sElbowX: number;
    let sElbowY: number;
    let sHandX: number;
    let sHandY: number;
    let sZ: number;

    if (isSupportHand) {
      sElbowX = shoulderX + side * 14;
      sElbowY = shoulderY + 28;
      sHandX = shoulderX + side * 24;
      sHandY = GROUND_LINE_Y - 8;
      sZ = 0.55;
    } else {
      sElbowX = shoulderX + side * 22;
      sElbowY = shoulderY + 8;
      sHandX = shoulderX + side * 38;
      sHandY = shoulderY - 2;
      sZ = 0.45;
    }

    // 5. BLEND SMOOTHLY ACROSS STATES
    let elbowX = lerp(rElbowX, iElbowX, this.idleBlend);
    let elbowY = lerp(rElbowY, iElbowY, this.idleBlend);
    let handX = lerp(rHandX, iHandX, this.idleBlend);
    let handY = lerp(rHandY, iHandY, this.idleBlend);
    let zDepth = lerp(armZ, iZ, this.idleBlend);

    if (this.jumpBlend > 0.001) {
      elbowX = lerp(elbowX, jElbowX, this.jumpBlend);
      elbowY = lerp(elbowY, jElbowY, this.jumpBlend);
      handX = lerp(handX, jHandX, this.jumpBlend);
      handY = lerp(handY, jHandY, this.jumpBlend);
      zDepth = lerp(zDepth, jZ, this.jumpBlend);
    }

    if (this.slideBlend > 0.001) {
      elbowX = lerp(elbowX, sElbowX, this.slideBlend);
      elbowY = lerp(elbowY, sElbowY, this.slideBlend);
      handX = lerp(handX, sHandX, this.slideBlend);
      handY = lerp(handY, sHandY, this.slideBlend);
      zDepth = lerp(zDepth, sZ, this.slideBlend);
    }

    const scale = clamp(1 + zDepth * 0.1, 0.9, 1.11);

    return {
      side,
      shoulderX,
      shoulderY,
      elbowX,
      elbowY,
      handX,
      handY,
      zDepth,
      scale,
      openPalm: this.slideBlend > 0.45 && isSupportHand,
    };
  }

  // ============================================================================
  // 2. 3D-SHADED STYLIZED CARTOON BODY & EQUIPMENT RENDERERS
  // ============================================================================

  /** Draws a smooth 3D-shaded tapered capsule segment with dark cartoon ink outline */
  private drawShadedLimbSegment(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r1: number,
    r2: number,
    colorHi: string,
    colorMid: string,
    colorLo: string,
    outlineColor: string,
    outlineWidth = 2.4
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const ang = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.arc(x1, y1, r1, ang + Math.PI * 0.5, ang + Math.PI * 1.5);
    ctx.arc(x2, y2, r2, ang - Math.PI * 0.5, ang + Math.PI * 0.5);
    ctx.closePath();

    // Cross-cylinder 3D lighting gradient (top-left bright rim -> rich core -> deep right-bottom shadow)
    const midX = (x1 + x2) * 0.5;
    const midY = (y1 + y2) * 0.5;
    const avgR = (r1 + r2) * 0.55;
    const grad = ctx.createLinearGradient(
      midX - nx * avgR,
      midY - ny * avgR,
      midX + nx * avgR,
      midY + ny * avgR
    );
    grad.addColorStop(0, colorHi);
    grad.addColorStop(0.45, colorMid);
    grad.addColorStop(1, colorLo);

    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outlineColor;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  private drawLegAndSneaker(
    ctx: CanvasRenderingContext2D,
    leg: LegPose,
    pal: RigPalette,
    isBoosting: boolean
  ): void {
    const sc = leg.scale;
    const { hipX, hipY, kneeX, kneeY, ankleX, ankleY, side } = leg;

    // 1. Jogger Thigh (matte black with subtle 3D fold shading)
    this.drawShadedLimbSegment(
      ctx,
      hipX,
      hipY,
      kneeX,
      kneeY,
      11.5 * sc,
      9.4 * sc,
      pal.pantHi,
      pal.pantMid,
      pal.pantLo,
      pal.outline,
      2.4
    );

    // Outer thigh glowing neon accent stripe (cyan + purple/magenta touch like reference sheet)
    const thighAng = Math.atan2(kneeY - hipY, kneeX - hipX);
    const outX = Math.cos(thighAng + side * Math.PI * 0.5);
    const outY = Math.sin(thighAng + side * Math.PI * 0.5);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.accentHex;
    ctx.lineWidth = 2.6 * sc;
    ctx.beginPath();
    ctx.moveTo(
      lerp(hipX, kneeX, 0.18) + outX * 7.2 * sc,
      lerp(hipY, kneeY, 0.18) + outY * 7.2 * sc
    );
    ctx.lineTo(
      lerp(hipX, kneeX, 0.78) + outX * 6.5 * sc,
      lerp(hipY, kneeY, 0.78) + outY * 6.5 * sc
    );
    ctx.stroke();
    ctx.restore();

    // 2. Jogger Shin / Tapered Calf
    this.drawShadedLimbSegment(
      ctx,
      kneeX,
      kneeY,
      ankleX,
      ankleY,
      8.8 * sc,
      6.4 * sc,
      pal.pantHi,
      pal.pantMid,
      pal.pantLo,
      pal.outline,
      2.3
    );

    // Outer calf bright cyan futuristic zigzag/stripe accent
    const shinAng = Math.atan2(ankleY - kneeY, ankleX - kneeX);
    const sOutX = Math.cos(shinAng + side * Math.PI * 0.5);
    const sOutY = Math.sin(shinAng + side * Math.PI * 0.5);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = isBoosting ? '#38f9d7' : pal.hoodieRim;
    ctx.lineWidth = 2.4 * sc;
    ctx.beginPath();
    ctx.moveTo(
      lerp(kneeX, ankleX, 0.16) + sOutX * 5.8 * sc,
      lerp(kneeY, ankleY, 0.16) + sOutY * 5.8 * sc
    );
    ctx.lineTo(
      lerp(kneeX, ankleX, 0.76) + sOutX * 4.5 * sc,
      lerp(kneeY, ankleY, 0.76) + sOutY * 4.5 * sc
    );
    ctx.stroke();

    // Fitted ribbed jogger ankle cuff
    ctx.fillStyle = pal.pantHi;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(
      lerp(kneeX, ankleX, 0.9),
      lerp(kneeY, ankleY, 0.9),
      7.2 * sc,
      3.5 * sc,
      leg.footTilt,
      0,
      TWO_PI
    );
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3. Chunky Sculpted 3D Futuristic Sneaker (Heel View <-> Glowing Cyan Tread Sole Flip!)
    this.drawSneaker(ctx, leg, pal, isBoosting);
  }

  private drawSneaker(
    ctx: CanvasRenderingContext2D,
    leg: LegPose,
    pal: RigPalette,
    isBoosting: boolean
  ): void {
    const sc = leg.scale;
    const soleColor = isBoosting ? '#38f9d7' : pal.shoeSoleGlow;
    const reveal = leg.soleReveal;

    ctx.save();
    ctx.translate(leg.ankleX, leg.ankleY + 5 * sc);
    ctx.rotate(leg.footTilt);

    if (reveal < 0.42) {
      // GROUNDED / HEEL-BACK VIEW (Chunky futuristic sneaker planted firmly on asphalt)
      const w = 13.8 * sc;
      const h = 11.2 * sc;

      // Upper sculpted sneaker body
      const upGrad = ctx.createLinearGradient(-w, -h, w, h * 0.5);
      upGrad.addColorStop(0, pal.hoodieHi);
      upGrad.addColorStop(0.45, pal.shoeUpperHi);
      upGrad.addColorStop(1, pal.shoeUpperLo);

      ctx.beginPath();
      ctx.moveTo(-w * 0.78, -h * 0.65);
      ctx.quadraticCurveTo(0, -h * 0.92, w * 0.78, -h * 0.65);
      ctx.lineTo(w * 1.02, h * 0.25);
      ctx.quadraticCurveTo(w * 1.05, h * 0.68, w * 0.62, h * 0.72);
      ctx.lineTo(-w * 0.62, h * 0.72);
      ctx.quadraticCurveTo(-w * 1.05, h * 0.68, -w * 1.02, h * 0.25);
      ctx.closePath();
      ctx.fillStyle = upGrad;
      ctx.fill();
      ctx.lineWidth = 2.3;
      ctx.strokeStyle = pal.outline;
      ctx.stroke();

      // Purple/accent heel counter collar & pull tab
      ctx.fillStyle = pal.shoeAccent;
      ctx.beginPath();
      ctx.roundRect(-w * 0.52, -h * 0.48, w * 1.04, h * 0.44, 4 * sc);
      ctx.fill();

      // Crisp specular highlight on heel shell
      ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
      ctx.beginPath();
      ctx.ellipse(-w * 0.24, -h * 0.24, w * 0.26, h * 0.12, -0.2, 0, TWO_PI);
      ctx.fill();

      // Bright glowing cyan wrap-around futuristic midsole resting flush on the road!
      ctx.save();
      ctx.shadowColor = soleColor;
      ctx.shadowBlur = 8 * sc;
      ctx.fillStyle = soleColor;
      ctx.beginPath();
      ctx.roundRect(-w * 0.96, h * 0.24, w * 1.92, h * 0.42, 4 * sc);
      ctx.fill();
      // White-hot neon core line along midsole
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(-w * 0.76, h * 0.38, w * 1.52, 1.8 * sc);
      ctx.restore();

      // Crisp bottom outline
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = pal.outline;
      ctx.beginPath();
      ctx.roundRect(-w * 0.96, h * 0.24, w * 1.92, h * 0.42, 4 * sc);
      ctx.stroke();
    } else {
      // KICKBACK / SOLE-FLIP VIEW (Reveals glowing cyan futuristic sneaker tread facing camera!)
      const t = clamp((reveal - 0.42) / 0.58, 0, 1);
      const w = (12.8 + t * 2.4) * sc;
      const h = (12.0 + t * 7.8) * sc;

      // Upper sneaker peeking slightly behind the tilted sole
      ctx.fillStyle = pal.shoeUpperHi;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.28, w * 0.92, h * 0.56, 0, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();

      // Purple accent wrap
      ctx.fillStyle = pal.shoeAccent;
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.42, w * 0.56, h * 0.24, 0, 0, TWO_PI);
      ctx.fill();

      // Glowing neon outer sneaker sole rim with sculpted athletic forefoot-arch-heel contour
      ctx.save();
      ctx.shadowColor = soleColor;
      ctx.shadowBlur = 11 * sc;
      ctx.fillStyle = soleColor;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.22);
      ctx.bezierCurveTo(w * 0.92, -h * 0.22, w * 0.98, h * 0.16, w * 0.72, h * 0.36);
      ctx.bezierCurveTo(w * 0.9, h * 0.62, w * 0.78, h * 0.9, 0, h * 0.9);
      ctx.bezierCurveTo(-w * 0.78, h * 0.9, -w * 0.9, h * 0.62, -w * 0.72, h * 0.36);
      ctx.bezierCurveTo(-w * 0.98, h * 0.16, -w * 0.92, -h * 0.22, 0, -h * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.lineWidth = 2.1;
      ctx.strokeStyle = pal.outline;
      ctx.stroke();

      // Inner dark sculpted rubber tread cavity following the arch contour
      ctx.fillStyle = '#0c1330';
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.08);
      ctx.bezierCurveTo(w * 0.66, -h * 0.08, w * 0.7, h * 0.18, w * 0.5, h * 0.35);
      ctx.bezierCurveTo(w * 0.62, h * 0.56, w * 0.56, h * 0.76, 0, h * 0.76);
      ctx.bezierCurveTo(-w * 0.56, h * 0.76, -w * 0.62, h * 0.56, -w * 0.5, h * 0.35);
      ctx.bezierCurveTo(-w * 0.7, h * 0.18, -w * 0.66, -h * 0.08, 0, -h * 0.08);
      ctx.closePath();
      ctx.fill();

      // Luminous glowing forefoot & heel energy tread pads inside the sole
      ctx.fillStyle = soleColor;
      ctx.beginPath();
      ctx.roundRect(-w * 0.44, h * 0.05, w * 0.88, h * 0.2, 3 * sc);
      ctx.roundRect(-w * 0.36, h * 0.44, w * 0.72, h * 0.21, 3 * sc);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fillRect(-w * 0.3, h * 0.12, w * 0.6, 1.8 * sc);
      ctx.fillRect(-w * 0.24, h * 0.52, w * 0.48, 1.8 * sc);
    }

    ctx.restore();
  }

  private drawPelvisJoin(
    ctx: CanvasRenderingContext2D,
    hipX: number,
    hipY: number,
    pal: RigPalette,
    torsoTwist: number,
    slideBlend: number,
    slideSide: -1 | 1
  ): void {
    ctx.save();
    ctx.translate(hipX - torsoTwist * 0.12, hipY + 3);
    ctx.rotate(slideSide * 0.22 * slideBlend);

    const grad = ctx.createLinearGradient(-22, -6, 22, 12);
    grad.addColorStop(0, pal.pantHi);
    grad.addColorStop(0.5, pal.pantMid);
    grad.addColorStop(1, pal.pantLo);

    ctx.fillStyle = grad;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.ellipse(0, 2, 21, 12.5, 0, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawHoodieTorso(
    ctx: CanvasRenderingContext2D,
    hipX: number,
    hipY: number,
    shoulderMidX: number,
    shoulderMidY: number,
    shoulderRoll: number,
    torsoTwist: number,
    forwardLean: number,
    pal: RigPalette,
    isBoosting: boolean
  ): void {
    const shHalfW = 25.5 + forwardLean * 3.5;
    const waistHalfW = 19.8;

    const cosR = Math.cos(shoulderRoll);
    const sinR = Math.sin(shoulderRoll);

    const sLx = shoulderMidX - shHalfW * cosR;
    const sLy = shoulderMidY - shHalfW * sinR;
    const sRx = shoulderMidX + shHalfW * cosR;
    const sRy = shoulderMidY + shHalfW * sinR;

    const wLx = hipX - waistHalfW;
    const wLy = hipY + 2;
    const wRx = hipX + waistHalfW;
    const wRy = hipY + 2;

    ctx.save();

    // 1. Sculpted 3D Futuristic Hoodie Back Silhouette
    ctx.beginPath();
    ctx.moveTo(sLx, sLy + 2);
    ctx.quadraticCurveTo(shoulderMidX, shoulderMidY - 8, sRx, sRy + 2);
    ctx.bezierCurveTo(
      sRx + 4,
      lerp(sRy, wRy, 0.42),
      wRx + 2,
      lerp(sRy, wRy, 0.78),
      wRx,
      wRy
    );
    ctx.quadraticCurveTo(hipX, hipY + 9, wLx, wLy);
    ctx.bezierCurveTo(
      wLx - 2,
      lerp(sLy, wLy, 0.78),
      sLx - 4,
      lerp(sLy, wLy, 0.42),
      sLx,
      sLy + 2
    );
    ctx.closePath();

    // Rich directional 3D cartoon hoodie shading (matches part_hood_back.png seamlessly!)
    const bodyGrad = ctx.createLinearGradient(
      shoulderMidX - 24,
      shoulderMidY - 6,
      hipX + 24,
      hipY + 8
    );
    bodyGrad.addColorStop(0, pal.hoodieHi);
    bodyGrad.addColorStop(0.45, pal.hoodieMid);
    bodyGrad.addColorStop(1, pal.hoodieLo);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Subtle spine fabric fold highlight & side rim lighting
    const rimGrad = ctx.createLinearGradient(sLx, shoulderMidY, sRx, shoulderMidY);
    rimGrad.addColorStop(0, 'rgba(0, 240, 255, 0.28)');
    rimGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.08)');
    rimGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
    rimGrad.addColorStop(0.84, 'rgba(180, 76, 255, 0.14)');
    rimGrad.addColorStop(1, 'rgba(180, 76, 255, 0.34)');
    ctx.fillStyle = rimGrad;
    ctx.fill();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = pal.outline;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 2. Signature Glowing Back Neon V-Seam Lines (exact match to 180° Back view!)
    const neonColor = isBoosting ? '#38f9d7' : pal.hoodieRim;
    const spineShift = -torsoTwist * 0.45;
    const vTopY = lerp(shoulderMidY, hipY, 0.34);
    const vBotY = lerp(shoulderMidY, hipY, 0.84);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = neonColor;
    ctx.shadowBlur = isBoosting ? 12 : 7;

    // Outer glow stroke
    ctx.strokeStyle = neonColor;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    // Left angled cyber seam
    ctx.moveTo(lerp(sLx, shoulderMidX, 0.14) + spineShift * 0.5, vTopY);
    ctx.lineTo(hipX - 7.5 + spineShift, vBotY);
    // Right angled cyber seam
    ctx.moveTo(lerp(sRx, shoulderMidX, 0.14) + spineShift * 0.5, vTopY);
    ctx.lineTo(hipX + 7.5 + spineShift, vBotY);
    // Lower glowing hem piping
    ctx.moveTo(wLx + 4, wLy - 2);
    ctx.quadraticCurveTo(hipX, hipY + 4, wRx - 4, wRy - 2);
    ctx.stroke();

    // Crisp white-cyan inner filament core
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();

    // Subtle 3D overlap shadow beneath hoodie waist hem onto joggers
    ctx.strokeStyle = 'rgba(4, 5, 16, 0.65)';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(wLx + 1, wLy + 3.5);
    ctx.quadraticCurveTo(hipX, hipY + 10.5, wRx - 1, wRy + 3.5);
    ctx.stroke();

    // Ribbed dark-blue elastic bottom hoodie hem edge
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(wLx, wLy + 1);
    ctx.quadraticCurveTo(hipX, hipY + 8, wRx, wRy + 1);
    ctx.stroke();

    ctx.restore();
  }

  private drawArm(
    ctx: CanvasRenderingContext2D,
    arm: ArmPose,
    pal: RigPalette,
    isBoosting: boolean
  ): void {
    const sc = arm.scale;
    const { shoulderX, shoulderY, elbowX, elbowY, handX, handY } = arm;
    const neonColor = isBoosting ? '#38f9d7' : pal.hoodieRim;

    // 1. Electric-Blue Hoodie Upper Sleeve (shoulder -> elbow)
    this.drawShadedLimbSegment(
      ctx,
      shoulderX,
      shoulderY,
      elbowX,
      elbowY,
      9.4 * sc,
      7.6 * sc,
      pal.hoodieHi,
      pal.hoodieMid,
      pal.hoodieLo,
      pal.outline,
      2.3
    );

    // Glowing cyan neon sleeve band right above the elbow cuff (iconic detail from 360° sheet!)
    const uAng = Math.atan2(elbowY - shoulderY, elbowX - shoulderX);
    const bandX = lerp(shoulderX, elbowX, 0.84);
    const bandY = lerp(shoulderY, elbowY, 0.84);
    ctx.save();
    ctx.translate(bandX, bandY);
    ctx.rotate(uAng);
    ctx.shadowColor = neonColor;
    ctx.shadowBlur = 6 * sc;
    ctx.fillStyle = neonColor;
    ctx.beginPath();
    ctx.roundRect(-2.6 * sc, -7.8 * sc, 5.2 * sc, 15.6 * sc, 2.4 * sc);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillRect(-1.0 * sc, -6.2 * sc, 2.0 * sc, 12.4 * sc);
    ctx.restore();

    // 2. Warm 3D-Shaded Skin Forearm (elbow -> wrist)
    const wristX = lerp(elbowX, handX, 0.76);
    const wristY = lerp(elbowY, handY, 0.76);
    this.drawShadedLimbSegment(
      ctx,
      elbowX,
      elbowY,
      wristX,
      wristY,
      6.4 * sc,
      5.2 * sc,
      pal.skinHi,
      pal.skinMid,
      pal.skinLo,
      pal.outline,
      2.1
    );

    // 3. Futuristic Black Fingerless Glove + Glowing Cyan Wrist Strap
    const fAng = Math.atan2(handY - elbowY, handX - elbowX);
    ctx.save();
    ctx.translate(wristX, wristY);
    ctx.rotate(fAng);

    // Cyan glowing wrist band
    ctx.fillStyle = neonColor;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-2.4 * sc, -5.8 * sc, 4.4 * sc, 11.6 * sc, 2 * sc);
    ctx.fill();
    ctx.stroke();

    // Fingerless glove palm/back
    const gloveLen = arm.openPalm ? 11 * sc : 9.2 * sc;
    const gloveR = arm.openPalm ? 6.8 * sc : 6.2 * sc;
    const gGrad = ctx.createLinearGradient(0, -gloveR, gloveLen, gloveR);
    gGrad.addColorStop(0, pal.gloveHi);
    gGrad.addColorStop(1, pal.gloveLo);

    ctx.fillStyle = gGrad;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.roundRect(1.5 * sc, -gloveR, gloveLen, gloveR * 2, 4.5 * sc);
    ctx.fill();
    ctx.stroke();

    // Neon cyan knuckle rail accent on back of glove
    ctx.fillStyle = neonColor;
    ctx.fillRect(4.8 * sc, -gloveR * 0.65, 2.4 * sc, gloveR * 1.3);

    // Warm skin fingertips peeking past the fingerless glove!
    ctx.fillStyle = pal.skinMid;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(gloveLen + 1.6 * sc, -2.2 * sc, 2.5 * sc, 0, TWO_PI);
    ctx.arc(gloveLen + 2.0 * sc, 2.2 * sc, 2.5 * sc, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawFoldedHood(
    ctx: CanvasRenderingContext2D,
    shoulderMidX: number,
    shoulderMidY: number,
    shoulderRoll: number,
    forwardLean: number,
    skinId: RunnerSkinId,
    pal: RigPalette
  ): void {
    const hoodImg = this.getDrawablePart(CHARACTER_SPRITE_KEYS.PART_HOOD_BACK, skinId, true);
    const hoodY = shoulderMidY - 5 + this.hoodLagY * 0.72 + forwardLean * 3.5;

    ctx.save();
    ctx.translate(shoulderMidX, hoodY);
    ctx.rotate(shoulderRoll * 0.85);
    const stretchY = clamp(1 - this.hoodLagY * 0.018 + forwardLean * 0.08, 0.88, 1.18);
    ctx.scale(1.02, stretchY);

    if (hoodImg) {
      // part_hood_back.png is 64×48 with top collar rim around y = 5
      ctx.drawImage(hoodImg, -32, -5, 64, 48);
    } else {
      // Clean fallback draped hood if texture not ready on frame 0
      const grad = ctx.createLinearGradient(0, 0, 0, 34);
      grad.addColorStop(0, pal.hoodieHi);
      grad.addColorStop(1, pal.hoodieLo);
      ctx.fillStyle = grad;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(-24, 2);
      ctx.quadraticCurveTo(0, -6, 24, 2);
      ctx.quadraticCurveTo(18, 28, 0, 34);
      ctx.quadraticCurveTo(-18, 28, -24, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPaintedHead(
    ctx: CanvasRenderingContext2D,
    headX: number,
    headY: number,
    headTilt: number,
    forwardLean: number,
    slideBlend: number
  ): void {
    // Head hair & warm skin ears NEVER get recolored across skins!
    const headImg = this.getDrawablePart(CHARACTER_SPRITE_KEYS.PART_HEAD_BACK, 'cyber_pulse', false);

    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(headTilt);

    // Subtle foreshortening when leaning into high-speed sprint or tucking low in slide
    const scaleX = 1.03;
    const scaleY = 1.03 - forwardLean * 0.04 - slideBlend * 0.03;
    ctx.scale(scaleX, scaleY);

    if (headImg) {
      // part_head_back.png is 96×80 with neck base centered at (48, 66)
      ctx.drawImage(headImg, -48, -66, 96, 80);
    }
    ctx.restore();
  }

  private drawBackAura(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    speedIntensity: number,
    isBoosting: boolean,
    animState: CharacterAnimState,
    skin: RunnerSkinSpec
  ): void {
    const auraRadius = isBoosting ? 102 : 76 + speedIntensity * 14;
    const aura = ctx.createRadialGradient(cx, cy, 8, cx, cy, auraRadius);
    if (isBoosting) {
      aura.addColorStop(0, 'rgba(56, 249, 215, 0.48)');
      aura.addColorStop(0.55, 'rgba(0, 240, 255, 0.2)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else if (animState === 'SLIDE') {
      aura.addColorStop(0, skin.auraRgba);
      aura.addColorStop(0.6, 'rgba(255, 42, 133, 0.14)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      aura.addColorStop(0, skin.auraRgba);
      aura.addColorStop(0.58, 'rgba(157, 78, 221, 0.14)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, auraRadius, 0, TWO_PI);
    ctx.fill();
  }

  private drawSneakerJets(
    ctx: CanvasRenderingContext2D,
    leftLeg: LegPose,
    rightLeg: LegPose,
    elapsed: number,
    isBoosting: boolean,
    skin: RunnerSkinSpec
  ): void {
    const plumeLen = isBoosting
      ? 34 + Math.sin(elapsed * 46) * 6
      : 20 + Math.max(0, this.airFactorSmooth) * 14;

    for (const leg of [leftLeg, rightLeg]) {
      const px = leg.ankleX;
      const py = leg.ankleY + 9 * leg.scale;
      const grad = ctx.createLinearGradient(px, py, px, py + plumeLen);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
      grad.addColorStop(0.35, isBoosting ? 'rgba(56, 249, 215, 0.85)' : skin.trimHex);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(px - 6.5 * leg.scale, py);
      ctx.lineTo(px + 6.5 * leg.scale, py);
      ctx.lineTo(px, py + plumeLen);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawSlideGroundGlow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    slideBlend: number,
    slideSide: -1 | 1,
    skin: RunnerSkinSpec
  ): void {
    ctx.save();
    ctx.globalAlpha = slideBlend * 0.88;
    const grad = ctx.createLinearGradient(cx - 78, GROUND_LINE_Y - 2, cx + 78, GROUND_LINE_Y - 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.45, skin.coreHex);
    grad.addColorStop(0.6, '#ffffff');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(cx - 72 + slideSide * 6, GROUND_LINE_Y - 2);
    ctx.lineTo(cx + 72 + slideSide * 6, GROUND_LINE_Y - 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSprintSpeedWisps(
    ctx: CanvasRenderingContext2D,
    cx: number,
    shoulderY: number,
    speedIntensity: number,
    elapsed: number,
    skin: RunnerSkinSpec
  ): void {
    const alpha = clamp((speedIntensity - 0.45) * 0.65, 0, 0.42);
    if (alpha <= 0.02) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = skin.trimHex;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const pulse = (elapsed * 7 + i * 0.5) % 1;
      const sx = cx + side * (42 + pulse * 14);
      const sy = shoulderY + 12 + i * 16 + pulse * 26;
      const len = 14 + speedIntensity * 14;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + side * 4, sy + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ============================================================================
  // 3. HIGH-RES PAINTED REACTION POSES (HURT / VICTORY / DEATH)
  // ============================================================================

  private drawReactionSpriteFrame(
    animState: 'HURT' | 'VICTORY' | 'DEATH',
    elapsed: number,
    isBoosting: boolean,
    skin: RunnerSkinSpec
  ): void {
    const ctx = this.ctx;
    const cx = CANVAS_W * 0.5;
    const spriteKey: CharacterSpriteKey =
      animState === 'HURT'
        ? CHARACTER_SPRITE_KEYS.HURT
        : animState === 'VICTORY'
          ? CHARACTER_SPRITE_KEYS.VICTORY
          : CHARACTER_SPRITE_KEYS.DEATH;

    const frame = this.getDrawablePart(spriteKey, skin.id, true);

    let offsetX = 0;
    let offsetY = 0;
    let localScaleY = 1;
    let localRot = 0;

    if (animState === 'HURT') {
      const decay = Math.max(0, 1 - this.stateTime * 2.2);
      offsetX = Math.sin(elapsed * 56) * 6.5 * decay;
      offsetY = -4 * decay;
      localRot = Math.sin(elapsed * 42) * 0.08 * decay;
    } else if (animState === 'VICTORY') {
      const bounce = Math.abs(Math.sin(elapsed * 5.2));
      offsetY = -bounce * 10;
      localScaleY = 1 + bounce * 0.03;
    } else if (animState === 'DEATH') {
      const settle = Math.min(1, this.stateTime * 4.5);
      offsetY = 4 * settle;
    }

    // State-matched aura
    const auraY = animState === 'DEATH' ? 186 : 140;
    const auraR = animState === 'VICTORY' ? 98 : 84;
    const aura = ctx.createRadialGradient(cx + offsetX, auraY + offsetY, 10, cx + offsetX, auraY + offsetY, auraR);
    if (animState === 'HURT') {
      aura.addColorStop(0, 'rgba(255, 42, 133, 0.56)');
      aura.addColorStop(0.55, 'rgba(255, 90, 95, 0.22)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else if (animState === 'VICTORY') {
      aura.addColorStop(0, 'rgba(255, 209, 102, 0.48)');
      aura.addColorStop(0.55, skin.auraRgba);
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      aura.addColorStop(0, 'rgba(157, 78, 221, 0.24)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx + offsetX, auraY + offsetY, auraR, 0, TWO_PI);
    ctx.fill();

    if (frame) {
      ctx.save();
      ctx.translate(cx + offsetX, GROUND_LINE_Y + offsetY);
      if (localRot !== 0) ctx.rotate(localRot);
      if (localScaleY !== 1) ctx.scale(1, localScaleY);

      if (animState === 'HURT' && Math.floor(elapsed * 24) % 2 === 0) {
        ctx.shadowColor = '#ff2a85';
        ctx.shadowBlur = 18;
      } else if (animState === 'VICTORY') {
        ctx.shadowColor = '#ffd166';
        ctx.shadowBlur = 16;
      } else if (isBoosting) {
        ctx.shadowColor = '#38f9d7';
        ctx.shadowBlur = 14;
      }

      ctx.drawImage(frame, -cx, -GROUND_LINE_Y, CANVAS_W, CANVAS_H);
      ctx.restore();
    }
  }
}
