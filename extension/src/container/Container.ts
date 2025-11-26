import * as vscode from 'vscode';
import { ConfigService } from '../services/ConfigService.js';
import { WorkspaceManager } from '../services/WorkspaceManager.js';
import { IndexingService } from '../services/IndexingService.js';
import { AnalyticsService } from '../services/AnalyticsService.js';
import { LoggerService, ILogger } from '../services/LoggerService.js';

/**
 * Service lifetime options
 */
export enum ServiceLifetime {
  /** Single instance shared across all requests */
  Singleton = 'singleton',
  /** New instance on every request */
  Transient = 'transient',
  /** Instance per scope (useful for testing) */
  Scoped = 'scoped'
}

/**
 * Factory function that can be sync or async
 */
type ServiceFactory<T> = (container: Container) => T | Promise<T>;

/**
 * Service registration metadata
 */
interface ServiceRegistration<T> {
  key: string;
  factory: ServiceFactory<T>;
  lifetime: ServiceLifetime;
  instance?: T; // Cached instance for singletons
  disposeFn?: (instance: T) => void | Promise<void>;
}

/**
 * Type-safe service registry
 */
export interface ServiceRegistry {
  ConfigService: ConfigService;
  WorkspaceManager: WorkspaceManager;
  IndexingService: IndexingService;
  AnalyticsService: AnalyticsService;
  LoggerService: ILogger;
}

/**
 * Improved DI container with lazy initialization, caching, and circular dependency resolution
 */
export class Container {
  private static _instance: Container;
  private _registrations = new Map<string, ServiceRegistration<any>>();
  private _context: vscode.ExtensionContext | undefined;
  private _isInitialized = false;

  private constructor() {}

  public static get instance(): Container {
    if (!Container._instance) {
      Container._instance = new Container();
    }
    return Container._instance;
  }

