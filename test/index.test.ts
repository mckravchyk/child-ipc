import { ChildIpc, type IpcEvent } from 'src/index';

import { ProcessHandle } from './util/process_handle';

/* eslint-disable func-names, @typescript-eslint/no-this-alias */

interface SelfActions {
  events: {
    'action': []
    'e': []
    'e1': [a: number, b: { test: number }]
    'e2': [a: number, b: { test: number }]
  }
}

interface PeerActions {
  calls: {
    'action': []
    'cl': []
    'cl1': [a: number, b: { test: number }]
    'cl2': [a: number, b: { test: number }]
  }

  commands: {
    'action': { params: [], returnVal: Promise<void> }
    'cm': { params: [], returnVal: Promise<void> }
    // Note that the returnVal can either be a regular value or a Promise. This must match the
    // return value of the handler. If an async handler is used, the return must be Promise.
    'cm1': { params: [a: number, b: { test: number }], returnVal: number }
    'cm2': { params: [a: number, b: { test: number }], returnVal: Promise<number> }
  }
}

describe('Child IPC', () => {
  describe('Emitting and listening', () => {
    // Each basic test includes 2 events being emitted 2 times each and listened 2 times each, with
    // the latter being an exception for commands where only one command handler is allowed.

    test('An event is emitted and listened to', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let thisVal: ChildIpc<SelfActions, PeerActions> | null = null;
      let event: IpcEvent | null = null;
      let aVal = 0;
      let bVal = 0;

      peerIpc.on('e', function (e) {
        event = e;
        thisVal = this;
      });

      peerIpc.on('e1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      peerIpc.on('e1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      peerIpc.on('e2', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      peerIpc.on('e2', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      selfIpc.send('e');
      selfIpc.send('e1', 1, { test: 1 });
      selfIpc.send('e2', 10, { test: 10 });
      selfIpc.send('e1', 1, { test: 1 });
      selfIpc.send('e2', 10, { test: 10 });

      expect(thisVal).toBe(peerIpc);
      expect(event).not.toBe(null);
      expect(typeof event!.messageId).toBe('string');
      expect(event!.messageId.startsWith('ipce_')).toBe(true);
      expect(typeof event!.processId).toBe('number');
      expect(event!.type).toBe('event');
      expect(event!.actionName).toBe('e');

      expect(aVal).toBe(44);
      expect(bVal).toBe(44);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('A call is made and received', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let thisVal: ChildIpc<SelfActions, PeerActions> | null = null;
      let event: IpcEvent | null = null;
      let aVal = 0;
      let bVal = 0;

      peerIpc.receive('cl', function (e) {
        event = e;
        thisVal = this;
      });

      peerIpc.receive('cl1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      peerIpc.receive('cl1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      peerIpc.receive('cl2', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      peerIpc.receive('cl2', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      selfIpc.call('cl');
      selfIpc.call('cl1', 1, { test: 1 });
      selfIpc.call('cl2', 10, { test: 10 });
      selfIpc.call('cl1', 1, { test: 1 });
      selfIpc.call('cl2', 10, { test: 10 });

      expect(thisVal).toBe(peerIpc);
      expect(event).not.toBe(null);
      expect(typeof event!.messageId).toBe('string');
      expect(event!.messageId.startsWith('ipce_')).toBe(true);
      expect(typeof event!.processId).toBe('number');
      expect(event!.type).toBe('call');
      expect(event!.actionName).toBe('cl');

      expect(aVal).toBe(44);
      expect(bVal).toBe(44);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('A command is invoked and handled', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let thisVal: ChildIpc<SelfActions, PeerActions> | null = null;
      let event: IpcEvent | null = null;
      let aVal = 0;
      let bVal = 0;

      peerIpc.handle('cm', async function (e) {
        event = e;
        thisVal = this;
      });

      peerIpc.handle('cm1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
        return 1;
      });

      peerIpc.handle('cm2', async (e, a, b) => {
        aVal += a;
        bVal += b.test;
        return 10;
      });

      const rVals = await Promise.all([
        selfIpc.invoke('cm'),
        selfIpc.invoke('cm1', 1, { test: 1 }),
        selfIpc.invoke('cm2', 10, { test: 10 }),
        selfIpc.invoke('cm1', 1, { test: 1 }),
        selfIpc.invoke('cm2', 10, { test: 10 }),
      ]);

      expect(thisVal).toBe(peerIpc);
      expect(event).not.toBe(null);
      expect(typeof event!.messageId).toBe('string');
      expect(event!.messageId.startsWith('ipce_')).toBe(true);
      expect(typeof event!.processId).toBe('number');
      expect(event!.type).toBe('command');
      expect(event!.actionName).toBe('cm');

      expect(aVal).toBe(22);
      expect(bVal).toBe(22);
      expect(rVals.sort()).toEqual([1, 1, 10, 10, undefined]);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('Event listeners are executed in the order they were added', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let n = 1;
      peerIpc.on('e', () => { n += 2; });
      peerIpc.on('e', () => { n *= 3; });

      selfIpc.send('e');
      expect(n).toBe(9);

      processHandle.removeAllListeners();
    });

    test('Call receivers are executed in the order they were added', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let n = 1;
      peerIpc.receive('cl', () => { n += 2; });
      peerIpc.receive('cl', () => { n *= 3; });

      selfIpc.call('cl');
      expect(n).toBe(9);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('An event is listened to once', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let aVal = 0;
      let bVal = 0;

      peerIpc.once('e1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      peerIpc.on('e2', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      selfIpc.send('e1', 1, { test: 1 });
      selfIpc.send('e2', 10, { test: 10 });
      selfIpc.send('e1', 1, { test: 1 });
      selfIpc.send('e2', 10, { test: 10 });

      expect(aVal).toBe(21);
      expect(bVal).toBe(21);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('A call is received once', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let aVal = 0;
      let bVal = 0;

      peerIpc.receiveOnce('cl1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      peerIpc.receive('cl2', (e, a, b) => {
        aVal += a;
        bVal += b.test;
      });

      selfIpc.call('cl');
      selfIpc.call('cl1', 1, { test: 1 });
      selfIpc.call('cl2', 10, { test: 10 });
      selfIpc.call('cl1', 1, { test: 1 });
      selfIpc.call('cl2', 10, { test: 10 });

      expect(aVal).toBe(21);
      expect(bVal).toBe(21);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('A command is handled once', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      // eslint-disable-next-line max-len
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle, { responseTimeout: 10 });
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let aVal = 0;
      let bVal = 0;

      peerIpc.handleOnce('cm1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
        return 1;
      });

      await selfIpc.invoke('cm1', 1, { test: 1 });

      try {
        await selfIpc.invoke('cm1', 1, { test: 1 });
      }
      catch (err) {
        //
      }

      expect(aVal).toBe(1);
      expect(bVal).toBe(1);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('Action names do not conflict across event types', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let n = 0;

      peerIpc.on('action', async () => {
        n += 1;
      });

      peerIpc.receive('action', async () => {
        n += 10;
      });

      peerIpc.handle('action', async () => {
        n += 100;
      });

      selfIpc.send('action');
      selfIpc.call('action');
      await selfIpc.invoke('action');

      expect(n).toBe(111);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });
  });

  describe('Errors', () => {
    test('An error is thrown when adding a second handler for a command', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      peerIpc.handle('cm', async () => { });
      let errorThrown = false;

      try {
        peerIpc.handle('cm', async () => { });
      }
      catch (err) {
        errorThrown = true;
      }

      // Also expecting that if one handler is removed another one can be done.
      peerIpc.removeHandler('cm');
      peerIpc.handle('cm', async () => { });

      expect(errorThrown).toBe(true);

      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('An error thrown in the command handler results in a rejection of the invoke promise', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      // eslint-disable-next-line max-len
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle, { responseTimeout: 100 });
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let i = -1;

      peerIpc.handle('cm1', () => {
        i += 1;

        if (i === 0) {
          throw new Error('Test');
        }

        return 1;
      });

      let error: Error | null = null;
      let errorCount = 0;

      try {
        await selfIpc.invoke('cm1', 1, { test: 1 });
      }
      catch (err) {
        error = err as Error;
        errorCount += 1;
      }

      // Also testing that the previous error does not have an impact on the next invoke
      try {
        // Not expecting this error
        await selfIpc.invoke('cm1', 1, { test: 1 });
      }
      catch (err) {
        errorCount += 1;
      }

      expect(errorCount).toBe(1);
      expect(error instanceof Error).toBe(true);
      expect(error?.message).toBe('Test');

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('Invoking a command times out if not handled', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      // eslint-disable-next-line max-len
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle, { responseTimeout: 10 });

      let error: Error | null = null;

      try {
        await selfIpc.invoke('cm1', 1, { test: 1 });
      }
      catch (err) {
        error = err as Error;
      }

      expect(error instanceof Error).toBe(true);

      selfIpc.destroy();
      processHandle.removeAllListeners();
    });
  });

  describe('Cleanup', () => {
    test('An event listener is removed', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let aVal = 0;
      let bVal = 0;

      const c1 = (e: IpcEvent, a: number, b: { test: number }) => {
        aVal += a;
        bVal += b.test;
      };

      const c2 = (e: IpcEvent, a: number, b: { test: number }) => {
        aVal += a;
        bVal += b.test;
      };

      peerIpc.on('e1', c1);
      peerIpc.on('e2', c2);

      selfIpc.send('e1', 1, { test: 1 });
      selfIpc.send('e2', 10, { test: 10 });
      peerIpc.removeListener('e1', c1);

      selfIpc.send('e1', 1, { test: 1 });
      selfIpc.send('e2', 10, { test: 10 });

      expect(aVal).toBe(21);
      expect(bVal).toBe(21);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('A call receiver is removed', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let aVal = 0;
      let bVal = 0;

      const c1 = (e: IpcEvent, a: number, b: { test: number }) => {
        aVal += a;
        bVal += b.test;
      };

      const c2 = (e: IpcEvent, a: number, b: { test: number }) => {
        aVal += a;
        bVal += b.test;
      };

      peerIpc.receive('cl1', c1);
      peerIpc.receive('cl2', c2);

      selfIpc.call('cl1', 1, { test: 1 });
      selfIpc.call('cl2', 10, { test: 10 });
      peerIpc.removeReceiver('cl1', c1);

      selfIpc.call('cl1', 1, { test: 1 });
      selfIpc.call('cl2', 10, { test: 10 });

      expect(aVal).toBe(21);
      expect(bVal).toBe(21);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('A command handler is removed', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      // eslint-disable-next-line max-len
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle, { responseTimeout: 10 });
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let aVal = 0;
      let bVal = 0;

      peerIpc.handle('cm1', (e, a, b) => {
        aVal += a;
        bVal += b.test;
        return 1;
      });

      await selfIpc.invoke('cm1', 1, { test: 1 });

      peerIpc.removeHandler('cm1');

      try {
        await selfIpc.invoke('cm1', 1, { test: 1 });
      }
      catch (err) {
        //
      }

      expect(aVal).toBe(1);
      expect(bVal).toBe(1);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('All channel event listeners are removed', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let n = 0;

      peerIpc.on('e1', () => { n += 1; });
      peerIpc.on('e1', () => { n += 10; });
      peerIpc.on('e2', () => { n += 100; });

      selfIpc.send('e1', 0, { test: 0 });
      selfIpc.send('e2', 0, { test: 0 });

      peerIpc.removeListener('e1');

      selfIpc.send('e1', 0, { test: 0 });
      selfIpc.send('e2', 0, { test: 0 });

      expect(n).toBe(211);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('All route call receivers are removed', () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle);
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let n = 0;

      peerIpc.receive('cl1', () => { n += 1; });
      peerIpc.receive('cl1', () => { n += 10; });
      peerIpc.receive('cl2', () => { n += 100; });

      selfIpc.call('cl1', 0, { test: 0 });
      selfIpc.call('cl2', 0, { test: 0 });

      peerIpc.removeReceiver('cl1');

      selfIpc.call('cl1', 0, { test: 0 });
      selfIpc.call('cl2', 0, { test: 0 });

      expect(n).toBe(211);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('All listeners, receivers and handlers are removed', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle, { responseTimeout: 9 });
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let n = 0;

      peerIpc.on('action', async () => {
        n += 1;
      });

      peerIpc.receive('action', async () => {
        n += 10;
      });

      peerIpc.handle('action', async () => {
        n += 100;
      });

      selfIpc.send('action');
      selfIpc.call('action');
      await selfIpc.invoke('action');

      peerIpc.removeAll();

      selfIpc.send('action');
      selfIpc.call('action');

      try {
        await selfIpc.invoke('action');
      }
      catch (err) {
        //
      }

      expect(n).toBe(111);

      // Ensure that the instance is still apt to listen to new messages (not destroyed)
      peerIpc.on('action', async () => {
        n += 1;
      });

      selfIpc.send('action');

      expect(n).toBe(112);

      selfIpc.destroy();
      peerIpc.destroy();
      processHandle.removeAllListeners();
    });

    test('The instance is destroyed', async () => {
      const processHandle = new ProcessHandle() as unknown as NodeJS.Process;
      const selfIpc = new ChildIpc<SelfActions, PeerActions>(processHandle, { responseTimeout: 9 });
      const peerIpc = new ChildIpc<PeerActions, SelfActions>(processHandle);

      let n = 0;

      peerIpc.on('action', async () => {
        n += 1;
      });

      peerIpc.receive('action', async () => {
        n += 10;
      });

      peerIpc.handle('action', async () => {
        n += 100;
      });

      selfIpc.send('action');
      selfIpc.call('action');
      await selfIpc.invoke('action');

      // Destroying the peer and expecting that the event listeners no longer work even if they are
      // added again
      peerIpc.destroy();

      let errorCount = 0;

      try {
        peerIpc.on('action', async () => { n += 1; });
      }
      catch (err) {
        errorCount += 1;
      }

      try {
        peerIpc.receive('action', async () => { n += 10; });
      }
      catch (err) {
        errorCount += 1;
      }

      try {
        peerIpc.handle('action', async () => { n += 100; });
      }
      catch (err) {
        errorCount += 1;
      }

      selfIpc.send('action');
      selfIpc.call('action');

      expect(n).toBe(111);

      // Destroying the self and expecting that emitting methods throw because the instance has
      // been destroyed.
      selfIpc.destroy();

      try {
        selfIpc.send('action');
      }
      catch (err) {
        errorCount += 1;
      }

      try {
        selfIpc.call('action');
      }
      catch (err) {
        errorCount += 1;
      }

      try {
        await selfIpc.invoke('action');
      }
      catch (err) {
        errorCount += 1;
      }

      expect(errorCount).toBe(6);

      processHandle.removeAllListeners();
    });
  });
});
