/**
 * Action parameters - the array represents parameters of an action.
 *
 * Use `[]` if there are no parameters.
 */
export type IpcActionParameters = unknown[];

/**
 * Available events (or calls) and their parameters.
 */
export type IpcActionDomain = Record<string, IpcActionParameters>;

export type IpcInvokeAction = { params: IpcActionParameters, returnVal: unknown }

/**
 * Available command names, their parameters and return values.
 *
 * Note that if the command handler returns a Promise or is an async function, the returnVal type
 * must be Promise.
 */
export type IpcInvokeActionDomain = Record<string, IpcInvokeAction>;

export interface IpcActions {
  /**
   * Events are used to notify that something has happened in the emitting process and their types
   * are defined by said process. They are emitted with the `send` method and listened to with the
   * `on` method.
   */
  events?: IpcActionDomain

  /**
   * Calls are used to make the receiving process execute a certain action and their types are
   * defined by said process. They are called with the `call` method and received with the
   * `receive` method.
   */
  calls?: IpcActionDomain

  /**
   * Commands are like calls except the invoking method returns a Promise with the result of the
   * command. Command types are defined by the handling process. They are invoked with the
   * `invoke` method and handled with the `handle` method. There can only be one command handler at
   * any given time.
   */
  commands?: IpcInvokeActionDomain
}

export interface UntypedIpcActions {
  // any is better than unknown for callback parameters in untyped mode
  /* eslint-disable @typescript-eslint/no-explicit-any */
  events: Record<string, any[]>
  calls: Record<string, any[]>
  commands: Record<string, { params: any[], returnVal: unknown }>
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
