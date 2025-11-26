import "reflect-metadata";
import type { InjectionToken } from "tsyringe";
import { container } from "tsyringe";
import * as vscode from "vscode";
import { LoggerService } from "./LoggerService.js";
import { ConfigService } from "./ConfigService.js";
import { AnalyticsService } from "./AnalyticsService.js";
import { IndexingService } from "./IndexingService.js";
import { WorkspaceManager } from "./WorkspaceManager.js";
import {
  OUTPUT_CHANNEL_TOKEN,
  EXTENSION_CONTEXT_TOKEN,
  TRACE_ENABLED_TOKEN,
  ILOGGER_TOKEN,
} from "./ServiceTokens.js";

// Re‑export tokens so existing imports from ServiceContainer remain valid
export {
  OUTPUT_CHANNEL_TOKEN,
  EXTENSION_CONTEXT_TOKEN,
  TRACE_ENABLED_TOKEN,
  ILOGGER_TOKEN,
} from "./ServiceTokens.js";

// ============================================================================
// CONTAINER INITIALIZATION
// ============================================================================

/**
 * Initialize the tsyringe dependency injection container
 */
export function initializeServiceContainer(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  traceEnabled: boolean
): void {
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
  container.registerSingleton(ILOGGER_TOKEN, LoggerService);
  container.registerSingleton("LoggerService", LoggerService);

  // ========================================================================
  // Phase 3: Register Domain Services (SINGLETONS)
  // ========================================================================
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
 *
 * Overloads ensure we preserve type information for known tokens while still
 * allowing string-based service identifiers for legacy usages.
 */
export function getService<T>(token: InjectionToken<T>): T;
export function getService<T>(token: string): T;
export function getService<T>(token: string | InjectionToken<T>): T {
  try {
    return container.resolve<T>(token as InjectionToken<T>);
  } catch (error) {
    const tokenName = typeof token === "string" ? token : token.toString();
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Failed to resolve service "${tokenName}": ${err.message}`);
  }
}

/**
 * Dispose the container (call in deactivate)
 * Properly disposes all services before clearing registrations
 */
interface Disposable {
  dispose: () => Promise<void> | void;
}

function isDisposable(value: unknown): value is Disposable {
  return !!value && typeof (value as any).dispose === "function";
}

export async function disposeContainer(): Promise<void> {
  try {
    console.log("[ServiceContainer] Starting container disposal...");

    // Dispose services in reverse order of dependency
    const servicesToDispose = [
      "AnalyticsService",
      "IndexingService",
      "WorkspaceManager",
      "ConfigService",
      "LoggerService",
    ];

    for (const serviceName of servicesToDispose) {
      try {
        const service = container.resolve<unknown>(
          serviceName as InjectionToken<unknown>
        );
        if (isDisposable(service)) {
          console.log(`[ServiceContainer] Disposing ${serviceName}...`);
          await service.dispose();
          console.log(
            `[ServiceContainer] ${serviceName} disposed successfully`
          );
        }
      } catch (error) {
        console.warn(
          `[ServiceContainer] Error disposing ${serviceName}:`,
          error
        );
      }
    }

    console.log("[ServiceContainer] Clearing container registrations...");
    container.reset();
    console.log("[ServiceContainer] Container disposed successfully");
  } catch (error) {
    console.error("[ServiceContainer] Error disposing container:", error);
  }
}

// ============================================================================
// SINGLETON HELPERS (for testing/debugging)
// ============================================================================

/**
 * Check if a service is registered
 */
export function isServiceRegistered(
  token: string | InjectionToken<unknown>
): boolean {
  // Prefer container's registration metadata instead of attempting resolution,
  // which could trigger expensive constructors or side effects.
  if (typeof token === "string") {
    return container.isRegistered(token);
  }

  return container.isRegistered(token);
}

/**
 * Clear container (useful for testing)
 */
export function clearContainer(): void {
  container.reset();
}

export { container };
