/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: 1,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/test/integration/**/*.test.ts',
  ],
  setupFiles: ['<rootDir>/src/test/setup-env.ts'],
  moduleNameMapper: {
    '^uuid$': '<rootDir>/src/test/uuid.ts',
  },
};
