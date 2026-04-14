/**
 * Notify 节点执行器
 * 发送通知
 */

import { BaseNodeExecutor } from '../base-node-executor';
import { NodeContext, NodeResult } from '../../types/node.types';

/**
 * 通知类型
 */
type NotificationType =
  | 'email'
  | 'slack'
  | 'teams'
  | 'webhook'
  | 'console'
  | 'log'
  | 'event';

/**
 * 通知优先级
 */
type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Notify 节点配置
 */
interface NotifyConfig {
  /** 通知类型 */
  notification_type?: NotificationType;
  /** 目标地址（邮箱、URL 等） */
  destination?: string;
  /** 消息模板 */
  template?: string;
  /** 优先级 */
  priority?: NotificationPriority;
  /** 是否包含附件 */
  include_attachments?: boolean;
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * Notify 节点执行器
 */
export class NotifyExecutor extends BaseNodeExecutor {
  /**
   * 执行节点
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as NotifyConfig;

    try {
      // 验证输入
      this.validateInputs(context.inputs);

      const message = context.inputs.message || context.inputs.content;
      const subject = context.inputs.subject || context.inputs.title;
      const attachments = context.inputs.attachments;

      if (!message) {
        throw new Error('Message is required');
      }

      const notificationType = config.notification_type || 'console';
      const priority = config.priority || 'normal';

      // 构建通知内容
      const notification = await this.buildNotification(
        message,
        subject,
        attachments,
        config,
        context
      );

      // 发送通知
      const sendResult = await this.sendNotification(
        notification,
        notificationType,
        priority,
        config,
        context
      );

      // 保存通知结果
      this.setVariable(context, 'notification_result', sendResult);

      this.publishEvent(context, 'notify:sent', {
        type: notificationType,
        priority,
        destination: config.destination
      });

      this.addExecutionRecord(context, true);

      return this.success({
        sent: sendResult.success,
        notification_type: notificationType,
        notification_id: sendResult.notification_id,
        destination: sendResult.destination
      });

    } catch (error) {
      this.addExecutionRecord(context, false, (error as Error).message);
      return this.failure(error as Error);
    }
  }

  /**
   * 构建通知
   */
  private async buildNotification(
    message: string,
    subject: string | undefined,
    attachments: any[] | undefined,
    config: NotifyConfig,
    context: NodeContext
  ): Promise<any> {
    let content = message;

    // 应用模板
    if (config.template) {
      content = this.applyTemplate(config.template, context.inputs, context.state.variables);
    }

    return {
      subject: subject || 'Notification',
      content,
      attachments: config.include_attachments ? attachments : undefined,
      priority: config.priority || 'normal',
      timestamp: new Date().toISOString(),
      metadata: config.metadata
    };
  }

  /**
   * 发送通知
   */
  private async sendNotification(
    notification: any,
    type: NotificationType,
    priority: NotificationPriority,
    config: NotifyConfig,
    context: NodeContext
  ): Promise<{ success: boolean; notification_id: string; destination: string }> {
    const destination = config.destination || 'default';

    switch (type) {
      case 'email':
        return await this.sendEmail(notification, destination);

      case 'slack':
        return await this.sendSlack(notification, destination);

      case 'teams':
        return await this.sendTeams(notification, destination);

      case 'webhook':
        return await this.sendWebhook(notification, destination);

      case 'console':
        return this.sendToConsole(notification, priority);

      case 'log':
        return this.sendToLog(notification, context);

      case 'event':
        return this.sendAsEvent(notification, context);

      default:
        return this.sendToConsole(notification, priority);
    }
  }

  /**
   * 发送邮件
   */
  private async sendEmail(
    notification: any,
    destination: string
  ): Promise<{ success: boolean; notification_id: string; destination: string }> {
    // 在实际实现中，这里会调用邮件 API
    // 这里我们模拟发送
    const notificationId = `email_${Date.now()}`;

    console.log(`[EMAIL] To: ${destination}`);
    console.log(`[EMAIL] Subject: ${notification.subject}`);
    console.log(`[EMAIL] Content: ${notification.content}`);

    return {
      success: true,
      notification_id: notificationId,
      destination
    };
  }

