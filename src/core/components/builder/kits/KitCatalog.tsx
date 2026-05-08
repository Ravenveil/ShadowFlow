/**
 * KitCatalog — Story 10.5 (AC3)
 *
 * 在 Builder 入口页的「选择 Kit」步骤中展示 4 个 Kit 卡片网格：
 *   - Research Kit（规划-搜集-总结-报告）
 *   - Knowledge Assistant Kit（知识问答-引用-转人工）
 *   - Review & Approval Kit（Writer-Reviewer-Approver）
 *   - Persona / NPC Kit（角色记忆-状态-关系）
 *
 * 支持 category 筛选 Tab + 本地搜索框。
 * 点击「使用此 Kit」按钮后调用 onSelectKit(kit) 回调，
 * 由 BuilderPage 路由到对应向导。
 */
import { useState, useEffect, useMemo } from 'react';
import { listKits } from '../../../../api/builder';
import type { KitDefinition, KitCategory } from '../../../../common/types/kits';
import { Icon, Search } from '../../../../common/icons/iconRegistry';

// ---------------------------------------------------------------------------
// 静态占位 Kit 数据（API 加载失败时的 fallback / 开发期骨架）
// ---------------------------------------------------------------------------

const FALLBACK_KITS: KitDefinition[] = [
  {
    kit_id: 'research_kit',
    display_name: 'Research Kit',
    description: '规划 → 搜集 → 总结的多步骤研究 Agent，输出结构化报告。',
    category: 'research',
    supported_modes: ['goal', 'scene', 'graph'],
    default_result_view: 'research_report',
    recommended_inputs: ['research_topic', 'output_format', 'depth', 'audience'],
    icon: '🔬',
  },
  {
    kit_id: 'knowledge_assistant_kit',
    display_name: 'Knowledge Assistant Kit',
    description: '基于知识库的问答 Agent，支持引用来源，并在必要时转接人工客服。',
    category: 'knowledge',
    supported_modes: ['goal', 'scene'],
    default_result_view: 'agent_dm_with_state',
    recommended_inputs: ['knowledge_source', 'citation_mode', 'handoff_threshold'],
    icon: '📚',
  },
  {
    kit_id: 'review_approval_kit',
    display_name: 'Review & Approval Kit',
    description: 'Writer → Reviewer → Approver 三级审批流水线，确保内容质量。',
    category: 'review',
    supported_modes: ['goal', 'scene', 'graph'],
    default_result_view: 'approval_inbox',
    recommended_inputs: ['document_type', 'approval_level', 'reviewer_count'],
    icon: '✅',
  },
  {
    kit_id: 'persona_npc_kit',
    display_name: 'Persona / NPC Kit',
    description: '有角色记忆与状态的 NPC / 人物扮演 Agent，支持持久化关系图谱。',
    category: 'persona',
    supported_modes: ['goal', 'scene'],
    default_result_view: 'agent_dm_with_state',
    recommended_inputs: ['persona_name', 'persona_background', 'memory_mode', 'relationship_graph'],
    icon: '🎭',
  },
];

// ---------------------------------------------------------------------------
// Category Tab 定义
// ---------------------------------------------------------------------------

interface CategoryTab {
  key: KitCategory | 'all';
  label: string;
}

const CATEGORY_TABS: CategoryTab[] = [
  { key: 'all', label: '全部' },
  { key: 'research', label: '研究' },
  { key: 'knowledge', label: '知识库' },
  { key: 'review', label: '审批' },
  { key: 'persona', label: '角色' },
];

const CATEGORY_LABEL_MAP: Record<string, string> = {
  research: '研究',
  knowledge: '知识库',
  review: '审批',
  persona: '角色',
  custom: '自定义',
};

const MODE_LABEL_MAP: Record<string, string> = {
  goal: 'Goal',
  scene: 'Scene',
  graph: 'Graph',
};

// ---------------------------------------------------------------------------
// KitCard 子组件
// ---------------------------------------------------------------------------

interface KitCardProps {
  kit: KitDefinition;
  onSelect: (kit: KitDefinition) => void;
  isSelected?: boolean;
}

