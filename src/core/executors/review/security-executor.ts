/**
 * Security 节点执行器
 * 安全审计
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 安全类别
 */
type SecurityCategory =
  | 'injection'
  | 'xss'
  | 'authentication'
  | 'authorization'
  | 'encryption'
  | 'data-exposure'
  | 'misconfiguration'
  | 'all';

/**
 * 严重级别
 */
type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Security 节点配置
 */
interface SecurityConfig {
  /** 安全类别 */
  category?: SecurityCategory;
  /** 安全标准 */
  standard?: 'owasp' | 'sans' | 'custom';
  /** 是否包含敏感数据检测 */
  detect_sensitive_data?: boolean;
  /** 是否生成修复建议 */
  generate_fixes?: boolean;
}

/**
 * 安全漏洞
 */
interface SecurityVulnerability {
  /** 漏洞 ID */
  id: string;
  /** 漏洞类型 */
  type: SecurityCategory;
  /** 漏洞名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 位置 */
  location?: {
    line?: number;
    column?: number;
    file?: string;
  };
  /** 严重级别 */
  severity: SeverityLevel;
  /** CWE 编号 */
  cwe?: string;
  /** 修复建议 */
  fix?: string;
}

/**
 * 安全审计结果
 */
interface SecurityAuditResult {
  /** 是否安全 */
  secure: boolean;
  /** 漏洞列表 */
  vulnerabilities: SecurityVulnerability[];
  /** 风险评分 (0-1, 1为最危险) */
  risk_score: number;
  /** 检测到的敏感数据 */
  sensitive_data?: string[];
}

/**
 * Security 节点执行器
 */
export class SecurityExecutor extends BaseNodeExecutor {
  private vulnIdCounter = 0;

  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as SecurityConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const artifact = context.inputs.artifact || context.inputs.code;
      const techStack = context.inputs.tech_stack;

      if (!artifact) {
        throw new Error('Artifact data is required');
      }

      const category = config.category || 'all';
      const standard = config.standard || 'owasp';

      // 执行安全审计
      const auditResult = await this.performSecurityAudit(
        artifact,
        category,
        standard,
        techStack,
        config,
        context
      );

      // 生成修复建议（如果配置）
      let fixedCode;
      if (config.generate_fixes && !auditResult.secure) {
        fixedCode = await this.generateSecurityFixes(artifact, auditResult.vulnerabilities, context);
      }

      // 保存审计结果
      this.setVariable(context, 'security_audit_result', auditResult);
      this.setVariable(context, 'security_secure', auditResult.secure);

