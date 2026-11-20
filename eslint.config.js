import firebaseSecurityRules from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  firebaseSecurityRules.configs['flat/recommended'],
];
