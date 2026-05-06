/**
 * Negotiate 节点执行器
 * 多方协商
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult, NegotiationResult } from '../../types/node.types';

/**
 * 协商策略
 */
type NegotiationStrategy =
  | 'majority_vote'
  | 'consensus'
  | 'expert_priority'
  | 'weighted'
  | 'round_robin';

/**
 * Negotiate 节点配置
 */
interface NegotiateConfig {
  /** 协商策略 */
  strategy?: NegotiationStrategy;
  /** 最大轮次 */
  max_rounds?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否需要人类确认 */
  require_human_confirmation?: boolean;
}

/**
 * Negotiate 节点执行器
 */
export class NegotiateExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as NegotiateConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      // 获取参与者意见
      const participants = this.getParticipants(context.inputs);

      if (participants.length === 0) {
        return this.success({
          agreed: true,
          final_proposal: null,
          opinions: [],
          conflicts: []
        });
      }

      const strategy = config.strategy || 'majority_vote';
      const maxRounds = config.max_rounds || 3;

      // 执行协商
      const result = await this.performNegotiation(
        participants,
        strategy,
        maxRounds,
        config.timeout || 30000,
        context
      );

      // 保存结果
      this.setVariable(context, 'negotiation_result', result);

      this.publishEvent(context, 'negotiate:completed', {
        agreed: result.agreed,
        participantCount: participants.length
      });

      this.addExecutionRecord(context, true);

      return this.success({
        negotiation_result: result,
        agreed: result.agreed,
        final_proposal: result.finalProposal,
        opinions: result.opinions,
        conflicts: result.conflicts
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 获取参与者
   */
  private getParticipants(inputs: Record<string, any>): any[] {
    // 查找参与者列表
    if (inputs.participants && Array.isArray(inputs.participants)) {
      return inputs.participants;
    }

    if (inputs.agents && Array.isArray(inputs.agents)) {
      return inputs.agents;
    }

    // 收集所有意见
    const participants: any[] = [];
    for (const key in inputs) {
      if (key.startsWith('agent_') || key.startsWith('opinion_')) {
        participants.push({
          id: key,
          content: inputs[key]
        });
      }
    }

    return participants.length > 0 ? participants : [{ id: 'default', content: inputs }];
  }

  /**
   * 执行协商
   */
  private async performNegotiation(
    participants: any[],
    strategy: NegotiationStrategy,
    maxRounds: number,
    timeout: number,
    context: NodeContext
  ): Promise<NegotiationResult> {
    const opinions: any[] = [];
    const conflicts: any[] = [];

    // 收集所有意见
    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      const opinion = {
        agentId: participant.id || `agent_${i}`,
        agentName: participant.name || `Agent ${i + 1}`,
        content: typeof participant.content === 'string'
          ? participant.content
          : JSON.stringify(participant.content),
        timestamp: new Date()
      };

      opinions.push(opinion);
    }

    // 根据策略确定最终方案
    let finalProposal: any;
    let agreed = false;

    switch (strategy) {
      case 'majority_vote':
        finalProposal = await this.majorityVote(opinions, context);
        agreed = finalProposal.agreed;
        break;

      case 'consensus':
        finalProposal = await this.consensus(opinions, maxRounds, context);
        agreed = finalProposal.agreed;
        break;

      case 'expert_priority':
        finalProposal = await this.expertPriority(opinions, context);
        agreed = true;
        break;

      case 'weighted':
        finalProposal = await this.weighted(opinions, participants, context);
        agreed = true;
        break;

      case 'round_robin':
        finalProposal = opinions[0]?.content;
        agreed = true;
        break;

      default:
        finalProposal = opinions[0]?.content;
        agreed = false;
    }

    // 识别冲突点
    for (let i = 0; i < opinions.length; i++) {
      for (let j = i + 1; j < opinions.length; j++) {
        if (this.hasConflict(opinions[i].content, opinions[j].content)) {
          conflicts.push({
            description: `Conflict between ${opinions[i].agentName} and ${opinions[j].agentName}`,
            participants: [opinions[i].agentId, opinions[j].agentId],
            resolved: agreed,
            resolution: agreed ? 'Resolved through negotiation' : 'Unresolved'
          });
        }
      }
    }

    return {
      agreed,
      finalProposal,
      opinions,
      conflicts
    };
  }

  /**
   * 多数投票
   */
  private async majorityVote(
    opinions: any[],
    context: NodeContext
  ): Promise<{ agreed: boolean; proposal: any }> {
    // 简化实现：检查意见是否一致
    const firstOpinion = opinions[0]?.content;

    const agreeCount = opinions.filter(o => o.content === firstOpinion).length;
    const agreed = agreeCount > opinions.length / 2;

    return {
      agreed,
      proposal: agreed ? firstOpinion : await this.resolveConflict(opinions, context)
    };
  }

  /**
   * 共识
   */
  private async consensus(
    opinions: any[],
    maxRounds: number,
    context: NodeContext
  ): Promise<{ agreed: boolean; proposal: any }> {
    const llmClient = this.getLLMClient(context);

    const prompt = `
Facilitate consensus among these opinions:

${opinions.map(o => `- ${o.agentName}: ${o.content}`).join('\n')}

Return a consensus proposal or indicate that consensus cannot be reached.
Return JSON:
{
  "agreed": true/false,
  "proposal": "consensus text",
  "reasoning": "explanation"
}
`;

    try {
      const response = await llmClient.chat([
        { role: 'system', content: 'You are a negotiation and consensus expert.' },
        { role: 'user', content: prompt }
      ]);

      const parsed = JSON.parse(response);
      return {
        agreed: parsed.agreed || false,
        proposal: parsed.proposal
      };
    } catch {
      return {
        agreed: false,
        proposal: 'Could not reach consensus'
      };
    }
  }

  /**
   * 专家优先
   */
  private async expertPriority(
    opinions: any[],
    context: NodeContext
  ): Promise<any> {
    // 使用第一个专家的意见
    return opinions[0]?.content || null;
  }

  /**
   * 加权
   */
  private async weighted(
    opinions: any[],
    participants: any[],
    context: NodeContext
  ): Promise<any> {
    // 简化实现：返回第一个意见
    return opinions[0]?.content || null;
  }

  /**
   * 解决冲突
   */
  private async resolveConflict(
    opinions: any[],
    context: NodeContext
  ): Promise<any> {
    const llmClient = this.getLLMClient(context);

    const prompt = `
Resolve this conflict by synthesizing these opinions:

${opinions.map(o => `- ${o.agentName}: ${o.content}`).join('\n')}

Provide a balanced proposal that addresses all concerns.
`;

    try {
      return await llmClient.chat([
        { role: 'system', content: 'You are a conflict resolution expert.' },
        { role: 'user', content: prompt }
      ]);
    } catch {
      return opinions[0]?.content || 'Conflict resolution failed';
    }
  }

  /**
   * 检查冲突
   */
  private hasConflict(opinion1: string, opinion2: string): boolean {
    // 简化实现：检查意见是否不同
    return opinion1 !== opinion2;
  }
}
