import { getContext, setContext } from 'svelte';
import type { IpcScope } from '../../protocol';

// Define the context key for IPC
export const ipcContext = Symbol('ipc');

// Define the interface for the IPC host
export interface HostIpc {
    sendCommand<TParams>(method: string, scope: IpcScope, params: TParams): void;
    sendRequest<TParams, TResponseParams>(method: string, scope: IpcScope, params: TParams): Promise<TResponseParams>;
    onNotification<TParams>(method: string, handler: (params: TParams) => void): void;
}

// Function to set the IPC context (typically called at app initialization)
export function setIpcContext(ipc: HostIpc): void {
    setContext(ipcContext, ipc);
}

// Function to get the IPC context from any component
export function getIpcContext(): HostIpc {
    const ipc = getContext<HostIpc>(ipcContext);
    if (!ipc) {
        throw new Error('IPC context not found. Make sure setIpcContext was called in a parent component.');
    }
    return ipc;
}