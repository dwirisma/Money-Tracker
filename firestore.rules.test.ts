/**
 * Firestore Security Rules Test Specification (TDD Phase 0)
 * Documents required authorization and validation invariants for Artha's cloud-only Firestore rules.
 */

export interface SecurityRuleTestCase {
  name: string;
  actor: 'unauthenticated' | 'owner' | 'other_user';
  operation: 'read' | 'create' | 'update' | 'delete';
  path: string;
  expected: 'ALLOW' | 'DENY';
}

export const FIRESTORE_RULE_TEST_CASES: SecurityRuleTestCase[] = [
  // Unauthenticated access must always fail
  {
    name: 'Unauthenticated user cannot read ledgers',
    actor: 'unauthenticated',
    operation: 'read',
    path: '/users/uid_alice/ledgers/ledger_personal_default',
    expected: 'DENY',
  },
  {
    name: 'Unauthenticated user cannot create transactions',
    actor: 'unauthenticated',
    operation: 'create',
    path: '/users/uid_alice/transactions/tx_1',
    expected: 'DENY',
  },
  // Cross-user isolation must always fail
  {
    name: 'Other authenticated user cannot read Alice accounts',
    actor: 'other_user',
    operation: 'read',
    path: '/users/uid_alice/accounts/acc_1',
    expected: 'DENY',
  },
  {
    name: 'Other authenticated user cannot update Alice preferences',
    actor: 'other_user',
    operation: 'update',
    path: '/users/uid_alice/settings/preferences',
    expected: 'DENY',
  },
  {
    name: 'Other authenticated user cannot delete Alice salary history',
    actor: 'other_user',
    operation: 'delete',
    path: '/users/uid_alice/salaryHistory/sal_1',
    expected: 'DENY',
  },
  // Owner access with valid schema succeeds
  {
    name: 'Owner can create default ledger',
    actor: 'owner',
    operation: 'create',
    path: '/users/uid_alice/ledgers/ledger_personal_default',
    expected: 'ALLOW',
  },
  {
    name: 'Owner can create valid account and transaction atomically',
    actor: 'owner',
    operation: 'create',
    path: '/users/uid_alice/transactions/tx_1',
    expected: 'ALLOW',
  },
  {
    name: 'Owner can update preferences singleton',
    actor: 'owner',
    operation: 'update',
    path: '/users/uid_alice/settings/preferences',
    expected: 'ALLOW',
  },
  // Unknown paths denied by default
  {
    name: 'Owner cannot write to arbitrary top-level collections',
    actor: 'owner',
    operation: 'create',
    path: '/salary_history/sal_1',
    expected: 'DENY',
  },
];
