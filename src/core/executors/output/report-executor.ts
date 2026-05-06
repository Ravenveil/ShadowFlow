/**
 * Report 节点执行器
 * 生成报告
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 报告类型
 */
type ReportType =
  | 'summary'
  | 'detailed'
  | 'executive'
  | 'technical'
  | 'progress'
  | 'final'
  | 'custom';

/**
 * 报告格式
 */
type ReportFormat = 'markdown' | 'html' | 'pdf' | 'json' | 'csv';

/**
 * Report 节点配置
 */
interface ReportConfig {
  /** 报告类型 */
  report_type?: ReportType;
  /** 输出格式 */
  output_format?: ReportFormat;
  /** 是否包含图表 */
  include_charts?: boolean;
  /** 是否包含时间戳 */
  include_timestamp?: boolean;
  /** 报告模板 */
  template?: string;
}

/**
 * Report 节点执行器
 */
export class ReportExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as ReportConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const reportType = config.report_type || 'summary';
      const outputFormat = config.output_format || 'markdown';
      const includeTimestamp = config.include_timestamp !== false;

      // 生成报告内容
      const report = await this.generateReport(
        reportType,
        outputFormat,
        includeTimestamp,
        config,
        context
      );

      // 生成报告文件名
      const fileName = this.generateReportFileName(reportType, outputFormat);

      // 保存报告
      this.setVariable(context, 'generated_report', report);
      this.setVariable(context, 'report_file_name', fileName);

      this.publishEvent(context, 'report:generated', {
        type: reportType,
        format: outputFormat,
        fileName
      });

      this.addExecutionRecord(context, true);

      return this.success({
        report,
        report_type: reportType,
        output_format: outputFormat,
        file_name: fileName,
        word_count: report.split(/\s+/).length
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 生成报告
   */
  private async generateReport(
    reportType: ReportType,
    outputFormat: ReportFormat,
    includeTimestamp: boolean,
    config: ReportConfig,
    context: NodeContext
  ): Promise<string> {
    const llmClient = this.getLLMClient(context);

    // 收集报告数据
    const reportData = this.collectReportData(context);

    // 如果提供了模板，使用模板
    if (config.template) {
      return this.applyTemplate(config.template, reportData);
    }

    // 构建报告生成提示
    const prompt = this.buildReportPrompt(reportType, reportData, includeTimestamp);

    try {
      const response = await llmClient.chat([
        { role: 'system', content: this.getReportSystemPrompt(reportType) },
        { role: 'user', content: prompt }
      ]);

      return this.formatReport(response, outputFormat);
    } catch {
      // 降级：使用默认模板
      return this.getDefaultReport(reportType, reportData, includeTimestamp);
    }
  }

  /**
   * 收集报告数据
   */
  private collectReportData(context: NodeContext): any {
    return {
      workflowId: context.state.workflowId,
      executionHistory: context.state.executionHistory,
      inputs: context.inputs,
      variables: context.state.variables,
      taskCount: context.state.executionHistory.length,
      successCount: context.state.executionHistory.filter(e => e.success).length,
      failureCount: context.state.executionHistory.filter(e => !e.success).length,
      totalDuration: context.state.executionHistory.reduce((sum, e) => sum + e.duration, 0)
    };
  }

  /**
   * 构建报告提示
   */
  private buildReportPrompt(
    reportType: ReportType,
    data: any,
    includeTimestamp: boolean
  ): string {
    const sections: string[] = [];

    sections.push(`Generate a ${reportType} report.\n`);

    // 添加时间戳（如果需要）
    if (includeTimestamp) {
      sections.push(`Generated: ${new Date().toISOString()}\n`);
    }

    // 添加工作流数据
    sections.push('## Workflow Execution Data\n');
    sections.push(`- Workflow ID: ${data.workflowId}`);
    sections.push(`- Total Tasks: ${data.taskCount}`);
    sections.push(`- Successes: ${data.successCount}`);
    sections.push(`- Failures: ${data.failureCount}`);
    sections.push(`- Total Duration: ${data.totalDuration}ms\n`);

    // 添加执行历史
    if (data.executionHistory.length > 0) {
      sections.push('## Execution History\n');
      data.executionHistory.forEach((exec: any, index: number) => {
        sections.push(`\n### Task ${index + 1}: ${exec.nodeId}`);
        sections.push(`- Status: ${exec.success ? 'Success' : 'Failed'}`);
        sections.push(`- Duration: ${exec.duration}ms`);
        if (exec.error) {
          sections.push(`- Error: ${exec.error}`);
        }
      });
    }

    // 添加变量
    if (Object.keys(data.variables).length > 0) {
      sections.push('\n## Variables\n');
      sections.push('```json');
      sections.push(JSON.stringify(data.variables, null, 2));
      sections.push('```');
    }

    sections.push('\n\nGenerate a well-formatted report with appropriate sections and formatting.');

    return sections.join('\n');
  }

  /**
   * 获取报告系统提示
   */
  private getReportSystemPrompt(reportType: ReportType): string {
    const prompts: Record<ReportType, string> = {
      summary: 'Generate a concise summary report highlighting key findings, outcomes, and recommendations.',
      detailed: 'Generate a comprehensive detailed report with all relevant information, analysis, and documentation.',
      executive: 'Generate an executive summary report for stakeholders, focusing on business value and key outcomes.',
      technical: 'Generate a technical report with detailed technical information, architecture, implementation details, and code examples.',
      progress: 'Generate a progress report showing current status, milestones achieved, and next steps.',
      final: 'Generate a final project report summarizing all work, outcomes, lessons learned, and recommendations.',
      custom: 'Generate a custom report based on the provided requirements.'
    };

    return prompts[reportType] || prompts.summary;
  }

  /**
   * 格式化报告
   */
  private formatReport(content: string, format: ReportFormat): string {
    switch (format) {
      case 'json':
        // 尝试从 markdown 中提取结构化数据
        return JSON.stringify({ content, generatedAt: new Date() }, null, 2);

      case 'csv':
        // 简化版：将内容包装在 CSV 中
        return `content\n${content.replace(/\n/g, ' ')}`;

      case 'html':
        // 简化版：包装 HTML 标签
        return `<!DOCTYPE html>
<html>
<head><title>Report</title></head>
<body>
${this.markdownToHtml(content)}
</body>
</html>`;

      case 'pdf':
        // PDF 转换需要额外库
        return content;

      default:
        return content;
    }
  }

  /**
   * Markdown 转 HTML（简化版）
   */
  private markdownToHtml(markdown: string): string {
    let html = markdown;

    // 标题
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 列表
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');

    // 代码块
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/gim, '<pre><code>$2</code></pre>');

    // 段落
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;

    return html;
  }

  /**
   * 应用模板
   */
  private applyTemplate(template: string, data: any): string {
    let result = template;

    // 替换变量占位符
    for (const key in data) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(placeholder, String(data[key]));
    }

    return result;
  }

  /**
   * 获取默认报告
   */
  private getDefaultReport(
    reportType: ReportType,
    data: any,
    includeTimestamp: boolean
  ): string {
    const sections: string[] = [];

    sections.push(`# ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report\n`);

    if (includeTimestamp) {
      sections.push(`**Generated:** ${new Date().toISOString()}\n`);
    }

    sections.push('## Summary\n');
    sections.push(`- Total tasks executed: ${data.taskCount}`);
    sections.push(`- Successful: ${data.successCount}`);
    sections.push(`- Failed: ${data.failureCount}`);
    sections.push(`- Total duration: ${data.totalDuration}ms\n`);

    if (data.executionHistory.length > 0) {
      sections.push('## Task Execution Details\n');

      data.executionHistory.forEach((exec: any, index: number) => {
        sections.push(`\n${index + 1}. **${exec.nodeId}**`);
        sections.push(`   - Status: ${exec.success ? ':white_check_mark: Success' : ':x: Failed'}`);
        sections.push(`   - Duration: ${exec.duration}ms`);
        if (exec.error) {
          sections.push(`   - Error: ${exec.error}`);
        }
      });
    }

    return sections.join('\n');
  }

  /**
   * 生成报告文件名
   */
  private generateReportFileName(reportType: ReportType, format: ReportFormat): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const extensions: Record<ReportFormat, string> = {
      markdown: 'md',
      html: 'html',
      pdf: 'pdf',
      json: 'json',
      csv: 'csv'
    };

    return `report_${reportType}_${timestamp}.${extensions[format]}`;
  }
}
