# Child IPC

A typed, Electron-style IPC interface to facilitate communication between the main process and a child process in Node.js (including, but not limited to, Electron apps).

## Installation

```
npm install child-ipc --save
```

## Example

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
  }
}

const ipc = new ChildIpc<ChildIpcActions, MainIpcActions>(process);

ipc.handle('processData', (e, data: string) => {
  // ...
  return processed;
});
```

## Documentation

- [Tutorial](./docs/tutorial.md)
- [API](./docs/api/)