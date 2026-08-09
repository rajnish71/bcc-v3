// backend/src/modules/financial/financial-event-bus.service.ts
//
// PAY-001 §BUSINESS EVENT MODEL — In-process Financial Engine Event Bus.
// Uses the Node.js built-in EventEmitter; no external dependency required.
// Single-process deployment only — compatible with this platform's PM2/NestJS
// architecture. Business Modules call onFinancialEvent() to subscribe;
// the Financial Engine calls emit() to publish.

import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { FinancialEngineEventPayload } from './financial.events';

@Injectable()
export class FinancialEventBus extends EventEmitter {
  constructor() {
    super();
    // Raise the default limit of 10 listeners to accommodate multiple
    // Business Module subscriptions per event type.
    this.setMaxListeners(50);
  }

  // Typed emit — overrides EventEmitter.emit to enforce the payload shape.
  emit(eventType: string, payload: FinancialEngineEventPayload): boolean {
    return super.emit(eventType, payload);
  }

  // Typed subscription.
  on(eventType: string, listener: (payload: FinancialEngineEventPayload) => void): this {
    return super.on(eventType, listener);
  }

  once(eventType: string, listener: (payload: FinancialEngineEventPayload) => void): this {
    return super.once(eventType, listener);
  }
}
