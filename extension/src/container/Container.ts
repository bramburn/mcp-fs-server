import * as vscode from 'vscode';
import { ConfigService } from '../services/ConfigService.js';
import { WorkspaceManager } from '../services/WorkspaceManager.js';
import { IndexingService } from '../services/IndexingService.js';
import { AnalyticsService } from '../services/AnalyticsService.js';

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
    if (this._isInitialized) {
      console.warn('Container already initialized');
      return;
    }
    this._context = context;
    this._isInitialized = true;
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
    const registration = this._registrations.get(key);
    if (!registration) {
      throw new Error(`Service ${String(key)} is not registered`);
    }

    // Return cached instance for singletons
    if (registration.lifetime === ServiceLifetime.Singleton && registration.instance) {
      return registration.instance;
    }

    // Create new instance
    const instance = registration.factory(this);

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
    const disposals: Promise<void>[] = [];

    // Dispose in reverse order to handle dependencies correctly
    const registrations = Array.from(this._registrations.values()).reverse();

    for (const registration of registrations) {
      if (registration.instance && registration.disposeFn) {
        try {
          const result = registration.disposeFn(registration.instance);
          if (result instanceof Promise) {
            disposals.push(result);
          }
        } catch (error) {
          console.error(`Error disposing service ${registration.key}:`, error);
        }
      }
    }

    await Promise.all(disposals);
    this._registrations.clear();
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
  AnalyticsService: 'AnalyticsService'
} as const;

/**
 * Helper to register all services with proper dependency resolution
 * This uses a two-phase approach to avoid circular dependencies
 */
export function initializeServices(context: vscode.ExtensionContext): void {
  const container = Container.instance;
  container.initialize(context);

  // Phase 1: Register ConfigService (no dependencies)
  container.register('ConfigService', (c) => new ConfigService(), {
    lifetime: ServiceLifetime.Singleton,
    dispose: (svc) => svc.dispose()
  });

  // Phase 2: Register AnalyticsService (no dependencies on other services)
  container.register('AnalyticsService', (c) =>
    new AnalyticsService(c.context),
    {
      lifetime: ServiceLifetime.Singleton,
      dispose: (svc) => svc.dispose()
    }
  );

  // Phase 3: Register IndexingService (depends on ConfigService, AnalyticsService)
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

  // Phase 4: Register WorkspaceManager (no dependencies on other services)
  // WorkspaceManager manages Git repositories and workspace context
  container.register('WorkspaceManager', (c) =>
    new WorkspaceManager(c.context, c.get('ConfigService')), // Pass ConfigService
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