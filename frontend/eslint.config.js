// ESLint 9 dropped .eslintrc and ESLint 10 removed it entirely, so this is the
// flat-config replacement for the .eslintrc.cjs added earlier. Same three rule
// decisions as before, carried over deliberately.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', '../static/dist', 'node_modules', 'vite.config.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      // `const { images, ...jsonData } = form` is how a field is stripped before
      // sending, so a rest sibling is not a dead binding.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // react-hook-form's proxy-based `watch()`/`register()` are opaque to the
      // React Compiler, so it reports the component as "compilation skipped".
      // This project does not run the compiler (no babel-plugin-react-compiler),
      // so the report is not actionable here - the other react-hooks rules,
      // which do check real correctness, stay on.
      'react-hooks/incompatible-library': 'off',
      // The codebase was written without a linter and uses `any` throughout,
      // mostly for caught errors. Turning this on would mean 30+ failures on
      // untouched files; typing those is worth doing, but as its own change.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
