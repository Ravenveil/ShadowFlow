import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      colors: {
        sf: {
          bg:       '#0A0A0A',
          panel:    '#0F0F12',
          elev1:    '#0C0C10',
          elev2:    '#141414',
          elev3:    '#1A1A1A',
          elev4:    '#1F1F23',
          border:   '#27272A',
          accent:   '#A855F7',
          'accent-tint':   '#140A1F',
          'accent-bright': '#D8B4FE',
          'accent-dim':    '#6B21A8',
          fg0:  '#FFFFFF',
          fg1:  '#FAFAFA',
          fg2:  '#E4E4E7',
          fg3:  '#A1A1AA',
          fg4:  '#71717A',
          fg5:  '#52525B',
          fg6:  '#3F3F46',
          run:    '#3B82F6',
          ok:     '#10B981',
          warn:   '#F59E0B',
          reject: '#EF4444',
          gated:  '#22D3EE',
          'run-tint':    '#0A1020',
          'ok-tint':     '#0A1F17',
          'warn-tint':   '#1F1810',
          'reject-tint': '#1A0F12',
        },
        shadowflow: {
          bg: '#0D1117',
          surface: '#161B22',
          border: '#21262D',
          accent: '#A78BFA',
          success: '#22C55E',
          warn: '#F59E0B',
          muted: '#6B7280',
        },
      },
      borderRadius: {
        sf: '14px',
        'node': '14px',
        'card': '12px',
        'pill': '999px',
      },
      boxShadow: {
        'glow-accent': '0 0 0 1px #A855F7, 0 0 16px -2px rgba(168,85,247,.5)',
        'glow-ok':     '0 0 0 1px #10B981, 0 0 16px -4px rgba(16,185,129,.4)',
        'glow-reject': '0 0 0 1px #EF4444, 0 0 20px -4px rgba(239,68,68,.5)',
        'pop':         '0 0 0 1px rgba(168,85,247,.35), 0 8px 24px -8px rgba(168,85,247,.4)',
        'hud':         '0 10px 30px -10px rgba(0,0,0,.6)',
      },
    },
  },
  plugins: [],
};

export default config;
