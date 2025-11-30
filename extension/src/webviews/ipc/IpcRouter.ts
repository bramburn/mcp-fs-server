import { ILogger } from "../../services/LoggerService.js";
import {
  IpcCommand,
  IpcMessage,
  IpcRequest,
  IpcResponse,
} from "../protocol.js"; // Removed unused IpcNotification

/**
 * Interface provided to handlers to interact with the Webview/System
 */
export interface IpcContext {
  postMessage(message: IpcMessage): void;
  log(message: string, level?: "INFO" | "WARN" | "ERROR" | "FATAL"): void;
}

/**
 * Base interface for a domain-specific handler
 */
export interface IRequestHandler {
  handleCommand(command: IpcCommand<any>, context: IpcContext): Promise<void>;
  handleRequest(
    request: IpcRequest<any>,
    context: IpcContext
  ): Promise<IpcResponse<any>>;
  // The 'method' property exists on IpcCommand, IpcRequest, and IpcNotification,
  // but not IpcResponse, which is why we must type guard or use casting here.
  canHandle(method: string): boolean;
}

/**
 * Routes incoming IPC messages to the appropriate registered handler
 */
export class IpcRouter {
  private handlers: IRequestHandler[] = [];

  constructor(private logger: ILogger) {}

  public registerHandler(handler: IRequestHandler) {
    this.handlers.push(handler);
  }

  public async routeMessage(
    message: IpcMessage,
    context: IpcContext
  ): Promise<void> {
    // 1. Validate Scope (Centralized validation)
    // FIX: Added 'debugger' to validScopes to allow debug messages to pass through
    const validScopes = ["qdrantIndex", "webview-mgmt", "debugger"];
    if (!validScopes.includes(message.scope)) {
      context.log(
        `Received message with unknown scope: ${message.scope}`,
        "WARN"
      );
      return;
    }

    // Determine method safely, as IpcResponse does not have 'method'
    const method =
      message.kind !== "response"
        ? (message as IpcCommand<any> | IpcRequest<any>).method
        : undefined;

    if (!method) {
      context.log(
        `Received message without method (kind: ${message.kind}). Skipping routing.`,
        "INFO"
      );
      return;
    }

    try {
      // 2. Find Handler
      const handler = this.handlers.find((h) => h.canHandle(method));

      if (!handler) {
        // Fallback for unhandled methods
        if (message.kind === "request") {
          const response: IpcResponse<any> = {
            kind: "response",
            responseId: (message as IpcRequest<any>).id,
            id: crypto.randomUUID(),
            scope: message.scope,
            timestamp: Date.now(),
            error: `Method '${method}' not implemented or registered.`,
          };
          context.postMessage(response);
        }
        context.log(`No handler registered for method: ${method}`, "WARN");
        return;
      }

      // 3. Dispatch based on Kind
      if (message.kind === "command") {
        await handler.handleCommand(message as IpcCommand<any>, context);
      } else if (message.kind === "request") {
        const response = await handler.handleRequest(
          message as IpcRequest<any>,
          context
        );
        context.postMessage(response);
      } else if (message.kind === "notification") {
        // Notifications are usually one-way from Host -> Guest, but if we receive one:
        context.log(`Received notification ${method} (Not handled)`, "INFO");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      context.log(`Error routing message ${method}: ${errorMsg}`, "ERROR");

      // If it was a request, ensure we send an error response back so the promise doesn't hang
      if (message.kind === "request") {
        const errResponse: IpcResponse<any> = {
          kind: "response",
          responseId: (message as IpcRequest<any>).id,
          id: crypto.randomUUID(),
          scope: message.scope,
          timestamp: Date.now(),
          error: errorMsg,
        };
        context.postMessage(errResponse);
      }
    }
  }
}