      this.publishEvent(context, 'security:completed', {
        secure: auditResult.secure,
        riskScore: auditResult.risk_score,
        vulnCount: auditResult.vulnerabilities.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        secure: auditResult.secure,
        vulnerabilities: auditResult.vulnerabilities,
        risk_score: auditResult.risk_score,
        sensitive_data: auditResult.sensitive_data,
        fixed_code: fixedCode
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 执行安全审计
   */
  private async performSecurityAudit(
    artifact: string,
    category: SecurityCategory,
    standard: string,
    techStack: any,
    config: SecurityConfig,
    context: NodeContext
  ): Promise<SecurityAuditResult> {
    const llmClient = this.getLLMClient(context);

    const artifactContent = typeof artifact === 'string' ? artifact : JSON.stringify(artifact, null, 2);

    // 构建审计提示
    const prompt = this.buildSecurityPrompt(
      artifactContent,
      category,
      standard,
      techStack
    );

    try {
      const response = await llmClient.chat([
        { role: 'system', content: this.getSecuritySystemPrompt(standard) },
        { role: 'user', content: prompt }
      ]);

      const parsed = this.parseSecurityResponse(response);

      // 检测敏感数据（如果配置）
      let sensitiveData: string[] | undefined;
      if (config.detect_sensitive_data) {
        sensitiveData = this.detectSensitiveData(artifactContent);
      }

      // 计算风险评分
      const riskScore = this.calculateRiskScore(parsed.vulnerabilities);

      return {
        secure: parsed.vulnerabilities.length === 0,
        vulnerabilities: parsed.vulnerabilities,
        risk_score: riskScore,
        sensitive_data: sensitiveData?.length ? sensitiveData : undefined
      };
    } catch {
      // 降级：执行基本静态分析
      return this.performStaticAnalysis(artifactContent);
    }
  }

  /**
   * 构建安全审计提示
   */
  private buildSecurityPrompt(
    artifact: string,
    category: SecurityCategory,
    standard: string,
    techStack: any
  ): string {
    const sections: string[] = [];

    sections.push(`Perform a ${standard.toUpperCase()} security audit on the following ${category}:\n`);

    sections.push('```');
    sections.push(artifact.substring(0, 4000));
    sections.push('```\n');

    // 添加技术栈上下文
    if (techStack) {
      sections.push(`\nTech Stack: ${techStack.framework || 'Unknown'}`);
      sections.push(`Language: ${techStack.language || 'Unknown'}`);
    }

    // 添加检查类别说明
    const categories = {
      injection: 'SQL injection, command injection, LDAP injection, etc.',
      xss: 'Cross-site scripting vulnerabilities.',
      authentication: 'Authentication and session management issues.',
      authorization: 'Access control and privilege escalation.',
      encryption: 'Cryptography and data protection issues.',
      'data-exposure': 'Sensitive data exposure and privacy issues.',
      misconfiguration: 'Security misconfigurations.',
      all: 'All of the above security issues.'
    };

    sections.push(`\nCheck for: ${categories[category]}\n`);

    sections.push(`
Return JSON:
{
  "vulnerabilities": [
    {
      "type": "category",
      "name": "vulnerability name",
      "description": "description",
      "severity": "critical|high|medium|low|info",
      "cwe": "CWE-ID",
      "location": {"line": 10},
      "fix": "fix suggestion"
    }
  ]
}
`);

    return sections.join('\n');
  }

  /**
   * 获取安全审计系统提示
   */
  private getSecuritySystemPrompt(standard: string): string {
    const prompts: Record<string, string> = {
      owasp: `You are an OWASP security expert. Conduct security audits following OWASP Top 10 guidelines. Focus on injection attacks, broken authentication, sensitive data exposure, XML external entities, broken access control, security misconfiguration, cross-site scripting, insecure deserialization, using components with known vulnerabilities, and insufficient logging/monitoring.`,
      sans: `You are a SANS security expert. Conduct security audits following SANS Top 25 critical security weaknesses. Focus on buffer overflows, cross-site scripting, SQL injection, OS command injection, and other critical vulnerabilities.`,
      custom: `You are a security expert. Conduct thorough security audits. Check for common vulnerabilities including injection attacks, authentication/authorization issues, data exposure, encryption problems, and security misconfigurations.`
    };

    return prompts[standard] || prompts.owasp;
  }

  /**
   * 解析安全审计响应
   */
  private parseSecurityResponse(response: string): {
    vulnerabilities: SecurityVulnerability[];
  } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : '{}';
      const parsed = JSON.parse(jsonStr);

      const vulnerabilities: SecurityVulnerability[] = (parsed.vulnerabilities || [])
        .map((vuln: any) => ({
          id: `VULN-${this.vulnIdCounter++}`,
          type: vuln.type || 'misconfiguration',
          name: vuln.name || 'Unnamed vulnerability',
          description: vuln.description || 'No description',
          location: vuln.location,
          severity: ['critical', 'high', 'medium', 'low', 'info'].includes(vuln.severity)
            ? vuln.severity
            : 'medium',
          cwe: vuln.cwe,
          fix: vuln.fix
        }));

      return { vulnerabilities };
    } catch {
      return { vulnerabilities: [] };
    }
  }

