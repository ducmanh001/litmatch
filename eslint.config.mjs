import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      '**/webpack.config.js',
      '**/jest.config.cts',
      '.nx/**',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Boundary tầng project (docs/03 § 3.2): app chỉ phụ thuộc lib, lib không phụ thuộc app.
      // Boundary giữa các module BÊN TRONG core-api: xem arch test apps/core-api/src/arch/.
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:lib'] },
            { sourceTag: 'type:lib', onlyDependOnLibsWithTags: ['type:lib'] },
            // Capability runtime là chiều độc lập với type/scope. Project có cả hai tag
            // phải thoả cả hai constraint, nên lib cross-runtime chỉ phụ thuộc lib cross-runtime.
            {
              sourceTag: 'platform:server',
              onlyDependOnLibsWithTags: ['platform:server'],
            },
            {
              sourceTag: 'platform:browser',
              onlyDependOnLibsWithTags: ['platform:browser'],
            },
            // FE chỉ được depend lib browser-compatible (docs/12 § 12.9-2).
            {
              sourceTag: 'scope:frontend',
              onlyDependOnLibsWithTags: ['platform:browser'],
            },
            {
              sourceTag: 'scope:core',
              onlyDependOnLibsWithTags: ['platform:server'],
            },
            {
              sourceTag: 'scope:signaling',
              onlyDependOnLibsWithTags: ['platform:server'],
            },
            {
              sourceTag: 'scope:e2e',
              onlyDependOnLibsWithTags: ['platform:server'],
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error', // docs/05 § 5.1 — không nhận `any`
    },
  },
];
