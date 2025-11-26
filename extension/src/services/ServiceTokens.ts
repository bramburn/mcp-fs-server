import type * as vscode from "vscode";
import type { InjectionToken } from "tsyringe";
import type { ILogger } from "./LoggerService.js";

// ============================================================================
// TOKENS: Shared injection tokens for infrastructure and services
// ============================================================================

/**
 * Output channel used for logging throughout the extension.
 */
export const OUTPUT_CHANNEL_TOKEN: InjectionToken<vscode.OutputChannel> =
  "outputChannel";

/**
 * VS Code extension context token, used for accessing workspace resources.
 */
export const EXTENSION_CONTEXT_TOKEN: InjectionToken<vscode.ExtensionContext> =
  "extensionContext";

/**
 * Global trace flag used to control verbose logging behaviour.
 */
export const TRACE_ENABLED_TOKEN: InjectionToken<boolean> = "traceEnabled";

/**
 * Logical token for the ILogger interface.
 * This allows services to depend on the abstraction instead of the concrete
 * LoggerService implementation.
 */
export const ILOGGER_TOKEN: InjectionToken<ILogger> = "ILogger";

/**
 * Convenience union of all well-known service tokens.
 * This can be extended over time without changing existing imports.
 */
export type KnownServiceToken =
  | typeof OUTPUT_CHANNEL_TOKEN
  | typeof EXTENSION_CONTEXT_TOKEN
  | typeof TRACE_ENABLED_TOKEN
  | typeof ILOGGER_TOKEN;