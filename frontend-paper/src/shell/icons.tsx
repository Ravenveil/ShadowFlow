/** 细线图标集（1.6px 描边，24 网格）。零依赖，避免旧版 lucide 的兼容坑。 */
type P = { size?: number; className?: string };

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconPlus = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconChat = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M20 12a7.5 7.5 0 0 1-7.5 7.5H7L4 22v-5.2A7.5 7.5 0 0 1 12.5 4.5 7.5 7.5 0 0 1 20 12Z" />
  </svg>
);

export const IconFolder = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17V7.5Z" />
  </svg>
);

export const IconUsers = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.4a3.2 3.2 0 0 1 0 6.2M17.5 14.4a5 5 0 0 1 3 5.1" />
  </svg>
);

export const IconBook = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a1.6 1.6 0 0 0-1.6-1.6H4V5.5Z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a1.6 1.6 0 0 1 1.6-1.6H20V5.5Z" />
  </svg>
);

export const IconClock = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.6V12l3.2 1.9" />
  </svg>
);

export const IconSearch = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.5 15.5 4 4" />
  </svg>
);

export const IconSettings = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11A1.7 1.7 0 0 0 19.4 15Z" />
  </svg>
);

export const IconPanel = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M15 4.5v15" />
  </svg>
);

export const IconChevron = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const IconChevronDown = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconCheck = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

export const IconSparkle = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9 12 3.5Z" />
  </svg>
);

export const IconArrowUp = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const IconPaperclip = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M16.5 8.5 9.4 15.6a2.8 2.8 0 0 0 4 4l7.5-7.5a4.7 4.7 0 0 0-6.7-6.7l-7.8 7.8a6.6 6.6 0 0 0 9.3 9.3L22 16" />
  </svg>
);

export const IconSlash = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M15 4 9 20" />
  </svg>
);

export const IconFile = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5L13.5 3.5Z" />
    <path d="M13.5 3.5v5h5" />
  </svg>
);

export const IconImage = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17 4.8-4.4 3.2 2.6 3-2.6 4 4.4" />
  </svg>
);

export const IconCode = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m8.5 7.5-5 4.5 5 4.5M15.5 7.5l5 4.5-5 4.5" />
  </svg>
);

export const IconGrid = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </svg>
);

export const IconMore = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="5.5" cy="12" r="1.1" fill="currentColor" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.1" fill="currentColor" />
  </svg>
);

export const IconBell = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 9.5a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5Z" />
    <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
  </svg>
);

export const IconArrowRight = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 12h16M13 5l7 7-7 7" />
  </svg>
);

export const IconLayers = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="m12 3.5 8 4.2-8 4.2-8-4.2 8-4.2Z" />
    <path d="m4 12 8 4.2 8-4.2M4 16.3l8 4.2 8-4.2" />
  </svg>
);

export const IconPlay = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M10.4 9.2 15 12l-4.6 2.8V9.2Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconShield = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 3.5 19 6v6c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-2.5Z" />
    <path d="m9 12 2.2 2.2L15.2 10" />
  </svg>
);

export const IconBranch = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="6.5" cy="5.5" r="2.2" />
    <circle cx="6.5" cy="18.5" r="2.2" />
    <circle cx="17.5" cy="9" r="2.2" />
    <path d="M6.5 7.7v8.6" />
    <path d="M17.5 11.2c0 3-2.4 4.2-4.6 4.6-2.1.4-3.4 1-3.4 2.7" />
  </svg>
);
