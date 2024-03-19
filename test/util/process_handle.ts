// eslint-disable-next-line import/no-extraneous-dependencies
import { EventEmitter } from '@mckravchyk/event-emitter';

/**
 * Acts as the process handle on both ends.
 *
 * This leverages the fact that the message API is the same on each side. By using the same handle
 * on both ends it is possible to do a pair end-to-end test with the same handle in a single
 * process (with one instance being the sole emitter and the other the sole receiver).
 */
export class ProcessHandle {
  private emitter: EventEmitter;

  private callbacks: Array<(data: unknown) => void> = [];

  public constructor() {
    this.emitter = new EventEmitter();

    this.emitter.on('message', (e, ...params: unknown[]) => {
      for (const callback of this.callbacks) {
        callback(params[0]);
      }
    });
  }

  public on(event: 'message', cb: (data: unknown) => void) {
    this.callbacks.push(cb);
  }

  public off(event: 'message', cb: (data: unknown) => void) {
    let i = 0;

    while (i < this.callbacks.length) {
      if (cb === this.callbacks[i]) {
        this.callbacks.splice(i, 1);
      }
      else {
        i += 1;
      }
    }
  }

  public send(data: unknown): void {
    this.emitter.emit('message', data);
  }

  public removeAllListeners() {
    this.emitter.removeAllListeners();
    this.callbacks = [];
  }
}
