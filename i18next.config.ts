import { defineConfig } from 'i18next-cli';

export default defineConfig({
  locales: ['en', 'zh'],

  extract: {
    input: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/**/__mocks__/**'],
    output: 'src/common/i18n/locales/{{language}}.json',
    keySeparator: '.',
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
