import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsJest = 'ts-jest';
// Jest runs from the workspace root so pnpm's root-level node_modules resolves on Windows.
// eslint-disable-next-line @nx/enforce-module-boundaries -- Jest config consumes the workspace preset.
import nxPresetModule from '../../jest.preset.js';
const nxPreset = { ...nxPresetModule };
delete nxPreset.resolver;

export default {
  ...nxPreset,
  rootDir: path.resolve(__dirname, '../..'),
  roots: [path.resolve(__dirname, 'src')],
  moduleDirectories: ['node_modules'],
  resolver: path.resolve(__dirname, '../../scripts/jest/resolver.cjs'),
  displayName: 'signaling-gateway-e2e',
  globalSetup: path.resolve(__dirname, 'src/support/global-setup.ts'),
  globalTeardown: path.resolve(__dirname, 'src/support/global-teardown.ts'),
  setupFiles: [path.resolve(__dirname, 'src/support/test-setup.ts')],
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      tsJest,
      {
        tsconfig: path.resolve(__dirname, 'tsconfig.spec.json'),
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/signaling-gateway-e2e',
};
