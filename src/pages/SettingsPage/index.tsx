/**
 * SettingsPage — Neo 重构（2026-11-06）
 *
 * 布局对齐主应用 NeoApp 的 clawsgo 体系：左栏灰底（--t-bg）212px + 内容区纯白
 * （--t-panel）+ hairline 分隔。导航行复刻 .neo-nav-row（图标 15px + 文字
 * 12.5px，选中灰底 600、无彩色指示条）。样式走 settings-neo.css 的 neo-st-*
 * 作用域类，颜色一律 var(--t-*)，day/night 双主题安全。
 *
 * 2026-11-06 用户反馈批：
 *   - 顶栏（HfTopBar）移除——内容直接从视口顶部开始；
 *   - 侧栏头部「设置」标题块 → 「← 返回工作区」行式按钮（Z Code 式）。
 *   - 未开发占位项撤下（billing / shortcuts / workspace / onchain 从导航与
 *     路由类型移除，ComingSoonSection 一并删除；wallet 0G 已停用本就不在
 *     导航，渲染分支保留可回退——AGENTS.md 0G 遗留约定）。
 *   - 账户分组合并：「个人资料 · 快速上手」与「账户 · 关于」并为一个
 *     welcome 条目（关于/会话/退出信息并入 WelcomeSection 页内）；
 *     AboutSection 组件保留不删、仅撤引用（同 GroupMembersPanel 先例）。
 *     链上（钱包）登录入口撤下，未登录只留访客模式。
 *
 * 历史脉络：Hi-Fi v2 redesign（hf-pages.jsx 1:1 迁移）→ UI5.0 → 本批 Neo 化。
 *
 * Preservation rule: 已开发的 settings 子组件原样保留、挂在稳定的 section id
 * 下。Default active section is `welcome`.
 *
 * Active selection persists to `window.location.hash` (e.g. `#byok`) so
 * deep-linking + browser back/forward work. Falls back to in-memory state
 * if hash is absent.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  Image,
  KeyRound,
  Languages,
  LayoutGrid,
  Palette,
  PawPrint,
  Plug,
  Server,
  Shield,
  SlidersHorizontal,
  Terminal,
  User,
  Waves,
  Bell,
  Wrench,
  Brain,
  IdCard,
  ArrowRightLeft,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../common/i18n';
import { ToolProvidersTab } from './ToolProvidersTab';
import { SkillsCatalogTab } from './SkillsCatalogTab';
import { LocalCLISection } from '../../core/components/settings/LocalCLISection';
import { ByokSection } from '../../core/components/settings/ByokSection';
import { ConnectorsSection } from '../../core/components/settings/ConnectorsSection';
import { AppearanceSection } from '../../core/components/settings/AppearanceSection';
import { LanguageSection } from '../../core/components/settings/LanguageSection';
import { McpIntegrationsSection } from '../../core/components/settings/McpIntegrationsSection';
import { PetSettings } from '../../core/components/pet/PetSettings';
import { NotificationsSection } from '../../core/components/settings/NotificationsSection';
import { AdvancedSection } from '../../core/components/settings/AdvancedSection';
import { MediaProvidersSection } from '../../core/components/settings/MediaProvidersSection';
import { WelcomeSection } from '../../core/components/settings/WelcomeSection';
import { WalletSection } from './WalletSection';
import { GenerationSettings } from '../../components/GenerationSettings';
import { AcpAgentsPanel } from '../../components/AcpAgentsPanel';
import { MemorySection } from '../../core/components/settings/MemorySection';
import { SchedulesSection } from './SchedulesSection';
// ClawHub（2026-11-06 自 Neo 侧边栏迁入设置）：目录/安装/卸载整页复用
import { ClawHubPage } from '../clawhub/ClawHubPage';
// 记忆折叠批（2026-11-06）：原左栏一级「记忆」页整体并入设置。
// 与 main 的 Neo 重构合并后仍按裸组件渲染：不套 LegacySectionWrap，
// 它的 760 上限会把「交接与写回」的一行四输入挤到换行。
import MemoryPage from '../MemoryPage';
import MemoryProfilePanel from '../MemoryProfilePanel';
import MemoryHandoffPanel from '../MemoryHandoffPanel';
import './settings-neo.css';

// ---------------------------------------------------------------------------
// Section ids — 已开发条目 + wallet（0G 停用保留，仅 hash 可达）。
// 2026-11-06: 未开发占位项（billing/shortcuts/workspace/onchain）撤下。
// ---------------------------------------------------------------------------

type SectionId =
  // 账户（welcome = 个人资料 + 关于，2026-11-06 合并；about 保留兼容旧 hash）
  | 'welcome'      // existing — used as Profile entry
  | 'about'        // legacy — 关于已并入 welcome，旧 hash 深链仍可解析
  // 外观
  | 'appearance'
  | 'language'
  // 集成
  | 'skills-catalog'           // Skills 管理面板 — catalog 浏览 / enable / 导入 / 删除
  | 'skill-studio-generation'  // 生成参数 — model / max_tokens / temperature / defaults
  | 'skill-studio-acp'         // 远端 Agent — ACP/MCP remote agent discovery
  | 'clawhub'                  // ClawHub — Claw 目录 / 安装 / 卸载（2026-11-06 自侧边栏迁入）
  | 'local-cli'
  | 'byok'
  | 'tool-providers'
  | 'connectors'
  | 'mcp-integrations'
  // 0G（停用保留）
  | 'wallet'       // backed by /api/wallet/*
  // 记忆
  | 'memory-entries'   // 记忆条目（手动条目 + 经验沉淀，原 /memory 主列表）
  | 'memory-profile'   // 记忆画像（Agent 运行时画像）
  | 'memory-handoff'   // 交接与写回（A→B 交接、长期画像写回、冲突裁决）
  | 'memory-river'
  // 数据
  | 'schedules'
  | 'notifications'
  | 'advanced'
  | 'media-providers'
  | 'pet';

interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

// Static section IDs for hash routing (labels not needed here)
const STATIC_NAV_GROUPS: Array<{ group: string; items: Array<{ id: SectionId }> }> = [
  {
    group: 'Account',
    items: [
      { id: 'welcome' },
      // 2026-11-06: 关于并入个人资料，导航不再单列 about（旧 hash 兼容保留）
    ],
  },
  {
    group: 'Appearance',
    items: [
      { id: 'appearance' },
      { id: 'language' },
    ],
  },
  {
    group: 'Integrations',
    items: [
      { id: 'skills-catalog' },
      { id: 'clawhub' },
      { id: 'local-cli' },
      { id: 'byok' },
      { id: 'skill-studio-generation' },
      { id: 'skill-studio-acp' },
      { id: 'tool-providers' },
      { id: 'connectors' },
      { id: 'mcp-integrations' },
    ],
  },
  // 2026-08-11: 「0G」设置分组停用（0G 组件先不用，代码保留可回退）。
  {
    group: 'Memory',
    items: [
      { id: 'memory-entries' },
      { id: 'memory-profile' },
      { id: 'memory-handoff' },
      { id: 'memory-river' },
    ],
  },
  {
    group: 'Data',
    items: [
      { id: 'schedules' },
      { id: 'notifications' },
      { id: 'advanced' },
      { id: 'media-providers' },
      { id: 'pet' },
    ],
  },
];

const ALL_IDS = STATIC_NAV_GROUPS.flatMap((g) => g.items.map((it) => it.id));
const ID_SET = new Set<string>(ALL_IDS);

function buildNavGroups(t: (key: string, options?: Record<string, unknown>) => string): NavGroup[] {
  return [
    {
      group: t('settings.groupAccount'),
      items: [
        { id: 'welcome', label: t('settings.navProfile'), icon: User },
        // 2026-11-06: 「账户 · 关于」并入个人资料页，导航合并为单条目
      ],
    },
    {
      group: t('settings.groupAppearance'),
      items: [
        { id: 'appearance', label: t('settings.navAppearance'), icon: Palette },
        { id: 'language',   label: t('settings.navLanguage'), icon: Languages },
      ],
    },
    {
      group: t('settings.groupIntegrations'),
      items: [
        { id: 'skills-catalog',          label: t('settings.navSkillsCatalog'), icon: LayoutGrid },
        { id: 'clawhub',                 label: t('clawhub.navEntry', { defaultValue: 'ClawHub' }), icon: PawPrint },
        { id: 'local-cli',               label: t('settings.navLocalCli'), icon: Terminal },
        { id: 'byok',                    label: t('settings.navByok'), icon: KeyRound },
        { id: 'skill-studio-generation', label: t('settings.navGeneration'), icon: SlidersHorizontal },
        { id: 'skill-studio-acp',        label: t('settings.navRemoteAgents'), icon: Bot },
        { id: 'tool-providers',          label: t('settings.navToolProviders'), icon: Wrench },
        { id: 'connectors',              label: t('settings.navConnectors'), icon: Plug },
        { id: 'mcp-integrations',        label: t('settings.navMcp'), icon: Server },
      ],
    },
    // 2026-08-11: 0G 分组停用，同步移除 i18n 组（wallet 条目代码保留）
    {
      group: t('settings.groupMemory'),
      items: [
        { id: 'memory-entries', label: t('settings.navMemoryEntries', { defaultValue: 'Memory Entries' }), icon: Brain },
        { id: 'memory-profile', label: t('settings.navMemoryProfile', { defaultValue: 'Memory Profile' }), icon: IdCard },
        { id: 'memory-handoff', label: t('settings.navMemoryHandoff', { defaultValue: 'Handoff & Writeback' }), icon: ArrowRightLeft },
        { id: 'memory-river',   label: t('settings.navRiverMemory'), icon: Waves },
      ],
    },
    {
      group: t('settings.groupData'),
      items: [
        { id: 'schedules',       label: t('settings.navSchedules', { defaultValue: 'Schedules' }), icon: CalendarClock },
        { id: 'notifications',   label: t('settings.navNotifications'), icon: Bell },
        { id: 'advanced',        label: t('settings.navPrivacy'), icon: Shield },
        { id: 'media-providers', label: t('settings.navMedia'), icon: Image },
        { id: 'pet',             label: t('settings.navPet'), icon: PawPrint },
      ],
    },
  ];
}

const DEFAULT_SECTION: SectionId = 'welcome';

function readHashSection(): SectionId | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (raw && ID_SET.has(raw)) return raw as SectionId;
  return null;
}

// ---------------------------------------------------------------------------
// Section wrapper — keeps existing Tailwind / `sf-*` token components
// embedded inside the Neo pane.
// ---------------------------------------------------------------------------

function LegacySectionWrap({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: 760 }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const NAV_GROUPS = useMemo(() => buildNavGroups(t), [t]);

  // 2026-10-31: 设置页返回按钮——用户从齿轮进入后能一键回退。
  // react-router v6 在 history.state 里存 idx：>0 说明有站内历史可回退，
  // 否则（新标签直开 / 刷新后首条）兜底回主页，避免退出站点。
  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  // Default = welcome. Persists via window.location.hash so refresh + deep
  // links work.
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    return readHashSection() ?? DEFAULT_SECTION;
  });

  // Sync hash — state when user uses browser back/forward.
  useEffect(() => {
    function onHash() {
      const next = readHashSection();
      if (next && next !== activeSection) setActiveSection(next);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [activeSection]);

  // Sync state — hash (only when changed by user; avoids writing on initial
  // load if the hash already matches).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = window.location.hash.replace(/^#\/?/, '').trim();
    if (current !== activeSection) {
      // Use replaceState so it doesn't clutter history with every click.
      const newUrl = `${window.location.pathname}${window.location.search}#${activeSection}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [activeSection]);

  // 键盘 ↑/↓ 在导航项间移动（2026-11-06 优化批）：rAF 内滚动保证聚焦项可见。
  // 注意依赖闭包里用最新 state（handler 每次渲染重建），focus 走 data-attr 查询。
  const handleNavKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const flat = NAV_GROUPS.flatMap((g) => g.items);
    if (flat.length === 0) return;
    const idx = flat.findIndex((it) => it.id === activeSection);
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const next = flat[(idx + delta + flat.length) % flat.length] ?? flat[0];
    if (next && next.id !== activeSection) setActiveSection(next.id);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-section-id="${next.id}"]`)
        ?.focus();
    });
  };

  // local-cli / byok / clawhub 的 section 自带全高布局（头部 + 内部滚动），外壳不滚不留白
  const bare = activeSection === 'local-cli' || activeSection === 'byok' || activeSection === 'clawhub';

  return (
    <div className={`neo-settings${bare ? ' st-bare' : ''}`} data-testid="settings-page">
      {/* ── 212px settings nav（NeoRail 同款层次：灰栏 + hairline 分隔） ── */}
      <aside className="neo-st-side">
        {/* 侧栏头部：返回按钮（Z Code 式行钮；顶栏移除后的唯一返回入口） */}
        <button
          type="button"
          className="neo-st-back"
          data-testid="settings-back"
          onClick={handleBack}
          aria-label={t('settings.back', { defaultValue: '返回' })}
          title={t('settings.back', { defaultValue: '返回' })}
        >
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden />
          <span>{t('settings.back', { defaultValue: '返回' })}</span>
        </button>

        <nav className="neo-st-nav" onKeyDown={handleNavKeyDown}>
          {NAV_GROUPS.map((g) => (
            <div key={g.group} className="neo-st-group">
              {/* 分组标签（复刻 .neo-section-label） */}
              <div className="neo-st-group-label">{g.group}</div>
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-section-id={item.id}
                    className={`neo-st-row${active ? ' on' : ''}`}
                    onClick={() => setActiveSection(item.id)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={15} strokeWidth={1.8} aria-hidden />
                    <span className="neo-st-row-name">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── 右侧内容区（纯白 panel + 细滚动条） ── */}
      <main className="neo-st-main">
        <div
          key={activeSection}
          className={`neo-st-content${bare ? ' bare' : ''}`}
        >
          {/* 账户（关于已并入 welcome 页内；about 仅为旧 hash 兼容保留） */}
          {activeSection === 'welcome'   && <LegacySectionWrap><WelcomeSection /></LegacySectionWrap>}
          {activeSection === 'about'     && <LegacySectionWrap><WelcomeSection /></LegacySectionWrap>}

          {/* 外观 */}
          {activeSection === 'appearance' && <LegacySectionWrap><AppearanceSection /></LegacySectionWrap>}
          {activeSection === 'language'   && <LegacySectionWrap><LanguageSection /></LegacySectionWrap>}

          {/* 集成 */}
          {activeSection === 'skills-catalog' && <LegacySectionWrap><SkillsCatalogTab /></LegacySectionWrap>}
          {activeSection === 'clawhub' && <ClawHubPage embedded />}
          {activeSection === 'local-cli' && <LocalCLISection />}
          {activeSection === 'byok'      && <ByokSection />}
          {activeSection === 'skill-studio-generation' && (
            <LegacySectionWrap>
              <GenerationSettings />
            </LegacySectionWrap>
          )}
          {activeSection === 'skill-studio-acp' && (
            <LegacySectionWrap>
              <AcpAgentsPanel />
            </LegacySectionWrap>
          )}
          {activeSection === 'tool-providers'    && <LegacySectionWrap><ToolProvidersTab /></LegacySectionWrap>}
          {activeSection === 'connectors'        && <LegacySectionWrap><ConnectorsSection /></LegacySectionWrap>}
          {activeSection === 'mcp-integrations'  && <LegacySectionWrap><McpIntegrationsSection /></LegacySectionWrap>}

          {/* 0G（停用保留，仅 hash 深链可达） */}
          {activeSection === 'wallet'  && <WalletSection />}

          {/* 记忆（2026-11-06 折叠批）：左栏一级「记忆」入口下线，整体并入设置。
              memory-entries 自带 0 padding，右栏留白直接复用。 */}
          {activeSection === 'memory-entries' && <MemoryPage settings />}
          {/* 画像区块自带 860 上限；交接卡片按设置右栏整宽（原记忆页也是整宽），
              套 760 会把一行四输入 + 按钮挤到换行。 */}
          {activeSection === 'memory-profile' && <MemoryProfilePanel />}
          {activeSection === 'memory-handoff' && <MemoryHandoffPanel />}
          {activeSection === 'memory-river'   && <LegacySectionWrap><MemorySection /></LegacySectionWrap>}

          {/* 数据 */}
          {activeSection === 'schedules'        && <LegacySectionWrap><SchedulesSection /></LegacySectionWrap>}
          {activeSection === 'notifications'    && <LegacySectionWrap><NotificationsSection /></LegacySectionWrap>}
          {activeSection === 'advanced'         && <LegacySectionWrap><AdvancedSection /></LegacySectionWrap>}
          {activeSection === 'media-providers'  && <LegacySectionWrap><MediaProvidersSection /></LegacySectionWrap>}
          {activeSection === 'pet'              && <LegacySectionWrap><PetSettings /></LegacySectionWrap>}
        </div>
      </main>
    </div>
  );
}
