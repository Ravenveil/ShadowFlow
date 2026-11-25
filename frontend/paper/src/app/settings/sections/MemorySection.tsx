/**
 * MemorySection — 设置里的「知识与记忆」：三块真实数据，全部走后端。
 *
 *   召回策略  自动沉淀开关 + 每次召回条数（通用 settings 键，后端有缺省）
 *   手写条目  /api/memory-entries（user / project / session 三种作用域，可增删）
 *   经验沉淀  /api/memory/lessons（run 失败自动写，可手动归档）
 *   记忆画像  /api/memory/profiles（保留天数 / 召回条数，可删）
 *
 * 后端没这块数据时列表就是空态 —— 不编造条目，也不假装保存成功。
 * 文案全在 `content/settings.ts` 的 SETTINGS_COPY.memory。
 */
import { useCallback, useEffect, useState } from 'react';
import { SETTINGS_COPY } from '@/shared/content/settings';
import {
  archiveMemoryLesson,
  createMemoryEntry,
  deleteMemoryEntry,
  deleteMemoryProfile,
  getAutoLearn,
  getRecallTopK,
  listMemoryEntries,
  listMemoryLessons,
  listMemoryProfiles,
  setAutoLearn,
  setRecallTopK,
  type MemoryEntry,
  type MemoryLesson,
  type MemoryProfile,
  type MemoryScope,
} from '@/shared/data/http/memory';
import { Group, Row, Seg, Switch, Tag, Tile } from '@/app/settings/primitives';

const C = SETTINGS_COPY.memory;

/** 召回条数只给这几档：再多就是烧上下文，不是「更聪明」。 */
const TOPK_OPTIONS = ['2', '4', '6', '8'] as const;

const SCOPES: readonly { value: MemoryScope; label: string }[] = [
  { value: 'user', label: C.entryScope.user },
  { value: 'project', label: C.entryScope.project },
  { value: 'session', label: C.entryScope.session },
];

/** 列表行只放一行摘要：内容太长就截断，完整内容挂在标题的 title 上。 */
function excerpt(text: string, max = 96): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

interface Draft {
  scope: MemoryScope;
  title: string;
  content: string;
}

