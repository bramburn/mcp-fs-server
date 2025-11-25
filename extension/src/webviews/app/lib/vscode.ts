import type { IpcCommand, IpcRequest, IpcNotification, IpcMessage, IpcScope } from '../../protocol'; // Changed to .ts, removed .js
import { generateUuid } from './utils'; // Assumed utility import

// Acquire the VS Code API instance (must be called only once)
declare const acquireVsCodeApi: <T = unknown>() => VsCodeApi<T>;
interface VsCodeApi<T = unknown> {
  postMessage(message: IpcMessage): void;
  getState(): T | undefined;
  setState(state: T): void;
}

export const vscode = acquireVsCodeApi();

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
 * Sends a Command (fire-and-forget action) to the extension host.
 * @param command - The IpcCommand instance (defining method and scope).
 * @param params - The parameters for the command.
 */
export function sendCommand<TParams>(commandMethod: string, scope: IpcScope, params: TParams): void {
  const message: IpcMessage = {
    id: generateUuid(),
    scope: scope,
    method: commandMethod,
    params: params,
    kind: 'command', // Explicitly set kind
    timestamp: Date.now()
  };
  vscode.postMessage(message);
}

/**
 * Sends a Request (request/response pair with Promise-based handling) to the extension host.
 * @param request - The IpcRequest instance.
 * @param params - The request parameters.
 * @returns A Promise resolving with the response parameters.
 */
export function sendRequest<TParams, TResponseParams>(
  requestMethod: string,
  scope: IpcScope,
  params: TParams
): Promise<TResponseParams> {
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
    vscode.postMessage(message);
  });
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

// Create the HostIpc implementation that can be used with the context
export const hostIpc: HostIpc = {
  sendCommand,
  sendRequest,
  onNotification
};

// Export the HostIpc interface for use in components
export interface HostIpc {
  sendCommand<TParams>(method: string, scope: IpcScope, params: TParams): void;
  sendRequest<TParams, TResponseParams>(method: string, scope: IpcScope, params: TParams): Promise<TResponseParams>;
  onNotification<TParams>(method: string, handler: (params: TParams) => void): void;
}