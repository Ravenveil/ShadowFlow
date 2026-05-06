import React, { useRef, useState } from 'react';
import {
  importCustomTemplate,
  TemplateConflictError,
  TemplateValidationError,
  type PydanticValidationError,
} from '../../../api/templates';
import type { Template } from '../../../common/types/template';

interface ImportTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (tpl: Template & { source: 'seed' | 'custom' }) => void;
}

const TEMPLATE_ID_RE = /^[a-z0-9-]{3,40}$/;

const PLACEHOLDER_YAML = `template_id: my-team
version: "0.1"
name: My Team
description: ""
user_role: Founder
default_ops_room_name: ""
brief_board_alias: BriefBoard
theme_color: "#A78BFA"
agent_roster: []
group_roster: []
parameters:
  goal:
    type: string
    required: true
agents:
  - id: agent_1
    ref: agent_1
flow:
  entrypoint: agent_1
  edges:
    - from: agent_1
      to: END
      type: final
policy_matrix:
  agents: {}
stages: []
defaults: {}
metadata: {}
`.trim();

export function ImportTemplateDialog({ open, onClose, onImported }: ImportTemplateDialogProps) {
  const [yamlText, setYamlText] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [userRole, setUserRole] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setYamlText((ev.target?.result as string) ?? '');
    reader.readAsText(file, 'utf-8');
  }

  function localValidate(): string[] {
    const errs: string[] = [];
    if (!yamlText.trim()) errs.push('YAML 内容不能为空');
    if (!templateId.trim()) errs.push('Template ID 必填');
    else if (!TEMPLATE_ID_RE.test(templateId.trim())) errs.push('Template ID 只能包含小写字母、数字和短横线，长度 3-40');
    return errs;
  }

  async function handleImport() {
    const localErrs = localValidate();
    if (localErrs.length) { setErrors(localErrs); return; }
    setErrors([]);
    setLoading(true);
    try {
      const overrides: Record<string, string> = { template_id: templateId.trim() };
      if (userRole.trim()) overrides.user_role = userRole.trim();
      const tpl = await importCustomTemplate({ yaml_text: yamlText, overrides });
      setYamlText('');
      setTemplateId('');
      setUserRole('');
      onImported(tpl);
      onClose();
    } catch (err) {
      if (err instanceof TemplateConflictError) {
        setErrors([`Template ID 已被占用，请换一个名字（已存在于 ${err.conflictDetail.existing_source}）`]);
      } else if (err instanceof TemplateValidationError) {
        setErrors(
          err.errors.map((e: PydanticValidationError) =>
            e.loc.length ? `${e.loc.join('.')}: ${e.msg}` : e.msg,
          ),
        );
      } else {
        setErrors([String(err)]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#0D1117',
          borderRadius: 14,
          border: '1px solid #30363D',
          padding: '28px 32px',
          width: 560,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Title */}
        <h2 style={{ color: '#E6EDF3', margin: 0, fontSize: 18, fontWeight: 600 }}>
          + 新建模板（从 YAML 导入）
        </h2>

        {/* YAML input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: '#8B949E', fontSize: 13 }}>YAML 内容</label>
          <textarea
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            placeholder={PLACEHOLDER_YAML}
            rows={10}
            style={{
              background: '#161B22', color: '#E6EDF3',
              border: '1px solid #30363D', borderRadius: 8,
              padding: '10px 12px', fontFamily: 'monospace', fontSize: 12,
              resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#8B949E', fontSize: 12 }}>或上传文件:</span>
            <input
              ref={fileRef}
              type="file"
              accept=".yaml,.yml"
              onChange={handleFileChange}
              style={{ color: '#8B949E', fontSize: 12 }}
            />
          </div>
        </div>

        {/* Override fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: '#8B949E', fontSize: 13 }}>
            Template ID <span style={{ color: '#F85149' }}>*</span>
          </label>
          <input
            type="text"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="my-company"
            style={{
              background: '#161B22', color: '#E6EDF3',
              border: '1px solid #30363D', borderRadius: 8,
              padding: '8px 12px', fontSize: 14, outline: 'none',
            }}
          />
          <span style={{ color: '#6E7681', fontSize: 11 }}>小写字母、数字和短横线，3-40 个字符</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: '#8B949E', fontSize: 13 }}>User Role（可选）</label>
          <input
            type="text"
            value={userRole}
            onChange={(e) => setUserRole(e.target.value)}
            placeholder="CEO / Founder / PI ..."
            style={{
              background: '#161B22', color: '#E6EDF3',
              border: '1px solid #30363D', borderRadius: 8,
              padding: '8px 12px', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {/* Error display */}
        {errors.length > 0 && (
          <div style={{
            background: '#1A0000', border: '1px solid #F85149',
            borderRadius: 8, padding: '10px 14px',
          }}>
            {errors.map((e, i) => (
              <div key={i} style={{ color: '#F85149', fontSize: 13 }}>{e}</div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          {/* + 加入企业 — AC6 disabled placeholder */}
          <button
            disabled
            title="多租户企业模式 · Phase 3 启用"
            style={{
              marginRight: 'auto',
              background: 'transparent', color: '#6E7681',
              border: '1px solid #30363D', borderRadius: 8,
              padding: '8px 14px', fontSize: 13, cursor: 'not-allowed',
            }}
          >
            + 加入企业
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'transparent', color: '#8B949E',
              border: '1px solid #30363D', borderRadius: 8,
              padding: '8px 18px', fontSize: 14, cursor: 'pointer',
            }}
          >
            取消
          </button>

          <button
            onClick={handleImport}
            disabled={loading}
            style={{
              background: loading ? '#5B4F8A' : '#A78BFA',
              color: '#0D1117',
              border: 'none', borderRadius: 8,
              padding: '8px 22px', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading && (
              <span style={{
                display: 'inline-block', width: 14, height: 14,
                border: '2px solid #0D1117', borderTopColor: 'transparent',
                borderRadius: '50%', animation: 'spin 0.7s linear infinite',
              }} />
            )}
            {loading ? '导入中...' : '导入'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
