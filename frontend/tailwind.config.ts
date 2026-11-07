import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Tailwind `dark:` variant is gated to night theme only.
  // Project switches via [data-theme="night"|"day"] (set by useTheme on documentElement),
  // so we use the `variant` form to attach a custom selector instead of `class="dark"`.
  darkMode: ['variant', '&:where([data-theme="night"], [data-theme="night"] *)'],
  theme: {
    extend: {
      fontFamily: {
        // 2026-08-18 clawsgo 收敛: 与 index.css --font-sans 同步切系统字体栈
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
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
          // UI5.0: 紫色 accent 全族收敛为 clawsgo 关键蓝 #1447E6 同色系
          accent:   '#1447E6',
          'accent-tint':   '#0A1128',
          'accent-bright': '#93C5FD',
          'accent-dim':    '#0F3BCC',
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
          // UI5.0: #A78BFA 紫 → clawsgo 关键蓝
          accent: '#1447E6',
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
        // UI5.0: glow/pop 阴影同步改蓝（原 rgba(168,85,247) 紫）
        'glow-accent': '0 0 0 1px #1447E6, 0 0 16px -2px rgba(20,71,230,.5)',
        'glow-ok':     '0 0 0 1px #10B981, 0 0 16px -4px rgba(16,185,129,.4)',
        'glow-reject': '0 0 0 1px #EF4444, 0 0 20px -4px rgba(239,68,68,.5)',
        'pop':         '0 0 0 1px rgba(20,71,230,.35), 0 8px 24px -8px rgba(20,71,230,.4)',
        'hud':         '0 10px 30px -10px rgba(0,0,0,.6)',
      },
    },
  },
  plugins: [],
};

export default config;
