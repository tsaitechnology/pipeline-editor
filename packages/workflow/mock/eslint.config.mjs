import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
          ],
          // Private package — never published. Its @tsai-pe/* siblings are not
          // part of the release, so their pinned versions drift as the public
          // libs bump. Ignore them here to avoid false-positive version checks.
          ignoredDependencies: ['@tsai-pe/models', '@tsai-pe/nodes'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
