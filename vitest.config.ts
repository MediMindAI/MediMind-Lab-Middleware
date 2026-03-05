/**
 * Vitest configuration for MediMind Lab Middleware.
 *
 * Sets up TypeScript-based testing with Istanbul coverage reporting.
 * Tests are colocated next to source files (*.test.ts pattern).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/simulators/**',
        'src/types/**',
      ],
    },
    testTimeout: 10000,
  },
});
