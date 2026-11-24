import Phaser from 'phaser';
import type { RunnerSkinSpec } from './cosmetics';

export interface RunnerAnimInput {
  dt: number;
  elapsed: number;
  speedNorm: number; // 0..1+
  laneVel: number; // lateral lane velocity (-10..+10)
  playerY: number;
  playerVy: number;
  isJumping: boolean;
  isSliding: boolean;
  isBoosting: boolean;
  skin: RunnerSkinSpec;
}

export interface RunnerAnimOutput {
  footStrikeSide: -1 | 1 | 0; // Emits -1 (left) or 1 (right) on exact foot touchdown
  squashX: number;
  squashY: number;
}

interface ScarfNode {
  x: number;
  y: number;
}

const CANVAS_W = 240;
const CANVAS_H = 260;
const TEX_KEY = 'runner_live_canvas';

/**
 * 60 FPS Real-Time Procedural Articulated Cyber-Runner Animator.
 * Renders sculpted armored limbs with true 3D stride foreshortening, velocity-reactive jump arcs,
 * dynamic parkour slide poses, landing squash-and-stretch, and physics-driven twin neon scarf ribbons.
 */
export class RunnerAnimator {
  private canvasTex: Phaser.Textures.CanvasTexture;
  private ctx: CanvasRenderingContext2D;

  // Continuous animation state
  private stridePhase = 0;
  private prevHalfCycle = 0;
  private jumpBlend = 0;
  private slideBlend = 0;
  private bankSmooth = 0;

  // Landing squash-and-stretch spring
  private squashAmt = 0; // positive = squashed wide/short, negative = stretched tall/thin
  private squashVel = 0;

  // Twin physics-driven energy scarf ribbons (in canvas coordinates)
  private scarfA: ScarfNode[] = [];
  private scarfB: ScarfNode[] = [];

