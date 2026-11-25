import Phaser from 'phaser';
import type { ObstacleType } from './types';

export interface ObstacleCollisionInput {
  obstacleType: ObstacleType;
  obstacleLane: number;
  obstacleZ: number;
  nearMissed: boolean;
  playerLaneX: number;
  playerY: number;
  playerZ: number;
  isSliding: boolean;
  isBoosting: boolean;
}

export type ObstacleCollisionResult = 'NONE' | 'HIT' | 'CLEARED' | 'NEAR_MISS';

export interface JumpLandingFeedbackInput {
  footX: number;
  footY: number;
  scale: number;
  primaryColor: number;
  accentColor: number;
  wasFastFalling: boolean;
}

/**
 * Centralizes Neon Dash collision evaluation and tactile ground-contact feedback.
 * Owns pooled Phaser ParticleEmitters triggered precisely at the player's feet
 * whenever a JUMP sequence completes upon highway touchdown.
 */
export class CollisionManager {
  private landingDustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private landingSparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    // Ground-skimming translucent mist/dust puffs fanning sideways & slightly upward from both sneakers
    this.landingDustEmitter = scene.add.particles(0, 0, 'particle_dust', {
      emitting: false,
      lifespan: { min: 220, max: 350 },
      angle: { min: 192, max: 348 },
      speed: { min: 55, max: 145 },
      gravityY: 185,
      scale: { start: 0.48, end: 1.1 },
      alpha: { start: 0.78, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      maxParticles: 48,
    });
    this.landingDustEmitter.setDepth(492);

    // Crisp neon micro-sparks snapping sideways & upward from the sneaker soles on touchdown
    this.landingSparkEmitter = scene.add.particles(0, 0, 'particle_spark', {
      emitting: false,
      lifespan: { min: 170, max: 290 },
      angle: { min: 198, max: 342 },
      speed: { min: 85, max: 210 },
      gravityY: 320,
      scale: { start: 0.56, end: 0.08 },
      alpha: { start: 0.95, end: 0 },
      rotate: { min: 0, max: 360 },
      blendMode: Phaser.BlendModes.ADD,
      maxParticles: 40,
    });
    this.landingSparkEmitter.setDepth(505);
  }

  /**
   * Evaluates obstacle overlap, jump/slide clearance, and near-miss thresholds
   * using Neon Dash's exact calibrated lane/depth hitboxes.
   */
  public evaluateObstacleCollision(input: ObstacleCollisionInput): ObstacleCollisionResult {
    const zDiff = Math.abs(input.obstacleZ - input.playerZ);
    const xDiff = Math.abs(input.obstacleLane - input.playerLaneX);

    if (zDiff < 0.034 && xDiff < 0.42) {
      const clearedByJump = input.obstacleType === 'LOW' && input.playerY > 0.19;
      const clearedBySlide =
        input.obstacleType === 'HIGH' && input.isSliding && input.playerY < 0.09;
      return clearedByJump || clearedBySlide ? 'CLEARED' : 'HIT';
    }

    if (
      !input.nearMissed &&
      input.obstacleZ < input.playerZ - 0.035 &&
      input.obstacleZ > input.playerZ - 0.12 &&
      xDiff >= 0.44 &&
      xDiff < 0.92 &&
      !input.isBoosting
    ) {
      return 'NEAR_MISS';
    }

    return 'NONE';
  }

  /**
   * Triggers a compact, directional particle burst right at the player's sneakers
   * when completing a JUMP sequence and contacting the highway surface.
   */
  public emitJumpLandingFeedback(input: JumpLandingFeedbackInput): void {
    const { footX, footY, scale, primaryColor, accentColor, wasFastFalling } = input;
    const clampedScale = Phaser.Math.Clamp(scale, 0.55, 1.5);
    const footSpread = 12 * clampedScale;

    this.landingDustEmitter.setParticleTint(
      wasFastFalling ? [accentColor, primaryColor, 0xffffff] : [primaryColor, 0xd8f8ff]
    );
    this.landingSparkEmitter.setParticleTint(
      wasFastFalling ? [accentColor, 0xffffff] : [primaryColor, accentColor, 0xffffff]
    );

    // Emit twin compact bursts directly beneath left & right sneaker heels
    const dustPerFoot = wasFastFalling ? 6 : 4;
    const sparksPerFoot = wasFastFalling ? 5 : 3;

    this.landingDustEmitter.explode(dustPerFoot, footX - footSpread, footY);
    this.landingDustEmitter.explode(dustPerFoot, footX + footSpread, footY);

    this.landingSparkEmitter.explode(sparksPerFoot, footX - footSpread * 0.85, footY - 1);
    this.landingSparkEmitter.explode(sparksPerFoot, footX + footSpread * 0.85, footY - 1);
  }

  public clear(): void {
    this.landingDustEmitter?.killAll();
    this.landingSparkEmitter?.killAll();
  }

  public destroy(): void {
    this.landingDustEmitter?.destroy();
    this.landingSparkEmitter?.destroy();
  }
}
