# Neon Dash Global Leaderboard — Security Specification

## Phase 0: Data Invariants & Access Model

### Collection: `/leaderboard/{userId}`
- **Ownership**: Strictly keyed by Firebase Auth UID (`userId == request.auth.uid`). Each authenticated player controls exactly one document.
- **Authentication**: Google Sign-In with verified email (`request.auth != null && request.auth.token.email_verified == true`) is required for all writes (`create`, `update`, `delete`).
- **PII Segregation**: Zero PII is stored in `/leaderboard/{userId}`. No email, phone number, photo URL, or OAuth tokens are permitted in the schema.
- **Public Read**:
  - `get`: Allowed for the owner (`request.auth.uid == userId`) to check existing submission status, or publicly if `resource != null && resource.data.score is int && resource.data.score > 0`.
  - `list`: Allowed only when constrained to valid positive scores (`resource.data.score is int && resource.data.score > 0`) and bounded to at most 10 rows (`request.query.limit <= 10`).
- **Field Validation**:
  - Exact key set via `hasAll` and `hasOnly` (`uid`, `playerName`, `score`, `distance`, `equippedSkin`, `featuredBadge`, `badgeCount`, `createdAt`, `updatedAt`).
  - `uid == userId && uid == request.auth.uid`, string `1..128` chars.
  - `playerName`: string `1..18` chars.
  - `score`: integer `1..50000000`. On `update`, `incoming.score >= existing.score`.
  - `distance`: integer `0..5000000`.
  - `equippedSkin`: strict allowlist of the 5 Neon Dash skins.
  - `featuredBadge`: empty string or strict allowlist of the 10 Neon Dash achievement IDs.
  - `badgeCount`: integer `0..10`.
  - `createdAt`: must equal `request.time` on `create`, immutable on `update`.
  - `updatedAt`: must equal `request.time` on `create` and `update`.
- **Default Deny**: All other paths are explicitly denied via `match /{document=**} { allow read, write: if false; }`.

## Dirty Dozen Attack Vectors (Must Be Rejected)
1. **Cross-user overwrite**: User A attempts `create` or `update` on `/leaderboard/userB`.
2. **Unauthenticated write**: Guest (`request.auth == null`) attempts to submit a score.
3. **Unverified email write**: Token with `email_verified: false` attempts to write.
4. **UID mismatch spoofing**: User A writes to `/leaderboard/userA` with `uid: "userB"`.
5. **Shadow field injection**: Payload includes undeclared fields such as `isAdmin: true` or `email: "a@b.com"`.
6. **Oversized string / DoS**: `playerName` with 500 characters or empty `""`.
7. **Out-of-bounds score**: `score: 0`, `score: -100`, `score: 999999999`, or float `score: 120.5`.
8. **Score downgrade / tampering**: Updating an existing document to lower `score` below `existing().score`.
9. **Timestamp backdating**: Supplying a client-forged `createdAt` or `updatedAt` != `request.time`, or mutating `createdAt` on `update`.
10. **Invalid enum poisoning**: Supplying an arbitrary `equippedSkin` or `featuredBadge` not in the allowlist.
11. **Unbounded list dump**: Querying `/leaderboard` with `limit(500)` or without the `score > 0` filter.
12. **Arbitrary collection write**: Attempting read/write on `/admin/config` or `/users/victim`.
