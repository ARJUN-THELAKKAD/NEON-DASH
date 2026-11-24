import { ArrowLeft, Play, Shield, Magnet, Zap, Sparkles } from 'lucide-react';

interface InstructionsModalProps {
  onBack: () => void;
  onPlay: () => void;
}

export function InstructionsModal({ onBack, onPlay }: InstructionsModalProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[#060714]/78 backdrop-blur-sm overflow-y-auto">
      <div className="neon-panel w-full max-w-2xl rounded-2xl p-6 sm:p-8 animate-screen-in my-auto">
        <div className="flex items-center justify-between gap-4 border-b border-cyan-400/15 pb-4">
          <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-wide text-white">
            How to Play
          </h2>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-cyan-400/50 transition-colors flex items-center gap-1.5 text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Controls */}
          <div>
            <h3 className="text-sm font-semibold text-cyan-300 tracking-wide mb-3">
              Controls
            </h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5">
                <dt className="text-slate-300">Switch Lanes</dt>
                <dd className="font-mono-num text-white text-right">← / →, A / D, Swipe</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5">
                <dt className="text-slate-300">Jump</dt>
                <dd className="font-mono-num text-white text-right">↑, W, Space, Swipe Up</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5">
                <dt className="text-slate-300">Slide / Fast-Fall</dt>
                <dd className="font-mono-num text-white text-right">↓, S, Swipe Down</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-1.5">
                <dt className="text-slate-300">Pause / Mute</dt>
                <dd className="font-mono-num text-white text-right">P or Esc / M</dd>
              </div>
            </dl>
          </div>

          {/* Obstacles */}
          <div>
            <h3 className="text-sm font-semibold text-pink-400 tracking-wide mb-3">
              Obstacles
            </h3>
            <ul className="space-y-2.5 text-sm text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-sm bg-[#00f0ff] shrink-0" />
                <span>
                  <strong className="text-white font-semibold">Cyan Hurdle:</strong> Jump over or switch lanes.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-sm bg-[#ff2a85] shrink-0" />
                <span>
                  <strong className="text-white font-semibold">Pink Laser Gate:</strong> Slide underneath the beam.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-sm bg-[#9d4edd] shrink-0" />
                <span>
                  <strong className="text-white font-semibold">Cyber Monolith:</strong> Full-height blocker — switch lanes.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-sm bg-amber-400 shrink-0" />
                <span>
                  <strong className="text-white font-semibold">Patrol Drone:</strong> Sweeps across lanes at higher speeds.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Power-Ups */}
        <div className="mt-6 pt-5 border-t border-cyan-400/15">
          <h3 className="text-sm font-semibold text-purple-300 tracking-wide mb-3">
            Power-Ups
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs sm:text-sm">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-cyan-400/20">
              <Shield className="w-4 h-4 text-[#00f0ff] mb-1.5" />
              <div className="font-semibold text-white">Shield</div>
              <p className="text-slate-400 text-xs mt-0.5">Absorbs one collision.</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-pink-400/20">
              <Magnet className="w-4 h-4 text-[#ff2a85] mb-1.5" />
              <div className="font-semibold text-white">Magnet</div>
              <p className="text-slate-400 text-xs mt-0.5">Pulls coins across lanes.</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-purple-400/20">
              <Sparkles className="w-4 h-4 text-[#c77dff] mb-1.5" />
              <div className="font-semibold text-white">2x Score</div>
              <p className="text-slate-400 text-xs mt-0.5">Doubles points earned.</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.03] border border-teal-300/20">
              <Zap className="w-4 h-4 text-[#38f9d7] mb-1.5" />
              <div className="font-semibold text-white">Hyper Boost</div>
              <p className="text-slate-400 text-xs mt-0.5">Smash through obstacles.</p>
            </div>
          </div>
        </div>

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[46px] px-5 py-2.5 rounded-xl border border-slate-700 text-slate-200 hover:bg-white/5 transition-colors text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            Main Menu
          </button>
          <button
            type="button"
            onClick={onPlay}
            className="neon-btn-primary min-h-[46px] px-7 py-2.5 rounded-xl font-display font-bold text-base tracking-wider text-white flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Run</span>
          </button>
        </div>
      </div>
    </div>
  );
}
