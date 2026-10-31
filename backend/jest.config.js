/**
 * NestJS 12 ships as ESM only; the test script runs Node with --experimental-vm-modules
 * so Jest can require() those packages natively.
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\.(spec|e2e-spec)\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { diagnostics: { ignoreCodes: [151001] } }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
