import js from '@eslint/js';
import globals from 'globals';

// One flat config for both workspaces. Deliberately minimal: the recommended
// baseline (undefined vars, unused vars, duplicate keys, …) without stylistic
// or framework-specific rules, so lint stays cheap to run and cheap to keep green.
export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  {
    files: ['backend/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    }
  }
];
