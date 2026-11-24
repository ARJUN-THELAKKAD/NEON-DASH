export type AchievementId =
  | 'first_run'
  | 'dist_500'
  | 'dist_2500'
  | 'dist_10000'
  | 'coins_50'
  | 'coins_250'
  | 'coins_1000'
  | 'nearmiss_10'
  | 'smash_5'
  | 'cosmetics_2';

export type AchievementCategory = 'DISTANCE' | 'COINS' | 'SKILL';

export type BadgeIconName =
  | 'flame'
  | 'compass'
  | 'gauge'
  | 'crown'
  | 'coins'
  | 'gem'
  | 'trophy'
  | 'wind'
  | 'zap'
  | 'sparkles';

export interface CareerProfileStats {
  bestScore: number;
  bestDistance: number;
  totalDistance: number;
  lifetimeCoins: number;
  walletCoins: number;
  totalRuns: number;
  totalNearMisses: number;
  totalObstaclesSmashed: number;
  topSpeedKmh: number;
  unlockedCosmeticsCount: number;
}

export interface AchievementSpec {
  id: AchievementId;
  title: string;
  badgeName: string;
  description: string;
  category: AchievementCategory;
  target: number;
  unit: string;
  accentHex: string;
  icon: BadgeIconName;
  getCurrent: (stats: CareerProfileStats) => number;
}

export const ACHIEVEMENTS: AchievementSpec[] = [
  {
    id: 'first_run',
    title: 'First Sprint',
    badgeName: 'Ignition',
    description: 'Complete your first run on the neon highway.',
    category: 'SKILL',
    target: 1,
    unit: 'run',
    accentHex: '#00f0ff',
    icon: 'flame',
    getCurrent: (s) => s.totalRuns,
  },
  {
    id: 'dist_500',
    title: 'Street Sprinter',
    badgeName: 'Grid Walker',
    description: 'Reach 500 meters in total distance run.',
    category: 'DISTANCE',
    target: 500,
    unit: 'm',
    accentHex: '#38f9d7',
    icon: 'compass',
    getCurrent: (s) => s.totalDistance,
  },
  {
    id: 'dist_2500',
    title: 'Highway Phantom',
    badgeName: 'Velocity',
    description: 'Reach 2,500 meters in total distance run.',
    category: 'DISTANCE',
    target: 2500,
    unit: 'm',
    accentHex: '#00f0ff',
    icon: 'gauge',
    getCurrent: (s) => s.totalDistance,
  },
  {
    id: 'dist_10000',
    title: 'Neon Marathon',
    badgeName: 'Hyperion',
    description: 'Reach 10,000 meters in total distance run.',
    category: 'DISTANCE',
    target: 10000,
    unit: 'm',
    accentHex: '#c77dff',
    icon: 'crown',
    getCurrent: (s) => s.totalDistance,
  },
  {
    id: 'coins_50',
    title: 'Coin Hunter',
    badgeName: 'Spark Seeker',
    description: 'Collect 50 total coins across your runs.',
    category: 'COINS',
    target: 50,
    unit: 'coins',
    accentHex: '#ffd166',
    icon: 'coins',
    getCurrent: (s) => s.lifetimeCoins,
  },
  {
    id: 'coins_250',
    title: 'Vault Runner',
    badgeName: 'Credit Rush',
    description: 'Collect 250 total coins across your runs.',
    category: 'COINS',
    target: 250,
    unit: 'coins',
    accentHex: '#ff9e00',
    icon: 'gem',
    getCurrent: (s) => s.lifetimeCoins,
  },
  {
    id: 'coins_1000',
    title: 'Neon Tycoon',
    badgeName: 'Gold Circuit',
    description: 'Collect 1,000 total coins across your runs.',
    category: 'COINS',
    target: 1000,
    unit: 'coins',
    accentHex: '#ff2a85',
    icon: 'trophy',
    getCurrent: (s) => s.lifetimeCoins,
  },
  {
    id: 'nearmiss_10',
    title: 'Edge Dancer',
    badgeName: 'Razor Reflex',
    description: 'Trigger 10 total near-miss dodges.',
    category: 'SKILL',
    target: 10,
    unit: 'dodges',
    accentHex: '#ff2a85',
    icon: 'wind',
    getCurrent: (s) => s.totalNearMisses,
  },
  {
    id: 'smash_5',
    title: 'Overdrive Breaker',
    badgeName: 'Shockwave',
    description: 'Smash 5 obstacles while using Hyper Boost.',
    category: 'SKILL',
    target: 5,
    unit: 'smashes',
    accentHex: '#38f9d7',
    icon: 'zap',
    getCurrent: (s) => s.totalObstaclesSmashed,
  },
  {
    id: 'cosmetics_2',
    title: 'Style Collector',
    badgeName: 'Neon Icon',
    description: 'Unlock 2 additional avatars or trails in the Skin Store.',
    category: 'COINS',
    target: 2,
    unit: 'styles',
    accentHex: '#c77dff',
    icon: 'sparkles',
    getCurrent: (s) => s.unlockedCosmeticsCount,
  },
];

export function getAchievementSpec(id: AchievementId): AchievementSpec | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function getPlayerRankTitle(unlockedCount: number): string {
  if (unlockedCount >= 9) return 'Cyber Legend';
  if (unlockedCount >= 6) return 'Neon Striker';
  if (unlockedCount >= 3) return 'Circuit Dasher';
  if (unlockedCount >= 1) return 'Grid Runner';
  return 'Rookie Runner';
}
