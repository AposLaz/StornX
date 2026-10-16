module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: [
    '<rootDir>/services/optiscaler/tests',
    '<rootDir>/services/optibalancer/tests',
    '<rootDir>/packages/platform/tests',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'bundler',
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
