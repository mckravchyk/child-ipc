import { type ChildProcess } from 'child_process';

import { ExternalPromise } from 'external-promise';

import type {
  IpcActionDomain,
  IpcActions,
  IpcInvokeAction,
  IpcInvokeActionDomain,
  UntypedIpcActions,
} from './ipc_actions';
import { generateId } from './lib/string';

const DEFAULT_RESPONSE_TIMEOUT = 10000;

type MessageId = `ipce_${string}`;

export type {
  IpcInvokeAction,
  IpcActionDomain,
  IpcInvokeActionDomain,
  IpcActions,
  UntypedIpcActions,
};

export interface Options {
  /**
   * Maximum time (ms) allowed to receive, process and return back the response of a command. If
   * this threshold is exceeded the invoke promise will be rejected.
   */
  responseTimeout?: number
}

export interface IpcEvent {
  messageId: MessageId
  processId: number
  actionName: string
  type: 'command' | 'call' | 'event'
}

interface Envelope<T> extends Omit<IpcEvent, 'type'> {
  type: 'command' | 'call' | 'event' | 'response'
  payload: T
}

interface Listener<R, SA extends IpcActions, PA extends IpcActions> {
  handler: (this: ChildIpc<SA, PA>, event: IpcEvent, ...args: unknown[]) => R,
  isOnce: boolean
}

interface CommandResponseOk {
  response: unknown
}

interface CommandResponseError {
  error: {
    message: string
  }
}

type CommandResponseResult = CommandResponseOk | CommandResponseError;

/**
 * A typed IPC interface to facilitate communication between the main process and a child process.
 *
 * The class is universal and handles both the parent and child process when initialized in each.
 * Note that direct communication between 2 child processes is not supported.
 *
 * @param processHandle The process instance that exposes the message bus to communicate with the
 * other process:
 * - In the main process, it must be the target
 * [ChildProcess](https://nodejs.org/api/child_process.html) instance
 * - In the child process, it must be the `process` global
 */
export class ChildIpc<
  SelfActions extends IpcActions = UntypedIpcActions,
  PeerActions extends IpcActions = UntypedIpcActions,
