import nextEslintPluginNext from '@next/eslint-plugin-next';
import { fixupConfigRules } from '@eslint/compat';
import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  { plugins: { '@next/next': nextEslintPluginNext } },
  // eslint-plugin-react (trong preset Nx) chưa hỗ trợ API ESLint 10 — shim bằng @eslint/compat
  ...fixupConfigRules(nx.configs['flat/react-typescript']),
  ...baseConfig,
  {
    ignores: ['.next/**/*'],
  },
];
