/**
 * CreateGroupDialog — Story 7.3 (AC1 / AC2 / AC3 / AC4)
 *
 * 5-step wizard for creating a new group chat:
 *   Step 1 — Select group template
 *   Step 2 — Select agent roster
 *   Step 3 — Invite human members (MVP: UI only, no real send)
 *   Step 4 — Name the group
 *   Step 5 — Preview policy matrix (read-only)
 */

import { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PolicyMatrixPanel } from '../Panel/PolicyMatrixPanel';
import { createGroup } from '../../../api/groupApi';
import { getTemplate } from '../../../api/templates';
import { useInboxStore } from '../../store/useInboxStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import type { GroupItem } from '../../../common/types/inbox';
import { useI18n } from '../../../common/i18n';

// ---------------------------------------------------------------------------
// Types (matches backend template response shape)
// ---------------------------------------------------------------------------

interface AgentRosterEntry {
  id: string;
  name: string;
  soul: string;
  llm: string;
  tools: string[];
}

interface GroupTemplateSpec {
  id: string;
  name: string;
  agents: string[];
  policy_matrix: string;
}

interface TemplateSpec {
  agent_roster: AgentRosterEntry[];
  group_roster: GroupTemplateSpec[];
  policy_matrix: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  selectedGroupTemplate: GroupTemplateSpec | null;
  selectedAgentIds: string[];
  memberEmails: string;
  groupName: string;
}

type WizardAction =
  | { type: 'SET_STEP'; step: WizardState['step'] }
  | { type: 'SELECT_GROUP_TEMPLATE'; template: GroupTemplateSpec }
  | { type: 'TOGGLE_AGENT'; agentId: string }
  | { type: 'SET_MEMBER_EMAILS'; value: string }
  | { type: 'SET_GROUP_NAME'; value: string }
  | { type: 'RESET' };

