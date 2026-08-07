/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: 1,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  /*
   * TOOLCHAIN CONTRACT (ledger #13 — 2026-08-05): `npm test` is the
   * DB-FREE gate — it must pass on any machine without Postgres or Redis.
   * Integration suites (*.integration.test.ts, src/test/integration/**)
   * boot the full Express app against real PostgreSQL/Redis (see
   * src/test/setup-env.ts for the :55433/:56379 test-env defaults) and are
   * therefore OPT-IN: run them with `npm run test:integration`.
   */
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.test\\.ts$',
    '<rootDir>/src/test/integration/',
  ],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/test/integration/**/*.test.ts',
  ],
  setupFiles: ['<rootDir>/src/test/setup-env.ts'],
  // TOOLCHAIN (ledger #13): per-suite handle teardown — see that file's
  // header. Without it the runner hung on ioredis retry loops.
  setupFilesAfterEnv: ['<rootDir>/src/test/teardown-handles.ts'],
  moduleNameMapper: {
    '^uuid$': '<rootDir>/src/test/uuid.ts',
  },
};
