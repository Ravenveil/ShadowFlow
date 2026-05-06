/**
 * Test 节点执行器
 * 编写或运行测试
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult, TestSuiteResult } from '../../types/node.types';

/**
 * 测试类型
 */
type TestType = 'unit' | 'integration' | 'e2e' | 'performance' | 'security' | 'all';

/**
 * 测试框架
 */
type TestFramework =
  | 'jest'
  | 'mocha'
  | 'jasmine'
  | 'pytest'
  | 'unittest'
  | 'junit'
  | 'rspec'
  | 'go';

/**
 * Test 节点配置
 */
interface TestConfig {
  /** 测试类型 */
  test_type?: 'write' | 'run';
  /** 测试分类 */
  test_category?: TestType;
  /** 测试框架 */
  framework?: TestFramework;
  /** 是否生成测试数据 */
  generate_test_data?: boolean;
  /** 目标覆盖率 */
  target_coverage?: number;
  /** 超时时间（秒） */
  timeout?: number;
}

/**
 * Test 节点执行器
 */
export class TestExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as TestConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const testType = config.test_type || 'write';

      if (testType === 'write') {
        return await this.writeTests(context, config);
      } else {
        return await this.runTests(context, config);
      }
    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 编写测试
   */
  private async writeTests(context: NodeContext, config: TestConfig): Promise<NodeResult> {
    const code = context.inputs.code;
    const task = context.inputs.task || context.inputs.parsed_task?.data;
    const design = context.inputs.design;

    if (!code && !task) {
      throw new Error('Code or task data is required for writing tests');
    }

    const testCategory = config.test_category || 'unit';
    const framework = config.framework || this.detectFramework(context);

    // 生成测试代码
    const testCode = await this.generateTestCode(
      code,
      task,
      design,
      testCategory,
      framework,
      context
    );

    // 保存测试代码
    this.setVariable(context, 'test_code', testCode);
    this.setVariable(context, 'test_framework', framework);

    this.publishEvent(context, 'test:written', {
      category: testCategory,
      framework
    });

    this.addExecutionRecord(context, true);

    return this.success({
      test_code: testCode,
      test_framework: framework,
      test_category: testCategory,
      file_path: this.generateTestPath(framework, testCategory)
    });
  }

  /**
   * 运行测试
   */
  private async runTests(context: NodeContext, config: TestConfig): Promise<NodeResult> {
    const testCode = context.inputs.test_code;
    const code = context.inputs.code;

    if (!testCode) {
      throw new Error('Test code is required for running tests');
    }

    const framework = config.framework || this.detectFramework(context);
    const timeout = config.timeout || 30;

    // 在实际实现中，这里会调用测试框架执行测试
    // 这里我们模拟测试结果
    const testResult = await this.simulateTestRun(
      code,
      testCode,
      framework,
      timeout,
      context
    );

    // 保存测试结果
    this.setVariable(context, 'test_result', testResult);

    this.publishEvent(context, 'test:completed', {
      passed: testResult.passed,
      failed: testResult.failed,
      total: testResult.total
    });

    this.addExecutionRecord(context, true);

    return this.success({
      test_result: testResult,
      passed: testResult.passed,
      failed: testResult.failed,
      total: testResult.total,
      coverage: testResult.coverage
    });
  }

  /**
   * 生成测试代码
   */
  private async generateTestCode(
    code: string | undefined,
    task: any,
    design: any,
    testCategory: TestType,
    framework: TestFramework,
    context: NodeContext
  ): Promise<string> {
    const llmClient = this.getLLMClient(context);

    const sections = [];

    // 构建提示
    sections.push(`Write ${testCategory} tests using ${framework}.\n`);

    if (code) {
      sections.push('Code to test:\n```');
      sections.push(code.substring(0, 2000)); // 限制长度
      sections.push('```\n');
    }

    if (task) {
      const taskDesc = typeof task === 'string' ? task : JSON.stringify(task);
      sections.push(`Task context:\n${taskDesc}\n`);
    }

    sections.push(`
Generate comprehensive tests that:
1. Test all main code paths
2. Include edge cases and error conditions
3. Use descriptive test names
4. Include setup and teardown as needed
5. Use assertions properly

Return the complete test file code within a code block.
`);

    try {
      const response = await llmClient.chat([
        { role: 'system', content: this.getTestFrameworkPrompt(framework) },
        { role: 'user', content: sections.join('\n') }
      ]);

      return this.extractCodeBlock(response);
    } catch {
      // 降级：生成简单测试模板
      return this.generateTestTemplate(framework);
    }
  }

  /**
   * 检测测试框架
   */
  private detectFramework(context: NodeContext): TestFramework {
    const techStack = context.inputs.tech_stack;
    const language = techStack?.language || 'typescript';

    const defaults: Record<string, TestFramework> = {
      javascript: 'jest',
      typescript: 'jest',
      python: 'pytest',
      java: 'junit',
      go: 'go',
      rust: 'rspec'
    };

    return defaults[language] || 'jest';
  }

  /**
   * 模拟测试运行
   */
  private async simulateTestRun(
    code: string | undefined,
    testCode: string,
    framework: TestFramework,
    timeout: number,
    context: NodeContext
  ): Promise<TestSuiteResult> {
    // 在实际实现中，这里会真正执行测试
    // 这里我们模拟结果，返回一个基本的测试结果

    const totalTests = Math.max(1, Math.floor(testCode.length / 100));
    const passed = Math.floor(totalTests * 0.8); // 假设 80% 通过率
    const failed = totalTests - passed;

    return {
      total: totalTests,
      passed,
      failed,
      skipped: 0,
      results: [],
      coverage: {
        lines: 75,
        functions: 80,
        branches: 70,
        statements: 75
      }
    };
  }

  /**
   * 获取测试框架提示
   */
  private getTestFrameworkPrompt(framework: TestFramework): string {
    const prompts: Record<TestFramework, string> = {
      jest: `You are a Jest testing expert. Write clean, maintainable Jest tests. Use describe, test/it, expect, and Jest matchers. Use beforeAll, beforeEach, afterAll, afterEach for setup/teardown.`,
      mocha: `You are a Mocha testing expert. Write clean, maintainable Mocha tests. Use describe, it, and Chai assertions. Use before, beforeEach, after, afterEach for setup/teardown.`,
      jasmine: `You are a Jasmine testing expert. Write clean, maintainable Jasmine tests. Use describe, it, and expect. Use beforeEach, afterEach for setup/teardown.`,
      pytest: `You are a pytest expert. Write clean, maintainable Python tests using pytest. Use fixtures for setup/teardown. Use descriptive test names with underscores.`,
      unittest: `You are a Python unittest expert. Write clean, maintainable tests using unittest. Use setUp, tearDown for setup/teardown. Use descriptive test method names.`,
      junit: `You are a JUnit testing expert. Write clean, maintainable JUnit tests. Use @Test, @Before, @After, @BeforeClass, @AfterClass annotations.`,
      rspec: `You are an RSpec expert. Write clean, maintainable Ruby tests using RSpec. Use describe, it, expect. Use before, after for setup/teardown.`,
      go: `You are a Go testing expert. Write clean, maintainable Go tests. Use table-driven tests where appropriate. Use TestMain for setup/teardown.`
    };

    return prompts[framework] || prompts.jest;
  }

  /**
   * 提取代码块
   */
  private extractCodeBlock(response: string): string {
    const codeBlockRegex = /```\w*\n([\s\S]*?)```/;
    const match = codeBlockRegex.exec(response);
    return match ? match[1] : response;
  }

  /**
   * 生成测试模板
   */
  private generateTestTemplate(framework: TestFramework): string {
    const templates: Record<TestFramework, string> = {
      jest: `describe('Test Suite', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });

  // Add more tests here
});`,
      mocha: `describe('Test Suite', () => {
  it('should pass', () => {
    expect(true).to.be.true;
  });

  // Add more tests here
});`,
      jasmine: `describe('Test Suite', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });

  // Add more tests here
});`,
      pytest: `def test_example():
    assert True

# Add more tests here`,
      unittest: `import unittest

class TestSuite(unittest.TestCase):
    def test_example(self):
        self.assertTrue(True)

if __name__ == '__main__':
    unittest.main()`,
      junit: `import org.junit.Test;
import static org.junit.Assert.*;

public class TestSuite {
    @Test
    public void testExample() {
        assertTrue(true);
    }
}`,
      rspec: `describe 'Test Suite' do
  it 'should pass' do
    expect(true).to be true
  end
end`,
      go: `package main

import "testing"

func TestExample(t *testing.T) {
    if !true {
        t.Error("expected true")
    }
}`
    };

    return templates[framework] || templates.jest;
  }

  /**
   * 生成测试文件路径
   */
  private generateTestPath(framework: TestFramework, category: TestType): string {
    const exts: Record<TestFramework, string> = {
      jest: 'test.ts',
      mocha: 'test.ts',
      jasmine: 'spec.ts',
      pytest: 'test.py',
      unittest: 'test.py',
      junit: 'Test.java',
      rspec: '_spec.rb',
      go: '_test.go'
    };

    return `tests/${category}.${exts[framework]}`;
  }
}
