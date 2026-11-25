/**
 * ArtifactBoard — 右栏「产物」页的**按成员看**视图（对齐 WorkBuddy：成员常驻，点谁看谁）。
 *
 * 两块：
 *   ArtifactChips   —— 顶部一排成员胶囊（全部 / 每位成员 + 交付件数）
 *   MemberArtifacts —— 选中成员的交付清单 + 因此挂上的工作目录文件
 *
 * 归属怎么算全在 `data/deliverables.ts`（纯函数 + 测试）：组件只负责画，
 * 不猜、不补、不把别人的文件算到谁头上。文案在 `content/app.ts` 的 PANEL。
 */
import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import { PANEL as PANEL_COPY } from '@/shared/content/app';
import type { MemberDeliverables } from '@/shared/data/deliverables';
import type { ArtifactEntry, RosterMember } from '@/shared/data/types';
import { sizeLabel, stampLabel } from '@/shared/ui/format';
import { IconChevron, fileIcon } from '@/shared/ui/icons';

/** 一位成员的交付：先说他交了什么，再说这些落在工作目录哪几个文件上。 */
export function MemberArtifacts({
  member,
  group,
  onOpen,
}: {
  member: RosterMember;
  group: MemberDeliverables | null;
  onOpen: (entry: ArtifactEntry) => void;
}) {
  const items = group?.items ?? [];
  const files = group?.files ?? [];
  // 名字本身就是「Reader · 论文精读」时，再挂一个「论文精读」标签就是重复
  const isLead = member.role && member.role !== member.name && !member.name.includes(member.role);

  return (
    <div className="ab-member">
      <div className="ab-member-head">
        <AgentAvatar label={member.name} size={AVATAR_SIZE.sm} status={false} />
        <span className="ab-member-name">{PANEL_COPY.artifactsOf(member.name)}</span>
        {isLead ? <span className="ab-member-role">{member.role}</span> : null}
        {items.length ? <span className="ab-member-count">{items.length}</span> : null}
      </div>

      {!items.length ? (
        <div className="panel-empty">{PANEL_COPY.artifactsMemberEmpty}</div>
      ) : (
        <>
          <div className="panel-sec-head">
            <span>{PANEL_COPY.artifactsMemberDeliveries(items.length)}</span>
            {group?.latest ? <span className="panel-sec-meta">{group.latest}</span> : null}
          </div>
          <ol className="ab-items">
            {items.map((it, i) => (
              <li key={`${it.label}-${i}`}>
                <span className="ab-item-label" title={it.label}>
                  {it.label}
                </span>
                {it.time ? <span className="ab-item-time">{it.time}</span> : null}
              </li>
            ))}
          </ol>

          <div className="panel-sec-head">
            <span>{PANEL_COPY.artifactsMemberFiles(files.length)}</span>
          </div>
          {files.length ? (
            <ul className="panel-files panel-files--pad">
              {files.map((f) => {
                const Glyph = fileIcon(f.ext);
                return (
                  <li key={f.path} onClick={() => onOpen(f)}>
                    <span className="panel-file-icon">
                      <Glyph size={14} />
                    </span>
                    <span className="panel-file-body">
                      <span className="panel-file-name" title={f.name}>
                        {f.name}
                      </span>
                      <span className="panel-file-meta">
                        {sizeLabel(f.size)} · {stampLabel(f.mtime)}
                      </span>
                    </span>
                    <span className="panel-file-go">
                      <IconChevron size={12} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="panel-art-note">{PANEL_COPY.artifactsMemberNoFile}</p>
          )}
        </>
      )}
    </div>
  );
}
