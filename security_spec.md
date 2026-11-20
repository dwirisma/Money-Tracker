# Security Specification — Artha Cloud Firestore

## Authentication Model
- Users authenticate via Firebase Authentication Email/Password using a virtual User ID email format (`<userid>@artha.local`).
- Because virtual `@artha.local` accounts are provisioned by the administrator and do not receive external verification emails, ownership is strictly verified via `request.auth != null && request.auth.uid == userId`.

## Authorization & Data Isolation
- **Strict Tenant Isolation**: Every document in the database resides strictly beneath `/users/{userId}/...`.
- **Default Deny**: All unmatched paths (`/databases/{database}/documents/{document=**}`) deny read and write access (`if false`).
- **Owner-Only Access**: A signed-in user may only `read`, `create`, `update`, and `delete` documents inside their own `/users/{request.auth.uid}/...` subtree. Cross-user reads, writes, queries, and deletions are unconditionally denied.
- **Unauthenticated Access**: Completely denied across all collections.

## Schema & Validation Rules
- Every subcollection enforces required fields, primitive data types (`string`, `number`, `bool`, `list`, `map`), string length limits, and enum constraints on `create` and `update`.
- Numeric amounts (`amount`, `targetAmount`, `totalDebt`, `initialCapital`, `currentValue`) are validated as numbers within reasonable bounds.
- Singleton settings documents under `/users/{userId}/settings/{settingId}` are restricted to allowed setting IDs: `preferences`, `categories`, and `holidays`.
