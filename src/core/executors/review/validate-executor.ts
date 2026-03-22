/**
 * Validate 节点执行器
 * 规范验证
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 验证类型
 */
type ValidationType =
  | 'schema'
  | 'spec'
  | 'api'
  | 'contract'
  | 'data'
  | 'format'
  | 'all';

/**
 * Validate 节点配置
 */
interface ValidateConfig {
  /** 验证类型 */
  validation_type?: ValidationType;
  /** 是否严格模式 */
  strict_mode?: boolean;
  /** 自定义验证规则 */
  custom_rules?: ValidationRule[];
  /** 验证架构 */
  schema?: any;
  /** 是否修复验证失败 */
  auto_fix?: boolean;
}

/**
 * 验证规则
 */
interface ValidationRule {
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 规则表达式 */
  expression: string;
  /** 严重级别 */
  severity: 'error' | 'warning' | 'info';
}

/**
 * 验证结果
 */
interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 验证错误 */
  errors: ValidationError[];
  /** 验证警告 */
  warnings: ValidationError[];
  /** 验证通过的规则 */
  passed_rules: string[];
  /** 验证失败的规则 */
  failed_rules: string[];
}

/**
 * 验证错误
 */
interface ValidationError {
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 位置 */
  location?: {
    line?: number;
    column?: number;
    path?: string;
  };
  /** 严重级别 */
  severity: 'error' | 'warning' | 'info';
}

/**
 * Validate 节点执行器
 */
