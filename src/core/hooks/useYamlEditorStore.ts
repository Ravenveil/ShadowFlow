import { create } from 'zustand';

/** Source tag to prevent circular YAML↔store updates (AR42). */
export type YamlSourceTag = 'user' | 'store';

interface YamlEditorState {
  yamlText: string;
  lastYamlError: string | null;
  _sourceTag: YamlSourceTag;
  setYamlText: (text: string, source: YamlSourceTag) => void;
  setYamlError: (error: string | null) => void;
  getSourceTag: () => YamlSourceTag;
  /** Reset sourceTag to 'store' so Direction B can resume after user finishes typing. */
  resetSourceTag: () => void;
}

export const useYamlEditorStore = create<YamlEditorState>((set, get) => ({
  yamlText: '',
  lastYamlError: null,
  _sourceTag: 'store',

  setYamlText: (text, source) =>
    set({ yamlText: text, _sourceTag: source }),

  setYamlError: (error) =>
    set({ lastYamlError: error }),

  getSourceTag: () => get()._sourceTag,

  // P1-β fix: allows Direction B to resume after Direction A debounce completes
  resetSourceTag: () => set({ _sourceTag: 'store' }),
}));
