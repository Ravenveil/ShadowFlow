import { AgentAvatar, AVATAR_SIZE } from '../avatar';
import { DEMO } from '../content/app';
import type { ArtifactPayload, Message } from '../data/types';
import { IconFile, IconImage, IconCode, IconBook, IconGrid } from '../shell/icons';
import { RunBlock } from './RunBlock';
import { TeamBlock } from './TeamBlock';

const ART_ICON = {
  paper: IconFile,
  doc: IconFile,
  bib: IconBook,
  sheet: IconGrid,
  figure: IconImage,
  code: IconCode,
} as const;

function ArtifactCard({ a }: { a: ArtifactPayload }) {
  const Icon = ART_ICON[a.kind] ?? IconFile;
  return (
    <button className="sf-artifact">
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

function Bubble({ m }: { m: Message }) {
  if (m.role === 'user') {
    return (
      <div className="sf-msg sf-msg--user">
        <div className="sf-msg-userbubble">{m.text}</div>
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
        {m.text ? <div className="sf-msg-text">{m.text}</div> : null}
        {m.run ? <RunBlock run={m.run} /> : null}
        {m.team ? <TeamBlock team={m.team} /> : null}
        {m.artifacts?.length ? (
          <div className="sf-artifacts">
            {m.artifacts.map((a) => (
              <ArtifactCard key={a.name} a={a} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="sf-thread">
      {messages.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}
    </div>
  );
}
