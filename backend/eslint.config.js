const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'uploads/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `catch (error)` without using `error` is idiomatic here - the
          // handler's job is often just to return a generic 500. ESLint 9
          // started flagging these by default; we don't want that churn.
          caughtErrors: 'none',
        },
      ],
      // Server-side logging goes to stdout and is collected by the platform.
      'no-console': 'off',
      // Deliberately swallowed errors (best-effort cleanup, optional lookups).
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['**/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
];
