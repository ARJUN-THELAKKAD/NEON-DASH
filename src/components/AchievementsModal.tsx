import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Check,
  Crown,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Play,
  Star,
  Upload,
} from 'lucide-react';
import {
  ACHIEVEMENTS,
  getAchievementSpec,
  getPlayerRankTitle,
  type AchievementCategory,
  type AchievementId,
  type CareerProfileStats,
} from '../game/achievements';
import { getSkinSpec, type RunnerSkinId } from '../game/cosmetics';
import {
  LeaderboardService,
  type AuthUserSummary,
  type LeaderboardRunner,
} from '../game/LeaderboardService';
import { BadgeMedallion } from './BadgeMedallion';

export type AchievementsModalTab = 'PROFILE' | 'LEADERBOARD';

interface AchievementsModalProps {
  initialTab?: AchievementsModalTab;
  playerName: string;
  equippedSkin: RunnerSkinId;
  stats: CareerProfileStats;
  unlockedAchievements: AchievementId[];
  featuredBadge: AchievementId | null;
  onRenamePlayer: (name: string) => void;
  onSelectFeaturedBadge: (id: AchievementId) => void;
  onBack: () => void;
  onPlay: () => void;
}

function RunnerMiniAvatar({ skinId }: { skinId: RunnerSkinId }) {
  const skin = getSkinSpec(skinId);
  return (
    <div
      className="w-10 h-10 rounded-lg bg-[#07091a] border flex items-center justify-center shrink-0"
      style={{
        borderColor: skin.trimHex,
        boxShadow: `0 0 12px ${skin.auraRgba}`,
      }}
    >
      <svg viewBox="0 0 80 80" className="w-7 h-7" aria-hidden="true">
        <circle
          cx="40"
          cy="20"
          r="11"
          fill={skin.suitTop}
          stroke={skin.trimHex}
          strokeWidth="3"
        />
        <polygon
          points="25,35 55,35 50,64 30,64"
          fill={skin.suitTop}
          stroke={skin.trimHex}
          strokeWidth="2.8"
        />
        <polygon points="40,40 46,49 40,59 34,49" fill={skin.coreHex} />
        <circle cx="40" cy="49" r="2.2" fill="#ffffff" />
      </svg>
    </div>
  );
}

