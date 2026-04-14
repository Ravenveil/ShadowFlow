/**
 * Code 节点执行器
 * 编写代码
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult, CodeGenerationResult } from '../../types/node.types';

/**
 * 编程语言
 */
type ProgrammingLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'swift'
  | 'kotlin';

/**
 * Code 节点配置
 */
interface CodeConfig {
  /** 编程语言 */
  language?: ProgrammingLanguage;
  /** 代码风格 */
  style?: 'functional' | 'object-oriented' | 'procedural' | 'auto';
  /** 是否添加注释 */
  add_comments?: boolean;
  /** 是否添加 JSDoc */
  add_jsdoc?: boolean;
  /** 最大文件行数 */
  max_lines?: number;
  /** 文件路径模板 */
  file_path_template?: string;
}

/**
 * Code 节点执行器
 */
export class CodeExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as CodeConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      // 🌊 从河流取水 - 读取上下文记忆
      const contextMemory = this.drinkMemory(context, 'context');
      const designDecisions = contextMemory.filter(c =>
        c.content?.type === 'design_decision' || c.content?.type === 'architecture'
      );

      // 🌊 从沉淀层取水 - 读取学习到的代码模式
      const learnedPatterns = this.dredgePatterns(context, {
        type: 'success_pattern',
        minImportance: 0.5,
      });
      const codePatterns = learnedPatterns.filter(p =>
        p.content?.category === 'code' || p.content?.category === 'style'
      );

      const task = context.inputs.task || context.inputs.refined_task || context.inputs.parsed_task?.data;
      const design = context.inputs.design;
      const subtask = context.inputs.subtask;
      const spec = context.inputs.specifications;

      if (!task && !subtask) {
        throw new Error('Task or subtask data is required');
      }

      const language = config.language || design?.techStack?.language || 'typescript';
      const style = config.style || 'auto';

      // 生成代码（使用记忆中的上下文）
      const codeResult = await this.generateCode(
        task,
        subtask,
        design,
        spec,
        language,
        style,
        config,
        context,
        { designDecisions, codePatterns }  // 传入记忆
      );

      // 保存代码到变量
      this.setVariable(context, 'generated_code', codeResult);
      this.setVariable(context, 'last_language', language);

      // 🌊 向河流注水 - 记录执行结果
      this.pourMemory(context, {
        type: 'execution',
        content: {
          category: 'code_generation',
          filePath: codeResult.filePath,
          language: codeResult.language,
          summary: `Generated ${language} code for ${subtask?.description || task}`,
        },
        metadata: {
          createdAt: new Date(),
          importance: 0.7,
        },
      });

      // 🌊 向河流注水 - 记录上下文（供下游使用）
      this.pourMemory(context, {
        type: 'context',
        content: {
          type: 'code_context',
          language,
          style,
          keyDependencies: codeResult.dependencies,
          designDecisionsUsed: designDecisions.map(d => d.id),
        },
        metadata: {
          createdAt: new Date(),
          importance: 0.6,
        },
      });

      this.publishEvent(context, 'code:generated', {
        filePath: codeResult.filePath,
        language
      });

      this.addExecutionRecord(context, true);

      return this.success({
        code: codeResult.code,
        file_path: codeResult.filePath,
        language: codeResult.language,
        dependencies: codeResult.dependencies,
        generation_result: codeResult
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 生成代码
   */
  private async generateCode(
    task: any,
    subtask: any,
    design: any,
    spec: any,
    language: ProgrammingLanguage,
    style: string,
    config: CodeConfig,
    context: NodeContext,
    memory?: { designDecisions: any[]; codePatterns: any[] }
  ): Promise<CodeGenerationResult> {
    const llmClient = this.getLLMClient(context);

    // 确定要实现的内容
    const taskDescription = subtask?.description || (typeof task === 'string' ? task : JSON.stringify(task));

    // 构建代码生成提示（包含记忆）
    const prompt = this.buildCodePrompt(
      taskDescription,
      design,
      spec,
      language,
      style,
      config,
      memory
    );

    try {
      const response = await llmClient.chat([
        { role: 'system', content: this.getCodeSystemPrompt(language) },
        { role: 'user', content: prompt }
      ]);

      // 解析响应
      const parsed = this.parseCodeResponse(response, language);

      // 生成文件路径
      const filePath = this.generateFilePath(task, subtask, language, config);

      return {
        code: parsed.code,
        filePath,
        language,
        dependencies: parsed.dependencies || []
      };
    } catch (error) {
      // 降级：生成简单模板代码
      return {
        code: this.generateTemplateCode(language, taskDescription),
        filePath: this.generateFilePath(task, subtask, language, config),
        language,
        dependencies: []
      };
    }
  }

  /**
   * 构建代码生成提示
   */
  private buildCodePrompt(
    taskDescription: string,
    design: any,
    spec: any,
    language: ProgrammingLanguage,
    style: string,
    config: CodeConfig,
    memory?: { designDecisions: any[]; codePatterns: any[] }
  ): string {
    const sections = [];

    sections.push(`Write ${language} code for:\n${taskDescription}\n`);

    // 添加记忆中的设计决策
    if (memory?.designDecisions?.length) {
      sections.push('\nPrevious Design Decisions:');
      memory.designDecisions.forEach((d: any) => {
        sections.push(`- ${d.content?.summary || d.content?.decision || JSON.stringify(d.content)}`);
      });
    }

    // 添加记忆中的代码模式
    if (memory?.codePatterns?.length) {
      sections.push('\nLearned Code Patterns:');
      memory.codePatterns.forEach((p: any) => {
        sections.push(`- ${p.content?.pattern || p.content?.summary || JSON.stringify(p.content)}`);
      });
    }

    // 添加设计上下文
    if (design) {
      sections.push('\nDesign Context:');
      sections.push(`- Architecture: ${design.architecture || 'Not specified'}`);
      if (design.dataModels?.length) {
        sections.push('- Data Models:');
        design.dataModels.forEach((model: any) => {
          sections.push(`  * ${model.name}: ${JSON.stringify(model.fields)}`);
        });
      }
      if (design.interfaces?.length) {
        sections.push('- API Interfaces:');
        design.interfaces.forEach((iface: any) => {
          sections.push(`  * ${iface.method} ${iface.path}`);
        });
      }
    }

    // 添加规范
    if (spec) {
      const mustRequirements = spec.flatMap((s: any) =>
        s.requirements.filter((r: any) => r.priority === 'must')
      );
      if (mustRequirements.length > 0) {
        sections.push('\nRequirements (must):');
        mustRequirements.forEach((req: any) => {
          sections.push(`- ${req.description}`);
        });
      }
    }

    // 添加风格要求
    if (style !== 'auto') {
      sections.push(`\nCode Style: ${style}`);
    }

    // 添加注释要求
    if (config.add_comments) {
      sections.push('\nAdd inline comments explaining the code.');
    }

    if (config.add_jsdoc) {
      sections.push('Add JSDoc comments for functions and classes.');
    }

    sections.push('\n\nRespond with:');
    sections.push('```' + this.getFileExtension(language));
    sections.push('// Your code here');
    sections.push('```');
    sections.push('\nIf any dependencies are needed, list them at the end:');
    sections.push('Dependencies: dependency1@version, dependency2@version');

    return sections.join('\n');
  }

  /**
   * 获取代码生成系统提示
   */
  private getCodeSystemPrompt(language: ProgrammingLanguage): string {
    const prompts: Record<ProgrammingLanguage, string> = {
      javascript: `You are an expert JavaScript developer. Write clean, modern, and efficient code following best practices. Use ES6+ features and async/await. Handle errors properly.`,
      typescript: `You are an expert TypeScript developer. Write clean, type-safe, and efficient code following best practices. Use proper types, interfaces, and modern TypeScript features. Handle errors properly.`,
      python: `You are an expert Python developer. Write clean, PEP 8 compliant code. Use type hints and modern Python features. Handle errors properly with try/except.`,
      java: `You are an expert Java developer. Write clean, object-oriented code following Java conventions. Use proper encapsulation and exception handling.`,
      go: `You are an expert Go developer. Write idiomatic Go code following Go conventions. Handle errors properly and use goroutines when appropriate.`,
      rust: `You are an expert Rust developer. Write safe, efficient Rust code following Rust conventions. Handle errors with Result types.`,
      c: `You are an expert C developer. Write clean, efficient C code following C conventions. Manage memory carefully and handle errors.`,
      cpp: `You are an expert C++ developer. Write modern C++ code (C++17+) following C++ conventions. Use RAII and proper error handling.`,
      csharp: `You are an expert C# developer. Write clean, modern C# code following .NET conventions. Use async/await and proper error handling.`,
      php: `You are an expert PHP developer. Write clean, modern PHP code following PSR standards. Use proper error handling and type declarations.`,
      ruby: `You are an expert Ruby developer. Write idiomatic Ruby code following Ruby conventions. Use blocks and proper error handling.`,
      swift: `You are an expert Swift developer. Write clean, modern Swift code following Swift conventions. Use optionals properly and async/await.`,
      kotlin: `You are an expert Kotlin developer. Write idiomatic Kotlin code following Kotlin conventions. Use coroutines and proper error handling.`
    };

    return prompts[language] || prompts.typescript;
  }

  /**
   * 解析代码响应
   */
  private parseCodeResponse(response: string, language: ProgrammingLanguage): {
    code: string;
    dependencies?: string[];
  } {
    // 提取代码块
    const codeBlockRegex = new RegExp('```' + this.getFileExtension(language) + '\\n([\\s\\S]*?)```', 'gi');
    const codeMatch = codeBlockRegex.exec(response);

    let code = codeMatch ? codeMatch[1] : response;

    // 提取依赖
    const depRegex = /Dependencies:\s*(.*)/i;
    const depMatch = depRegex.exec(response);
    const dependencies = depMatch
      ? depMatch[1].split(',').map(d => d.trim()).filter(d => d)
      : [];

    // 移除依赖行
    code = code.replace(/Dependencies:.*/gi, '').trim();

    return { code, dependencies };
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(language: ProgrammingLanguage): string {
    const extensions: Record<ProgrammingLanguage, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      go: 'go',
      rust: 'rs',
      c: 'c',
      cpp: 'cpp',
      csharp: 'cs',
      php: 'php',
      ruby: 'rb',
      swift: 'swift',
      kotlin: 'kt'
    };

    return extensions[language] || language;
  }

  /**
   * 生成文件路径
   */
  private generateFilePath(
    task: any,
    subtask: any,
    language: ProgrammingLanguage,
    config: CodeConfig
  ): string {
    if (config.file_path_template) {
      return config.file_path_template;
    }

    // 根据子任务或任务生成文件名
    const name = subtask?.name
      ? subtask.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      : (typeof task === 'string' ? task.substring(0, 30).toLowerCase().replace(/\s+/g, '_') : 'generated');

    const ext = this.getFileExtension(language);
    return `src/${name}.${ext}`;
  }

  /**
   * 生成模板代码（降级方案）
   */
  private generateTemplateCode(language: ProgrammingLanguage, task: string): string {
    const templates: Record<ProgrammingLanguage, (task: string) => string> = {
      javascript: (task) => `/**
 * ${task}
 */

// TODO: Implement ${task}

module.exports = {
  // Export your functions/classes here
};`,

      typescript: (task) => `/**
 * ${task}
 */

// TODO: Implement ${task}

export function main(): void {
  console.log('${task}');
}

export default main;`,

      python: (task) => `"""
${task}
"""

# TODO: Implement ${task}

def main():
    print(f"{task}")

if __name__ == "__main__":
    main()`,

      java: (task) => `/**
 * ${task}
 */
public class Main {
    public static void main(String[] args) {
        // TODO: Implement ${task}
        System.out.println("${task}");
    }
}`,

      go: (task) => `// ${task}
package main

import "fmt"

func main() {
    // TODO: Implement ${task}
    fmt.Println("${task}")
}`,

      rust: (task) => `// ${task}
fn main() {
    // TODO: Implement ${task}
    println!("${task}");
}`
    };

    const template = templates[language] || templates.typescript;
    return template(task);
  }
}
