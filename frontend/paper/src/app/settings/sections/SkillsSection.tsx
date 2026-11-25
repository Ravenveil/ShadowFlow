/**
 * SkillsSection — 设置里的「技能」：技能目录的真身在后端 `/api/skills`。
 *
 * 只做三件事：开 / 关（影响主控路由与召回）、删自建技能、重扫磁盘。
 * 内置技能（source=builtin）后端拒绝删除，这里就不出删除按钮 —— 不给假按钮。
 * 文案在 `content/settings.ts` 的 SETTINGS_COPY.skills。
 */
import { useCallback, useEffect, useState } from 'react';
import { SETTINGS_COPY } from '@/shared/content/settings';
import {
  deleteSkill,
  isBuiltinSkill,
  listSkills,
  reloadSkills,
  setSkillEnabled,
  type SkillRecord,
} from '@/shared/data/http/skills';
import { Tile } from '@/app/settings/primitives';

const C = SETTINGS_COPY.skills;

export function SkillsSection() {
  const [rows, setRows] = useState<SkillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 删除要按两次：第一次只是把按钮变成「确认删除」。 */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listSkills());
      setError(null);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (skill: SkillRecord) => {
    const next = !skill.enabled;
    setBusyId(skill.skill_id);
    setRows((list) => list.map((s) => (s.skill_id === skill.skill_id ? { ...s, enabled: next } : s)));
    try {
      await setSkillEnabled(skill.skill_id, next);
    } catch (err) {
      // 失败就把开关拨回去，别让界面停在「以为成功了」的状态
      setRows((list) =>
        list.map((s) => (s.skill_id === skill.skill_id ? { ...s, enabled: !next } : s)),
      );
      setError(String((err as Error)?.message ?? err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (skill: SkillRecord) => {
    if (confirmId !== skill.skill_id) {
      setConfirmId(skill.skill_id);
      return;
    }
    setBusyId(skill.skill_id);
    try {
      await deleteSkill(skill.skill_id);
      setRows((list) => list.filter((s) => s.skill_id !== skill.skill_id));
      setConfirmId(null);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setBusyId(null);
    }
  };

  const rescan = async () => {
    setBusyId('__reload__');
    try {
      await reloadSkills();
      await load();
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setBusyId(null);
    }
  };

  const on = rows.filter((s) => s.enabled).length;

  return (
    <div className="st-stack">
      <div className="st-toolbar">
        <span className="st-value">{C.count(on, rows.length)}</span>
        <button
          className="st-btn st-btn--ghost"
          disabled={busyId === '__reload__'}
          onClick={() => void rescan()}
        >
          {busyId === '__reload__' ? C.reloading : C.reload}
        </button>
      </div>

      {error ? (
        <p className="st-flash" data-tone="danger">
          {C.failed(error)}
        </p>
      ) : null}

      {loading ? (
        <p className="st-empty">{C.reloading}</p>
      ) : rows.length === 0 ? (
        <div className="st-empty">
          <b>{C.empty}</b>
          <span>{C.emptyHint}</span>
        </div>
      ) : (
        <div className="st-list">
          {rows.map((s) => (
            <div className="st-card" key={s.skill_id} data-off={s.enabled ? undefined : 'true'}>
              <div className="st-card-head">
                <Tile tone={s.enabled ? 'teal' : 'slate'}>{s.name.slice(0, 1)}</Tile>
                <div className="st-card-text">
                  <b>{s.name}</b>
                  <span>{s.description || C.noDescription}</span>
                </div>
                <button
                  role="switch"
                  aria-checked={s.enabled}
                  aria-label={s.name}
                  className="st-switch"
                  data-on={s.enabled ? 'true' : 'false'}
                  disabled={busyId === s.skill_id}
                  onClick={() => void toggle(s)}
                >
                  <i />
                </button>
                {isBuiltinSkill(s) ? null : (
                  <button
                    className="st-btn st-btn--ghost"
                    data-tone={confirmId === s.skill_id ? 'danger' : undefined}
                    disabled={busyId === s.skill_id}
                    onClick={() => void remove(s)}
                  >
                    {confirmId === s.skill_id ? C.deleteConfirm : C.delete}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
