import type { BranchMessage, Subscription, MessageFilter, MessageType, Priority } from '../types/memory';
import { EventEmitter } from 'events';

/**
 * 消息总线实现
 * 负责支流之间的消息传递和订阅管理
 */
export class MessageBus {
  private messages: BranchMessage[] = [];
  private subscriptions: Map<string, Set<Subscription>> = new Map();
  private eventEmitter = new EventEmitter();
  private maxMessages: number;

  constructor(maxMessages: number = 1000) {
    this.maxMessages = maxMessages;
  }

  /**
   * 发送消息
   */
  send(message: Omit<BranchMessage, 'id' | 'timestamp'>): string {
    const fullMessage: BranchMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      priority: message.priority || 'normal',
    };

    this.messages.push(fullMessage);

    // 保持消息数量在限制内
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    // 触发消息事件
    this.eventEmitter.emit('message', fullMessage);

    // 投递给订阅者
    this.deliverMessage(fullMessage);

    return fullMessage.id;
  }

  /**
   * 广播消息到所有支流
   */
  broadcast(message: Omit<BranchMessage, 'id' | 'timestamp'>): string {
    return this.send({
      ...message,
      to: 'broadcast',
    });
  }

  /**
   * 投递消息给订阅者
   */
  private deliverMessage(message: BranchMessage): void {
    // 如果是广播，发送给所有订阅者
    if (message.to === 'broadcast') {
      for (const [subscriber, subs] of this.subscriptions.entries()) {
        for (const sub of subs) {
          if (this.shouldDeliver(message, sub)) {
            this.eventEmitter.emit(`message:${subscriber}`, message);
          }
        }
      }
    } else {
      // 发送给特定接收者
      this.eventEmitter.emit(`message:${message.to}`, message);
    }
  }

  /**
   * 检查消息是否应该投递给订阅者
   */
  private shouldDeliver(message: BranchMessage, subscription: Subscription): boolean {
    // 检查发布者匹配
    if (message.from !== subscription.publisher) {
      return false;
    }

    // 检查主题匹配
    if (!subscription.topics.includes(message.topic)) {
      return false;
    }

    // 检查过滤器
    if (subscription.filters) {
      for (const filter of subscription.filters) {
        if (!this.matchesFilter(message, filter)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 检查消息是否匹配过滤器
   */
  private matchesFilter(message: BranchMessage, filter: MessageFilter): boolean {
    const value = this.getNestedValue(message, filter.field);

    switch (filter.operator) {
      case 'eq':
        return value === filter.value;
      case 'ne':
        return value !== filter.value;
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
      case 'contains':
        return typeof value === 'string' && value.includes(filter.value);
      default:
        return true;
    }
  }

  /**
   * 获取嵌套对象值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 订阅消息
   */
  subscribe(subscription: Subscription): void {
    if (!this.subscriptions.has(subscription.subscriber)) {
      this.subscriptions.set(subscription.subscriber, new Set());
    }
    this.subscriptions.get(subscription.subscriber)!.add(subscription);

    this.eventEmitter.emit('subscribed', subscription);
  }

  /**
   * 取消订阅
   */
  unsubscribe(subscriber: string, publisher?: string, topic?: string): void {
    const subs = this.subscriptions.get(subscriber);
    if (!subs) return;

    for (const sub of subs) {
      const matchPublisher = !publisher || sub.publisher === publisher;
      const matchTopic = !topic || sub.topics.includes(topic);

      if (matchPublisher && matchTopic) {
        subs.delete(sub);
      }
    }

    if (subs.size === 0) {
      this.subscriptions.delete(subscriber);
    }

    this.eventEmitter.emit('unsubscribed', { subscriber, publisher, topic });
  }

  /**
   * 监听消息
   */
  onMessage(subscriberId: string, callback: (msg: BranchMessage) => void): void {
    this.eventEmitter.on(`message:${subscriberId}`, callback);
  }

  /**
   * 移除消息监听器
   */
  offMessage(subscriberId: string, callback: (msg: BranchMessage) => void): void {
    this.eventEmitter.off(`message:${subscriberId}`, callback);
  }

  /**
   * 获取指定订阅者的消息历史
   */
  getMessagesFor(subscriberId: string, limit?: number): BranchMessage[] {
    const messages = this.messages.filter(msg => {
      // 广播消息或发送给该订阅者的消息
      return msg.to === 'broadcast' || msg.to === subscriberId;
    });

    // 按时间倒序排序
    messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return limit ? messages.slice(0, limit) : messages;
  }

  /**
   * 获取所有订阅
   */
  getSubscriptions(): Subscription[] {
    const all: Subscription[] = [];
    for (const subs of this.subscriptions.values()) {
      all.push(...subs);
    }
    return all;
  }

  /**
   * 获取指定订阅者的订阅
   */
  getSubscriptionsFor(subscriberId: string): Subscription[] {
    return Array.from(this.subscriptions.get(subscriberId) || []);
  }

  /**
   * 清空消息历史
   */
  clearMessages(): void {
    this.messages = [];
    this.eventEmitter.emit('messages-cleared');
  }

  /**
   * 清空所有订阅
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
    this.eventEmitter.emit('subscriptions-cleared');
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.clearMessages();
    this.clearSubscriptions();
  }

  /**
   * 监听事件
   */
  on(event: string, callback: (...args: any[]) => void): void {
    this.eventEmitter.on(event, callback);
  }

  /**
   * 移除监听器
   */
  off(event: string, callback: (...args: any[]) => void): void {
    this.eventEmitter.off(event, callback);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalMessages: number;
    totalSubscriptions: number;
    messagesByType: Record<MessageType, number>;
    messagesByPriority: Record<Priority, number>;
  } {
    const messagesByType: Record<MessageType, number> = {
      decision: 0,
      dependency: 0,
      conflict: 0,
      'sync-request': 0,
      'sync-response': 0,
      query: 0,
      'query-response': 0,
    };

    const messagesByPriority: Record<Priority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    };

    for (const msg of this.messages) {
      messagesByType[msg.type]++;
      messagesByPriority[msg.priority]++;
    }

    let totalSubscriptions = 0;
    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.size;
    }

    return {
      totalMessages: this.messages.length,
      totalSubscriptions,
      messagesByType,
      messagesByPriority,
    };
  }
}

/**
 * 创建消息总线实例
 */
export function createMessageBus(maxMessages?: number): MessageBus {
  return new MessageBus(maxMessages);
}