  /**
   * 发送 Slack
   */
  private async sendSlack(
    notification: any,
    destination: string
  ): Promise<{ success: boolean; notification_id: string; destination: string }> {
    const notificationId = `slack_${Date.now()}`;

    console.log(`[SLACK] Webhook: ${destination}`);
    console.log(`[SLACK] Content: ${notification.content}`);

    return {
      success: true,
      notification_id: notificationId,
      destination
    };
  }

  /**
   * 发送 Teams
   */
  private async sendTeams(
    notification: any,
    destination: string
  ): Promise<{ success: boolean; notification_id: string; destination: string }> {
    const notificationId = `teams_${Date.now()}`;

    console.log(`[TEAMS] Webhook: ${destination}`);
    console.log(`[TEAMS] Content: ${notification.content}`);

    return {
      success: true,
      notification_id: notificationId,
      destination
    };
  }

  /**
   * 发送 Webhook
   */
  private async sendWebhook(
    notification: any,
    destination: string
  ): Promise<{ success: boolean; notification_id: string; destination: string }> {
    const notificationId = `webhook_${Date.now()}`;

    // 在实际实现中，这里会执行 HTTP POST
    console.log(`[WEBHOOK] URL: ${destination}`);
    console.log(`[WEBHOOK] Payload:`, notification);

    return {
      success: true,
      notification_id: notificationId,
      destination
    };
  }

  /**
   * 发送到控制台
   */
  private sendToConsole(
    notification: any,
    priority: NotificationPriority
  ): { success: boolean; notification_id: string; destination: string } {
    const notificationId = `console_${Date.now()}`;
    const prefix = this.getPriorityPrefix(priority);

    console.log(`[${prefix}] ${notification.subject || 'Notification'}`);
    console.log(`[${prefix}] ${notification.content}`);

    return {
      success: true,
      notification_id: notificationId,
      destination: 'console'
    };
  }

  /**
   * 发送到日志
   */
  private sendToLog(
    notification: any,
    context: NodeContext
  ): { success: boolean; notification_id: string; destination: string } {
    const notificationId = `log_${Date.now()}`;

    // 记录到工作流状态
    context.state.variables['_log'] = context.state.variables['_log'] || [];
    context.state.variables['_log'].push({
      timestamp: new Date().toISOString(),
      notification
    });

    return {
      success: true,
      notification_id: notificationId,
      destination: 'log'
    };
  }

  /**
   * 作为事件发送
   */
  private sendAsEvent(
    notification: any,
    context: NodeContext
  ): { success: boolean; notification_id: string; destination: string } {
    const notificationId = `event_${Date.now()}`;

    this.publishEvent(context, 'notification', notification);

    return {
      success: true,
      notification_id: notificationId,
      destination: 'event_bus'
    };
  }

  /**
   * 获取优先级前缀
   */
  private getPriorityPrefix(priority: NotificationPriority): string {
    const prefixes: Record<NotificationPriority, string> = {
      low: 'INFO',
      normal: 'NOTICE',
      high: 'WARNING',
      urgent: 'ALERT'
    };

    return prefixes[priority];
  }

  /**
   * 应用模板
   */
  private applyTemplate(
    template: string,
    inputs: Record<string, any>,
    variables: Record<string, any>
  ): string {
    let result = template;

    // 替换输入占位符
    for (const key in inputs) {
      const placeholder = new RegExp(`{${key}}`, 'g');
      result = result.replace(placeholder, String(inputs[key]));
    }

    // 替换变量占位符
    for (const key in variables) {
      const placeholder = new RegExp(`{${key}}`, 'g');
      result = result.replace(placeholder, String(variables[key]));
    }

    return result;
  }
}
