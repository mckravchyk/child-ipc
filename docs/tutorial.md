# Child IPC Tutorial

## Initialization

Initialize [ChildIpc](./api/child_ipc.md) in both processes:
- In the main process, the child process instance must be passed as the `processHandle` option
- In the child process, the `process` global is the `processHandle`

With TypeScript, the class accepts 2 (optional) type arguments:
- SelfActions - own actions
- PeerActions - actions of the peer

If those arguments are not supplied, IPC actions will be untyped.

*main.ts*
```ts
import { ChildIpc } from 'child-ipc';

import type { ChildIpcActions } from './child';

export interface MainIpcActions {
  events: {
    // ...
  }

  commands: {
    // ...
  }

  calls: {
    // ...
  }

  // Note that there's no need to define an empty object for an action type
  // if there are no actions of this type.
}

const cp = fork(path.join(__dirname, 'child.js'), ['args'], { stdio: 'pipe' });

const ipc = new ChildIpc<MainIpcActions, ChildIpcActions>(cp);
```

*child.ts*
```ts
import { ChildIpc } from 'child-ipc';

import type { MainIpcActions } from './main';

export interface ChildIpcActions {
  events: {
    // ...
  }

  commands: {
    // ...
  }

  calls: {
    // ...
  }
}

const ipc = new ChildIpc<ChildIpcActions, MainIpcActions>(process);
```

## Actions

There are 3 IPC action types:
- Events
- Calls
- Commands

### Events

Events are used to notify that something has happened in the emitting process and their types are defined by said process. They are emitted with the `send` method and listened to with the `on` method.

#### Example - an event emitted by a database worker child process

*main.ts*
```ts
import { ChildIpc } from 'child-ipc';

import type { ChildIpcActions } from './child';

export interface MainIpcActions {

}

const cp = fork(path.join(__dirname, 'child.js'), ['args'], { stdio: 'pipe' });

const ipc = new ChildIpc<MainIpcActions, ChildIpcActions>(cp);

ipc.on('resourceUpdated', (e, resourceType, entryId, data) => {
  console.log(`Resource ${resourceType}/${entryId} has been updated`);
  console.log(data);
});
```

*child.ts*
```ts
import { ChildIpc } from 'child-ipc';

import type { MainIpcActions } from './main';

export interface ChildIpcActions {
  events: {
    // Fires whenever a database resource has been updated.
    'resourceUpdated': [resourceType: string, entryId: number, data: Record<string, unknown>]

    // If there are no parameters, use `[]`.
    'ping': []
  }
}

const ipc = new ChildIpc<ChildIpcActions, MainIpcActions>(process);

function updateUser(id: number, update: Record<string, unknown>) {
  // ...

  ipc.send('resourceUpdated', 'user', id, update);
}

setInterval(() => { ipc.send('ping'); }, 5000);
```

### Calls

Calls are used to make the receiving process execute a certain action and their types are defined by said process. They are called with the `call` method and received with the `receive` method.

#### Example - a one way call received in the child process

*main.ts*
```ts
import { ChildIpc } from 'child-ipc';

import type { ChildIpcActions } from './child';

export interface MainIpcActions {

}

const cp = fork(path.join(__dirname, 'child.js'), ['args'], { stdio: 'pipe' });

const ipc = new ChildIpc<MainIpcActions, ChildIpcActions>(cp);

let jobIdCounter = 0;

function processAndSave(data) {
  ipc.call('processAndSave', jobIdCounter++, data);
}
```

*child.ts*
```ts
import { ChildIpc } from 'child-ipc';

import type { MainIpcActions } from './main';

export interface ChildIpcActions {
  calls: {
    // An example action to process data and save it to the filesystem. It does not require to
    // notify the main process about completion.
    'processAndSave': [jobId: number, data: string]
  }
}

const ipc = new ChildIpc<ChildIpcActions, MainIpcActions>(process);

ipc.receive('processAndSave', (e, jobId, data) => {
  // ...
});
```

### Commands

Commands are like calls except the invoking method returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) with the result of the command. Command types are defined by the handling process. They are invoked with the `invoke` method and handled with the `handle` method. There can only be one command handler at any given time.

#### Example - a command handled in the child process

*main.ts*
```ts
import { ChildIpc } from 'child-ipc';

import type { ChildIpcActions } from './child';

export interface MainIpcActions { }

const cp = fork(path.join(__dirname, 'child.js'), ['args'], { stdio: 'pipe' });

const ipc = new ChildIpc<MainIpcActions, ChildIpcActions>(cp);

async function processData(data: string): Promise<string> {
  const processed = await ipc.invoke('processData', data);

  // ...

  return processed;
}
```

*child.ts*
```ts
import { ChildIpc } from 'child-ipc';

import type { MainIpcActions } from './main';

export interface ChildIpcActions {
  commands: {
    'processData': { params: [data: string], returnVal: string }

    // If the handler is an async function or returns a Promise, the returnVal type must be
    // Promise.
    'asyncHandlerExample': { params: [data: string], returnVal: Promise<string> }
  }
}

const ipc = new ChildIpc<ChildIpcActions, MainIpcActions>(process);

ipc.handle('processData', (e, data: string) => {
  // ...
  return processed;
});

ipc.handle('asyncHandlerExample', async (e, data: string) => {
  // ...
  return processed;
});
```

## Defining actions in a modular way

Most apps consist of multiple modules and it would not be practical to define all action types in the root. By using type intersection it is possible to do a deep merge of IpcActions that are defined across multiple modules. In such setup it is recommended to prefix action names with the name of the module to ensure there are no conflicts.

*main/index.ts*
```ts

import { type ChildIpcActions } from '../child';

import { type IpcActions as ModuleAIpcActions } from './modula_a';
import { type IpcActions as ModuleBIpcActions } from './modula_b';

// Type intersection allows to perform a deep merge of 2 types. events, calls and commands are all
// merged. Note that on the other hand, interface extends is shallow!
export type MainIpcActions = ModuleAIpcActions & ModuleBIpcActions;

const cp = fork(path.join(__dirname, 'child.js'), ['args'], { stdio: 'pipe' });

const ipc = new ChildIpc<MainIpcActions, ChildIpcActions>(cp);
```

*main/module_a.ts*
```ts
// Action names are prefixed to avoid conflicts with the actions of other submodules
export interface IpcActions {
  events: {
    'moduleA/event1' [a: number]
  }
  calls: {
    'moduleA/call1': [a: string, b: number]
    'moduleA/call2': [a: unknown]
  }
  commands: {
    'moduleA/command1': { params: [a: string, b: number], returnVal: string }
    'moduleA/command2': { params: [a: unknown], returnVal: number }
  }
}
```

*main/module_b.ts*
```ts
export interface IpcActions {
  events: {
    'moduleB/event1' [a: string]
  }
  calls: {
    'moduleB/call1': [a: boolean]
    'moduleB/call2': [a: string, b: number]
  }
  commands: {
    'moduleB/command1': { params: [a: boolean], returnVal: string }
    'moduleB/command2': { params: [a: string, b: number], returnVal: number }
  }
}
```