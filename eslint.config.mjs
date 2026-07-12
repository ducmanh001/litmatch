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
            // FE chỉ được depend libs trung lập (docs/12 § 12.9-2) — vi phạm là lỗi lint
            {
              sourceTag: 'scope:frontend',
              onlyDependOnLibsWithTags: ['platform:browser'],
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error', // docs/05 § 5.1 — không nhận `any`
    },
  },
];
