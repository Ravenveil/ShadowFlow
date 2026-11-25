import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import { DEMO } from '@/shared/content/app';
import type { ArtifactPayload, KnowledgePack, Message } from '@/shared/data/types';
import { IconFile, IconImage, IconCode, IconBook, IconGrid } from '@/shared/ui/icons';
import { RunBlock } from '@/runtime/chat/RunBlock';
import { TeamBlock } from '@/runtime/chat/TeamBlock';
import { MarkdownText } from '@/runtime/chat/MarkdownText';

const ART_ICON = {
  paper: IconFile,
  doc: IconFile,
  bib: IconBook,
  sheet: IconGrid,
  figure: IconImage,
  code: IconCode,
} as const;

function ArtifactCard({ a, onOpen }: { a: ArtifactPayload; onOpen?: () => void }) {
  const Icon = ART_ICON[a.kind] ?? IconFile;
  return (
    <button className="sf-artifact" onClick={onOpen}>
      <span className="sf-artifact-icon">
        <Icon size={15} />
      </span>
      <span className="sf-artifact-body">
        <span className="sf-artifact-name">{a.name}</span>
        <span className="sf-artifact-meta">
          {a.size}
          {a.meta ? ` · ${a.meta}` : ''}
        </span>
      </span>
    </button>
  );
}

/** 用户消息带上的附件 / 知识包，显示成气泡下面的小 chip。 */
function Refs({ m, packs }: { m: Message; packs: KnowledgePack[] }) {
  const kps = (m.knowledge ?? [])
    .map((id) => packs.find((p) => p.id === id)?.name ?? id)
    .filter(Boolean);
  if (!m.attachments?.length && !kps.length) return null;
  return (
    <div className="sf-msg-refs">
      {(m.attachments ?? []).map((a) => (
        <span className="sf-msg-ref" key={a.id}>
          {a.kind === 'image' ? <IconImage size={11} /> : <IconFile size={11} />}
          {a.name}
        </span>
      ))}
      {kps.map((name) => (
        <span className="sf-msg-ref sf-msg-ref--kp" key={name}>
          <IconBook size={11} />
          {name}
        </span>
      ))}
    </div>
  );
}

function Bubble({ m, packs, onOpenArtifact }: { m: Message; packs: KnowledgePack[]; onOpenArtifact?: () => void }) {
  if (m.role === 'user') {
    return (
      <div className="sf-msg sf-msg--user">
        {m.text ? <div className="sf-msg-userbubble">{m.text}</div> : null}
        <Refs m={m} packs={packs} />
        <span className="sf-msg-time">{m.time}</span>
      </div>
    );
  }

  if (m.role === 'system') {
    return <div className="sf-msg-system">{m.text}</div>;
  }

  return (
    <div className="sf-msg sf-msg--agent">
      <div className="sf-msg-gutter">
        <AgentAvatar label={m.author ?? DEMO.leadAuthor} size={AVATAR_SIZE.base} />
      </div>
      <div className="sf-msg-main">
        <div className="sf-msg-head">
          <span className="sf-msg-author">{m.author}</span>
          <span className="sf-msg-time">{m.time}</span>
        </div>
        {/* Agent 正文按 Markdown 渲染（代码块/表格/列表/粗体）；用户输入不渲染，
            免得「2*3*4」这类文本被当成语法吃掉。 */}
        {m.text ? <MarkdownText text={m.text} className="sf-msg-text" /> : null}
        {m.run ? <RunBlock run={m.run} /> : null}
        {m.team ? <TeamBlock team={m.team} /> : null}
        {m.artifacts?.length ? (
          <div className="sf-artifacts">
            {m.artifacts.map((a) => (
              <ArtifactCard key={a.name} a={a} onOpen={onOpenArtifact} />

            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  packs = [],
  onOpenArtifact,
}: {
  messages: Message[];
  packs?: KnowledgePack[];
  onOpenArtifact?: () => void;
}) {
  return (
    <div className="sf-thread">
      {messages.map((m) => (
        <Bubble key={m.id} m={m} packs={packs} onOpenArtifact={onOpenArtifact} />
      ))}
    </div>
  );
}