  constructor(scene: Phaser.Scene) {
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

  public copySnapshotTo(scene: Phaser.Scene, targetKey: string): string {
    let dest = scene.textures.exists(targetKey)
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
    this.stridePhase = 0;
    this.prevHalfCycle = 0;
    this.jumpBlend = 0;
    this.slideBlend = 0;
    this.bankSmooth = 0;
    this.squashAmt = 0;
    this.squashVel = 0;

    this.scarfA = [];
    this.scarfB = [];
    for (let i = 0; i < 7; i++) {
      this.scarfA.push({ x: 124 + i * 6, y: 102 + i * 3 });
      this.scarfB.push({ x: 116 - i * 5, y: 104 + i * 3 });
    }
  }

  public triggerJumpImpulse(): void {
    // Crisp upward stretch impulse on takeoff
    this.squashAmt = -0.18;
    this.squashVel = -0.8;
  }

  public triggerLandingImpact(intensity = 1.0): void {
    // Expressive compression squash on landing that springs smoothly back
    this.squashAmt = Math.min(0.28, 0.19 * intensity);
    this.squashVel = 0.65 * intensity;
  }

  public triggerSlideImpulse(): void {
    this.squashAmt = 0.14;
    this.squashVel = 0.3;
  }

  public updateAndDraw(input: RunnerAnimInput): RunnerAnimOutput {
    const { dt, elapsed, speedNorm, laneVel, playerVy, isJumping, isSliding, isBoosting, skin } =
      input;

    // 1. Advance continuous sprint stride cycle
    let footStrikeSide: -1 | 1 | 0 = 0;
    const strideRate = 10.5 + speedNorm * 8.2 + (isBoosting ? 4.5 : 0);
    if (!isJumping && !isSliding) {
      this.stridePhase += dt * strideRate;
      const halfCycle = Math.floor(this.stridePhase / Math.PI);
      if (halfCycle !== this.prevHalfCycle) {
        this.prevHalfCycle = halfCycle;
        footStrikeSide = halfCycle % 2 === 0 ? -1 : 1;
      }
    } else {
      // Gently settle stride phase mid-air
      this.stridePhase += dt * 1.4;
    }

    // 2. Smoothly blend state weights (eliminates abrupt 1-frame texture pops!)
    const targetJump = isJumping ? 1 : 0;
    const targetSlide = isSliding && !isJumping ? 1 : 0;
    this.jumpBlend = Phaser.Math.Linear(this.jumpBlend, targetJump, 1 - Math.exp(-22 * dt));
    this.slideBlend = Phaser.Math.Linear(this.slideBlend, targetSlide, 1 - Math.exp(-24 * dt));

    const targetBank = Phaser.Math.Clamp(laneVel * 0.18, -1, 1);
    this.bankSmooth = Phaser.Math.Linear(this.bankSmooth, targetBank, 1 - Math.exp(-18 * dt));

    // 3. Damped spring for squash & stretch
    const stiffness = 190;
    const damping = 16;
    const force = -stiffness * this.squashAmt - damping * this.squashVel;
    this.squashVel += force * dt;
    this.squashAmt += this.squashVel * dt;
    if (Math.abs(this.squashAmt) < 0.002 && Math.abs(this.squashVel) < 0.01) {
      this.squashAmt = 0;
      this.squashVel = 0;
    }

    const squashX = 1 + this.squashAmt * 0.72;
    const squashY = 1 - this.squashAmt * 0.85;

    // 4. Compute articulated skeleton pose & draw onto live canvas
    this.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.drawSculptedRunner(
      dt,
      elapsed,
      speedNorm,
      playerVy,
      isBoosting,
      skin
    );
    this.canvasTex.refresh();

    return { footStrikeSide, squashX, squashY };
  }

  private drawSculptedRunner(
    dt: number,
    elapsed: number,
    speedNorm: number,
    playerVy: number,
    isBoosting: boolean,
    skin: RunnerSkinSpec
  ): void {
    const ctx = this.ctx;
    const cx = CANVAS_W * 0.5;
    const groundY = 232;

    const runWeight = Math.max(0, 1 - Math.max(this.jumpBlend, this.slideBlend));
    const phase = this.stridePhase;
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);

    // Subtle natural vertical bounce during running (double-frequency of stride)
    const runBob = -Math.abs(sinP) * 9.5 * runWeight;
    // Lateral hip shift onto the planted supporting foot
    const hipSway = -sinP * 5.2 * runWeight + this.bankSmooth * 12;
    // Counter-twist between pelvis and shoulders
    const shoulderTwist = sinP * 4.5 * runWeight;

    // Pelvis & torso positions smoothly blended across Run / Jump / Slide
    const airFactor = Phaser.Math.Clamp(playerVy / 2.6, -1, 1); // +1 launch, 0 apex, -1 fall
    const hipX = cx + hipSway;
    const hipY =
      (148 + runBob) * (1 - this.slideBlend) +
      204 * this.slideBlend +
      this.jumpBlend * (-10 - airFactor * 5);

    const torsoLen = 62 * (1 - this.slideBlend * 0.34);
    const torsoLeanX =
      this.bankSmooth * 14 +
      this.slideBlend * -14 +
      this.jumpBlend * (airFactor < 0 ? 4 : -2);
    const shoulderCenterX = hipX + torsoLeanX;
    const shoulderCenterY = hipY - torsoLen;

    // Update physics-driven twin energy scarf ribbons anchored at collar
    this.updateScarfPhysics(
      dt,
      elapsed,
      shoulderCenterX + 8,
      shoulderCenterY + 6,
      shoulderCenterX - 8,
      shoulderCenterY + 8,
      speedNorm,
      playerVy,
      isBoosting
    );

    // Ambient cyber-aura behind character
    const auraRadius = isBoosting ? 92 : 76;
    const aura = ctx.createRadialGradient(
      shoulderCenterX,
      hipY - 22,
      8,
      shoulderCenterX,
      hipY - 22,
      auraRadius
    );
    aura.addColorStop(0, isBoosting ? 'rgba(56, 249, 215, 0.42)' : skin.auraRgba);
    aura.addColorStop(0.55, 'rgba(157, 78, 221, 0.12)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(shoulderCenterX, hipY - 22, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    // Compute both legs (true 3D foreshortening + knee articulation)
    const leftLeg = this.computeLegPose(-1, hipX, hipY, groundY, phase, airFactor);
    const rightLeg = this.computeLegPose(1, hipX, hipY, groundY, phase + Math.PI, airFactor);

    // Compute both arms (counter-phase pumping + jump balance + slide brace)
    const leftArm = this.computeArmPose(
      -1,
      shoulderCenterX - 24 + shoulderTwist,
      shoulderCenterY + 10,
      phase + Math.PI,
      airFactor
    );
    const rightArm = this.computeArmPose(
      1,
      shoulderCenterX + 24 + shoulderTwist,
      shoulderCenterY + 10,
      phase,
      airFactor
    );

    // --- LAYER 1: Limbs currently further forward (behind torso) ---
    if (leftLeg.depth < 0) this.drawSculptedLeg(ctx, leftLeg, skin, isBoosting);
    if (rightLeg.depth < 0) this.drawSculptedLeg(ctx, rightLeg, skin, isBoosting);
    if (leftArm.depth < 0) this.drawSculptedArm(ctx, leftArm, skin);
    if (rightArm.depth < 0) this.drawSculptedArm(ctx, rightArm, skin);

    // --- LAYER 2: Armored Pelvis & Tapered Cyber-Torso ---
    this.drawSculptedTorso(
      ctx,
      hipX,
      hipY,
      shoulderCenterX,
      shoulderCenterY,
      shoulderTwist,
      skin,
      isBoosting,
      elapsed
    );

    // --- LAYER 3: Limbs currently pushing back (closer to camera, in front of torso edge) ---
    if (leftLeg.depth >= 0) this.drawSculptedLeg(ctx, leftLeg, skin, isBoosting);
    if (rightLeg.depth >= 0) this.drawSculptedLeg(ctx, rightLeg, skin, isBoosting);
    if (leftArm.depth >= 0) this.drawSculptedArm(ctx, leftArm, skin);
    if (rightArm.depth >= 0) this.drawSculptedArm(ctx, rightArm, skin);

    // --- LAYER 4: Aerodynamic Cyber-Helmet ---
    const headBob = -Math.abs(cosP) * 2.5 * runWeight;
    const headX = shoulderCenterX + this.bankSmooth * 4 + this.slideBlend * -6;
    const headY = shoulderCenterY - 20 + headBob + this.slideBlend * 4;
    this.drawSculptedHelmet(ctx, headX, headY, this.bankSmooth, skin, isBoosting);

    // --- LAYER 5: Flowing Physics-Driven Twin Neon Scarf Ribbons ---
    this.drawScarfRibbon(ctx, this.scarfB, skin.trimHex, isBoosting ? '#38f9d7' : skin.trimHex, 4.5, 0.72);
    this.drawScarfRibbon(ctx, this.scarfA, skin.coreHex, isBoosting ? '#ffffff' : skin.coreHex, 6.2, 0.95);
  }

  private computeLegPose(
    side: -1 | 1,
    hipX: number,
    hipY: number,
    groundY: number,
    legPhase: number,
    airFactor: number
  ) {
    const s = Math.sin(legPhase); // +1 = foot lifted/backstroke, -1 = foot driven forward
    const c = Math.cos(legPhase); // +1 = plant/contact, -1 = airborne kickback

    const hipJointX = hipX + side * 14;
    const hipJointY = hipY + 2;

    // RUN pose: realistic rear-view stride with knee lift & push-off extension
    const lift = Math.max(0, s);
    const forwardReach = Math.max(0, -s);
    const runKneeX = hipJointX + side * (4 + lift * 4);
    const runKneeY = hipJointY + 35 - lift * 20 - forwardReach * 6;
    const runFootX = hipJointX + side * (5 + lift * 5);
    const runFootY = groundY - lift * 38 - Math.max(0, c) * 4;
    // Depth > 0 means closer to camera (back-kick showing glowing boot sole!)
    const runDepth = s;
    const runSoleVisible = Phaser.Math.Clamp(lift * 1.35, 0.12, 1);

    // JUMP pose: velocity-reactive (launch -> stylish tuck -> descent reach)
    const isLeft = side < 0;
    const tuck = 1 - Math.abs(airFactor); // peaks at apex!
    const jumpKneeX = hipJointX + side * (16 + tuck * 10);
    const jumpKneeY =
      hipJointY + (isLeft ? 20 : 32) - tuck * (isLeft ? 16 : 6) - airFactor * 8;
    const jumpFootX = hipJointX + side * (10 + tuck * 4);
    const jumpFootY =
      hipJointY + (isLeft ? 48 : 66) - tuck * (isLeft ? 18 : 10) - airFactor * 14;
    const jumpDepth = isLeft ? 0.5 : -0.2;

    // SLIDE pose: low baseball/parkour power-slide (one leg kicked wide, one tucked under)
    const slideKneeX = hipJointX + (isLeft ? -28 : 26);
    const slideKneeY = groundY - (isLeft ? 14 : 18);
    const slideFootX = hipJointX + (isLeft ? -52 : 44);
    const slideFootY = groundY - (isLeft ? 4 : 7);

    // Smooth blend between Run -> Jump -> Slide
    const jB = this.jumpBlend;
    const sB = this.slideBlend;
    const rB = Math.max(0, 1 - jB - sB);

    const kneeX = runKneeX * rB + jumpKneeX * jB + slideKneeX * sB;
    const kneeY = runKneeY * rB + jumpKneeY * jB + slideKneeY * sB;
    const footX = runFootX * rB + jumpFootX * jB + slideFootX * sB;
    const footY = runFootY * rB + jumpFootY * jB + slideFootY * sB;
    const depth = runDepth * rB + jumpDepth * jB + (isLeft ? 0.4 : -0.2) * sB;
    const soleVisible = runSoleVisible * rB + (0.95) * jB + 0.85 * sB;

    return {
      side,
      hipX: hipJointX,
      hipY: hipJointY,
      kneeX,
      kneeY,
      footX,
      footY,
      depth,
      soleVisible,
      showThruster: jB > 0.2 && airFactor > -0.25,
      thrusterStrength: jB * Phaser.Math.Clamp((airFactor + 0.35) / 1.1, 0.25, 1),
      showSlideSparks: sB > 0.35,
    };
  }

  private drawSculptedLeg(
    ctx: CanvasRenderingContext2D,
    leg: ReturnType<RunnerAnimator['computeLegPose']>,
    skin: RunnerSkinSpec,
    isBoosting: boolean
  ): void {
    const scaleDepth = 1 + leg.depth * 0.13;

    // Jet-boot plasma thruster plume during jump ascent or Hyper-Boost!
    if (leg.showThruster || isBoosting) {
      const strength = isBoosting ? 1.0 : leg.thrusterStrength;
      const plumeLen = (34 + Math.random() * 14) * strength;
      const flame = ctx.createLinearGradient(
        leg.footX,
        leg.footY,
        leg.footX,
        leg.footY + plumeLen
      );
      flame.addColorStop(0, '#ffffff');
      flame.addColorStop(0.32, isBoosting ? '#38f9d7' : skin.trimHex);
      flame.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(leg.footX - 8 * scaleDepth, leg.footY + 2);
      ctx.lineTo(leg.footX + 8 * scaleDepth, leg.footY + 2);
      ctx.lineTo(leg.footX, leg.footY + plumeLen);
      ctx.closePath();
      ctx.fill();
    }

    // Tapered armored thigh polygon
    this.drawTaperedSegment(
      ctx,
      leg.hipX,
      leg.hipY,
      leg.kneeX,
      leg.kneeY,
      10.5 * scaleDepth,
      8.2 * scaleDepth,
      skin.limbDark,
      skin.suitBottom
    );

    // Tapered shin armor
    this.drawTaperedSegment(
      ctx,
      leg.kneeX,
      leg.kneeY,
      leg.footX,
      leg.footY,
      8.2 * scaleDepth,
      6.4 * scaleDepth,
      skin.suitTop,
      skin.limbDark
    );

    // Glowing knee pad armor ring
    ctx.fillStyle = skin.trimHex;
    ctx.shadowColor = skin.trimHex;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(leg.kneeX + leg.side * 2, leg.kneeY, 4.2 * scaleDepth, 0, Math.PI * 2);
    ctx.fill();

    // Glowing neon shin rail
    ctx.strokeStyle = skin.trimHex;
    ctx.lineWidth = 3 * scaleDepth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leg.kneeX + leg.side * 3.5, leg.kneeY + 3);
    ctx.lineTo(leg.footX + leg.side * 3, leg.footY - 4);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cyber hover-boot housing
    ctx.fillStyle = skin.suitBottom;
    ctx.beginPath();
    ctx.ellipse(leg.footX, leg.footY, 11 * scaleDepth, 6.5 * scaleDepth, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glowing neon boot sole (extra bright when kicking back toward camera!)
    const soleColor = isBoosting ? '#38f9d7' : skin.bootHex;
    ctx.fillStyle = soleColor;
    ctx.shadowColor = soleColor;
    ctx.shadowBlur = 14 * leg.soleVisible;
    ctx.beginPath();
    ctx.ellipse(
      leg.footX,
      leg.footY + 3 * scaleDepth,
      11.5 * scaleDepth,
      (3.6 + leg.soleVisible * 3.2) * scaleDepth,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // White hot inner thruster core on exposed boot sole
    if (leg.soleVisible > 0.45) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(
        leg.footX,
        leg.footY + 3 * scaleDepth,
        5.5 * scaleDepth,
        2.3 * scaleDepth,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  private computeArmPose(
    side: -1 | 1,
    shoulderX: number,
    shoulderY: number,
    armPhase: number,
    airFactor: number
  ) {
    const s = Math.sin(armPhase); // +1 = arm swung back toward camera, -1 = arm swung forward

    // RUN athletic bent-elbow sprint pump
    const runElbowX = shoulderX + side * (11 + Math.max(0, s) * 4);
    const runElbowY = shoulderY + 24 - s * 13;
    const runHandX = runElbowX + side * (3 - s * 5);
    const runHandY = runElbowY + 18 - s * 16;

    // JUMP expressive aerial balance arms swept out & up
    const jumpElbowX = shoulderX + side * 22;
    const jumpElbowY = shoulderY + 6 - airFactor * 14;
    const jumpHandX = jumpElbowX + side * 14;
    const jumpHandY = jumpElbowY - 14 - airFactor * 10;

    // SLIDE aerodynamic tucked arm + trailing balance hand
    const isLeft = side < 0;
    const slideElbowX = shoulderX + (isLeft ? -16 : 20);
    const slideElbowY = shoulderY + (isLeft ? 16 : 10);
    const slideHandX = slideElbowX + (isLeft ? -14 : 18);
    const slideHandY = slideElbowY + (isLeft ? 10 : -4);

    const jB = this.jumpBlend;
    const sB = this.slideBlend;
    const rB = Math.max(0, 1 - jB - sB);

    return {
      side,
      shoulderX,
      shoulderY,
      elbowX: runElbowX * rB + jumpElbowX * jB + slideElbowX * sB,
      elbowY: runElbowY * rB + jumpElbowY * jB + slideElbowY * sB,
      handX: runHandX * rB + jumpHandX * jB + slideHandX * sB,
      handY: runHandY * rB + jumpHandY * jB + slideHandY * sB,
      depth: s * rB + 0.2 * jB + (isLeft ? -0.2 : 0.3) * sB,
    };
  }

  private drawSculptedArm(
    ctx: CanvasRenderingContext2D,
    arm: ReturnType<RunnerAnimator['computeArmPose']>,
    skin: RunnerSkinSpec
  ): void {
    const depthScale = 1 + arm.depth * 0.1;

    // Upper arm
    this.drawTaperedSegment(
      ctx,
      arm.shoulderX,
      arm.shoulderY,
      arm.elbowX,
      arm.elbowY,
      7.2 * depthScale,
      5.8 * depthScale,
      skin.limbDark,
      skin.suitBottom
    );

    // Forearm gauntlet
    this.drawTaperedSegment(
      ctx,
      arm.elbowX,
      arm.elbowY,
      arm.handX,
      arm.handY,
      6.0 * depthScale,
      4.8 * depthScale,
      skin.suitTop,
      skin.limbDark
    );

    // Glowing holographic gauntlet stripe & wrist cuff
    ctx.strokeStyle = skin.trimHex;
    ctx.lineWidth = 2.8 * depthScale;
    ctx.lineCap = 'round';
    ctx.shadowColor = skin.trimHex;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(arm.elbowX, arm.elbowY);
    ctx.lineTo(arm.handX, arm.handY);
    ctx.stroke();

    // Glowing knuckle pulse
    ctx.fillStyle = skin.coreHex;
    ctx.beginPath();
    ctx.arc(arm.handX, arm.handY, 3.6 * depthScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawSculptedTorso(
    ctx: CanvasRenderingContext2D,
    hipX: number,
    hipY: number,
    shoulderX: number,
    shoulderY: number,
    twist: number,
    skin: RunnerSkinSpec,
    isBoosting: boolean,
    elapsed: number
  ): void {
    const shHalf = 27;
    const hipHalf = 17;

    // Armored pelvis belt
    ctx.fillStyle = skin.suitBottom;
    ctx.beginPath();
    ctx.ellipse(hipX, hipY + 2, hipHalf + 2, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main sculpted cyber-jacket silhouette (athletic V-taper with subtle metallic gradient)
    const torsoGrad = ctx.createLinearGradient(shoulderX, shoulderY, hipX, hipY);
    torsoGrad.addColorStop(0, skin.suitTop);
    torsoGrad.addColorStop(0.55, skin.limbDark);
    torsoGrad.addColorStop(1, skin.suitBottom);

    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.moveTo(shoulderX - shHalf, shoulderY + 6);
    ctx.quadraticCurveTo(shoulderX, shoulderY - 4, shoulderX + shHalf, shoulderY + 6);
    ctx.lineTo(hipX + hipHalf, hipY + 3);
    ctx.lineTo(hipX - hipHalf, hipY + 3);
    ctx.closePath();
    ctx.fill();

    // Sculpted shoulder pauldrons
    for (const side of [-1, 1]) {
      const px = shoulderX + side * (shHalf - 2);
      const py = shoulderY + 7;
      ctx.fillStyle = skin.suitTop;
      ctx.beginPath();
      ctx.ellipse(px, py, 10, 7, side * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = skin.trimHex;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = skin.trimHex;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px, py, 8.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Glowing jacket side seam rails
    ctx.strokeStyle = isBoosting ? '#38f9d7' : skin.trimHex;
    ctx.lineWidth = 3;
    ctx.shadowColor = isBoosting ? '#38f9d7' : skin.trimHex;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(shoulderX - shHalf + 3, shoulderY + 10);
    ctx.lineTo(hipX - hipHalf + 2, hipY);
    ctx.moveTo(shoulderX + shHalf - 3, shoulderY + 10);
    ctx.lineTo(hipX + hipHalf - 2, hipY);
    ctx.stroke();

    // Glowing waist belt accent
    ctx.strokeStyle = skin.trimHex;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(hipX - hipHalf + 1, hipY + 1);
    ctx.lineTo(hipX + hipHalf - 1, hipY + 1);
    ctx.stroke();

    // Pulsing cyber-spine reactor & segmented vertebrae nodes
    const spineX = (shoulderX + hipX) * 0.5 + twist * 0.5;
    const spineTopY = shoulderY + 11;
    const reactorPulse = 0.85 + 0.15 * Math.sin(elapsed * 10);
    const coreColor = isBoosting ? '#38f9d7' : skin.coreHex;

    ctx.fillStyle = coreColor;
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 16 * reactorPulse;

    // Upper diamond reactor core
    ctx.beginPath();
    ctx.moveTo(spineX, spineTopY);
    ctx.lineTo(spineX + 10, spineTopY + 13);
    ctx.lineTo(spineX, spineTopY + 30);
    ctx.lineTo(spineX - 10, spineTopY + 13);
    ctx.closePath();
    ctx.fill();

    // Segmented lower spine nodes
    ctx.fillRect(spineX - 4.5, spineTopY + 34, 9, 4);
    ctx.fillRect(spineX - 3.5, spineTopY + 41, 7, 3.5);

    // Hot white center core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(spineX, spineTopY + 14, 3.6 * reactorPulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawSculptedHelmet(
    ctx: CanvasRenderingContext2D,
    hx: number,
    hy: number,
    bank: number,
    skin: RunnerSkinSpec,
    isBoosting: boolean
  ): void {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(bank * 0.16);

    // Aerodynamic helmet shell gradient
    const helmGrad = ctx.createRadialGradient(-5, -8, 3, 0, 0, 22);
    helmGrad.addColorStop(0, skin.suitTop);
    helmGrad.addColorStop(1, skin.suitBottom);
    ctx.fillStyle = helmGrad;

    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Metallic rim highlight on crown
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -1, 16, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();

    // Glowing dorsal neon fin / Mohawk rail along helmet top
    const trim = isBoosting ? '#38f9d7' : skin.trimHex;
    ctx.strokeStyle = trim;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.shadowColor = trim;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 7);
    ctx.stroke();

    // Swept dual side visor wings / cyber ear pods
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-18, -4);
    ctx.lineTo(-24, -10);
    ctx.lineTo(-21, 5);
    ctx.lineTo(-17, 5);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(18, -4);
    ctx.lineTo(24, -10);
    ctx.lineTo(21, 5);
    ctx.lineTo(17, 5);
    ctx.closePath();
    ctx.fill();

    // Rear helmet collar light bar
    ctx.fillStyle = skin.coreHex;
    ctx.shadowColor = skin.coreHex;
    ctx.shadowBlur = 10;
    ctx.fillRect(-9, 13, 18, 3.2);

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private updateScarfPhysics(
    dt: number,
    elapsed: number,
    anchorAX: number,
    anchorAY: number,
    anchorBX: number,
    anchorBY: number,
    speedNorm: number,
    playerVy: number,
    isBoosting: boolean
  ): void {
    const stepScarf = (
      nodes: ScarfNode[],
      ax: number,
      ay: number,
      sideDir: number,
      phaseOffset: number
    ) => {
      if (nodes.length === 0) return;
      nodes[0].x = ax;
      nodes[0].y = ay;

      const windFreq = 11 + speedNorm * 10 + (isBoosting ? 8 : 0);
      const windAmp = 10 + speedNorm * 8 + (isBoosting ? 6 : 0);
      // Whip opposite to banking direction & billow upward when falling!
      const lateralWhip = -this.bankSmooth * 34 + sideDir * (14 + this.slideBlend * 12);
      const verticalBillow =
        playerVy * 11 - this.slideBlend * 12 - (isBoosting ? 8 : 0);

      for (let i = 1; i < nodes.length; i++) {
        const prev = nodes[i - 1];
        const curr = nodes[i];
        const t = i / (nodes.length - 1);

        const waveX = Math.sin(elapsed * windFreq - i * 0.95 + phaseOffset) * windAmp * t;
        const waveY = Math.cos(elapsed * windFreq * 0.85 - i * 0.8 + phaseOffset) * 5.5 * t;

        const targetX = prev.x + lateralWhip * 0.24 + waveX * 0.38;
        const targetY = prev.y + 4.5 + verticalBillow * 0.22 + waveY * 0.45;

        const follow = 1 - Math.exp(-(24 - i * 1.4) * dt);
        curr.x = Phaser.Math.Linear(curr.x, targetX, follow);
        curr.y = Phaser.Math.Linear(curr.y, targetY, follow);

        // Enforce segment max distance so ribbons stay sleek & never stretch too far
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.hypot(dx, dy);
        const maxLen = 10.5;
        if (dist > maxLen) {
          curr.x = prev.x + (dx / dist) * maxLen;
          curr.y = prev.y + (dy / dist) * maxLen;
        }
      }
    };

    stepScarf(this.scarfA, anchorAX, anchorAY, 1, 0);
    stepScarf(this.scarfB, anchorBX, anchorBY, -0.85, 1.9);
  }

  private drawScarfRibbon(
    ctx: CanvasRenderingContext2D,
    nodes: ScarfNode[],
    color: string,
    glowColor: string,
    baseWidth: number,
    alpha: number
  ): void {
    if (nodes.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const fade = 1 - i / (nodes.length - 1);
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * (0.28 + fade * 0.72);
      ctx.lineWidth = Math.max(1.2, baseWidth * fade);
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 12 * fade;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawTaperedSegment(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r1: number,
    r2: number,
    colorStart: string,
    colorEnd: string
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;

    const nx = -dy / len;
    const ny = dx / len;

    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, colorStart);
    grad.addColorStop(1, colorEnd);
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
    ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
    ctx.lineTo(x2 - nx * r2, y2 - ny * r2);
    ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
    ctx.closePath();
    ctx.fill();

    // Smooth rounded joint caps
    ctx.beginPath();
    ctx.arc(x1, y1, r1, 0, Math.PI * 2);
    ctx.arc(x2, y2, r2, 0, Math.PI * 2);
    ctx.fill();
  }
}
