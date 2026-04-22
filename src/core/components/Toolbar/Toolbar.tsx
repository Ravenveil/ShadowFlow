// ============================================================================
// 工具栏组件 - 顶部操作工具栏
// ============================================================================

import React, { useState, useRef } from 'react';
import { useI18n } from '../../../common/i18n';
import { useWorkflowActions } from '../../hooks/useWorkflow';
import { useExecution } from '../../hooks/useExecution';
import { ExportFormat, LayoutAlgorithm } from '../../types';
import { clsx } from 'clsx';

// 工具按钮组件
function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  isActive,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all',
        'hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed',
        isActive && 'bg-blue-100 text-blue-700'
      )}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
    >
      <span className="text-lg">{icon}</span>
      <span className="text-xs">{label}</span>
    </button>
  );
}

// 下拉菜单组件
function Dropdown({
  trigger,
  children,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 active:bg-gray-200"
      >
        {trigger}
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[150px] z-20">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

export function Toolbar() {
  const { t } = useI18n();
  const workflow = useWorkflowActions();
  const { execute, isRunning, error } = useExecution();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理导出
  const handleExport = (format: ExportFormat) => {
    const content = workflow.exportWorkflow(format);
    const blob = new Blob([content], {
      type: format === 'yaml' ? 'text/yaml' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow.${format === 'typescript' ? 'ts' : format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 处理导入
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const format = file.name.endsWith('.yaml') || file.name.endsWith('.yml')
          ? 'yaml'
          : file.name.endsWith('.ts')
          ? 'typescript'
          : 'json';
        workflow.importWorkflow(content, format);
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  // 自动布局
  const handleAutoLayout = (algorithm: LayoutAlgorithm) => {
    workflow.autoLayout(algorithm);
  };

  // 运行工作流
  const handleRun = () => {
    if (isRunning) {
      workflow.stopRun();
    } else {
      const validation = workflow.validateWorkflow();
      if (!validation.isValid) {
        alert('工作流验证失败：\n' + validation.errors.join('\n'));
        return;
      }
      
      const input = prompt('请输入任务指令:', '请帮我分析这段代码的安全性');
      if (input) {
        execute(input);
      }
    }
  };

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-2 pr-4 border-r border-gray-200">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">AG</span>
        </div>
        <div>
          <h1 className="font-bold text-gray-900 text-sm">{t('app.title')}</h1>
          <p className="text-xs text-gray-500 hidden sm:block">{t('app.subtitle')}</p>
        </div>
      </div>

      {/* 撤销/重做 */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon="↶"
          label={t('common.save')}
          onClick={workflow.undo}
          disabled={!workflow.canUndo}
          shortcut="Ctrl+Z"
        />
        <ToolButton
          icon="↷"
          label={t('toolbar.redo')}
          onClick={workflow.redo}
          disabled={!workflow.canRedo}
          shortcut="Ctrl+Y"
        />
      </div>

      <div className="w-px h-8 bg-gray-200" />

      {/* 画布控制 */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon="🔍+"
          label={t('toolbar.zoomIn')}
          onClick={() => workflow.setZoom(workflow.ui.zoom + 0.1)}
        />
        <ToolButton
          icon="🔍-"
          label={t('toolbar.zoomOut')}
          onClick={() => workflow.setZoom(workflow.ui.zoom - 0.1)}
        />
        <ToolButton
          icon="⛶"
          label={t('toolbar.fitView')}
          onClick={() => workflow.setZoom(1)}
        />
      </div>

      <div className="w-px h-8 bg-gray-200" />

      {/* 自动布局 */}
      <Dropdown
        trigger={
          <>
            <span className="text-lg">📐</span>
            <span className="text-xs">{t('toolbar.autoLayout')}</span>
          </>
        }
      >
        {(Object.keys({ hierarchical: null, force: null, circular: null, grid: null }) as LayoutAlgorithm[]).map(
          (algo) => (
            <button
              key={algo}
              onClick={() => handleAutoLayout(algo)}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
            >
              {t(`layout.${algo}`)}
            </button>
          )
        )}
      </Dropdown>

      <div className="w-px h-8 bg-gray-200" />

      {/* 导入/导出 */}
      <Dropdown
        trigger={
          <>
            <span className="text-lg">💾</span>
            <span className="text-xs">{t('common.export')}</span>
          </>
        }
      >
        <button
          onClick={() => handleExport('json')}
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
        >
          {t('exportFormat.json')}
        </button>
        <button
          onClick={() => handleExport('yaml')}
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
        >
          {t('exportFormat.yaml')}
        </button>
        <button
          onClick={() => handleExport('typescript')}
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
        >
          {t('exportFormat.typescript')}
        </button>
        <div className="border-t border-gray-200" />
        <button
          onClick={handleImportClick}
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
        >
          {t('common.import')}
        </button>
      </Dropdown>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.yaml,.yml,.ts"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 运行控制 */}
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleRun}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
            workflow.isRunning
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          )}
        >
          <span className={clsx('text-lg', workflow.isRunning && 'animate-pulse')}>
            {workflow.isRunning ? '⏹' : '▶'}
          </span>
          <span className="hidden sm:inline">
            {workflow.isRunning ? t('common.stop') : t('common.run')}
          </span>
        </button>
      </div>

      {/* 语言切换 */}
      <button
        onClick={() => workflow.setLanguage(workflow.ui.language === 'en' ? 'zh' : 'en')}
        className="ml-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
      >
        {workflow.ui.language === 'en' ? '中文' : 'EN'}
      </button>
    </div>
  );
}