  /**
   * 执行静态分析（降级方案）
   */
  private performStaticAnalysis(artifact: string): SecurityAuditResult {
    const vulnerabilities: SecurityVulnerability[] = [];
    const lowerArtifact = artifact.toLowerCase();

    // 检测常见安全问题
    if (lowerArtifact.includes('eval(')) {
      vulnerabilities.push({
        id: `VULN-${this.vulnIdCounter++}`,
        type: 'injection',
        name: 'Dynamic code evaluation',
        description: 'Potential code injection vulnerability due to use of eval()',
        severity: 'high',
        cwe: 'CWE-95',
        fix: 'Avoid using eval(). Use safer alternatives like JSON.parse() or proper parsing.'
      });
    }

    if (lowerArtifact.includes('sql') && lowerArtifact.includes('"')) {
      vulnerabilities.push({
        id: `VULN-${this.vulnIdCounter++}`,
        type: 'injection',
        name: 'Potential SQL injection',
        description: 'SQL query built with string concatenation',
        severity: 'critical',
        cwe: 'CWE-89',
        fix: 'Use parameterized queries or prepared statements.'
      });
    }

    if (lowerArtifact.includes('password') && !lowerArtifact.includes('hash')) {
      vulnerabilities.push({
        id: `VULN-${this.vulnIdCounter++}`,
        type: 'data-exposure',
        name: 'Password stored in plaintext',
        description: 'Passwords should be hashed, not stored in plaintext',
        severity: 'critical',
        cwe: 'CWE-256',
        fix: 'Use strong hashing algorithms like bcrypt, scrypt, or Argon2.'
      });
    }

    if (lowerArtifact.includes('http://') && lowerArtifact.includes('credentials')) {
      vulnerabilities.push({
        id: `VULN-${this.vulnIdCounter++}`,
        type: 'encryption',
        name: 'Insecure credential transmission',
        description: 'Credentials transmitted over HTTP instead of HTTPS',
        severity: 'critical',
        cwe: 'CWE-319',
        fix: 'Use HTTPS for all credential transmission.'
      });
    }

    const riskScore = this.calculateRiskScore(vulnerabilities);

    return {
      secure: vulnerabilities.length === 0,
      vulnerabilities,
      risk_score: riskScore
    };
  }

  /**
   * 计算风险评分
   */
  private calculateRiskScore(vulnerabilities: SecurityVulnerability[]): number {
    if (vulnerabilities.length === 0) {
      return 0;
    }

    const severityWeights = {
      critical: 1.0,
      high: 0.75,
      medium: 0.5,
      low: 0.25,
      info: 0.1
    };

    const totalWeight = vulnerabilities.reduce((sum, vuln) =>
      sum + (severityWeights[vuln.severity] || 0.5), 0
    );

    return Math.min(1, totalWeight / Math.max(1, vulnerabilities.length));
  }

  /**
   * 检测敏感数据
   */
  private detectSensitiveData(artifact: string): string[] {
    const patterns = {
      'API key': /api[_-]?key['"\s]*[:=]['"\s]*[a-zA-Z0-9\-_]{20,}/gi,
      'Token': /token['"\s]*[:=]['"\s]*[a-zA-Z0-9\-_]{20,}/gi,
      'Password': /password['"\s]*[:=]['"\s]*[^\s"']{4,}/gi,
      'Credit Card': /\b(?:\d[ -]*?){13,16}\b/g,
      'Email': /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    };

    const detected: string[] = [];

    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = artifact.match(pattern);
      if (matches) {
        detected.push(`${type}: ${matches.length} found`);
      }
    }

    return detected;
  }

  /**
   * 生成安全修复
   */
  private async generateSecurityFixes(
    artifact: string,
    vulnerabilities: SecurityVulnerability[],
    context: NodeContext
  ): Promise<string> {
    const llmClient = this.getLLMClient(context);

    const vulnDescriptions = vulnerabilities
      .map(v => `[${v.severity}] ${v.name}: ${v.description}\n  Fix: ${v.fix || 'See documentation'}`)
      .join('\n\n');

    const prompt = `
Fix these security vulnerabilities in the following code:

Code:
${artifact.substring(0, 3000)}

Vulnerabilities:
${vulnDescriptions}

Return only the fixed code, no explanation.
`;

    try {
      return await llmClient.chat([
        { role: 'system', content: 'You are a security expert specializing in fixing vulnerabilities.' },
        { role: 'user', content: prompt }
      ]);
    } catch {
      return artifact;
    }
  }
}
