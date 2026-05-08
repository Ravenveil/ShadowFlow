import { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useYamlEditorStore } from '../../hooks/useYamlEditorStore';
import { parseWorkflowYaml } from '../../lib/yamlSerializer';
import { AlertTriangle } from '../../../common/icons/iconRegistry';

// Monaco theme spec only accepts literal hex (no CSS var()), so we define
// both day + night themes and toggle via setTheme on data-theme change.
let _sfThemesDefined = false;
function ensureSfThemes(monaco: typeof Monaco) {
  if (_sfThemesDefined) return;
  _sfThemesDefined = true;
  monaco.editor.defineTheme('sf-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#e2e8f0',
      'editor.lineHighlightBackground': '#161b22',
      'editorLineNumber.foreground': '#4b5563',
      'editorCursor.foreground': '#a78bfa',
      'editor.selectionBackground': '#312e81',
      'editorBracketMatch.background': '#1f2937',
      'editorBracketMatch.border': '#a78bfa',
    },
  });
  monaco.editor.defineTheme('sf-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#0A0A0A',
      'editor.lineHighlightBackground': '#F4F3EE',
      'editorLineNumber.foreground': '#A1A1AA',
      'editorCursor.foreground': '#7C3AED',
      'editor.selectionBackground': '#E9D5FF',
      'editorBracketMatch.background': '#EDEBE3',
      'editorBracketMatch.border': '#7C3AED',
    },
  });
}

function readMonacoTheme(): 'sf-dark' | 'sf-light' {
  if (typeof document === 'undefined') return 'sf-dark';
  return document.documentElement.getAttribute('data-theme') === 'day'
    ? 'sf-light'
    : 'sf-dark';
}

interface YamlEditorProps {
  /** Called on every change (after internal store update). */
  onChange?: (text: string) => void;
  /** Called on blur — use to trigger validation markers. */
  onBlur?: (text: string) => void;
  height?: string | number;
}

export function YamlEditor({ onChange, onBlur, height = '100%' }: YamlEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const { yamlText, setYamlText, lastYamlError } = useYamlEditorStore();

  // P2-6 fix: keep a ref to the latest onBlur so the Monaco blur listener
  // (registered once in handleMount) always calls the current callback.
  const onBlurRef = useRef(onBlur);
  useEffect(() => { onBlurRef.current = onBlur; }, [onBlur]);

  const applyErrorMarkers = useCallback((text: string) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const result = parseWorkflowYaml(text);
    if (!result.ok) {
      // Try to extract a line number from yaml parse error message
      const lineMatch = result.error.match(/line (\d+)/i);
      const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;
      monaco.editor.setModelMarkers(model, 'yaml-sf', [{
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: model.getLineMaxColumn(line),
        message: result.error,
        severity: monaco.MarkerSeverity.Error,
      }]);
    } else {
      monaco.editor.setModelMarkers(model, 'yaml-sf', []);
    }
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidBlurEditorText(() => {
      const text = editor.getValue();
      applyErrorMarkers(text);
      // P2-6 fix: use ref so the latest onBlur is always called, not the one captured at mount
      onBlurRef.current?.(text);
    });

    ensureSfThemes(monaco);
    monaco.editor.setTheme(readMonacoTheme());
  }, [applyErrorMarkers]);

  // Re-apply Monaco theme whenever documentElement[data-theme] flips.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const target = document.documentElement;
    const obs = new MutationObserver(() => {
      const monaco = monacoRef.current;
      if (monaco) monaco.editor.setTheme(readMonacoTheme());
    });
    obs.observe(target, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const handleChange = useCallback((value: string | undefined) => {
    const text = value ?? '';
    setYamlText(text, 'user');
    onChange?.(text);
  }, [setYamlText, onChange]);

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', background: 'var(--t-panel)' }}>
      {lastYamlError && (
        // P2-4 fix: add role="alert" + aria-live so screen readers announce parse errors
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--status-reject)',
            background: 'rgba(239,68,68,.08)',
            borderBottom: '1px solid rgba(239,68,68,.2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={11} strokeWidth={2} /> {lastYamlError}</span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          language="yaml"
          value={yamlText}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: 'selection',
            folding: true,
            bracketPairColorization: { enabled: true },
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  );
}
