# Interface: IpcEvent

IPC event exposed in every event listener, call receiver and command handler.

## `messageId` string

Unique ID of the message.

## `processId` number

ID of the process that the event has originated from

## `actionName` string

The name of the action (event channel, call route or command handler)

## `type` string

Action type - 'event', 'call' or 'command'
