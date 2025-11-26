import { createContext, useContext, type ReactNode } from 'react';
import type { IpcScope } from '../../protocol';

export interface HostIpc {
  sendCommand<TParams>(method: string, scope: IpcScope, params: TParams): void;
  sendRequest<TParams, TResponseParams>(
    method: string,
    scope: IpcScope,
    params: TParams
  ): Promise<TResponseParams>;
  onNotification<TParams>(method: string, handler: (params: TParams) => void): void;
}

// Internal React context
const IpcContext = createContext<HostIpc | undefined>(undefined);

export interface IpcProviderProps {
  value: HostIpc;
  children: ReactNode;
}

export function IpcProvider({ value, children }: IpcProviderProps) {
  return <IpcContext.Provider value={value}>{children}</IpcContext.Provider>;
}

export function useIpc(): HostIpc {
  const ctx = useContext(IpcContext);
  if (!ctx) {
    throw new Error('useIpc must be used within an IpcProvider');
  }
  return ctx;
}