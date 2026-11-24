import { Pause, Volume2, VolumeX, Shield, Magnet, Sparkles, Zap } from 'lucide-react';
import type { HudSnapshot } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  banner: { id: number; label: string; accent: 'cyan' | 'pink' | 'purple' | 'gold' } | null;
  showSwipeHint: boolean;
  onPause: () => void;
  onToggleMute: () => void;
}

export function GameHud({
  hud,
  muted,
  banner,
  showSwipeHint,
  onPause,
  onToggleMute,
}: GameHudProps) {
  const { activePowerUps } = hud;

  const bannerColors = {
    cyan: 'text-[#00f0ff] border-cyan-400/45 bg-[#060714]/80',
    pink: 'text-[#ff70a6] border-pink-400/45 bg-[#060714]/80',
    purple: 'text-[#d8a7ff] border-purple-400/45 bg-[#060714]/80',
    gold: 'text-amber-300 border-amber-400/50 bg-[#060714]/80',
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Compact Top HUD Bar */}
      <div className="w-full max-w-6xl mx-auto flex items-start justify-between gap-4">
        {/* Left: Score & Distance */}
        <div className="bg-[#060714]/70 backdrop-blur-md border border-cyan-400/20 rounded-xl px-3.5 py-2 sm:px-4 sm:py-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono-num font-bold text-2xl sm:text-3xl leading-none text-white">
              {hud.score.toLocaleString()}
            </span>
            {hud.multiplier > 1 && (
              <span className="font-display font-bold text-sm sm:text-base text-[#c77dff]">
                2X
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-300 font-mono-num">
            <span>{hud.distance.toLocaleString()}m</span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="text-cyan-300">{hud.speedKmh} km/h</span>
            <span aria-hidden="true" className="hidden sm:inline text-slate-600">
              ·
            </span>
            <span className="hidden sm:inline text-slate-400">
              Best {hud.bestScore.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Right: Coins + Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="bg-[#060714]/70 backdrop-blur-md border border-amber-400/25 rounded-xl px-3 py-2 sm:px-3.5 min-h-[44px] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-300 shadow-[0_0_8px_#ffd166]" />
            <span className="font-mono-num font-bold text-sm sm:text-base text-amber-300">
              {hud.coins.toLocaleString()}
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="w-11 h-11 rounded-xl bg-[#060714]/75 backdrop-blur-md border border-cyan-400/25 text-slate-200 hover:border-cyan-300/65 hover:text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            {muted ? <VolumeX className="w-5 h-5 text-pink-400" /> : <Volume2 className="w-5 h-5 text-cyan-300" />}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause game"
            className="w-11 h-11 rounded-xl bg-[#060714]/75 backdrop-blur-md border border-cyan-400/25 text-slate-200 hover:border-cyan-300/65 hover:text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <Pause className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Transient Event Banner & Active Power-Ups */}
      <div className="w-full max-w-6xl mx-auto flex-1 relative mt-3">
        {/* Left-edge active power-up timers */}
        <div className="flex flex-col gap-2 max-w-[175px]">
          {activePowerUps.shield && (
            <div className="bg-[#060714]/75 backdrop-blur-md border border-cyan-400/40 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#00f0ff] shrink-0" />
              <span className="text-xs font-semibold text-cyan-200 whitespace-nowrap">
                Shield Ready
              </span>
            </div>
          )}

          {activePowerUps.boostRemaining > 0 && (
            <PowerUpTimerBar
              icon={<Zap className="w-4 h-4 text-[#38f9d7] shrink-0" />}
              label="Boost"
              remaining={activePowerUps.boostRemaining}
              duration={activePowerUps.boostDuration}
              barColor="bg-[#38f9d7]"
            />
          )}

          {activePowerUps.magnetRemaining > 0 && (
            <PowerUpTimerBar
              icon={<Magnet className="w-4 h-4 text-[#ff2a85] shrink-0" />}
              label="Magnet"
              remaining={activePowerUps.magnetRemaining}
              duration={activePowerUps.magnetDuration}
              barColor="bg-[#ff2a85]"
            />
          )}

          {activePowerUps.multiplierRemaining > 0 && (
            <PowerUpTimerBar
              icon={<Sparkles className="w-4 h-4 text-[#c77dff] shrink-0" />}
              label="2x Score"
              remaining={activePowerUps.multiplierRemaining}
              duration={activePowerUps.multiplierDuration}
              barColor="bg-[#c77dff]"
            />
          )}
        </div>

        {/* Center event banner */}
        {banner && (
          <div
            key={banner.id}
            className="absolute top-0 left-1/2 -translate-x-1/2 animate-screen-in"
          >
            <div
              className={`px-4 py-1.5 rounded-lg border backdrop-blur-md font-display font-bold text-sm sm:text-base tracking-wider whitespace-nowrap ${bannerColors[banner.accent]}`}
            >
              {banner.label}
            </div>
          </div>
        )}
      </div>

      {/* Brief non-blocking onboarding hint at start of run */}
      {showSwipeHint && (
        <div className="text-center pb-2">
          <span className="inline-block px-3.5 py-1.5 rounded-lg bg-[#060714]/70 border border-white/10 text-xs sm:text-sm text-slate-200">
            Swipe or use Arrow Keys to steer, jump, and slide
          </span>
        </div>
      )}
    </div>
  );
}

function PowerUpTimerBar({
  icon,
  label,
  remaining,
  duration,
  barColor,
}: {
  icon: React.ReactNode;
  label: string;
  remaining: number;
  duration: number;
  barColor: string;
}) {
  const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));
  return (
    <div className="bg-[#060714]/75 backdrop-blur-md border border-white/15 rounded-lg px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-100 font-medium">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-mono-num text-slate-300">{remaining.toFixed(1)}s</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-75 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
