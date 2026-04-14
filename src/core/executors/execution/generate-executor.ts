/**
 * Generate 节点执行器
 * 生成内容（文档、报告、配置等）
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 内容类型
 */
type ContentType =
  | 'documentation'
  | 'readme'
  | 'api-doc'
  | 'user-guide'
  | 'technical-guide'
  | 'changelog'
  | 'report'
  | 'presentation'
  | 'custom';

/**
 * 输出格式
 */
type OutputFormat = 'markdown' | 'html' | 'pdf' | 'json' | 'yaml';

/**
 * Generate 节点配置
 */
interface GenerateConfig {
  /** 内容类型 */
  content_type?: ContentType;
  /** 输出格式 */
  output_format?: OutputFormat;
  /** 是否包含目录 */
  include_toc?: boolean;
  /** 目标受众 */
  target_audience?: 'developers' | 'users' | 'managers' | 'all';
  /** 详细程度 */
  detail_level?: 'brief' | 'standard' | 'detailed';
}

/**
 * Generate 节点执行器
 */
export class GenerateExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as GenerateConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const task = context.inputs.task || context.inputs.parsed_task?.data;
      const design = context.inputs.design;
      const spec = context.inputs.specifications;
      const code = context.inputs.code;

      if (!task) {
        throw new Error('Task data is required');
      }

      const contentType = config.content_type || 'documentation';
      const outputFormat = config.output_format || 'markdown';

      // 生成内容
      const content = await this.generateContent(
        task,
        design,
        spec,
        code,
        contentType,
        config,
        context
      );

      // 转换格式（如果需要）
      const finalContent = outputFormat === 'markdown' ? content : await this.convertFormat(content, outputFormat);

      // 生成文件名
      const fileName = this.generateFileName(contentType, outputFormat);

      // 保存内容到变量
      this.setVariable(context, 'generated_content', finalContent);
      this.setVariable(context, 'content_type', contentType);

      this.publishEvent(context, 'generate:completed', {
        contentType,
        format: outputFormat,
        fileName
      });

      this.addExecutionRecord(context, true);

      return this.success({
        content: finalContent,
        content_type: contentType,
        output_format: outputFormat,
        file_name: fileName,
        word_count: finalContent.split(/\s+/).length
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 生成内容
   */
  private async generateContent(
    task: any,
    design: any,
    spec: any,
    code: any,
    contentType: ContentType,
    config: GenerateConfig,
    context: NodeContext
  ): Promise<string> {
    const llmClient = this.getLLMClient(context);

    const sections = [];

    const taskDescription = typeof task === 'string' ? task : JSON.stringify(task);
    const targetAudience = config.target_audience || 'all';
    const detailLevel = config.detail_level || 'standard';

    // 构建提示
    sections.push(`Generate ${contentType} content.\n`);
    sections.push(`Target audience: ${targetAudience}\n`);
    sections.push(`Detail level: ${detailLevel}\n`);
    sections.push(`Context:\n${taskDescription}\n`);

    if (design) {
      sections.push('\nDesign Information:');
      sections.push(`- Architecture: ${design.architecture || 'Not specified'}`);
      if (design.dataModels?.length) {
        sections.push(`- Data Models: ${design.dataModels.map((m: any) => m.name).join(', ')}`);
      }
    }

    if (spec) {
      const mustReqs = spec.flatMap((s: any) =>
        s.requirements.filter((r: any) => r.priority === 'must')
      );
      if (mustReqs.length > 0) {
        sections.push('\nKey Requirements:');
        mustReqs.slice(0, 5).forEach((r: any) => sections.push(`- ${r.description}`));
      }
    }

    sections.push('\n\nGenerate well-structured, professional content.');
    sections.push('Use proper Markdown formatting with headings, lists, and code blocks where appropriate.');

    if (config.include_toc) {
      sections.push('\nInclude a table of contents at the beginning.');
    }

    try {
      const response = await llmClient.chat([
        { role: 'system', content: this.getContentTypeSystemPrompt(contentType, targetAudience) },
        { role: 'user', content: sections.join('\n') }
      ]);

      return response;
    } catch {
      // 降级：生成基本模板
      return this.generateContentTemplate(contentType, taskDescription);
    }
  }

  /**
   * 获取内容类型系统提示
   */
  private getContentTypeSystemPrompt(contentType: ContentType, audience: string): string {
    const prompts: Record<ContentType, string> = {
      documentation: `You are a technical documentation expert. Write clear, comprehensive documentation for ${audience}. Use proper structure with headings, examples, and code snippets.`,
      readme: `You are a README writing expert. Create engaging, informative README files. Include project description, installation, usage, and contribution sections.`,
      'api-doc': `You are an API documentation expert. Write clear API documentation. Include endpoint descriptions, parameters, request/response examples, and error codes.`,
      'user-guide': `You are a technical writing expert specializing in user guides. Write clear, step-by-step guides for users. Include examples and troubleshooting tips.`,
      'technical-guide': `You are a technical writing expert specializing in technical guides. Write in-depth technical documentation with code examples and architecture explanations.`,
      changelog: `You are a changelog expert. Write clear, structured changelogs. Use conventional changelog format with Added, Changed, Deprecated, Removed, Fixed, Security sections.`,
      report: `You are a technical report writing expert. Write professional, well-structured reports. Include executive summary, findings, and recommendations.`,
      presentation: `You are a technical presentation expert. Create content suitable for slides. Keep points concise and focused. Use bullet points and clear headings.`,
      custom: `You are a professional technical writer. Write clear, professional content tailored to the request. Use proper structure and formatting.`
    };

    return prompts[contentType] || prompts.documentation;
  }

  /**
   * 转换格式
   */
  private async convertFormat(content: string, format: OutputFormat): Promise<string> {
    // 这里可以集成格式转换库
    // 简化实现：返回原始内容
    return content;
  }

  /**
   * 生成内容模板（降级方案）
   */
  private generateContentTemplate(contentType: ContentType, context: string): string {
    const templates: Record<ContentType, string> = {
      documentation: `# Documentation

${context}

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Examples](#examples)

## Installation

## Usage

## API Reference

## Examples
`,
      readme: `# Project Name

${context}

## Installation

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`javascript
const project = require('project-name');
\`\`\`

## Contributing

## License
`,
      'api-doc': `# API Documentation

${context}

## Endpoints

### GET /api/resource

**Description:** Get all resources

**Parameters:** None

**Response:** Array of resources

### POST /api/resource

**Description:** Create a new resource

**Request Body:**
\`\`\`json
{
  "name": "example"
}
\`\`\`

**Response:** Created resource
`,
      'user-guide': `# User Guide

${context}

## Getting Started

## Basic Usage

## Advanced Features

## Troubleshooting
`,
      'technical-guide': `# Technical Guide

${context}

## Architecture

## Implementation Details

## Performance Considerations

## Security
`,
      changelog: `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Initial implementation

### Changed
-

### Deprecated
-

### Removed
-

### Fixed
-

## [1.0.0] - ${new Date().toISOString().split('T')[0]}

### Added
- Initial release
`,
      report: `# Report

${context}

## Executive Summary

## Findings

## Recommendations

## Conclusion
`,
      presentation: `# Presentation

${context}

## Overview

## Key Points

## Details

## Summary
`,
      custom: `# Custom Content

${context}

## Section 1

## Section 2
`
    };

    return templates[contentType] || templates.documentation;
  }

  /**
   * 生成文件名
   */
  private generateFileName(contentType: ContentType, format: OutputFormat): string {
    const names: Record<ContentType, string> = {
      documentation: 'docs.md',
      readme: 'README.md',
      'api-doc': 'API.md',
      'user-guide': 'USER_GUIDE.md',
      'technical-guide': 'TECHNICAL_GUIDE.md',
      changelog: 'CHANGELOG.md',
      report: 'REPORT.md',
      presentation: 'PRESENTATION.md',
      custom: 'content.md'
    };

    const baseName = names[contentType] || 'content.md';

    if (format !== 'markdown') {
      return baseName.replace('.md', `.${format}`);
    }

    return baseName;
  }
}
