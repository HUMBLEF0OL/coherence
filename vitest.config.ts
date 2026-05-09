import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'schema',
          include: ['tests/schema/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'fixtures',
          include: ['tests/fixtures/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'perf',
          include: ['tests/perf/**/*.bench.ts', 'tests/perf/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60000,
        },
      },
      {
        test: {
          name: 'security',
          include: ['tests/security/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
        },
      },
      {
        test: {
          name: 'rollback',
          include: ['tests/rollback/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