  /**
   * Initialize container with extension context
   */
  public initialize(context: vscode.ExtensionContext): void {
    const startTime = Date.now();
    console.log(`[CONTAINER] Initializing DI container with context: ${context.extensionUri.fsPath}`);
    
    if (this._isInitialized) {
      console.warn('[CONTAINER] Container already initialized, skipping');
      return;
    }
    
    try {
      this._context = context;
      this._isInitialized = true;
      const duration = Date.now() - startTime;
      console.log(`[CONTAINER] DI container initialized successfully in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CONTAINER] Failed to initialize container after ${duration}ms:`, {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      
      // Special logging for network-related errors
      if (err.message.includes('ECONNRESET') || err.message.includes('connection reset') ||
          err.message.includes('network') || err.message.includes('fetch')) {
        console.error(`[CONTAINER] NETWORK ERROR in initialization - Type: ${err.name}, Message: ${err.message}`);
        console.error(`[CONTAINER] Network error details:`, {
          timestamp: new Date().toISOString(),
          duration
        });
      }
      
      throw err;
    }
  }

  /**
   * Register a service with proper lifetime management
   */
  public register<T extends keyof ServiceRegistry>(
    key: T,
    factory: ServiceFactory<ServiceRegistry[T]>,
    options: {
      lifetime?: ServiceLifetime;
      dispose?: (instance: ServiceRegistry[T]) => void | Promise<void>;
    } = {}
  ): void {
    const { lifetime = ServiceLifetime.Singleton, dispose } = options;

    if (this._registrations.has(key)) {
      throw new Error(`Service ${String(key)} is already registered`);
    }

    // Store registration WITHOUT creating instance (lazy initialization)
    this._registrations.set(key, {
      key: String(key),
      factory,
      lifetime,
      disposeFn: dispose
    });
  }

  /**
   * Get a service instance with dependency resolution and caching
   */
  public get<T extends keyof ServiceRegistry>(key: T): ServiceRegistry[T] {
    const startTime = Date.now();
    console.log(`[CONTAINER] Getting service: ${String(key)}`);
    
    const registration = this._registrations.get(key);
    if (!registration) {
      const error = new Error(`Service ${String(key)} is not registered`);
      console.error(`[CONTAINER] Service not found: ${String(key)}`, {
        availableServices: Array.from(this._registrations.keys()),
        requestedService: String(key)
      });
      throw error;
    }

    // Return cached instance for singletons
    if (registration.lifetime === ServiceLifetime.Singleton && registration.instance) {
      console.log(`[CONTAINER] Returning cached singleton instance: ${String(key)}`);
      return registration.instance;
    }

    // Create new instance
    console.log(`[CONTAINER] Creating new instance of service: ${String(key)}`);
    const factoryStartTime = Date.now();
    
    try {
      const instance = registration.factory(this);
      const factoryDuration = Date.now() - factoryStartTime;
      console.log(`[CONTAINER] Service factory completed for ${String(key)} in ${factoryDuration}ms`);

      // Cache for singletons
      if (registration.lifetime === ServiceLifetime.Singleton) {
        registration.instance = instance;
        console.log(`[CONTAINER] Cached singleton instance: ${String(key)}`);
      }

      // Auto-dispose on extension deactivation
      if (this._context && registration.disposeFn) {
        this._context.subscriptions.push({
          dispose: () => {
            const disposeStartTime = Date.now();
            console.log(`[CONTAINER] Disposing service: ${String(key)}`);
            try {
              registration.disposeFn!(instance);
              const disposeDuration = Date.now() - disposeStartTime;
              console.log(`[CONTAINER] Service disposed successfully: ${String(key)} in ${disposeDuration}ms`);
            } catch (error) {
              const disposeDuration = Date.now() - disposeStartTime;
              const err = error instanceof Error ? error : new Error(String(error));
              console.error(`[CONTAINER] Error disposing service ${String(key)} after ${disposeDuration}ms:`, {
                message: err.message,
                stack: err.stack,
                name: err.name
              });
              
              // Special logging for network-related errors
              if (err.message.includes('ECONNRESET') || err.message.includes('connection reset') ||
                  err.message.includes('network') || err.message.includes('fetch')) {
                console.error(`[CONTAINER] NETWORK ERROR in disposal - Type: ${err.name}, Message: ${err.message}`);
                console.error(`[CONTAINER] Network error details:`, {
                  serviceName: String(key),
                  timestamp: new Date().toISOString(),
                  duration: disposeDuration
                });
              }
            }
          }
        });
      }

      const totalDuration = Date.now() - startTime;
      console.log(`[CONTAINER] Service retrieval completed: ${String(key)} in ${totalDuration}ms`);
      return instance;
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CONTAINER] Failed to create service ${String(key)} after ${totalDuration}ms:`, {
        message: err.message,
        stack: err.stack,
        name: err.name,
        lifetime: registration.lifetime
      });
      
      // Special logging for network-related errors
      if (err.message.includes('ECONNRESET') || err.message.includes('connection reset') ||
          err.message.includes('network') || err.message.includes('fetch')) {
        console.error(`[CONTAINER] NETWORK ERROR in service creation - Type: ${err.name}, Message: ${err.message}`);
        console.error(`[CONTAINER] Network error details:`, {
          serviceName: String(key),
          lifetime: registration.lifetime,
          timestamp: new Date().toISOString(),
          duration: totalDuration
        });
      }
      
      throw err;
    }
  }

  /**
   * Get service asynchronously (for services with async initialization)
   */
  public async getAsync<T extends keyof ServiceRegistry>(key: T): Promise<ServiceRegistry[T]> {
    const registration = this._registrations.get(key);
    if (!registration) {
      throw new Error(`Service ${String(key)} is not registered`);
    }

    // Return cached instance for singletons
    if (registration.lifetime === ServiceLifetime.Singleton && registration.instance) {
      return registration.instance;
    }

    // Create new instance
    const instance = await Promise.resolve(registration.factory(this));

    // Cache for singletons
    if (registration.lifetime === ServiceLifetime.Singleton) {
      registration.instance = instance;
    }

    // Auto-dispose on extension deactivation
    if (this._context && registration.disposeFn) {
      this._context.subscriptions.push({
        dispose: () => {
          try {
            registration.disposeFn!(instance);
          } catch (error) {
            console.error(`Error disposing service ${String(key)}:`, error);
          }
        }
      });
    }

    return instance;
  }

  public get context(): vscode.ExtensionContext {
    if (!this._context) {
      throw new Error('Container not initialized with extension context');
    }
    return this._context;
  }

  /**
   * Dispose all services in reverse registration order
   */
  public async dispose(): Promise<void> {
    const startTime = Date.now();
    console.log(`[CONTAINER] Starting container disposal`);
    
    const disposals: Promise<void>[] = [];

    // Dispose in reverse order to handle dependencies correctly
    const registrations = Array.from(this._registrations.values()).reverse();
    console.log(`[CONTAINER] Disposing ${registrations.length} services in reverse dependency order`);

    for (const registration of registrations) {
      if (registration.instance && registration.disposeFn) {
        const disposeStartTime = Date.now();
        console.log(`[CONTAINER] Disposing service: ${registration.key}`);
        
        try {
          const result = registration.disposeFn(registration.instance);
          if (result instanceof Promise) {
            disposals.push(result);
          }
          const disposeDuration = Date.now() - disposeStartTime;
          console.log(`[CONTAINER] Service disposal initiated: ${registration.key} in ${disposeDuration}ms`);
        } catch (error) {
          const disposeDuration = Date.now() - disposeStartTime;
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(`[CONTAINER] Error disposing service ${registration.key} after ${disposeDuration}ms:`, {
            message: err.message,
            stack: err.stack,
            name: err.name
          });
          
          // Special logging for network-related errors
          if (err.message.includes('ECONNRESET') || err.message.includes('connection reset') ||
              err.message.includes('network') || err.message.includes('fetch')) {
            console.error(`[CONTAINER] NETWORK ERROR in container disposal - Type: ${err.name}, Message: ${err.message}`);
            console.error(`[CONTAINER] Network error details:`, {
              serviceName: registration.key,
              timestamp: new Date().toISOString(),
              duration: disposeDuration
            });
          }
        }
      } else {
        console.log(`[CONTAINER] Service ${registration.key} has no instance or dispose function, skipping`);
      }
    }

    try {
      await Promise.all(disposals);
      const duration = Date.now() - startTime;
      console.log(`[CONTAINER] Container disposal completed in ${duration}ms`);
      this._registrations.clear();
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[CONTAINER] Error during Promise.all in disposal after ${duration}ms:`, {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      
      // Special logging for network-related errors
      if (err.message.includes('ECONNRESET') || err.message.includes('connection reset') ||
          err.message.includes('network') || err.message.includes('fetch')) {
        console.error(`[CONTAINER] NETWORK ERROR in Promise.all disposal - Type: ${err.name}, Message: ${err.message}`);
        console.error(`[CONTAINER] Network error details:`, {
          timestamp: new Date().toISOString(),
          duration
        });
      }
      
      throw err;
    }
  }

  /**
   * Check if a service is registered
   */
  public has<T extends keyof ServiceRegistry>(key: T): boolean {
    return this._registrations.has(key);
  }

  /**
   * Clear all registrations (useful for testing)
   */
  public clear(): void {
    this._registrations.clear();
  }
}

/**
 * Type-safe service keys
 */
export const ServiceKeys: { [K in keyof ServiceRegistry]: K } = {
  ConfigService: 'ConfigService',
  WorkspaceManager: 'WorkspaceManager',
  IndexingService: 'IndexingService',
  AnalyticsService: 'AnalyticsService',
  LoggerService: 'LoggerService'
} as const;

/**
 * Helper to register all services with proper dependency resolution
 * This uses a two-phase approach to avoid circular dependencies
 */
export function initializeServices(
    context: vscode.ExtensionContext, 
    outputChannel: vscode.OutputChannel, 
    traceEnabled: boolean
): void {
  const container = Container.instance;
  container.initialize(context);

  // Phase 1: Register ConfigService, LoggerService (no dependencies on other services)
  container.register('ConfigService', () => new ConfigService(), {
    lifetime: ServiceLifetime.Singleton,
    dispose: (svc) => svc.dispose()
  });

  container.register('LoggerService', () =>
    new LoggerService(outputChannel, traceEnabled),
    {
      lifetime: ServiceLifetime.Singleton,
    }
  );

  // Phase 2: Register AnalyticsService (depends on ConfigService, LoggerService)
  container.register('AnalyticsService', (c) =>
    new AnalyticsService(c.context),
    {
      lifetime: ServiceLifetime.Singleton,
      dispose: (svc) => svc.dispose()
    }
  );

  // Phase 3: Register IndexingService (depends on ConfigService, AnalyticsService, LoggerService)
  container.register('IndexingService', (c) =>
    new IndexingService(
      c.get('ConfigService'),
      c.context,
      c.get('AnalyticsService')
    ),
    {
      lifetime: ServiceLifetime.Singleton,
      dispose: (svc) => svc.dispose?.()
    }
  );

  // Phase 4: Register WorkspaceManager (depends on ConfigService, LoggerService)
  // WorkspaceManager manages Git repositories and workspace context
  container.register('WorkspaceManager', (c) =>
    new WorkspaceManager(c.context, c.get('ConfigService')), // Pass ConfigService only
    {
      lifetime: ServiceLifetime.Singleton,
      dispose: (svc) => svc.dispose?.()
    }
  );
}

/**
 * Utility for type-safe service access in components
 */
export function useService<T extends keyof ServiceRegistry>(key: T): ServiceRegistry[T] {
  return Container.instance.get(key);
}

/**
 * Utility for async service access
 */
export async function useServiceAsync<T extends keyof ServiceRegistry>(key: T): Promise<ServiceRegistry[T]> {
  return await Container.instance.getAsync(key);
}