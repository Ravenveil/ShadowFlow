import { defineConfig } from 'i18next-cli';

export default defineConfig({
  locales: ['en', 'zh'],

  extract: {
    input: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/**/__mocks__/**'],
    output: 'src/common/i18n/locales/{{language}}.json',
    // Must match the runtime config (src/common/i18n/index.tsx → keySeparator: false).
    // Runtime treats "shell.navStart" as a single flat key. If the CLI uses
    // "." as separator it produces nested {shell:{navStart:...}} objects,
    // which then don't match the flat zh.json — status reports 0/338.
    keySeparator: false,
    nsSeparator: false,
    defaultNS: 'translation',
    functions: ['t', 'i18next.t', 'i18n.t'],
    transComponents: ['Trans'],
    preservePatterns: [
      'nodeNames.*',
      'nodeDescriptions.*',
      'categories.*',
    ],
  },
});
