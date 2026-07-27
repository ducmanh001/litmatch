import { Injectable } from '@nestjs/common';

type MatcherWakeListener = () => void;

/**
 * Tín hiệu đánh thức matcher trong cùng process.
 * Redis queue vẫn là nguồn công việc dùng chung giữa các instance; backstop interval của worker
 * xử lý trường hợp event bị mất hoặc ticket đã tồn tại trước khi process khởi động.
 */
@Injectable()
export class MatcherWakeup {
  private readonly listeners = new Set<MatcherWakeListener>();

  subscribe(listener: MatcherWakeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }
}
