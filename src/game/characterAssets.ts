import type Phaser from 'phaser';
import type { RunnerSkinId } from './cosmetics';

export type CharacterAnimState =
  | 'IDLE'
  | 'RUN'
  | 'JUMP'
  | 'SLIDE'
  | 'HURT'
  | 'VICTORY'
  | 'DEATH';

export const CHARACTER_SPRITE_KEYS = {
  RUN_0: 'char_run_0',
  RUN_1: 'char_run_1',
  RUN_2: 'char_run_2',
  RUN_3: 'char_run_3',
  RUN_4: 'char_run_4',
  RUN_5: 'char_run_5',
  RUN_6: 'char_run_6',
  RUN_7: 'char_run_7',
  JUMP: 'char_jump',
  SLIDE: 'char_slide',
  IDLE_BACK: 'char_idle_back',
  IDLE_FRONT_0: 'char_idle_front_0',
  IDLE_FRONT_1: 'char_idle_front_1',
  HURT: 'char_hurt',
  VICTORY: 'char_victory',
  DEATH: 'char_death',
  PART_HEAD_BACK: 'char_part_head_back',
  PART_HOOD_BACK: 'char_part_hood_back',
} as const;

export type CharacterSpriteKey =
  (typeof CHARACTER_SPRITE_KEYS)[keyof typeof CHARACTER_SPRITE_KEYS];

export const CHARACTER_SPRITE_PATHS: Record<CharacterSpriteKey, string> = {
  [CHARACTER_SPRITE_KEYS.RUN_0]: '/assets/character/run_0.png',
  [CHARACTER_SPRITE_KEYS.RUN_1]: '/assets/character/run_1.png',
  [CHARACTER_SPRITE_KEYS.RUN_2]: '/assets/character/run_2.png',
  [CHARACTER_SPRITE_KEYS.RUN_3]: '/assets/character/run_3.png',
  [CHARACTER_SPRITE_KEYS.RUN_4]: '/assets/character/run_4.png',
  [CHARACTER_SPRITE_KEYS.RUN_5]: '/assets/character/run_5.png',
  [CHARACTER_SPRITE_KEYS.RUN_6]: '/assets/character/run_6.png',
  [CHARACTER_SPRITE_KEYS.RUN_7]: '/assets/character/run_7.png',
  [CHARACTER_SPRITE_KEYS.JUMP]: '/assets/character/jump.png',
  [CHARACTER_SPRITE_KEYS.SLIDE]: '/assets/character/slide.png',
  [CHARACTER_SPRITE_KEYS.IDLE_BACK]: '/assets/character/idle_back.png',
  [CHARACTER_SPRITE_KEYS.IDLE_FRONT_0]: '/assets/character/idle_front_0.png',
  [CHARACTER_SPRITE_KEYS.IDLE_FRONT_1]: '/assets/character/idle_front_1.png',
  [CHARACTER_SPRITE_KEYS.HURT]: '/assets/character/hurt.png',
  [CHARACTER_SPRITE_KEYS.VICTORY]: '/assets/character/victory.png',
  [CHARACTER_SPRITE_KEYS.DEATH]: '/assets/character/death.png',
  [CHARACTER_SPRITE_KEYS.PART_HEAD_BACK]: '/assets/character/part_head_back.png',
  [CHARACTER_SPRITE_KEYS.PART_HOOD_BACK]: '/assets/character/part_hood_back.png',
};

export const RUN_CYCLE_KEYS: CharacterSpriteKey[] = [
  CHARACTER_SPRITE_KEYS.RUN_0,
  CHARACTER_SPRITE_KEYS.RUN_1,
  CHARACTER_SPRITE_KEYS.RUN_2,
  CHARACTER_SPRITE_KEYS.RUN_3,
  CHARACTER_SPRITE_KEYS.RUN_4,
  CHARACTER_SPRITE_KEYS.RUN_5,
  CHARACTER_SPRITE_KEYS.RUN_6,
  CHARACTER_SPRITE_KEYS.RUN_7,
];

