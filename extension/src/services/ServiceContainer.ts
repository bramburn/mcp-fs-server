import "reflect-metadata";
import type { InjectionToken } from "tsyringe";
import { container } from "tsyringe";
import * as vscode from "vscode";

// ============================================================================
// TOKENS: Use these to inject infrastructure dependencies into services
// ============================================================================

export const OUTPUT_CHANNEL_TOKEN: InjectionToken<vscode.OutputChannel> =
  "outputChannel";
export const EXTENSION_CONTEXT_TOKEN: InjectionToken<vscode.ExtensionContext> =
  "extensionContext";
export const TRACE_ENABLED_TOKEN: InjectionToken<boolean> = "traceEnabled";

// Service identifiers
export const ILOGGER_TOKEN = "ILogger";

// ============================================================================
// CONTAINER INITIALIZATION
// ============================================================================

/**
 * Initialize the tsyringe dependency injection container
 * Uses dynamic imports to break circular dependencies
 */
export async function initializeServiceContainer(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  traceEnabled: boolean
): Promise<void> {
  // Clear previous registrations (important for hot reload)
  container.reset();

  // ========================================================================
  // Phase 1: Register Infrastructure Tokens (NO DEPENDENCIES)
  // ========================================================================
  container.register(OUTPUT_CHANNEL_TOKEN, {
    useValue: outputChannel,
  });

  container.register(EXTENSION_CONTEXT_TOKEN, {
    useValue: context,
  });

  container.register(TRACE_ENABLED_TOKEN, {
    useValue: traceEnabled,
  });

  // ========================================================================
  // Phase 2: Register LoggerService as ILogger (SINGLETON)
  // ========================================================================
  // Use dynamic imports to avoid circular dependencies
  const { LoggerService } = await import("./LoggerService.js");
  container.registerSingleton(ILOGGER_TOKEN, LoggerService);
  container.registerSingleton("LoggerService", LoggerService);

  // ========================================================================
  // Phase 3: Register Domain Services (SINGLETONS)
  // ========================================================================
  const { ConfigService } = await import("./ConfigService.js");
  const { AnalyticsService } = await import("./AnalyticsService.js");
  const { IndexingService } = await import("./IndexingService.js");
  const { WorkspaceManager } = await import("./WorkspaceManager.js");

  container.registerSingleton("ConfigService", ConfigService);
  container.registerSingleton("AnalyticsService", AnalyticsService);
  container.registerSingleton("IndexingService", IndexingService);
  container.registerSingleton("WorkspaceManager", WorkspaceManager);
}

// ============================================================================
// SERVICE RESOLUTION
// ============================================================================

/**
 * Get a service instance from the container (synchronous)
 */
export function getService<T>(token: string | InjectionToken<T>): T {
  try {
    return container.resolve(token as any);
  } catch (error) {
    const tokenName = typeof token === "string" ? token : token.toString();
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Failed to resolve service "${tokenName}": ${err.message}`);
  }
}

/**
 * Dispose the container (call in deactivate)
 * Clears all registrations
 */
export async function disposeContainer(): Promise<void> {
  try {
    container.reset();
  } catch (error) {
    console.error("Error disposing container:", error);
  }
}

// ============================================================================
// SINGLETON HELPERS (for testing/debugging)
// ============================================================================

/**
 * Check if a service is registered
 */
export function isServiceRegistered(
  token: string | InjectionToken<any>
): boolean {
  try {
    const service = container.resolve(token as any);
    return service !== undefined && service !== null;
  } catch {
    return false;
  }
}

/**
 * Clear container (useful for testing)
 */
export function clearContainer(): void {
  container.reset();
}

export { container };
