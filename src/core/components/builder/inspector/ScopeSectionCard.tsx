/**
 * ScopeSectionCard — Story 13.5 (AC1/AC2)
 *
 * 顶部插件卡片：表达 Agent 是独立助手还是团队成员候选。
 * scope = 'team_member_candidate' 时展开协作配置区。
 */
import { useState } from 'react';
import type { RoleProfile, CollaborationContract, AgentScope, CollaborationStyle } from '../../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// TagInput component
// ---------------------------------------------------------------------------

interface TagInputProps {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  testId?: string;
}

function TagInput({ tags, onChange, placeholder, testId }: TagInputProps) {
  const [inputVal, setInputVal] = useState('');

  function addTag(value: string) {
    // Story 13.5 Round-1 LOW-1: trim + 大小写归一化，避免 'Planner' / 'planner' 视为不同
    const normalized = value.trim().toLowerCase();
    if (normalized && !tags.some((t) => t.toLowerCase() === normalized)) {
      onChange([...tags, normalized]);
    }
    setInputVal('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div
      data-testid={testId}
      className="flex min-h-[36px] flex-wrap gap-1.5 rounded-[7px] border border-sf-border bg-sf-elev1 px-2 py-1.5"
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-[4px] bg-sf-elev3 px-2 py-0.5 font-mono text-[11px] text-sf-fg2"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-0.5 text-[10px] text-sf-fg5 hover:text-sf-reject"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => inputVal && addTag(inputVal)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="min-w-[80px] flex-1 bg-transparent text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:outline-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScopeSectionCard
// ---------------------------------------------------------------------------

export interface ScopeSectionCardProps {
  role: RoleProfile;
  onUpdate: (patch: Partial<RoleProfile>) => void;
}

export function ScopeSectionCard({ role, onUpdate }: ScopeSectionCardProps) {
  const contract = role.collaboration_contract;
  const scope: AgentScope = contract?.scope ?? 'standalone';
  const acceptsFrom: string[] = contract?.accepts_from ?? [];
  const deliversTo: string[] = contract?.delivers_to ?? [];
  const collabStyle: CollaborationStyle = contract?.collaboration_style ?? 'push';

  function setScope(newScope: AgentScope) {
    if (newScope === 'standalone') {
      // 切回独立助手时置空 collaboration_contract
      onUpdate({ collaboration_contract: undefined });
    } else {
      onUpdate({
        collaboration_contract: {
          scope: newScope,
          accepts_from: acceptsFrom,
          delivers_to: deliversTo,
          collaboration_style: collabStyle,
        },
      });
    }
  }

  function patchContract(patch: Partial<CollaborationContract>) {
    // Story 13.5 Round-1 MEDIUM-1: scope 不在 patch 内硬编码，从当前 contract 派生；
    // patchContract 仅在 scope === 'team_member_candidate' 渲染分支内调用，因此
    // 当前 scope 必为 team_member_candidate；显式 spread 现状再叠加 patch，单一入口。
    const base: CollaborationContract = {
      scope,
      accepts_from: acceptsFrom,
      delivers_to: deliversTo,
      collaboration_style: collabStyle,
    };
    onUpdate({
      collaboration_contract: { ...base, ...patch },
    });
  }

  return (
    <div
      data-testid="scope-section-card"
      className="border-b border-sf-border/50 px-4 pb-3 pt-3"
    >
      {/* Header label */}
      <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-fg4">
        Agent Scope
      </p>

      {/* Scope toggle buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="scope-standalone-btn"
          onClick={() => setScope('standalone')}
          className={[
            'rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold transition-colors',
            scope === 'standalone'
              ? 'border-sf-accent bg-sf-accent-tint text-sf-accent-bright'
              : 'border-sf-border bg-sf-elev2 text-sf-fg3 hover:text-sf-fg1',
          ].join(' ')}
        >
          独立助手
        </button>
        <button
          type="button"
          data-testid="scope-team-candidate-btn"
          onClick={() => setScope('team_member_candidate')}
          className={[
            'rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold transition-colors',
            scope === 'team_member_candidate'
              ? 'border-sf-accent bg-sf-accent-tint text-sf-accent-bright'
              : 'border-sf-border bg-sf-elev2 text-sf-fg3 hover:text-sf-fg1',
          ].join(' ')}
        >
          团队成员候选
        </button>
      </div>

      {/* Collaboration config — only visible when team_member_candidate */}
      {scope === 'team_member_candidate' && (
        <div className="mt-3 space-y-3 rounded-[8px] border border-sf-border/60 bg-sf-elev1 px-3 py-2.5">
          {/* accepts_from */}
          <div>
            <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-fg4">
              接受来自 (accepts_from)
            </p>
            <TagInput
              tags={acceptsFrom}
              onChange={(next) => patchContract({ accepts_from: next })}
              placeholder="输入角色类型后按 Enter"
              testId="accepts-from-tags"
            />
          </div>

          {/* delivers_to */}
          <div>
            <p className="mb-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-fg4">
              交付给 (delivers_to)
            </p>
            <TagInput
              tags={deliversTo}
              onChange={(next) => patchContract({ delivers_to: next })}
              placeholder="输入角色类型后按 Enter"
              testId="delivers-to-tags"
            />
          </div>

          {/* collaboration_style */}
          <div>
            <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sf-fg4">
              协作方式
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="collab-style-push"
                onClick={() => patchContract({ collaboration_style: 'push' })}
                className={[
                  'rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  collabStyle === 'push'
                    ? 'border-sf-accent bg-sf-accent-tint text-sf-accent-bright'
                    : 'border-sf-border bg-sf-elev2 text-sf-fg3 hover:text-sf-fg1',
                ].join(' ')}
              >
                推式 (push)
              </button>
              <button
                type="button"
                data-testid="collab-style-pull"
                onClick={() => patchContract({ collaboration_style: 'pull' })}
                className={[
                  'rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  collabStyle === 'pull'
                    ? 'border-sf-accent bg-sf-accent-tint text-sf-accent-bright'
                    : 'border-sf-border bg-sf-elev2 text-sf-fg3 hover:text-sf-fg1',
                ].join(' ')}
              >
                拉式 (pull)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