function KitCard({ kit, onSelect, isSelected }: KitCardProps) {
  return (
    <div
      className={[
        'group relative flex flex-col rounded-[14px] border p-5 transition-all duration-150',
        'bg-sf-panel hover:border-sf-accent/60 hover:shadow-[0_0_0_1px_rgba(var(--sf-accent-raw),0.15)]',
        isSelected
          ? 'border-sf-accent shadow-[0_0_0_1px_rgba(var(--sf-accent-raw),0.25)]'
          : 'border-sf-border',
      ].join(' ')}
      data-testid={`kit-card-${kit.kit_id}`}
    >
      {/* Icon + 标题行 */}
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 inline-flex items-center justify-center text-sf-fg2" aria-hidden="true">
          <Icon token={kit.icon} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-sf-fg1">
            {kit.display_name}
          </h3>
          {/* Category 标签 */}
          <span className="mt-0.5 inline-block rounded-[4px] bg-sf-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-sf-accent-bright">
            {CATEGORY_LABEL_MAP[kit.category] ?? kit.category}
          </span>
        </div>
      </div>

      {/* Description（2 行截断）*/}
      <p className="mb-4 line-clamp-2 flex-1 text-[13px] leading-relaxed text-sf-fg3">
        {kit.description}
      </p>

      {/* Supported modes 标签 */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {kit.supported_modes.map((mode) => (
          <span
            key={mode}
            className="rounded-[4px] border border-sf-border bg-sf-surface px-1.5 py-0.5 font-mono text-[10px] text-sf-fg4"
          >
            {MODE_LABEL_MAP[mode] ?? mode}
          </span>
        ))}
      </div>

      {/* 使用此 Kit 按钮 */}
      <button
        type="button"
        onClick={() => onSelect(kit)}
        className={[
          'w-full rounded-[8px] py-2 font-mono text-[12px] font-bold transition-all duration-150',
          isSelected
            ? 'bg-sf-accent text-white'
            : 'border border-sf-accent/40 text-sf-accent-bright hover:bg-sf-accent hover:text-white',
        ].join(' ')}
        data-testid={`kit-select-btn-${kit.kit_id}`}
      >
        {isSelected ? '✓ 已选择' : '使用此 Kit'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KitCatalog 主组件
// ---------------------------------------------------------------------------

export interface KitCatalogProps {
  /** 用户选择 Kit 后的回调（接收完整 KitDefinition） */
  onSelectKit: (kit: KitDefinition) => void;
  /** 当前已选中的 kit_id（可选，用于高亮） */
  selectedKitId?: string | null;
}

export function KitCatalog({ onSelectKit, selectedKitId }: KitCatalogProps) {
  const [kits, setKits] = useState<KitDefinition[]>(FALLBACK_KITS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<KitCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 从 API 加载 Kit 列表
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    listKits()
      .then((apiKits) => {
        if (cancelled) return;
        if (apiKits.length > 0) {
          setKits(apiKits);
        }
        // API 返回空列表时保留 fallback 数据
      })
      .catch((_err) => {
        if (cancelled) return;
        // API 失败时使用 fallback 数据，不展示错误
        setLoadError(null); // 使用 fallback，静默失败
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 本地过滤（category + 搜索关键词）
  const filteredKits = useMemo(() => {
    let result = kits;

    if (activeCategory !== 'all') {
      result = result.filter((k) => k.category === activeCategory);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (k) =>
          k.display_name.toLowerCase().includes(q) ||
          k.description.toLowerCase().includes(q) ||
          k.category.toLowerCase().includes(q),
      );
    }

    return result;
  }, [kits, activeCategory, searchQuery]);

  return (
    <div className="w-full" data-testid="kit-catalog">
      {/* 标题区 */}
      <div className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sf-accent-bright">
          Kit Catalog
        </p>
        <h2 className="mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-sf-fg1">
          选择一个 Kit 开始构建
        </h2>
        <p className="mt-1 text-[13px] text-sf-fg3">
          每个 Kit 包含默认 Blueprint、Policy 和 Eval 配置，开箱即用。
        </p>
      </div>

      {/* 搜索框 + Category Tabs 行 */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Tabs */}
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Kit 分类筛选">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeCategory === tab.key}
              onClick={() => setActiveCategory(tab.key)}
              className={[
                'shrink-0 rounded-[6px] px-3 py-1.5 font-mono text-[11px] font-medium transition-all',
                activeCategory === tab.key
                  ? 'bg-sf-accent text-white'
                  : 'text-sf-fg3 hover:bg-sf-surface hover:text-sf-fg1',
              ].join(' ')}
              data-testid={`kit-tab-${tab.key}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center text-sf-fg4">
            <Search size={12} strokeWidth={2} />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 Kit 名称或描述..."
            className="w-full rounded-[8px] border border-sf-border bg-sf-surface py-1.5 pl-8 pr-3 text-[13px] text-sf-fg1 placeholder-sf-fg5 outline-none focus:border-sf-accent/60 sm:w-[240px]"
            data-testid="kit-search-input"
          />
        </div>
      </div>

      {/* Loading 状态 */}
      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-[13px] text-sf-fg4" data-testid="kit-loading">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sf-accent/30 border-t-sf-accent" />
          加载 Kit 列表中…
        </div>
      )}

      {/* 错误状态（非 fallback 情况） */}
      {loadError && (
        <div
          className="mb-4 rounded-[8px] border border-sf-reject/30 bg-sf-reject/8 px-3 py-2 text-[12px] text-sf-reject"
          role="alert"
          data-testid="kit-load-error"
        >
          {loadError}
        </div>
      )}

      {/* Kit 卡片网格（2×2，响应式） */}
      {!isLoading && filteredKits.length > 0 ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2"
          data-testid="kit-grid"
        >
          {filteredKits.map((kit) => (
            <KitCard
              key={kit.kit_id}
              kit={kit}
              onSelect={onSelectKit}
              isSelected={kit.kit_id === selectedKitId}
            />
          ))}
        </div>
      ) : (
        !isLoading && (
          <div
            className="rounded-[14px] border border-sf-border py-10 text-center text-[13px] text-sf-fg4"
            data-testid="kit-empty-state"
          >
            没有匹配的 Kit
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="ml-2 text-sf-accent-bright underline hover:no-underline"
              >
                清除搜索
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default KitCatalog;