> {
  private process_: NodeJS.Process | ChildProcess;

  private responsePromises_: Map<MessageId, ExternalPromise<unknown>> = new Map();

  private callReceivers_: Map<string, Listener<void, SelfActions, PeerActions>[]> = new Map();

  private commandHandlers_: Map<
    string,
    Listener<Promise<unknown>, SelfActions, PeerActions>
  > = new Map();

  private eventListeners_: Map<string, Listener<void, SelfActions, PeerActions>[]> = new Map();

  private processId_: number;

  private responseTimeout_: number;

  private isDestroyed_ = false;

  public constructor(processHandle: NodeJS.Process | ChildProcess, options: Options = { }) {
    if (!processHandle.send) {
      throw new Error('ChildIpc: Process is missing the send method. Did you try to use the process global instead of a child process in the parent process instance?');
    }

    this.process_ = processHandle;

    this.processId_ = process.pid;

    this.responseTimeout_ = typeof options.responseTimeout === 'number' && options.responseTimeout > 0
      ? options.responseTimeout
      : DEFAULT_RESPONSE_TIMEOUT;

    this.process_.on('message', this.handleMessage_);
  }

  public destroy(): void {
    this.removeAll();

    for (const p of Array.from(this.responsePromises_.values())) {
      p.reject('ChildIpc: Instance destroyed while awaiting response');
    }

    this.responsePromises_ = new Map();
    this.process_.off('message', this.handleMessage_);
    this.process_ = { send: () => { throw new Error('ChildIpc: cannot process.send in a destroyed instance'); } } as unknown as NodeJS.Process;
    this.isDestroyed_ = true;
  }

  /**
   * Emits an event.
   */
  public send<
    Events extends SelfActions['events'],
    Channel extends(
      Events extends IpcActionDomain ? keyof Events : never
    ),
    Args extends(
      Events[Channel] extends unknown[] ? Events[Channel] : unknown[]
    ),
  >(
    channel: Channel,
    ...args: Args
  ) {
    const envelope: Envelope<unknown[]> = {
      messageId: `ipce_${generateId()}`,
      processId: this.processId_,
      type: 'event',
      actionName: channel,
      payload: args,
    };

    this.process_.send!(envelope);
  }

  /**
   * Makes a call.
   */
  public call<
    Calls extends PeerActions['calls'],
    Channel extends(
      Calls extends IpcActionDomain ? keyof Calls : never
    ),
    Args extends(
      Calls[Channel] extends unknown[] ? Calls[Channel] : unknown[]
    ),
  >(
    channel: Channel,
    ...args: Args
  ) {
    const envelope: Envelope<unknown[]> = {
      messageId: `ipce_${generateId()}`,
      processId: this.processId_,
      type: 'call',
      actionName: channel,
      payload: args,
    };

    this.process_.send!(envelope);
  }

  /**
   * Invokes a command.
   */
  public async invoke<
    Commands extends PeerActions['commands'],
    Command extends(
      Commands extends IpcInvokeActionDomain ? keyof Commands : never
    ),
    Args extends(
      Commands[Command] extends IpcInvokeAction ? Commands[Command]['params'] : unknown[]
    ),
    ReturnVal extends(
      Commands[Command] extends IpcInvokeAction ? Commands[Command]['returnVal'] : unknown
    ),
  >(
    command: Command,
    ...args: Args
    // @ts-expect-error This is a limitation of TS, it does not recognize that in either case the
    // return type is guaranteed to be Promise<unknown>
  ): ReturnVal extends Promise<unknown> ? ReturnVal : Promise<ReturnVal> {
    const envelope: Envelope<unknown[]> = {
      messageId: `ipce_${generateId()}`,
      processId: this.processId_,
      type: 'command',
      actionName: command,
      payload: args,
    };

    const p = new ExternalPromise();

    this.responsePromises_.set(envelope.messageId, p);

    this.process_.send!(envelope);

    setTimeout(() => {
      if (p.getState() === 'pending') {
        p.reject(new Error(`ChildIpc: Command ${command} timed out after ${this.responseTimeout_}ms`));
        this.responsePromises_.delete(envelope.messageId);
      }
    }, this.responseTimeout_);

    return p.getPromise() as ReturnVal extends Promise<unknown> ? ReturnVal : Promise<ReturnVal>;
  }

  /**
   * Listens for an event.
   */
  public on<
    Events extends PeerActions['events'],
    Channel extends(
      Events extends IpcActionDomain ? keyof Events : never
    ),
    Args extends(
      Events[Channel] extends unknown[] ? Events[Channel] : unknown[]
    ),
  >(
    channel: Channel,
    listener: (this: ChildIpc<SelfActions, PeerActions>, event: IpcEvent, ...args: Args) => void,
  ): void {
    ChildIpc.registerEventListener_(
      this.eventListeners_,
      channel,
      listener as Listener<void, SelfActions, PeerActions>['handler'],
      false,
      this.isDestroyed_,
    );
  }

  /**
   * Listens for an event, once.
   */
  public once<
    Events extends PeerActions['events'],
    Channel extends(
      Events extends IpcActionDomain ? keyof Events : never
    ),
    Args extends(
      Events[Channel] extends unknown[] ? Events[Channel] : unknown[]
    ),
  >(
    channel: Channel,
    listener: (this: ChildIpc<SelfActions, PeerActions>, event: IpcEvent, ...args: Args) => void,
  ): void {
    ChildIpc.registerEventListener_(
      this.eventListeners_,
      channel,
      listener as Listener<void, SelfActions, PeerActions>['handler'],
      true,
      this.isDestroyed_,
    );
  }

  /**
   * Receives a call.
   */
  public receive<
    Events extends SelfActions['calls'],
    Channel extends(
      Events extends IpcActionDomain ? keyof Events : never
    ),
    Args extends(
      Events[Channel] extends unknown[] ? Events[Channel] : unknown[]
    ),
  >(
    route: Channel,
    receiver: (this: ChildIpc<SelfActions, PeerActions>, event: IpcEvent, ...args: Args) => void,
  ): void {
    ChildIpc.registerEventListener_(
      this.callReceivers_,
      route,
      receiver as Listener<void, SelfActions, PeerActions>['handler'],
      false,
      this.isDestroyed_,
    );
  }

  /**
   * Receives a call, once.
   */
  public receiveOnce<
    Events extends SelfActions['calls'],
    Channel extends(
      Events extends IpcActionDomain ? keyof Events : never
    ),
    Args extends(
      Events[Channel] extends unknown[] ? Events[Channel] : unknown[]
    ),
  >(
    route: Channel,
    receiver: (this: ChildIpc<SelfActions, PeerActions>, event: IpcEvent, ...args: Args) => void,
  ): void {
    ChildIpc.registerEventListener_(
      this.callReceivers_,
      route,
      receiver as Listener<void, SelfActions, PeerActions>['handler'],
      true,
      this.isDestroyed_,
    );
  }

  /**
   * Handles a command.
   *
   * @throws if a handler for the command has already been registered.
   */
  public handle<
    Commands extends SelfActions['commands'],
    Command extends(
      Commands extends IpcInvokeActionDomain ? keyof Commands : never
    ),
    Args extends(
      Commands[Command] extends IpcInvokeAction ? Commands[Command]['params'] : unknown[]
    ),
    CbReturnVal extends(
      Commands[Command] extends IpcInvokeAction ? Commands[Command]['returnVal'] : unknown
    )
  >(
    command: Command,
    handler: (
      this: ChildIpc<SelfActions, PeerActions>,
      event: IpcEvent,
      ...args: Args
    ) => CbReturnVal,
  ): void {
    this.registerCommandHandler_(
      command,
      handler as unknown as Listener<Promise<unknown>, SelfActions, PeerActions>['handler'],
      false,
      this.isDestroyed_,
    );
  }

  /**
   * Handles a command, once.
   *
   * @throws if a handler for the command has already been registered.
   */
  public handleOnce<
    Commands extends SelfActions['commands'],
    Command extends(
      Commands extends IpcInvokeActionDomain ? keyof Commands : never
    ),
    Args extends(
      Commands[Command] extends IpcInvokeAction ? Commands[Command]['params'] : unknown[]
    ),
    CbReturnVal extends(
      Commands[Command] extends IpcInvokeAction ? Commands[Command]['returnVal'] : unknown
    )
  >(
    command: Command,
    handler: (
      this: ChildIpc<SelfActions, PeerActions>,
      event: IpcEvent,
      ...args: Args
    ) => CbReturnVal,
  ): void {
    this.registerCommandHandler_(
      command,
      handler as unknown as Listener<Promise<unknown>, SelfActions, PeerActions>['handler'],
      true,
      this.isDestroyed_,
    );
  }

  /**
   * Removes an event listener.
   */
  public removeListener<
    Events extends PeerActions['events'],
    Channel extends(
      Events extends IpcActionDomain ? keyof Events : never
    ),
    Args extends(
      Events[Channel] extends unknown[] ? Events[Channel] : unknown[]
    )
  >(
    channel: Channel,
    listener?: (this: ChildIpc<SelfActions, PeerActions>, event: IpcEvent, ...args: Args) => void,
  ): void {
    ChildIpc.removeEventListener_(
      this.eventListeners_,
      channel,
      listener as Listener<Promise<unknown>, SelfActions, PeerActions>['handler'] | undefined,
    );
  }

  /**
   * Removes a call receiver.
   */
  public removeReceiver<
    Events extends SelfActions['calls'],
    Channel extends(
      Events extends IpcActionDomain ? keyof Events : never
    ),
    Args extends(
      Events[Channel] extends unknown[] ? Events[Channel] : unknown[]
    )
  >(
    route: Channel,
    listener?: (this: ChildIpc<SelfActions, PeerActions>, event: IpcEvent, ...args: Args) => void,
  ): void {
    ChildIpc.removeEventListener_(
      this.callReceivers_,
      route,
      listener as Listener<Promise<unknown>, SelfActions, PeerActions>['handler'] | undefined,
    );
  }

  /**
   * Removes a command handler.
   */
  public removeHandler<
    Commands extends SelfActions['commands'],
    Command extends(
      Commands extends IpcInvokeActionDomain ? keyof Commands : never
    ),
  >(
    command: Command,
  ): void {
    if (this.commandHandlers_.has(command)) {
      this.commandHandlers_.delete(command);
    }
  }

  public removeAll(): void {
    this.eventListeners_ = new Map();
    this.callReceivers_ = new Map();
    this.commandHandlers_ = new Map();
  }

  private handleMessage_ = async (envelope: unknown): Promise<void> => {
    if (!ChildIpc.isEnvelope_(envelope)) {
      return;
    }

    if (envelope.type === 'response') {
      const promise = this.responsePromises_.get(envelope.messageId);

      if (promise) {
        if (typeof (envelope.payload as CommandResponseError).error !== 'undefined') {
          const errorData = (envelope.payload as CommandResponseError).error || { message: 'ChildIpc: Unknown Error [i5a4Hz90FAMh]' };
          promise.reject(new Error(errorData.message));
        }
        else {
          // Note that payload.response will be undefined if it's a void async function
          promise.resolve((envelope.payload as CommandResponseOk).response);
        }

        this.responsePromises_.delete(envelope.messageId);
      }

      return;
    }

    const event: IpcEvent = {
      messageId: envelope.messageId,
      processId: envelope.processId,
      type: envelope.type,
      actionName: envelope.actionName,
    };

    if (envelope.type === 'command') {
      const listener = this.commandHandlers_.get(envelope.actionName);

      if (listener) {
        let result: CommandResponseResult;

        if (listener.isOnce) {
          this.commandHandlers_.delete(envelope.actionName);
        }

        try {
          result = {
            response: await listener.handler.apply(
              this,
              [event, ...(envelope as Envelope<unknown[]>).payload],
            ),
          };
        }
        catch (err) {
          let message = 'ChildIpc: Unknown error [azPRe972IL2S]';

          if (
            err instanceof Error
            || typeof err === 'object' && err !== null && typeof (err as { message: string }).message === 'string'
          ) {
            message = (err as { message: string }).message;
          }
          else if (typeof err === 'string') {
            message = err;
          }

          result = {
            error: { message },
          };
        }

        const responseEnvelope: Envelope<CommandResponseResult> = {
          messageId: envelope.messageId,
          processId: this.processId_,
          type: 'response',
          actionName: envelope.actionName,
          payload: result,
        };

        this.process_.send!(responseEnvelope);
      }
    }
    else {
      let listeners: Listener<void, SelfActions, PeerActions>[] = [];

      if (envelope.type === 'call') {
        listeners = this.callReceivers_.get(envelope.actionName) || [];
      }
      else {
        listeners = this.eventListeners_.get(envelope.actionName) || [];
      }

      let i = 0;

      while (i < listeners.length) {
        const listener = listeners[i];
        listener.handler.apply(this, [event, ...(envelope as Envelope<unknown[]>).payload]);

        if (listener.isOnce) {
          listeners.splice(i, 1);
        }
        else {
          i += 1;
        }
      }
    }
  };

  private static isEnvelope_(subject: unknown): subject is Envelope<unknown> {
    return (
      typeof subject === 'object'
      && subject !== null
      && typeof (subject as Envelope<unknown>).messageId === 'string'
      && typeof (subject as Envelope<unknown>).type === 'string'
      && typeof (subject as Envelope<unknown>).payload !== 'undefined'
      && (subject as Envelope<unknown>).messageId.startsWith('ipce_')
      && ['command', 'call', 'event', 'response'].includes((subject as Envelope<unknown>).type)
    );
  }

  private static registerEventListener_(
    listeners: Map<string, Listener<void, IpcActions, IpcActions>[]>,
    channel: string,
    listener: Listener<void, IpcActions, IpcActions>['handler'],
    isOnce: boolean,
    isDestroyed: boolean,
  ): void {
    if (isDestroyed) {
      throw new Error('ChildIpc: Cannot register listener for a destroyed instance');
    }

    if (!listeners.has(channel)) {
      listeners.set(channel, []);
    }

    const actionListeners = listeners.get(channel)!;
    actionListeners.push({ handler: listener as Listener<void, IpcActions, IpcActions>['handler'], isOnce });
  }

  private static removeEventListener_(
    listeners: Map<string, Listener<void, IpcActions, IpcActions>[]>,
    channel: string,
    listener?: Listener<void, IpcActions, IpcActions>['handler'],
  ): void {
    const channelListeners = listeners.get(channel);

    if (!channelListeners) {
      return;
    }

    if (typeof listener === 'undefined') {
      listeners.delete(channel);
      return;
    }

    let i = 0;
    while (i < channelListeners.length) {
      if (channelListeners[i].handler === listener) {
        channelListeners.splice(i, 1);
      }
      else {
        i += 1;
      }
    }
  }

  private registerCommandHandler_(
    command: string,
    handler: Listener<Promise<unknown>, IpcActions, IpcActions>['handler'],
    isOnce: boolean,
    isDestroyed: boolean,
  ): void {
    if (isDestroyed) {
      throw new Error('ChildIpc: Cannot register command handler for a destroyed instance');
    }

    if (this.commandHandlers_.has(command)) {
      throw new Error(`ChildIpc: Handler for ${command} already registered`);
    }

    this.commandHandlers_.set(command, { handler, isOnce });
  }
}