const initialState: WizardState = {
  step: 1,
  selectedGroupTemplate: null,
  selectedAgentIds: [],
  memberEmails: '',
  groupName: '',
};

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SELECT_GROUP_TEMPLATE': {
      const tpl = action.template;
      return {
        ...state,
        selectedGroupTemplate: tpl,
        selectedAgentIds: [...tpl.agents],
        groupName: state.groupName || tpl.name,
      };
    }
    case 'TOGGLE_AGENT':
      return {
        ...state,
        selectedAgentIds: state.selectedAgentIds.includes(action.agentId)
          ? state.selectedAgentIds.filter((id) => id !== action.agentId)
          : [...state.selectedAgentIds, action.agentId],
      };
    case 'SET_MEMBER_EMAILS':
      return { ...state, memberEmails: action.value };
    case 'SET_GROUP_NAME':
      return { ...state, groupName: action.value };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WizardStepIndicator({ current, total }: { current: number; total: number }) {
  const { t } = useI18n();
  return (
    <div role="list" aria-label={t('inbox.createGroup.wizardStepsLabel')} className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const active = step === current;
        const done = step < current;
        return (
          <div key={step} role="listitem" className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                active
                  ? 'bg-[#A78BFA] text-white'
                  : done
                    ? 'bg-[#A78BFA]/40 text-[#A78BFA]'
                    : 'bg-white/10 text-white/40'
              }`}
            >
              {done ? '✓' : step}
            </div>
            {step < total && (
              <div
                className={`h-px w-6 ${done ? 'bg-[#A78BFA]/40' : 'bg-white/10'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GroupTemplateSelector({
  templates,
  selected,
  onSelect,
}: {
  templates: GroupTemplateSpec[];
  selected: GroupTemplateSpec | null;
  onSelect: (t: GroupTemplateSpec) => void;
}) {
  const { t } = useI18n();
  if (templates.length === 0) {
    return (
      <p className="text-sm text-white/40">{t('inbox.createGroup.noTemplates')}</p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {templates.map((tpl) => {
        const isSelected = selected?.id === tpl.id;
        return (
          <button
            key={tpl.id}
            type="button"
            data-testid={`group-template-${tpl.id}`}
            onClick={() => onSelect(tpl)}
            className={`rounded-sf border p-4 text-left transition ${
              isSelected
                ? 'border-[#A78BFA] bg-[#A78BFA]/10'
                : 'border-white/10 hover:border-white/25'
            }`}
          >
            <p className="font-medium text-white">{tpl.name}</p>
            <p className="mt-1 text-xs text-white/45">
              {tpl.agents.length > 0
                ? `${tpl.agents.slice(0, 3).join(', ')}${tpl.agents.length > 3 ? ` +${tpl.agents.length - 3} more` : ''}`
                : t('inbox.createGroup.noAgents')}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function AgentRosterSelector({
  agents,
  availableAgents,
  selected,
  onToggle,
}: {
  agents: string[];
  availableAgents: AgentRosterEntry[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useI18n();
  const kindBadgeFor = (id: string) => {
    const a = availableAgents.find((x) => x.id === id);
    return a?.llm ? 'ACP' : 'CLI';
  };
  const soulFor = (id: string) => availableAgents.find((x) => x.id === id)?.soul ?? '';
  const nameFor = (id: string) => availableAgents.find((x) => x.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-2">
      {agents.map((agentId) => {
        const checked = selected.includes(agentId);
        return (
          <label
            key={agentId}
            className="flex cursor-pointer items-start gap-3 rounded-sf border border-white/10 p-3 transition hover:border-white/25"
          >
            <input
              type="checkbox"
              data-testid={`agent-check-${agentId}`}
              checked={checked}
              onChange={() => onToggle(agentId)}
              className="mt-0.5 accent-[#A78BFA]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{nameFor(agentId)}</span>
                <span className="rounded px-1.5 py-0.5 font-mono text-[10px] bg-white/10 text-white/60">
                  {kindBadgeFor(agentId)}
                </span>
              </div>
              {soulFor(agentId) && (
                <p className="mt-0.5 truncate text-xs text-white/40">{soulFor(agentId)}</p>
              )}
            </div>
          </label>
        );
      })}
      {agents.length === 0 && (
        <p className="text-sm text-white/40">{t('inbox.createGroup.noAgents')}</p>
      )}
    </div>
  );
}

function MemberEmailInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <textarea
        data-testid="member-emails-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={t('inbox.createGroup.memberEmailPlaceholder')}
        className="w-full rounded-sf border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-[#A78BFA]/60"
      />
      <p className="text-xs text-white/35">{t('inbox.createGroup.memberEmailHint')}</p>
    </div>
  );
}

function GroupNameInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const MAX = 40;
  return (
    <div className="flex flex-col gap-2">
      <input
        data-testid="group-name-input"
        type="text"
        value={value}
        maxLength={MAX}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('inbox.createGroup.groupNamePlaceholder')}
        className="h-10 w-full rounded-sf border border-white/10 bg-white/5 px-3 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-[#A78BFA]/60"
      />
      <p className={`text-right text-xs ${value.length >= MAX ? 'text-red-400' : 'text-white/35'}`}>
        {value.length} / {MAX}
      </p>
    </div>
  );
}

function PolicyMatrixPreview() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <PolicyMatrixPanel readOnly />
      <p className="text-xs text-white/40">
        {t('inbox.createGroup.policyHint')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  templateId: string;
}

export function CreateGroupDialog({ open, onClose, templateId }: CreateGroupDialogProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  // 2026-05-28 — 群必须绑定 workspace，否则切换工作区时这条会"挂在所有空间"
  // 共享显示。从 workspaceStore 取当前 id，没有就 fall back 到 'default'。
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentId) ?? undefined;
  const [state, dispatch] = useReducer(reducer, initialState);
  const [templateSpec, setTemplateSpec] = useState<TemplateSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const addGroup = useInboxStore((s) => s.addGroup);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch template spec when dialog opens
  useEffect(() => {
    if (!open) return;
    dispatch({ type: 'RESET' });
    setError(null);
    getTemplate(templateId)
      .then((data) => {
        setTemplateSpec({
          agent_roster: data.agent_roster ?? [],
          group_roster: data.group_roster ?? [],
          policy_matrix: data.policy_matrix ?? {},
        });
      })
      .catch(() => setTemplateSpec({ agent_roster: [], group_roster: [], policy_matrix: {} }));
  }, [open, templateId]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  const validateStep = (): string | null => {
    if (state.step === 1 && !state.selectedGroupTemplate) return t('inbox.createGroup.validateTemplate');
    if (state.step === 4 && !state.groupName.trim()) return t('inbox.createGroup.validateName');
    return null;
  };

  const handleNext = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    if (state.step < 5) dispatch({ type: 'SET_STEP', step: (state.step + 1) as WizardState['step'] });
  };

  const handleBack = () => {
    setError(null);
    if (state.step > 1) dispatch({ type: 'SET_STEP', step: (state.step - 1) as WizardState['step'] });
  };

  const handleSubmit = async () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createGroup({
        templateId,
        groupTemplateId: state.selectedGroupTemplate?.id ?? '',
        name: state.groupName.trim(),
        agentIds: state.selectedAgentIds,
        memberEmails: state.memberEmails
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        policyMatrix: {},
        workspaceId: currentWorkspaceId,
      });
      // Append to store without re-fetching
      const newGroup: GroupItem = {
        id: result.groupId,
        name: result.name,
        templateId: result.templateId,
        status: 'idle',
        unreadCount: 0,
        pendingApprovalsCount: 0,
        lastMessage: '',
        lastActivityAt: result.createdAt,
      };
      addGroup(newGroup);
      showToast(t('inbox.createGroup.created').replace('{name}', result.name));
      onClose();
      navigate(`/chat/${result.groupId}`);
    } catch (e) {
      /* TODO: i18n — no locale key for generic create error fallback */
      setError(e instanceof Error ? e.message : '创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const groupRoster = templateSpec?.group_roster ?? [];
  const agentRoster = templateSpec?.agent_roster ?? [];

  const STEP_TITLES: Record<number, string> = {
    1: t('inbox.createGroup.step1'),
    2: t('inbox.createGroup.step2'),
    3: t('inbox.createGroup.step3'),
    4: t('inbox.createGroup.step4'),
    5: t('inbox.createGroup.step5'),
  };

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          role="status"
          data-testid="create-group-toast"
          className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 rounded-sf bg-[#22C55E] px-5 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      {/* Backdrop */}
      <div
        data-testid="create-group-dialog-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Card */}
        <div
          data-testid="create-group-dialog"
          className="relative flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-sf bg-[#161B22] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-white/5 px-6 py-5">
            <div>
              <p className="text-xs text-white/40">{t('inbox.createGroup.stepLabel').replace('{current}', String(state.step)).replace('{total}', '5')}</p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                {STEP_TITLES[state.step]}
              </h2>
            </div>
            <button
              type="button"
              aria-label={t('inbox.createGroup.closeLabel')}
              onClick={onClose}
              className="text-white/40 hover:text-white/70"
            >
              ✕
            </button>
          </div>

          {/* Step indicator */}
          <div className="border-b border-white/5 px-6 py-3">
            <WizardStepIndicator current={state.step} total={5} />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {state.step === 1 && (
              <GroupTemplateSelector
                templates={groupRoster}
                selected={state.selectedGroupTemplate}
                onSelect={(t) => {
                  dispatch({ type: 'SELECT_GROUP_TEMPLATE', template: t });
                  setError(null);
                }}
              />
            )}
            {state.step === 2 && (
              <AgentRosterSelector
                agents={state.selectedGroupTemplate?.agents ?? []}
                availableAgents={agentRoster}
                selected={state.selectedAgentIds}
                onToggle={(id) => dispatch({ type: 'TOGGLE_AGENT', agentId: id })}
              />
            )}
            {state.step === 3 && (
              <MemberEmailInput
                value={state.memberEmails}
                onChange={(v) => dispatch({ type: 'SET_MEMBER_EMAILS', value: v })}
              />
            )}
            {state.step === 4 && (
              <GroupNameInput
                value={state.groupName}
                onChange={(v) => dispatch({ type: 'SET_GROUP_NAME', value: v })}
              />
            )}
            {state.step === 5 && <PolicyMatrixPreview />}

            {error && (
              <p
                data-testid="wizard-error"
                className="mt-4 rounded-sf border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
            <button
              type="button"
              onClick={handleBack}
              disabled={state.step === 1}
              className="rounded-sf px-4 py-2 text-sm text-white/60 hover:text-white disabled:opacity-0"
            >
              {t('inbox.createGroup.back')}
            </button>
            {state.step < 5 ? (
              <button
                type="button"
                data-testid="wizard-next"
                onClick={handleNext}
                className="rounded-sf bg-[#A78BFA]/20 px-5 py-2 text-sm font-medium text-[#A78BFA] transition hover:bg-[#A78BFA]/30"
              >
                {t('inbox.createGroup.nextStep')}
              </button>
            ) : (
              <button
                type="button"
                data-testid="wizard-create"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-sf bg-[#A78BFA] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#A78BFA]/80 disabled:opacity-60"
              >
                {submitting ? t('inbox.createGroup.creating') : t('inbox.createGroup.createBtn')}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
