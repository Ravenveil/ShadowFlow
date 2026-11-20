/** 写作规范：引用样式 / 日期格式 / 参考文献语言 / 自动编号。 */
import { SETTINGS_COPY } from '../../content/settings';
import { Group, Row, Select, Switch } from '../primitives';
import type { SectionProps } from '../types';

const C = SETTINGS_COPY.writing;

export function WritingSection({ settings, onPatch }: SectionProps) {
  const { writing } = settings;
  const set = (patch: Partial<typeof writing>) => onPatch({ writing: { ...writing, ...patch } });

  return (
    <Group title={C.title}>
      <Row label={C.citation} note={C.citationNote}>
        <Select
          label={C.citation}
          value={writing.citation}
          options={C.citationOptions}
          onChange={(citation) => set({ citation })}
        />
      </Row>
      <Row label={C.dateFormat}>
        <Select
          label={C.dateFormat}
          value={writing.dateFormat}
          options={C.dateFormatOptions}
          onChange={(dateFormat) => set({ dateFormat })}
        />
      </Row>
      <Row label={C.refLang}>
        <Select
          label={C.refLang}
          value={writing.refLang}
          options={C.refLangOptions}
          onChange={(refLang) => set({ refLang })}
        />
      </Row>
      <Row label={C.autoNumber} note={C.autoNumberNote}>
        <Switch
          label={C.autoNumber}
          on={writing.autoNumber}
          onChange={(autoNumber) => set({ autoNumber })}
        />
      </Row>
    </Group>
  );
}
