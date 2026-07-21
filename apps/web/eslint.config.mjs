import playwright from 'eslint-plugin-playwright';
import nextEslintPluginNext from '@next/eslint-plugin-next';
import { fixupConfigRules } from '@eslint/compat';
import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  // Chỉ áp cho e2e/** — áp toàn project thì rule playwright/no-standalone-expect báo sai trên
  // mọi *.spec.ts(x) Vitest (docs/13 § 13.12: Vitest cho web, Playwright chỉ ở e2e/).
  { ...playwright.configs['flat/recommended'], files: ['e2e/**/*.ts'] },
  { plugins: { '@next/next': nextEslintPluginNext } },
  // eslint-plugin-react (trong preset Nx) chưa hỗ trợ API ESLint 10 — shim bằng @eslint/compat
  ...fixupConfigRules(nx.configs['flat/react-typescript']),
  ...baseConfig,
  {
    ignores: ['.next/**/*', '.open-next/**/*'],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    // Override or add rules here
    rules: {},
  },
];
