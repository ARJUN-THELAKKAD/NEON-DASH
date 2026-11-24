import {
  Coins,
  Compass,
  Crown,
  Flame,
  Gauge,
  Gem,
  Lock,
  Sparkles,
  Trophy,
  Wind,
  Zap,
} from 'lucide-react';
import type { AchievementSpec, BadgeIconName } from '../game/achievements';

interface BadgeMedallionProps {
  achievement: AchievementSpec;
  unlocked: boolean;
  size?: 'sm' | 'md' | 'lg';
  featured?: boolean;
}

function renderIcon(icon: BadgeIconName, className: string) {
  switch (icon) {
    case 'flame':
      return <Flame className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'gauge':
      return <Gauge className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'coins':
      return <Coins className={className} />;
    case 'gem':
      return <Gem className={className} />;
    case 'trophy':
      return <Trophy className={className} />;
    case 'wind':
      return <Wind className={className} />;
    case 'zap':
      return <Zap className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
  }
}

export function BadgeMedallion({
  achievement,
  unlocked,
  size = 'md',
  featured = false,
}: BadgeMedallionProps) {
  const dims =
    size === 'sm'
      ? 'w-8 h-8'
      : size === 'lg'
        ? 'w-14 h-14'
        : 'w-11 h-11';
  const iconDims =
    size === 'sm'
      ? 'w-4 h-4'
      : size === 'lg'
        ? 'w-6 h-6'
        : 'w-5 h-5';

  return (
    <div
      title={
        unlocked
          ? `${achievement.badgeName} — ${achievement.title}`
          : `Locked: ${achievement.description}`
      }
      className={`relative ${dims} rounded-xl flex items-center justify-center shrink-0 transition-transform ${
        featured ? 'ring-2 ring-amber-300/80 ring-offset-2 ring-offset-[#090c1e]' : ''
      }`}
      style={
        unlocked
          ? {
              background: `linear-gradient(145deg, ${achievement.accentHex}2a 0%, rgba(10, 14, 34, 0.94) 100%)`,
              border: `1.5px solid ${achievement.accentHex}`,
              boxShadow: `0 0 16px ${achievement.accentHex}44`,
              color: achievement.accentHex,
            }
          : {
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1.5px solid rgba(148, 163, 184, 0.22)',
              color: '#64748b',
            }
      }
    >
      {unlocked ? renderIcon(achievement.icon, iconDims) : <Lock className={iconDims} />}
    </div>
  );
}
