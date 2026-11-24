import { Award, BookOpen, Play, ShoppingBag, Volume2, VolumeX } from 'lucide-react';
import {
  getAchievementSpec,
  getPlayerRankTitle,
  type AchievementId,
} from '../game/achievements';
import { BadgeMedallion } from './BadgeMedallion';

interface MainMenuProps {
  playerName: string;
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  unlockedAchievements: AchievementId[];
  featuredBadge: AchievementId | null;
  muted: boolean;
  onPlay: () => void;
  onOpenStore: () => void;
  onOpenAchievements: () => void;
  onInstructions: () => void;
  onToggleMute: () => void;
}

export function MainMenu({
  playerName,
  bestScore,
  bestDistance,
  totalCoins,
  unlockedAchievements,
  featuredBadge,
  muted,
  onPlay,
  onOpenStore,
  onOpenAchievements,
  onInstructions,
  onToggleMute,
}: MainMenuProps) {
  const rankTitle = getPlayerRankTitle(unlockedAchievements.length);
  // Order badges so featured badge appears first on the profile bar
  const orderedBadges = [...unlockedAchievements]
    .sort((a, b) => (a === featuredBadge ? -1 : b === featuredBadge ? 1 : 0))
    .slice(0, 3)
    .map((id) => getAchievementSpec(id))
    .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec));

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-between px-4 sm:px-6 py-6 sm:py-10 pointer-events-none bg-gradient-to-b from-[#060714]/78 via-[#060714]/25 to-[#060714]/82">
      {/* Top Profile & Utility Row */}
      <div className="w-full max-w-5xl flex items-center justify-between gap-4 pointer-events-auto">
        <button
          type="button"
          onClick={onOpenAchievements}
          className="flex items-center gap-3 min-h-[48px] px-3.5 py-2 rounded-xl bg-[#0a0d24]/80 border border-cyan-400/25 hover:border-cyan-400/65 transition-colors text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm sm:text-base text-white truncate max-w-[140px] sm:max-w-[190px]">
                {playerName}
              </span>
              <span className="hidden sm:inline text-xs text-cyan-300 font-medium">
                {rankTitle}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-300 font-mono-num">
              <span>Best {bestScore.toLocaleString()}</span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="hidden md:inline">{bestDistance.toLocaleString()}m</span>
              <span aria-hidden="true" className="hidden md:inline text-slate-600">
                ·
              </span>
              <span className="text-amber-300 font-bold">{totalCoins.toLocaleString()} Coins</span>
            </div>
          </div>

          {orderedBadges.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-white/10">
              {orderedBadges.map((badge) => (
                <BadgeMedallion
                  key={badge.id}
                  achievement={badge}
                  unlocked
                  size="sm"
                  featured={badge.id === featuredBadge}
                />
              ))}
              {unlockedAchievements.length > 3 && (
                <span className="text-xs font-mono-num text-slate-300 pl-0.5">
                  +{unlockedAchievements.length - 3}
                </span>
              )}
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg bg-[#0a0d24]/80 border border-cyan-400/25 text-slate-200 hover:border-cyan-400/60 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          {muted ? (
            <VolumeX className="w-4 h-4 text-pink-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-cyan-300" />
          )}
          <span className="hidden sm:inline text-sm font-medium">
            {muted ? 'Muted' : 'Sound On'}
          </span>
        </button>
      </div>

      {/* Center focal title and actions */}
      <div className="flex flex-col items-center text-center max-w-xl animate-screen-in pointer-events-auto">
        <h1 className="font-display italic font-bold tracking-tight text-6xl sm:text-8xl leading-none bg-gradient-to-r from-[#00f0ff] via-[#c77dff] to-[#ff2a85] bg-clip-text text-transparent neon-title-glow">
          NEON DASH
        </h1>
        <p className="mt-4 text-slate-200/90 text-base sm:text-lg max-w-md leading-relaxed">
          Sprint across an electric three-lane highway. Dodge barriers, leap over hazards, and collect power-ups as speed climbs.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={onPlay}
            className="neon-btn-primary w-full sm:w-auto min-w-[240px] min-h-[54px] px-8 py-3.5 rounded-xl font-display font-bold text-lg tracking-wider text-white flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Play</span>
          </button>

          <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onOpenStore}
              className="flex-1 sm:flex-none min-h-[48px] px-5 py-3 rounded-xl bg-[#0b0f29]/85 border border-cyan-400/35 text-slate-100 hover:border-cyan-300/75 hover:bg-[#131940]/90 font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <ShoppingBag className="w-4 h-4 text-amber-300" />
              <span>Skin Store</span>
            </button>

            <button
              type="button"
              onClick={onOpenAchievements}
              className="flex-1 sm:flex-none min-h-[48px] px-5 py-3 rounded-xl bg-[#0b0f29]/85 border border-pink-400/35 text-slate-100 hover:border-pink-300/75 hover:bg-[#131940]/90 font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <Award className="w-4 h-4 text-pink-400" />
              <span>Badges &amp; Ranks</span>
            </button>

            <button
              type="button"
              onClick={onInstructions}
              className="w-full sm:w-auto min-h-[48px] px-5 py-3 rounded-xl bg-[#0b0f29]/85 border border-purple-400/35 text-slate-100 hover:border-cyan-300/65 hover:bg-[#131940]/90 font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <BookOpen className="w-4 h-4 text-cyan-300" />
              <span>How to Play</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subtle control footer hint */}
      <div className="text-xs sm:text-sm text-slate-400 text-center pointer-events-none">
        <span>Arrow Keys or WASD on Desktop</span>
        <span aria-hidden="true" className="mx-2 text-slate-600">
          ·
        </span>
        <span>Swipe Anywhere on Mobile</span>
      </div>
    </div>
  );
}
