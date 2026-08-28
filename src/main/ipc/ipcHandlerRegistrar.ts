import type { IpcMainInvokeEvent } from 'electron'
import type { IpcInvokeChannel, IpcRequest, IpcResponse } from '@shared/ipc/contracts'

type MaybePromise<T> = T | Promise<T>
type NormalizeVoid<T> = void extends T ? Exclude<T, void> | undefined : T

export interface IpcHandlerRegistrar {
  handle<TChannel extends IpcInvokeChannel>(
    channel: TChannel,
    listener: (
      event: IpcMainInvokeEvent,
      payload: NormalizeVoid<IpcRequest<TChannel>>,
    ) => MaybePromise<IpcResponse<TChannel>>,
  ): void
}