export function preloadCharacterAssets(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(CHARACTER_SPRITE_PATHS)) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, url);
    }
  }
}

/**
 * Recolors ONLY the cool electric-blue / cyan neon hoodie & trim pixels of a sprite
 * to match unlockable skin palettes while keeping skin tone, eyes, hair, and dark outlines
 * 100% faithful to the reference character.
 */
export function createSkinRecoloredCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  skinId: RunnerSkinId
): HTMLCanvasElement {
  const w = source instanceof HTMLImageElement ? source.naturalWidth || source.width : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight || source.height : source.height;
  const canvas = document.createElement('canvas');
  canvas.width = w || 256;
  canvas.height = h || 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (skinId === 'cyber_pulse') {
    return canvas;
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 16) continue;

    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    // Detect electric-blue & cyan outfit/neon pixels (never warm skin where r > b)
    const blueDominance = b - r;
    const isCoolNeon = blueDominance > 18 && b > 55;
    if (!isCoolNeon) continue;

    // Weight smoothly so anti-aliased seams blend seamlessly
    const weight = Math.min(1, (blueDominance - 18) / 48);
    const lum = (0.22 * r + 0.52 * g + 0.26 * b) / 255;
    const isBrightCyanGlow = g > 140 && b > 170;

    let tr = r;
    let tg = g;
    let tb = b;

    if (skinId === 'solar_flare') {
      // Molten amber-gold hoodie & bright solar yellow glow lines
      if (isBrightCyanGlow) {
        tr = Math.min(255, Math.round(235 + lum * 20));
        tg = Math.min(255, Math.round(180 + lum * 65));
        tb = Math.min(255, Math.round(45 + lum * 40));
      } else {
        tr = Math.min(255, Math.round(b * 0.98 + 20));
        tg = Math.min(255, Math.round(g * 0.62 + b * 0.14));
        tb = Math.min(255, Math.round(r * 0.45 + 14));
      }
    } else if (skinId === 'phantom_violet') {
      // Deep ultraviolet hoodie & vivid neon magenta-lavender trim
      if (isBrightCyanGlow) {
        tr = Math.min(255, Math.round(205 + lum * 50));
        tg = Math.min(255, Math.round(110 + lum * 65));
        tb = Math.min(255, Math.round(240 + lum * 15));
      } else {
        tr = Math.min(255, Math.round(r * 0.4 + b * 0.62));
        tg = Math.min(255, Math.round(g * 0.48));
        tb = Math.min(255, Math.round(b * 0.96 + 10));
      }
    } else if (skinId === 'emerald_surge') {
      // Hyper-emerald / cyber-mint hoodie & bright lime-cyan trim
      if (isBrightCyanGlow) {
        tr = Math.min(255, Math.round(70 + lum * 60));
        tg = Math.min(255, Math.round(235 + lum * 20));
        tb = Math.min(255, Math.round(175 + lum * 45));
      } else {
        tr = Math.min(255, Math.round(r * 0.45 + 6));
        tg = Math.min(255, Math.round(b * 0.88 + 18));
        tb = Math.min(255, Math.round(g * 0.72 + b * 0.18));
      }
    } else if (skinId === 'prism_nova') {
      // Titanium pearl-white hoodie with crisp electric cyan & gold accents
      if (isBrightCyanGlow) {
        tr = Math.min(255, Math.round(180 + lum * 75));
        tg = Math.min(255, Math.round(238 + lum * 17));
        tb = 255;
      } else {
        const silver = Math.min(248, Math.round(125 + lum * 135));
        tr = Math.min(255, silver);
        tg = Math.min(255, silver + 6);
        tb = Math.min(255, silver + 16);
      }
    }

    d[i] = Math.round(r + (tr - r) * weight);
    d[i + 1] = Math.round(g + (tg - g) * weight);
    d[i + 2] = Math.round(b + (tb - b) * weight);
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
