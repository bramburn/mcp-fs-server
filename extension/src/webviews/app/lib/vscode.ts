import type { IpcCommand, IpcRequest, IpcNotification, IpcMessage, IpcScope } from '../../protocol'; // Changed to .ts, removed .js
import { generateUuid } from './utils'; // Assumed utility import

// VS Code API type definitions (for reference)
declare const acquireVsCodeApi: <T = unknown>() => VsCodeApi<T>;
export interface VsCodeApi<T = unknown> {
  postMessage(message: IpcMessage): void;
  getState(): T | undefined;
  setState(state: T): void;
}

// Note: The VS Code API is now acquired through the useVSCodeApi hook
// to prevent singleton errors during hot reload

// Map to store pending request callbacks
const pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>();

// Listen for responses from the extension host
window.addEventListener('message', (event) => {
  const message = event.data as IpcMessage;
  if (message.kind === 'response' && message.responseId) {
    const pending = pendingRequests.get(message.responseId);
    if (pending) {
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.data);
      }
      pendingRequests.delete(message.responseId);
    }
  }
});

/**
 * Creates a function that sends a Command (fire-and-forget action) to the extension host.
 * @param vscodeApi - The VS Code API instance from useVSCodeApi hook
 * @returns A function that sends commands
 */
export function createSendCommand(vscodeApi: VsCodeApi | null) {
  return function sendCommand<TParams>(commandMethod: string, scope: IpcScope, params: TParams): void {
    if (!vscodeApi) {
      console.warn('VS Code API not available, command not sent:', commandMethod);
      return;
    }
    
    const message: IpcMessage = {
      id: generateUuid(),
      scope: scope,
      method: commandMethod,
      params: params,
      kind: 'command', // Explicitly set kind
      timestamp: Date.now()
    };
    vscodeApi.postMessage(message);
  };
}

/**
 * Creates a function that sends a Request (request/response pair with Promise-based handling) to the extension host.
 * @param vscodeApi - The VS Code API instance from useVSCodeApi hook
 * @returns A function that sends requests and returns a Promise
 */
export function createSendRequest(vscodeApi: VsCodeApi | null) {
  return function sendRequest<TParams, TResponseParams>(
    requestMethod: string,
    scope: IpcScope,
    params: TParams
  ): Promise<TResponseParams> {
    if (!vscodeApi) {
      return Promise.reject(new Error('VS Code API not available'));
    }
    
    const messageId = generateUuid();
    const message: IpcMessage = {
      id: messageId,
      scope: scope,
      method: requestMethod,
      params: params,
      kind: 'request', // Explicitly set kind
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      // Store the resolve/reject callbacks for when the response arrives
      pendingRequests.set(messageId, { resolve, reject });
      vscodeApi.postMessage(message);
    });
  };
}

/** Registers a listener for Notifications from the extension host (Extension -> Webview state updates). */
export function onNotification<TParams>(
  notificationMethod: string,
  handler: (params: TParams) => void
): void {
  window.addEventListener('message', event => {
    const message = event.data as IpcMessage;
    if (message.kind === 'notification' && message.method === notificationMethod) {
      handler(message.params as TParams);
    }
  });
}

/**
 * Creates a HostIpc implementation that can be used with the context
 * @param vscodeApi - The VS Code API instance from useVSCodeApi hook
 * @returns A HostIpc instance
 */
export function createHostIpc(vscodeApi: VsCodeApi | null): HostIpc {
  return {
    sendCommand: createSendCommand(vscodeApi),
    sendRequest: createSendRequest(vscodeApi),
    onNotification
  };
}

// Export the HostIpc interface for use in components
export interface HostIpc {
  sendCommand<TParams>(method: string, scope: IpcScope, params: TParams): void;
  sendRequest<TParams, TResponseParams>(method: string, scope: IpcScope, params: TParams): Promise<TResponseParams>;
  onNotification<TParams>(method: string, handler: (params: TParams) => void): void;
}

// Legacy export for backward compatibility (will be deprecated)
// Note: This will not work without a VS Code API instance
export const hostIpc: HostIpc = {
  sendCommand: () => console.warn('hostIpc.sendCommand called without VS Code API instance'),
  sendRequest: () => Promise.reject(new Error('hostIpc.sendRequest called without VS Code API instance')),
  onNotification
};