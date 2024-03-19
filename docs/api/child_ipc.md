# Class: ChildIpc

A typed IPC interface to facilitate communication between the main process and a child process.

The class is universal and handles both the parent and child process when initialized in each. Note that direct communication between 2 child processes is not supported.

## `new ChildIpc(processHandle, options)`

Initializes the instance in either process.

* `processHandle` [Process](https://nodejs.org/api/process.html) | [ChildProcess](https://nodejs.org/api/child_process.html) The process instance that exposes the message bus to communicate with the other process:
  * In the main process, it must be the target [ChildProcess](https://nodejs.org/api/child_process.html) instance
  * In the child process, it must be the `process` global
* `options` [Options](structures/options.md) (optional)

In TypeScript, the class optionally accepts 2 type arguments `SelfActions` and `PeerActions` that extend [IpcActions](../../src/ipc_actions.ts). See [the tutorial](../tutorial.md) for more information about typed IPC actions.

## Instance Methods

### `.destroy()`

Destroys the instance.

### `.send(channel, ...args)`

Emits an event.

* `channel` string - event channel
* `...args` Array - event arguments

### `.call(route, ...args)`

Makes a call.

* `route` string - call route
* `...args` Array - call arguments

### `.invoke(command, ...args)`

Invokes a command.

* `command` string - command name
* `...args` Array - command arguments

Returns `Promise` - returns a promise with the command result. The promise will be rejected if the command handlers rejects / throws or if the command times out.

### `.on(channel, listener)`

Emits an event.

* `channel` string - event channel
* `listener` function - event listener
  * `this` ChildIpc
  * `e` [IpcEvent](./structures/ipc_event.md)
  * `...args` Array - event arguments

### `.once(channel, listener)`

The same as `on()` except the listener is automatically removed upon listening to the event once.

### `.receive(route, receiver)`

Receives a call.

* `route` string - call route
* `listener` function - call receiver
  * `this` ChildIpc
  * `e` [IpcEvent](./structures/ipc_event.md)
  * `...args` Array - call arguments

### `.receiveOnce(route, receiver)`

The same as `receive()` except the receiver is automatically removed upon receiving the call once.

### `.handle(command, handler)`

Handles a command.

* `command` string - command name
* `handler` function - command handler. Its return value (which can be absent, a regular value or a Promise) will be resolved as the result of `invoke`.
  * `this` ChildIpc
  * `e` [IpcEvent](./structures/ipc_event.md)
  * `...args` Array - command arguments

Throws if a handler has already been registered for the command.

### `.handleOnce(command, handler)`

The same as `handle()` except the handler is automatically removed upon handling the command once.

### `.removeListener(channel, listener?)`

Removes a `listener` for a `channel` or all `channel` listeners if the `listener` is not set.

* `channel` string - event channel
* `listener` Function (optional) - the event listener to remove

### `.removeReceiver(route, receiver?)`

Removes a `receiver` for a `route` or all `route` receivers if the `receiver` is not set.

* `route` string - call route
* `receiver` function (optional) - the call receiver to remove

### `.removeHandler(command)`

Removes a command handler.

* `command` string - command name

### `.removeAll()`

Removes all event listeners, call receivers and command handlers.