/**
 * Security Rules Verification Spec for /leaderboard/{userId}
 * Covers all Dirty Dozen attack payloads and happy-path operations from security_spec.md.
 */

export interface LeaderboardTestCase {
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  queryLimit?: number;
  expected: 'ALLOW' | 'DENY';
}

export const LEADERBOARD_RULE_TESTS: LeaderboardTestCase[] = [
  {
    name: 'Happy path: verified user creates own top score entry',
    operation: 'create',
    path: '/leaderboard/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      uid: 'userA',
      playerName: 'CyberNova',
      score: 12450,
      distance: 1420,
      equippedSkin: 'cyber_pulse',
      featuredBadge: 'dist_1000',
      badgeCount: 3,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'ALLOW',
  },
  {
    name: 'Happy path: public reads top 10 leaderboard with score > 0 and limit <= 10',
    operation: 'list',
    path: '/leaderboard',
    auth: null,
    queryLimit: 10,
    expected: 'ALLOW',
  },
  {
    name: 'Attack 1: cross-user overwrite denied',
    operation: 'update',
    path: '/leaderboard/userB',
    auth: { uid: 'userA', email_verified: true },
    payload: { score: 99999 },
    expected: 'DENY',
  },
  {
    name: 'Attack 2: unauthenticated create denied',
    operation: 'create',
    path: '/leaderboard/anon1',
    auth: null,
    payload: { uid: 'anon1', playerName: 'Bot', score: 500 },
    expected: 'DENY',
  },
  {
    name: 'Attack 3: unverified email write denied',
    operation: 'create',
    path: '/leaderboard/userC',
    auth: { uid: 'userC', email_verified: false },
    payload: { uid: 'userC', playerName: 'Unverified', score: 500 },
    expected: 'DENY',
  },
  {
    name: 'Attack 4: UID spoofing inside payload denied',
    operation: 'create',
    path: '/leaderboard/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userB', playerName: 'Spoofer', score: 900 },
    expected: 'DENY',
  },
  {
    name: 'Attack 5: shadow field / PII injection denied',
    operation: 'create',
    path: '/leaderboard/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userA', playerName: 'Runner', score: 900, email: 'leak@example.com' },
    expected: 'DENY',
  },
  {
    name: 'Attack 6: oversized playerName denied',
    operation: 'create',
    path: '/leaderboard/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userA', playerName: 'A'.repeat(64), score: 900 },
    expected: 'DENY',
  },
  {
    name: 'Attack 7: out-of-bounds or negative score denied',
    operation: 'create',
    path: '/leaderboard/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userA', playerName: 'Runner', score: 999999999 },
    expected: 'DENY',
  },
  {
    name: 'Attack 8: score downgrade on update denied',
    operation: 'update',
    path: '/leaderboard/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { score: 10 },
    expected: 'DENY',
  },
  {
    name: 'Attack 9: client-forged timestamp denied',
    operation: 'create',
    path: '/leaderboard/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userA', playerName: 'Runner', score: 900, createdAt: '2020-01-01T00:00:00Z' },
    expected: 'DENY',
  },
  {
    name: 'Attack 10: invalid skin enum denied',
    operation: 'create',
    path: '/leaderboard/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userA', playerName: 'Runner', score: 900, equippedSkin: 'hacked_skin' },
    expected: 'DENY',
  },
  {
    name: 'Attack 11: unbounded list query > 10 denied',
    operation: 'list',
    path: '/leaderboard',
    auth: null,
    queryLimit: 50,
    expected: 'DENY',
  },
  {
    name: 'Attack 12: arbitrary undeclared collection access denied',
    operation: 'get',
    path: '/admin/secrets',
    auth: { uid: 'userA', email_verified: true },
    expected: 'DENY',
  },
];
