import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // `mobile/` is a self-contained Expo/React Native sub-project with its own
  // toolchain (eslint/tsconfig/jest); the root web gate must not lint it.
  { ignores: ['dist', 'coverage', 'node_modules', 'mobile'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Align eslint with tsc's `noUnusedParameters`: a leading underscore marks
      // an intentionally-unused binding (e.g. a typed-but-unused mock/callback
      // parameter), so it must not be flagged as unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // The push service worker (public/service-worker.js) is plain JS that runs in
  // the ServiceWorkerGlobalScope — give it `self`, `clients`, etc. so no-undef
  // doesn't flag those globals.
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },
  prettier,
);
