import type { IpcMessage, IpcScope } from "../../protocol.js"; // Changed to .ts, removed .js
import { generateUuid } from "./utils.js"; // Assumed utility import

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
const pendingRequests = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason?: any) => void }
>();

// Listen for responses from the extension host
window.addEventListener("message", (event) => {
  try {
    const message = event.data as IpcMessage;
    console.log("[IPC Client] Received message from extension host:", message);

    if (message && message.kind === "response" && message.responseId) {
      console.log(
        "[IPC Client] Processing response for request:",
        message.responseId
      );
      const pending = pendingRequests.get(message.responseId);
      if (pending) {
        console.log("[IPC Client] Found pending request, resolving/rejecting");
        if (message.error) {
          console.error("[IPC Client] Response contains error:", message.error);
          pending.reject(new Error(message.error));
        } else {
          console.log("[IPC Client] Response successful, data:", message.data);
          // Ensure data is defined before resolving
          const responseData = message.data ?? {};
          console.log("[IPC Client] Resolving with data:", responseData);
          pending.resolve(responseData);
        }
        pendingRequests.delete(message.responseId);
      } else {
        console.warn(
          "[IPC Client] No pending request found for response:",
          message.responseId
        );
      }
    }
  } catch (error) {
    console.error("[IPC Client] Error processing message:", error);
  }
});

/**
 * Creates a function that sends a Command (fire-and-forget action) to the extension host.
 * @param vscodeApi - The VS Code API instance from useVSCodeApi hook
 * @returns A function that sends commands
 */
export function createSendCommand(vscodeApi: VsCodeApi | null) {
  return function sendCommand<TParams>(
    commandMethod: string,
    scope: IpcScope,
    params: TParams
  ): void {
    if (!vscodeApi) {
      console.warn(
        "VS Code API not available, command not sent:",
        commandMethod
      );
      return;
    }

    const message: IpcMessage = {
      id: generateUuid(),
      scope: scope,
      method: commandMethod,
      params: params,
      kind: "command", // Explicitly set kind
      timestamp: Date.now(),
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
    console.log("[IPC Client] sendRequest called:", {
      requestMethod,
      scope,
      params,
    });

    if (!vscodeApi) {
      console.error("[IPC Client] VS Code API not available!");
      return Promise.reject(new Error("VS Code API not available"));
    }

    const messageId = generateUuid();
    const message: IpcMessage = {
      id: messageId,
      scope: scope,
      method: requestMethod,
      params: params,
      kind: "request", // Explicitly set kind
      timestamp: Date.now(),
    };

    console.log("[IPC Client] Posting message to extension host:", message);

    return new Promise((resolve, reject) => {
      // Store the resolve/reject callbacks for when the response arrives
      pendingRequests.set(messageId, { resolve, reject });
      console.log("[IPC Client] Stored pending request:", messageId);

      try {
        vscodeApi.postMessage(message);
        console.log("[IPC Client] Message posted successfully");
      } catch (error) {
        console.error("[IPC Client] Failed to post message:", error);
        pendingRequests.delete(messageId);
        reject(error);
      }
    });
  };
}

/** Registers a listener for Notifications from the extension host (Extension -> Webview state updates). */
export function onNotification<TParams>(
  notificationMethod: string,
  handler: (params: TParams) => void
): void {
  window.addEventListener("message", (event) => {
    const message = event.data as IpcMessage;
    if (
      message.kind === "notification" &&
      message.method === notificationMethod
    ) {
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
    onNotification,
  };
}

// Export the HostIpc interface for use in components
export interface HostIpc {
  sendCommand<TParams>(method: string, scope: IpcScope, params: TParams): void;
  sendRequest<TParams, TResponseParams>(
    method: string,
    scope: IpcScope,
    params: TParams
  ): Promise<TResponseParams>;
  onNotification<TParams>(
    method: string,
    handler: (params: TParams) => void
  ): void;
}

// Legacy export for backward compatibility (will be deprecated)
// Note: This will not work without a VS Code API instance
export const hostIpc: HostIpc = {
  sendCommand: () =>
    console.warn("hostIpc.sendCommand called without VS Code API instance"),
  sendRequest: () =>
    Promise.reject(
      new Error("hostIpc.sendRequest called without VS Code API instance")
    ),
  onNotification,
};
