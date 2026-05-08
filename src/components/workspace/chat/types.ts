/**
 * Chat tab 共享类型
 */

export type ConvId = 'main' | 'engineering' | 'secret' | 'dudu' | 'api' | 'chaxha' | 'xiaoxie';

export type AgentMeta = {
  glyph: string;
  name: string;
  role: string;
  model: string;
  color: string;
};

export type MsgItem =
  | { type: 'divider'; label: string; id: number }
  | { type: 'system'; text: string; id: number }
  | { type: 'policy'; id: number }
  | { type: 'gate'; id: number }
  | { type: 'typing'; id: number }
  | {
      type: 'agent';
      id: number;
      agent: AgentMeta;
      time: string;
      bodyText: string;
      tool?: { name: string; meta: string };
      reactions?: [string, number][];
      thread?: { count: number; last: string };
      readBy?: string;
    }
  | {
      type: 'user';
      id: number;
      name: string;
      time: string;
      bodyText: string;
      reply?: { name: string; text: string };
    };

export type SlashCommand = { cmd: string; d: string };

export type Org = {
  init: string;
  name: string;
  tag: string;
  cur: boolean;
  warn?: boolean;
  members: string;
  color: string;
};