export function MemorySection() {
  const [autoLearn, setAutoLearnOn] = useState(true);
  const [topK, setTopKValue] = useState(4);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [lessons, setLessons] = useState<MemoryLesson[]>([]);
  const [profiles, setProfiles] = useState<MemoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [e, l, p, a, k] = await Promise.allSettled([
      listMemoryEntries(),
      listMemoryLessons(),
      listMemoryProfiles(),
      getAutoLearn(),
      getRecallTopK(),
    ]);
    if (e.status === 'fulfilled') setEntries(e.value);
    if (l.status === 'fulfilled') setLessons(l.value);
    if (p.status === 'fulfilled') setProfiles(p.value);
    if (a.status === 'fulfilled') setAutoLearnOn(a.value);
    if (k.status === 'fulfilled') setTopKValue(k.value);
    // 三块里只要有一块真报错（不是 404 空态）就把原因摊开，别让人以为「本来就没有」
    const failed = [e, l, p].find((r) => r.status === 'rejected');
    setError(
      failed && failed.status === 'rejected'
        ? String((failed.reason as Error)?.message ?? failed.reason)
        : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleAutoLearn = (next: boolean) => {
    setAutoLearnOn(next);
    void setAutoLearn(next).catch((err) => setError(String((err as Error)?.message ?? err)));
  };

  const pickTopK = (next: string) => {
    const n = Number(next);
    setTopKValue(n);
    void setRecallTopK(n).catch((err) => setError(String((err as Error)?.message ?? err)));
  };

  const saveDraft = async () => {
    if (!draft || !draft.title.trim()) return;
    setSaving(true);
    try {
      const created = await createMemoryEntry({
        scope: draft.scope,
        title: draft.title.trim(),
        content: draft.content,
      });
      setEntries((rows) => [created, ...rows]);
      setDraft(null);
      setError(null);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (id: string) => {
    try {
      await deleteMemoryEntry(id);
      setEntries((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  };

  const archiveLesson = async (id: string) => {
    try {
      await archiveMemoryLesson(id);
      setLessons((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  };

  const removeProfile = async (id: string) => {
    try {
      await deleteMemoryProfile(id);
      setProfiles((rows) => rows.filter((r) => r.profile_id !== id));
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  };

  return (
    <div className="st-stack">
      <section className="st-group">
        <Row label={C.autoLearn}>
          <Switch label={C.autoLearn} on={autoLearn} onChange={toggleAutoLearn} />
        </Row>
        <Row label={C.recallTopK}>
          <Seg
            label={C.recallTopK}
            value={String(topK)}
            options={TOPK_OPTIONS.map((v) => ({ value: v, label: C.recallUnit(Number(v)) }))}
            onChange={pickTopK}
          />
        </Row>
      </section>

      {error ? (
        <p className="st-flash" data-tone="danger">
          {C.entryFailed(error)}
        </p>
      ) : null}

      <Group title={`${C.entries} · ${C.entriesMeta(entries.length)}`}>
        {loading ? (
          <p className="st-empty">{C.loading}</p>
        ) : entries.length === 0 ? (
          <div className="st-empty">{C.entriesEmpty}</div>
        ) : (
          <div className="st-list">
            {entries.map((e) => (
              <div className="st-card" key={e.id}>
                <div className="st-card-head">
                  <Tile tone="blue">{e.title.slice(0, 1)}</Tile>
                  <div className="st-card-text">
                    <b title={e.content}>{e.title}</b>
                    <span>{excerpt(e.content)}</span>
                  </div>
                  <Tag tone="mute">{C.entryScope[e.scope] ?? e.scope}</Tag>
                  <button className="st-btn st-btn--ghost" onClick={() => void removeEntry(e.id)}>
                    {C.entryDelete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {draft ? (
          <div className="st-card">
            <div className="st-card-body">
              <input
                className="st-input"
                aria-label={C.entryTitle}
                placeholder={C.entryTitlePlaceholder}
                value={draft.title}
                onChange={(ev) => setDraft({ ...draft, title: ev.target.value })}
              />
              <textarea
                className="st-textarea"
                aria-label={C.entryContent}
                placeholder={C.entryContentPlaceholder}
                rows={4}
                value={draft.content}
                onChange={(ev) => setDraft({ ...draft, content: ev.target.value })}
              />
              <div className="st-row-ctrl">
                <Seg
                  label={C.entryNew}
                  value={draft.scope}
                  options={SCOPES}
                  onChange={(scope) => setDraft({ ...draft, scope })}
                />
                <button
                  className="st-btn st-btn--solid"
                  disabled={saving || !draft.title.trim()}
                  onClick={() => void saveDraft()}
                >
                  {saving ? C.entrySaving : C.entrySave}
                </button>
                <button className="st-btn st-btn--ghost" onClick={() => setDraft(null)}>
                  {C.entryCancel}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            className="st-btn st-btn--ghost"
            onClick={() => setDraft({ scope: 'user', title: '', content: '' })}
          >
            {C.entryAdd}
          </button>
        )}
      </Group>

      <Group title={`${C.lessons} · ${C.lessonsMeta(lessons.length)}`}>
        {lessons.length === 0 ? (
          <div className="st-empty">{C.lessonsEmpty}</div>
        ) : (
          <div className="st-list">
            {lessons.map((l) => (
              <div className="st-card" key={l.id}>
                <div className="st-card-head">
                  <Tile tone="teal">{l.title.slice(0, 1) || l.kind.slice(0, 1)}</Tile>
                  <div className="st-card-text">
                    <b title={l.content}>{l.title || excerpt(l.content, 40)}</b>
                    <span>{excerpt(l.content)}</span>
                  </div>
                  <Tag tone={l.kind === 'weakness' ? 'warn' : 'mute'}>
                    {C.lessonKind[l.kind as keyof typeof C.lessonKind] ?? l.kind}
                  </Tag>
                  <Tag tone="mute">{C.lessonHits(l.hits)}</Tag>
                  <button className="st-btn st-btn--ghost" onClick={() => void archiveLesson(l.id)}>
                    {C.lessonArchive}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Group>

      <Group title={`${C.profiles} · ${C.profilesMeta(profiles.length)}`}>
        {profiles.length === 0 ? (
          <div className="st-empty">{C.profilesEmpty}</div>
        ) : (
          <div className="st-list">
            {profiles.map((p) => (
              <div className="st-card" key={p.profile_id}>
                <div className="st-card-head">
                  <Tile tone="violet">{p.profile_id.slice(0, 1)}</Tile>
                  <div className="st-card-text">
                    <b>{p.profile_id}</b>
                    <span>
                      {C.profileTopK(p.semantic_retrieval_top_k)} ·{' '}
                      {C.profileRetention(p.episodic_retention_days)}
                    </span>
                  </div>
                  <button
                    className="st-btn st-btn--ghost"
                    onClick={() => void removeProfile(p.profile_id)}
                  >
                    {C.profileDelete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Group>
    </div>
  );
}
