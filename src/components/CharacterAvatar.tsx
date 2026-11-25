import { useEffect, useState } from 'react';
import {
  CHARACTER_SPRITE_KEYS,
  CHARACTER_SPRITE_PATHS,
  createSkinRecoloredCanvas,
} from '../game/characterAssets';
import { getSkinSpec, type RunnerSkinId } from '../game/cosmetics';

export type CharacterAvatarPose = 'idle_front' | 'victory' | 'death' | 'hurt' | 'jump' | 'slide';

interface CharacterAvatarProps {
  pose?: CharacterAvatarPose;
  skinId?: RunnerSkinId;
  animated?: boolean;
  className?: string;
  alt?: string;
}

// Module-level cache of recolored data URLs so switching skins or opening modals is instant
const recolorCache = new Map<string, string>();

function getPosePath(pose: CharacterAvatarPose, frameIdx: number): string {
  switch (pose) {
    case 'idle_front':
      return frameIdx % 2 === 0
        ? CHARACTER_SPRITE_PATHS[CHARACTER_SPRITE_KEYS.IDLE_FRONT_0]
        : CHARACTER_SPRITE_PATHS[CHARACTER_SPRITE_KEYS.IDLE_FRONT_1];
    case 'victory':
      return CHARACTER_SPRITE_PATHS[CHARACTER_SPRITE_KEYS.VICTORY];
    case 'death':
      return CHARACTER_SPRITE_PATHS[CHARACTER_SPRITE_KEYS.DEATH];
    case 'hurt':
      return CHARACTER_SPRITE_PATHS[CHARACTER_SPRITE_KEYS.HURT];
    case 'jump':
      return CHARACTER_SPRITE_PATHS[CHARACTER_SPRITE_KEYS.JUMP];
    case 'slide':
      return CHARACTER_SPRITE_PATHS[CHARACTER_SPRITE_KEYS.SLIDE];
  }
}

export function CharacterAvatar({
  pose = 'idle_front',
  skinId = 'cyber_pulse',
  animated = false,
  className = 'w-24 h-24',
  alt = 'Neon Dash runner character',
}: CharacterAvatarProps) {
  const [frameIdx, setFrameIdx] = useState(0);
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => getPosePath(pose, 0));
  const [loadFailed, setLoadFailed] = useState(false);

  // Subtle 2-frame front idle breathing loop when animated
  useEffect(() => {
    if (!animated || pose !== 'idle_front') {
      setFrameIdx(0);
      return;
    }
    const interval = window.setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % 2);
    }, 850);
    return () => window.clearInterval(interval);
  }, [animated, pose]);

  useEffect(() => {
    let active = true;
    const basePath = getPosePath(pose, frameIdx);
    setLoadFailed(false);

    if (skinId === 'cyber_pulse') {
      setResolvedSrc(basePath);
      return;
    }

    const cacheKey = `${basePath}|${skinId}`;
    const cached = recolorCache.get(cacheKey);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      try {
        const recolored = createSkinRecoloredCanvas(img, skinId);
        const url = recolored.toDataURL('image/png');
        recolorCache.set(cacheKey, url);
        setResolvedSrc(url);
      } catch {
        setResolvedSrc(basePath);
      }
    };
    img.onerror = () => {
      if (active) setResolvedSrc(basePath);
    };
    img.src = basePath;

    return () => {
      active = false;
    };
  }, [pose, frameIdx, skinId]);

  const skin = getSkinSpec(skinId);

  if (loadFailed) {
    return (
      <div
        className={`${className} rounded-xl flex items-center justify-center border border-cyan-400/30 bg-[#0b102c]`}
        style={{ boxShadow: `0 0 18px ${skin.auraRgba}` }}
        aria-label={alt}
      >
        <span className="font-display font-bold text-xs text-cyan-300">ND</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setLoadFailed(true)}
      className={`${className} object-contain select-none pointer-events-none transition-transform duration-300 ${
        animated && pose === 'victory' ? 'animate-bounce' : ''
      }`}
      style={{
        filter: `drop-shadow(0 6px 14px ${skin.auraRgba})`,
      }}
    />
  );
}
