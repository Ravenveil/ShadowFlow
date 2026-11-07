import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Matchers<R = void, T = any> extends TestingLibraryMatchers<typeof expect.stringContaining, R> {}
}