export function AchievementsModal({
  initialTab = 'PROFILE',
  playerName,
  equippedSkin,
  stats,
  unlockedAchievements,
  featuredBadge,
  onRenamePlayer,
  onSelectFeaturedBadge,
  onBack,
  onPlay,
}: AchievementsModalProps) {
  const [activeTab, setActiveTab] = useState<AchievementsModalTab>(initialTab);
  const [filter, setFilter] = useState<'ALL' | AchievementCategory>('ALL');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(playerName);

  // Global Leaderboard & Auth state
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [topRunners, setTopRunners] = useState<LeaderboardRunner[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [myEntry, setMyEntry] = useState<LeaderboardRunner | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    tone: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Subscribe to Firebase Google Auth state
  useEffect(() => {
    const unsubscribe = LeaderboardService.subscribeAuthState((user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to live Top 10 global runners when modal is open
  useEffect(() => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    const unsubscribe = LeaderboardService.subscribeTopRunners(
      (runners) => {
        setTopRunners(runners);
        setLeaderboardLoading(false);
      },
      (errMessage) => {
        setLeaderboardError(errMessage);
        setLeaderboardLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Load current user's personal leaderboard entry when signed in
  useEffect(() => {
    let active = true;
    if (!authUser) {
      setMyEntry(null);
      return;
    }

    LeaderboardService.getMyEntry(authUser.uid)
      .then((entry) => {
        if (active) setMyEntry(entry);
      })
      .catch(() => {
        // Non-blocking: live Top 10 still works even if personal check fails
      });

    return () => {
      active = false;
    };
  }, [authUser, topRunners]);

  const skin = getSkinSpec(equippedSkin);
  const rankTitle = getPlayerRankTitle(unlockedAchievements.length);
  const featuredSpec = featuredBadge ? getAchievementSpec(featuredBadge) : undefined;

  const filteredAchievements =
    filter === 'ALL'
      ? ACHIEVEMENTS
      : ACHIEVEMENTS.filter((a) => a.category === filter);

  const handleSaveName = () => {
    onRenamePlayer(draftName);
    setEditingName(false);
  };

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setStatusNotice(null);
    try {
      await LeaderboardService.signInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Sign-in window closed before completing.'
          : 'Could not sign in with Google. Please allow popups and try again.';
      setStatusNotice({ tone: 'error', text: msg });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setStatusNotice(null);
    try {
      await LeaderboardService.signOut();
      setMyEntry(null);
    } catch {
      setStatusNotice({ tone: 'error', text: 'Could not sign out right now.' });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSubmitScore = async () => {
    if (!authUser) {
      await handleGoogleSignIn();
      return;
    }
    if (stats.bestScore < 1) {
      setStatusNotice({
        tone: 'info',
        text: 'Complete at least one run to earn a score before submitting.',
      });
      return;
    }

    setSubmitting(true);
    setStatusNotice(null);
    try {
      const result = await LeaderboardService.submitTopScore({
        playerName,
        score: stats.bestScore,
        distance: stats.bestDistance,
        equippedSkin,
        featuredBadge,
        badgeCount: unlockedAchievements.length,
      });

      const refreshed = await LeaderboardService.getMyEntry(authUser.uid).catch(() => null);
      if (refreshed) setMyEntry(refreshed);

      if (result.status === 'submitted') {
        setStatusNotice({
          tone: 'success',
          text: `Score of ${result.submittedScore.toLocaleString()} submitted to the Global Leaderboard!`,
        });
      } else if (result.status === 'updated') {
        setStatusNotice({
          tone: 'success',
          text: `New personal best (${result.submittedScore.toLocaleString()}) updated worldwide!`,
        });
      } else if (result.status === 'synced_profile') {
        setStatusNotice({
          tone: 'info',
          text: `Profile synced! Your global best remains ${result.submittedScore.toLocaleString()}.`,
        });
      } else {
        setStatusNotice({
          tone: 'info',
          text: `Your best score (${result.submittedScore.toLocaleString()}) is already up to date.`,
        });
      }
    } catch (err) {
      let readable = 'Unable to submit score right now. Please try again.';
      if (err instanceof Error && err.message && !err.message.startsWith('{')) {
        readable = err.message;
      }
      setStatusNotice({ tone: 'error', text: readable });
    } finally {
      setSubmitting(false);
    }
  };

  const myTop10Rank = authUser
    ? topRunners.findIndex((r) => r.uid === authUser.uid) + 1
    : 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[#060714]/78 backdrop-blur-sm overflow-y-auto">
      <div className="neon-panel w-full max-w-4xl rounded-2xl p-5 sm:p-7 animate-screen-in my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cyan-400/15 pb-4 shrink-0">
          <div>
            <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-wide text-white">
              {activeTab === 'PROFILE' ? 'Profile & Achievements' : 'Global Leaderboard'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {activeTab === 'PROFILE'
                ? 'Track lifetime milestones and display unlocked badges on your runner profile.'
                : 'Submit your highest score and compete against the Top 10 runners worldwide.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-cyan-400/50 transition-colors flex items-center gap-1.5 text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>

        {/* Primary View Switcher */}
        <div className="mt-4 flex items-center justify-between flex-wrap gap-3 shrink-0">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('PROFILE')}
              className={`min-h-[42px] px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'PROFILE'
                  ? 'bg-cyan-400/18 text-white border border-cyan-400/45'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Award className="w-4 h-4 text-pink-400" />
              <span>Profile &amp; Milestones</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('LEADERBOARD')}
              className={`min-h-[42px] px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'LEADERBOARD'
                  ? 'bg-cyan-400/18 text-white border border-cyan-400/45'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Globe className="w-4 h-4 text-[#00f0ff]" />
              <span>Global Top 10</span>
            </button>
          </div>

          {activeTab === 'LEADERBOARD' && myTop10Rank > 0 && (
            <div className="text-xs sm:text-sm font-mono-num font-semibold text-amber-300">
              Your Worldwide Rank: #{myTop10Rank}
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="mt-5 overflow-y-auto pr-1 flex-1 space-y-5">
          {activeTab === 'PROFILE' ? (
            <>
              {/* Player Profile Card */}
              <section className="rounded-xl p-4 sm:p-5 bg-white/[0.03] border border-cyan-400/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                  {/* Identity + Equipped Avatar */}
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-xl bg-[#07091a] border flex items-center justify-center shrink-0"
                      style={{
                        borderColor: skin.trimHex,
                        boxShadow: `0 0 18px ${skin.auraRgba}`,
                      }}
                    >
                      <svg viewBox="0 0 80 80" className="w-12 h-12" aria-hidden="true">
                        <circle
                          cx="40"
                          cy="20"
                          r="11"
                          fill={skin.suitTop}
                          stroke={skin.trimHex}
                          strokeWidth="2.5"
                        />
                        <polygon
                          points="25,35 55,35 50,64 30,64"
                          fill={skin.suitTop}
                          stroke={skin.trimHex}
                          strokeWidth="2.4"
                        />
                        <polygon points="40,40 46,49 40,59 34,49" fill={skin.coreHex} />
                        <circle cx="40" cy="49" r="2" fill="#ffffff" />
                      </svg>
                    </div>

                    <div>
                      {editingName ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={draftName}
                            maxLength={18}
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName();
                              if (e.key === 'Escape') {
                                setDraftName(playerName);
                                setEditingName(false);
                              }
                            }}
                            aria-label="Runner name"
                            autoFocus
                            className="w-40 sm:w-48 px-2.5 py-1.5 rounded-lg bg-[#060714] border border-cyan-400/60 text-white text-sm font-medium focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleSaveName}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-cyan-400/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-400/30 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="font-display font-bold text-xl text-white">
                            {playerName}
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              setDraftName(playerName);
                              setEditingName(true);
                            }}
                            aria-label="Edit runner name"
                            className="p-1.5 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                        <span className="text-cyan-300 font-semibold">{rankTitle}</span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="font-mono-num">
                          {unlockedAchievements.length}/{ACHIEVEMENTS.length} Badges
                        </span>
                        {featuredSpec && (
                          <>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span style={{ color: featuredSpec.accentHex }}>
                              Featured: {featuredSpec.badgeName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Unlocked Profile Badge Showcase */}
                  <div className="flex flex-col md:items-end gap-1.5">
                    <span className="text-xs text-slate-400">
                      Profile Badges {unlockedAchievements.length > 0 ? '(Click to feature)' : ''}
                    </span>
                    {unlockedAchievements.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Complete milestones below to earn badges for your profile.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {unlockedAchievements.map((id) => {
                          const spec = getAchievementSpec(id);
                          if (!spec) return null;
                          const isFeatured = featuredBadge === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => onSelectFeaturedBadge(id)}
                              aria-label={`Feature ${spec.badgeName} badge on profile`}
                              className="cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-cyan-300"
                            >
                              <BadgeMedallion
                                achievement={spec}
                                unlocked
                                size="sm"
                                featured={isFeatured}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lifetime Career Stats Row */}
                <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-slate-400">Total Distance Run</div>
                    <div className="mt-0.5 font-mono-num font-bold text-lg sm:text-xl text-[#00f0ff]">
                      {stats.totalDistance.toLocaleString()}m
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Total Coins Collected</div>
                    <div className="mt-0.5 font-mono-num font-bold text-lg sm:text-xl text-amber-300">
                      {stats.lifetimeCoins.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Runs Completed</div>
                    <div className="mt-0.5 font-mono-num font-bold text-lg sm:text-xl text-white">
                      {stats.totalRuns.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Near Misses / Top Speed</div>
                    <div className="mt-0.5 font-mono-num font-bold text-lg sm:text-xl text-pink-300">
                      {stats.totalNearMisses} · {stats.topSpeedKmh || 85} km/h
                    </div>
                  </div>
                </div>
              </section>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                  {(
                    [
                      { id: 'ALL', label: 'All' },
                      { id: 'DISTANCE', label: 'Distance' },
                      { id: 'COINS', label: 'Coins' },
                      { id: 'SKILL', label: 'Skill' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFilter(item.id)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        filter === item.id
                          ? 'bg-cyan-400/18 text-white border border-cyan-400/40'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <span className="text-xs text-slate-400 font-mono-num">
                  {unlockedAchievements.length} of {ACHIEVEMENTS.length} milestones complete
                </span>
              </div>

              {/* Achievements Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredAchievements.map((ach) => {
                  const current = ach.getCurrent(stats);
                  const clamped = Math.min(current, ach.target);
                  const pct = Math.min(100, Math.round((clamped / ach.target) * 100));
                  const isUnlocked = unlockedAchievements.includes(ach.id);
                  const isFeatured = featuredBadge === ach.id;

                  return (
                    <div
                      key={ach.id}
                      className={`rounded-xl p-4 border transition-colors flex flex-col justify-between ${
                        isUnlocked
                          ? 'bg-white/[0.045] border-cyan-400/35'
                          : 'bg-white/[0.02] border-white/10'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <BadgeMedallion
                          achievement={ach}
                          unlocked={isUnlocked}
                          size="md"
                          featured={isFeatured}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-display font-bold text-base text-white truncate">
                              {ach.title}
                            </h4>
                            <span
                              className="text-xs font-semibold whitespace-nowrap shrink-0"
                              style={{ color: isUnlocked ? ach.accentHex : '#64748b' }}
                            >
                              {ach.badgeName}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                            {ach.description}
                          </p>
                        </div>
                      </div>

                      {/* Progress & Feature Toggle */}
                      <div className="mt-3.5">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-mono-num text-slate-300">
                            {clamped.toLocaleString()} / {ach.target.toLocaleString()} {ach.unit}
                          </span>

                          {isUnlocked ? (
                            <button
                              type="button"
                              onClick={() => onSelectFeaturedBadge(ach.id)}
                              disabled={isFeatured}
                              className={`inline-flex items-center gap-1 text-xs font-semibold transition-colors ${
                                isFeatured
                                  ? 'text-amber-300 cursor-default'
                                  : 'text-cyan-300 hover:text-white cursor-pointer'
                              }`}
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${isFeatured ? 'fill-current' : ''}`}
                              />
                              <span>{isFeatured ? 'Featured Badge' : 'Feature on Profile'}</span>
                            </button>
                          ) : (
                            <span className="font-mono-num text-slate-500">{pct}%</span>
                          )}
                        </div>

                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width] duration-300"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: isUnlocked ? ach.accentHex : '#475569',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Global Leaderboard Tab */
            <>
              {/* Score Submission & Account Bar */}
              <section className="rounded-xl p-4 sm:p-5 bg-white/[0.03] border border-cyan-400/25">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <RunnerMiniAvatar skinId={equippedSkin} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-bold text-lg text-white">
                          {playerName}
                        </span>
                        {authUser && (
                          <span className="text-xs text-cyan-300 font-medium">
                            Google Connected
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-300 font-mono-num">
                        <span>
                          Local Best:{' '}
                          <strong className="text-[#00f0ff]">
                            {stats.bestScore.toLocaleString()}
                          </strong>
                        </span>
                        {myEntry && (
                          <>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span>
                              Global Best:{' '}
                              <strong className="text-amber-300">
                                {myEntry.score.toLocaleString()}
                              </strong>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {!authUser ? (
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={authBusy}
                        className="neon-btn-primary min-h-[44px] px-5 py-2.5 rounded-xl font-display font-bold text-sm tracking-wide text-white flex items-center gap-2 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                      >
                        {authBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <LogIn className="w-4 h-4" />
                        )}
                        <span>Sign in with Google to Submit</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleSubmitScore}
                          disabled={submitting || stats.bestScore < 1}
                          className="neon-btn-primary min-h-[44px] px-5 py-2.5 rounded-xl font-display font-bold text-sm tracking-wide text-white flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {submitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span>
                            {myEntry && stats.bestScore <= myEntry.score
                              ? 'Sync Profile'
                              : 'Submit Best Score'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSignOut}
                          disabled={authBusy}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-pink-400/50 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {statusNotice && (
                  <div
                    className={`mt-3 pt-3 border-t border-white/10 text-xs sm:text-sm font-medium ${
                      statusNotice.tone === 'success'
                        ? 'text-emerald-300'
                        : statusNotice.tone === 'error'
                          ? 'text-pink-300'
                          : 'text-cyan-200'
                    }`}
                  >
                    {statusNotice.text}
                  </div>
                )}
              </section>

              {/* Top 10 Worldwide Table */}
              <section className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-300" />
                    <h3 className="font-display font-bold text-sm sm:text-base text-white tracking-wide">
                      Top 10 Runners Worldwide
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono-num">
                    {topRunners.length} / 10 Ranked
                  </span>
                </div>

                {leaderboardLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                    <span className="text-sm">Loading worldwide rankings...</span>
                  </div>
                ) : leaderboardError ? (
                  <div className="py-10 px-4 text-center text-sm text-pink-300">
                    {leaderboardError}
                  </div>
                ) : topRunners.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <p className="text-base font-display font-semibold text-white">
                      No global scores recorded yet
                    </p>
                    <p className="mt-1 text-xs sm:text-sm text-slate-400">
                      Complete a run, sign in with Google, and claim the #1 spot on the highway.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {topRunners.map((runner, idx) => {
                      const rank = idx + 1;
                      const isCurrentUser = authUser?.uid === runner.uid;
                      const badgeSpec = runner.featuredBadge
                        ? getAchievementSpec(runner.featuredBadge)
                        : undefined;
                      const rankColor =
                        rank === 1
                          ? 'text-amber-300'
                          : rank === 2
                            ? 'text-slate-200'
                            : rank === 3
                              ? 'text-orange-300'
                              : 'text-slate-400';

                      return (
                        <div
                          key={runner.uid}
                          className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                            isCurrentUser
                              ? 'bg-cyan-400/[0.09] border-l-2 border-l-[#00f0ff]'
                              : 'hover:bg-white/[0.025]'
                          }`}
                        >
                          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                            <div
                              className={`w-8 text-center font-display font-bold text-base sm:text-lg font-mono-num shrink-0 ${rankColor}`}
                            >
                              #{rank}
                            </div>

                            <RunnerMiniAvatar skinId={runner.equippedSkin} />

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-display font-bold text-sm sm:text-base text-white truncate">
                                  {runner.playerName}
                                </span>
                                {isCurrentUser && (
                                  <span className="text-xs font-semibold text-[#00f0ff] shrink-0">
                                    (You)
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 font-mono-num">
                                <span>{runner.distance.toLocaleString()}m</span>
                                <span aria-hidden="true" className="text-slate-600">
                                  ·
                                </span>
                                <span>
                                  {runner.badgeCount}{' '}
                                  {runner.badgeCount === 1 ? 'Badge' : 'Badges'}
                                </span>
                                {badgeSpec && (
                                  <>
                                    <span aria-hidden="true" className="hidden sm:inline text-slate-600">
                                      ·
                                    </span>
                                    <span
                                      className="hidden sm:inline truncate"
                                      style={{ color: badgeSpec.accentHex }}
                                    >
                                      {badgeSpec.badgeName}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {badgeSpec && (
                              <div className="hidden sm:block">
                                <BadgeMedallion
                                  achievement={badgeSpec}
                                  unlocked
                                  size="sm"
                                  featured
                                />
                              </div>
                            )}
                            <div className="text-right">
                              <div className="font-mono-num font-bold text-base sm:text-lg text-[#00f0ff]">
                                {runner.score.toLocaleString()}
                              </div>
                              <div className="text-[11px] text-slate-500">PTS</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-cyan-400/15 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-400">
            {activeTab === 'PROFILE'
              ? 'Progress saves automatically at the end of every run.'
              : 'Only your runner callsign, best score, distance, and avatar are published.'}
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] px-5 py-2 rounded-xl border border-slate-700 text-slate-200 hover:bg-white/5 transition-colors text-sm font-medium cursor-pointer whitespace-nowrap shrink-0"
            >
              Main Menu
            </button>
            <button
              type="button"
              onClick={onPlay}
              className="neon-btn-primary min-h-[44px] px-6 py-2 rounded-xl font-display font-bold text-sm tracking-wider text-white flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Run</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
