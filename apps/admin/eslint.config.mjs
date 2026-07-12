import { fixupConfigRules } from '@eslint/compat';
import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  // eslint-plugin-react (trong preset Nx) chưa hỗ trợ API ESLint 10 — shim bằng @eslint/compat
  ...fixupConfigRules(nx.configs['flat/react']),
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
