import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { ACHIEVEMENTS, type AchievementId } from './achievements';
import { RUNNER_SKINS, type RunnerSkinId } from './cosmetics';

export interface LeaderboardRunner {
  uid: string;
  playerName: string;
  score: number;
  distance: number;
  equippedSkin: RunnerSkinId;
  featuredBadge: AchievementId | null;
  badgeCount: number;
  updatedAtMs: number;
}

export interface AuthUserSummary {
  uid: string;
  displayName: string | null;
  emailVerified: boolean;
}

export interface SubmitScorePayload {
  playerName: string;
  score: number;
  distance: number;
  equippedSkin: RunnerSkinId;
  featuredBadge: AchievementId | null;
  badgeCount: number;
}

export interface SubmitScoreResult {
  status: 'submitted' | 'updated' | 'synced_profile' | 'already_best';
  submittedScore: number;
}

const VALID_SKIN_IDS = new Set<string>(RUNNER_SKINS.map((s) => s.id));
const VALID_BADGE_IDS = new Set<string>(ACHIEVEMENTS.map((a) => a.id));

function sanitizeSkin(skin: string): RunnerSkinId {
  return VALID_SKIN_IDS.has(skin) ? (skin as RunnerSkinId) : 'cyber_pulse';
}

function sanitizeBadge(badge: string | null | undefined): AchievementId | null {
  if (!badge) return null;
  return VALID_BADGE_IDS.has(badge) ? (badge as AchievementId) : null;
}

function sanitizePlayerName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 18);
  return cleaned.length > 0 ? cleaned : 'Neon Runner';
}

function mapDocToRunner(id: string, data: Record<string, unknown>): LeaderboardRunner {
  const ts = data.updatedAt;
  let updatedAtMs = 0;
  if (ts instanceof Timestamp) {
    updatedAtMs = ts.toMillis();
  }
  return {
    uid: typeof data.uid === 'string' ? data.uid : id,
    playerName: typeof data.playerName === 'string' ? data.playerName : 'Neon Runner',
    score: typeof data.score === 'number' ? Math.floor(data.score) : 0,
    distance: typeof data.distance === 'number' ? Math.floor(data.distance) : 0,
    equippedSkin: sanitizeSkin(typeof data.equippedSkin === 'string' ? data.equippedSkin : ''),
    featuredBadge: sanitizeBadge(typeof data.featuredBadge === 'string' ? data.featuredBadge : ''),
    badgeCount: typeof data.badgeCount === 'number' ? Math.max(0, Math.min(10, Math.floor(data.badgeCount))) : 0,
    updatedAtMs,
  };
}

function toAuthSummary(user: User | null): AuthUserSummary | null {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
  };
}

export const LeaderboardService = {
  subscribeAuthState(callback: (user: AuthUserSummary | null) => void): Unsubscribe {
    return onAuthStateChanged(auth, (user) => {
      callback(toAuthSummary(user));
    });
  },

  async signInWithGoogle(): Promise<AuthUserSummary> {
    const cred = await signInWithPopup(auth, googleProvider);
    return {
      uid: cred.user.uid,
      displayName: cred.user.displayName,
      emailVerified: cred.user.emailVerified,
    };
  },

  async signOut(): Promise<void> {
    await signOut(auth);
  },

  subscribeTopRunners(
    onData: (runners: LeaderboardRunner[]) => void,
    onError: (message: string) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'leaderboard'),
      where('score', '>', 0),
      orderBy('score', 'desc'),
      limit(10)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) =>
          mapDocToRunner(d.id, d.data() as Record<string, unknown>)
        );
        onData(list);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'leaderboard');
        } catch {
          onError('Unable to load the global leaderboard right now. Please try again.');
        }
      }
    );
  },

  async getMyEntry(uid: string): Promise<LeaderboardRunner | null> {
    const path = `leaderboard/${uid}`;
    try {
      const snap = await getDoc(doc(db, 'leaderboard', uid));
      if (!snap.exists()) return null;
      return mapDocToRunner(snap.id, snap.data() as Record<string, unknown>);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  },

  async submitTopScore(payload: SubmitScorePayload): Promise<SubmitScoreResult> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Sign in with Google to submit your score to the global leaderboard.');
    }

    const score = Math.min(50000000, Math.max(0, Math.floor(payload.score)));
    if (score < 1) {
      throw new Error('Complete a run first to earn a score before submitting.');
    }

    const distance = Math.min(5000000, Math.max(0, Math.floor(payload.distance)));
    const playerName = sanitizePlayerName(payload.playerName);
    const equippedSkin = sanitizeSkin(payload.equippedSkin);
    const featuredBadge = sanitizeBadge(payload.featuredBadge) ?? '';
    const badgeCount = Math.min(10, Math.max(0, Math.floor(payload.badgeCount)));

    const ref = doc(db, 'leaderboard', user.uid);
    const path = `leaderboard/${user.uid}`;

    let existingSnap;
    try {
      existingSnap = await getDoc(ref);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }

    if (!existingSnap.exists()) {
      try {
        await setDoc(ref, {
          uid: user.uid,
          playerName,
          score,
          distance,
          equippedSkin,
          featuredBadge,
          badgeCount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return { status: 'submitted', submittedScore: score };
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }

    const existing = existingSnap.data() as Record<string, unknown>;
    const existingScore = typeof existing.score === 'number' ? Math.floor(existing.score) : 0;
    const existingDistance =
      typeof existing.distance === 'number' ? Math.floor(existing.distance) : 0;
    const existingName = typeof existing.playerName === 'string' ? existing.playerName : '';
    const existingSkin = typeof existing.equippedSkin === 'string' ? existing.equippedSkin : '';
    const existingBadge = typeof existing.featuredBadge === 'string' ? existing.featuredBadge : '';
    const existingBadgeCount =
      typeof existing.badgeCount === 'number' ? Math.floor(existing.badgeCount) : 0;

    const isHigherScore = score > existingScore;
    const profileChanged =
      existingName !== playerName ||
      existingSkin !== equippedSkin ||
      existingBadge !== featuredBadge ||
      existingBadgeCount !== badgeCount;

    if (!isHigherScore && !profileChanged) {
      return { status: 'already_best', submittedScore: existingScore };
    }

    try {
      await updateDoc(ref, {
        playerName,
        score: isHigherScore ? score : existingScore,
        distance: isHigherScore ? distance : Math.max(existingDistance, distance),
        equippedSkin,
        featuredBadge,
        badgeCount,
        updatedAt: serverTimestamp(),
      });
      return {
        status: isHigherScore ? 'updated' : 'synced_profile',
        submittedScore: isHigherScore ? score : existingScore,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },
};
