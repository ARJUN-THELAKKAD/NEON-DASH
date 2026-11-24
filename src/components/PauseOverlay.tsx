import { Home, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { HudSnapshot } from '../game/types';

interface PauseOverlayProps {
  hud: HudSnapshot;
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onHome: () => void;
  onToggleMute: () => void;
}

export function PauseOverlay({
  hud,
  muted,
  onResume,
  onRestart,
  onHome,
  onToggleMute,
}: PauseOverlayProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#060714]/72 backdrop-blur-sm">
      <div className="neon-panel w-full max-w-sm rounded-2xl p-6 sm:p-7 text-center animate-screen-in">
        <h2 className="font-display font-bold text-3xl tracking-wide text-white">
          Paused
        </h2>

        <div className="mt-4 flex items-center justify-center gap-4 text-sm text-slate-300 font-mono-num">
          <span>Score {hud.score.toLocaleString()}</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span>{hud.distance.toLocaleString()}m</span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-amber-300">{hud.coins} Coins</span>
        </div>

        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={onResume}
            className="neon-btn-primary w-full min-h-[48px] px-6 py-3 rounded-xl font-display font-bold text-base tracking-wider text-white flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Resume</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-white/[0.04] border border-cyan-400/25 hover:border-cyan-300/60 hover:bg-white/[0.08] text-slate-100 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-cyan-300" />
            <span>Restart Run</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-white/[0.04] border border-slate-700 hover:border-slate-500 text-slate-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-pink-400" /> : <Volume2 className="w-4 h-4 text-cyan-300" />}
            <span>{muted ? 'Unmute Sound' : 'Mute Sound'}</span>
          </button>

          <button
            type="button"
            onClick={onHome}
            className="w-full min-h-[46px] px-5 py-2.5 rounded-xl border border-transparent hover:border-slate-700 text-slate-400 hover:text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Main Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
}
