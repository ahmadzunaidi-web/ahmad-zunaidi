import { EventEmitter } from 'node:events';

export type HubEvent =
  | { type: 'message'; conversationId: number }
  | { type: 'conversation'; conversationId: number }
  | { type: 'agent'; agentId: number };

/** In-process pub/sub that feeds the inbox's live Server-Sent Events stream. */
export class EventHub {
  private em = new EventEmitter();
  constructor() { this.em.setMaxListeners(100); }
  publish(e: HubEvent): void { this.em.emit('e', e); }
  subscribe(fn: (e: HubEvent) => void): () => void {
    this.em.on('e', fn);
    return () => this.em.off('e', fn);
  }
}