export class ValidateExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as ValidateConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const artifact = context.inputs.artifact || context.inputs.code || context.inputs.content;
      const spec = context.inputs.specifications;
      const design = context.inputs.design;

      if (!artifact) {
        throw new Error('Artifact data is required');
      }

      const validationType = config.validation_type || 'all';
      const strictMode = config.strict_mode || false;

      // 执行验证
      const validationResult = await this.validate(
        artifact,
        spec,
        design,
        validationType,
        config,
        strictMode,
        context
      );

      // 如果启用自动修复且存在错误
      let fixedArtifact = artifact;
      if (config.auto_fix && !validationResult.valid) {
        fixedArtifact = await this.fixValidationErrors(artifact, validationResult, context);
      }

      // 保存验证结果
      this.setVariable(context, 'validation_result', validationResult);
      this.setVariable(context, 'validation_valid', validationResult.valid);

      this.publishEvent(context, 'validate:completed', {
        valid: validationResult.valid,
        errors: validationResult.errors.length,
        warnings: validationResult.warnings.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        passed_rules: validationResult.passed_rules,
        failed_rules: validationResult.failed_rules,
        fixed_artifact: fixedArtifact !== artifact ? fixedArtifact : undefined
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 执行验证
   */
  private async validate(
    artifact: any,
    spec: any,
    design: any,
    validationType: ValidationType,
    config: ValidateConfig,
    strictMode: boolean,
    context: NodeContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const passedRules: string[] = [];
    const failedRules: string[] = [];

    // Schema 验证
    if (validationType === 'schema' || validationType === 'all') {
      const schemaResult = this.validateSchema(artifact, config.schema);
      errors.push(...schemaResult.errors);
      warnings.push(...schemaResult.warnings);
      if (schemaResult.valid) passedRules.push('schema');
      else failedRules.push('schema');
    }

    // 规范验证
    if (validationType === 'spec' || validationType === 'all') {
      const specResult = await this.validateSpec(artifact, spec, context);
      errors.push(...specResult.errors);
      warnings.push(...specResult.warnings);
      if (specResult.valid) passedRules.push('spec');
      else failedRules.push('spec');
    }

    // API 验证
    if (validationType === 'api' || validationType === 'all') {
      const apiResult = await this.validateAPI(artifact, design, context);
      errors.push(...apiResult.errors);
      warnings.push(...apiResult.warnings);
      if (apiResult.valid) passedRules.push('api');
      else failedRules.push('api');
    }

    // 自定义规则验证
    if (config.custom_rules) {
      for (const rule of config.custom_rules) {
        const ruleResult = this.validateCustomRule(artifact, rule, context);
        if (ruleResult.valid) {
          passedRules.push(rule.name);
        } else {
          failedRules.push(rule.name);
          if (rule.severity === 'error') {
            errors.push(ruleResult.error);
          } else {
            warnings.push(ruleResult.error);
          }
        }
      }
    }

    // 基本格式验证
    if (validationType === 'format' || validationType === 'all') {
      const formatResult = this.validateFormat(artifact);
      warnings.push(...formatResult.warnings);
      if (formatResult.valid) passedRules.push('format');
      else failedRules.push('format');
    }

    // 在严格模式下，警告也算作错误
    if (strictMode) {
      errors.push(...warnings.map(w => ({ ...w, severity: 'error' as const })));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      passed_rules: passedRules,
      failed_rules: failedRules
    };
  }

  /**
   * Schema 验证
   */
  private validateSchema(artifact: any, schema?: any): {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!schema) {
      // 没有提供 schema，跳过验证
      return { valid: true, errors, warnings };
    }

    // 简化版 schema 验证
    // 实际实现应该使用 JSON Schema 验证库
    try {
      if (schema.type && typeof artifact !== schema.type) {
        errors.push({
          code: 'SCHEMA_TYPE_MISMATCH',
          message: `Expected type ${schema.type}, got ${typeof artifact}`,
          severity: 'error'
        });
      }

      if (schema.required && Array.isArray(schema.required)) {
        for (const requiredField of schema.required) {
          if (!artifact || !(requiredField in artifact)) {
            errors.push({
              code: 'SCHEMA_REQUIRED_MISSING',
              message: `Required field '${requiredField}' is missing`,
              severity: 'error'
            });
          }
        }
      }
    } catch (e) {
      errors.push({
        code: 'SCHEMA_VALIDATION_ERROR',
        message: `Schema validation failed: ${(e as Error).message}`,
        severity: 'error'
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 规范验证
   */
  private async validateSpec(artifact: any, spec: any, context: NodeContext): Promise<{
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
  }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!spec) {
      // 没有提供规范，返回警告
      warnings.push({
        code: 'SPEC_NOT_AVAILABLE',
        message: 'No specifications available for validation',
        severity: 'warning'
      });
      return { valid: true, errors, warnings };
    }

    // 使用 LLM 进行规范验证
    const llmClient = this.getLLMClient(context);

    const artifactContent = typeof artifact === 'string' ? artifact : JSON.stringify(artifact, null, 2);
    const specContent = JSON.stringify(spec, null, 2);

    const prompt = `
Validate this artifact against these specifications:

Artifact:
${artifactContent.substring(0, 2000)}

Specifications:
${specContent.substring(0, 2000)}

Check if the artifact meets all "must" requirements.
Return JSON:
{
  "valid": true/false,
  "errors": [{"code": "...", "message": "..."}],
  "warnings": [{"code": "...", "message": "..."}]
}
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a specification validation expert.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(response);
      return {
        valid: parsed.valid || true,
        errors: parsed.errors || [],
        warnings: parsed.warnings || []
      };
    } catch {
      return { valid: true, errors, warnings };
    }
  }

  /**
   * API 验证
   */
  private async validateAPI(artifact: any, design: any, context: NodeContext): Promise<{
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
  }> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!design?.interfaces) {
      return { valid: true, errors, warnings };
    }

    // 检查 artifact 是否实现了所有定义的接口
    const artifactContent = typeof artifact === 'string' ? artifact : JSON.stringify(artifact);

    for (const iface of design.interfaces) {
      if (!artifactContent.includes(iface.name)) {
        warnings.push({
          code: 'API_INTERFACE_NOT_FOUND',
          message: `Interface '${iface.name}' not found in artifact`,
          severity: 'warning'
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 自定义规则验证
   */
  private validateCustomRule(artifact: any, rule: ValidationRule, context: NodeContext): {
    valid: boolean;
    error: ValidationError;
  } {
    try {
      // 注意：在生产环境中应使用安全的表达式评估
      const validate = new Function('artifact', `return ${rule.expression}`);
      const result = validate(artifact);

      if (!result) {
        return {
          valid: false,
          error: {
            code: `CUSTOM_RULE_${rule.name.toUpperCase()}`,
            message: `Rule '${rule.name}' failed: ${rule.description}`,
            severity: rule.severity
          }
        };
      }

      return {
        valid: true,
        error: {
          code: '',
          message: '',
          severity: 'info'
        }
      };
    } catch (e) {
      return {
        valid: false,
        error: {
          code: 'CUSTOM_RULE_ERROR',
          message: `Rule '${rule.name}' evaluation error: ${(e as Error).message}`,
          severity: 'warning'
        }
      };
    }
  }

  /**
   * 格式验证
   */
  private validateFormat(artifact: any): {
    valid: boolean;
    warnings: ValidationError[];
  } {
    const warnings: ValidationError[] = [];

    if (typeof artifact === 'string') {
      // 检查文件大小
      if (artifact.length > 100000) {
        warnings.push({
          code: 'LARGE_FILE_SIZE',
          message: `Artifact size (${artifact.length} chars) exceeds recommended limit`,
          severity: 'warning'
        });
      }

      // 检查基本格式问题
      if (artifact.includes('TODO') || artifact.includes('FIXME')) {
        warnings.push({
          code: 'TODO_FOUND',
          message: 'Artifact contains TODO/FIXME markers',
          severity: 'info'
        });
      }
    }

    return { valid: true, warnings };
  }

  /**
   * 修复验证错误
   */
  private async fixValidationErrors(
    artifact: string,
    validationResult: ValidationResult,
    context: NodeContext
  ): Promise<string> {
    const llmClient = this.getLLMClient(context);

    const errorMessages = validationResult.errors.map(e => e.message).join('\n');

    const prompt = `
Fix these validation errors in the following artifact:

Artifact:
${artifact.substring(0, 3000)}

Errors:
${errorMessages}

Return only the fixed artifact, no explanation.
`;

    try {
      return await llmClient.chat([
        { role: 'system', content: 'You are an expert at fixing validation errors.' },
        { role: 'user', content: prompt }
      ]);
    } catch {
      return artifact;
    }
  }
}
