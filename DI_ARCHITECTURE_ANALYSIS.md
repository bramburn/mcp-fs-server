# Dependency Injection Architecture Analysis

## Current DI System: tsyringe

The extension uses **tsyringe** for dependency injection with the following structure:

### Service Dependency Graph

```
ServiceContainer (DI Registry)
├── Phase 1: Infrastructure Tokens (no dependencies)
│   ├── OUTPUT_CHANNEL_TOKEN
│   ├── EXTENSION_CONTEXT_TOKEN
│   └── TRACE_ENABLED_TOKEN
│
├── Phase 2: LoggerService (singleton)
│   └── Registered as ILOGGER_TOKEN
│
└── Phase 3: Domain Services (singletons)
    ├── ConfigService (depends on: ILOGGER_TOKEN)
    ├── AnalyticsService (depends on: EXTENSION_CONTEXT_TOKEN)
    ├── IndexingService (depends on: ConfigService, AnalyticsService, ILOGGER_TOKEN)
    └── WorkspaceManager (depends on: ConfigService, ILOGGER_TOKEN)
```

## Circular Dependency Issues (FIXED)

### The Problem

**Before Fix:**
```
ServiceContainer.ts imports LoggerService
                        ├─ imports ConfigService
                        │  └─ imports ILOGGER_TOKEN from ServiceContainer (CIRCULAR!)
                        └─ imports AnalyticsService
                           └─ imports EXTENSION_CONTEXT_TOKEN from ServiceContainer (CIRCULAR!)
```

When Node.js loads `ServiceContainer.js`, it must resolve all top-level imports. If `ConfigService.js` tries to import from `ServiceContainer.js`, the module isn't fully initialized yet, causing:
- Undefined exports
- Race conditions
- Module resolution failures

### The Solution

**After Fix:**
```
ServiceContainer.ts uses import type (no runtime code)
                   └─ Dynamic imports in initializeServiceContainer()
                      └─ Imports happen AFTER container is ready
                         └─ Services import tokens from ServiceTokens.js (separate file)
```

**Key Changes:**
1. Top-level imports → `import type` (compile-time only)
2. `require()` → `await import()` (dynamic, breaks circular chain)
3. Services import from `ServiceTokens.js` (not ServiceContainer)

## Token Architecture

### ServiceTokens.js (New Separation)

```typescript
export const ILOGGER_TOKEN = "ILogger";
export const OUTPUT_CHANNEL_TOKEN = "outputChannel";
export const EXTENSION_CONTEXT_TOKEN = "extensionContext";
export const TRACE_ENABLED_TOKEN = "traceEnabled";
```

**Benefits:**
- No circular dependencies (tokens are just strings/symbols)
- Services can import tokens without importing ServiceContainer
- Clean separation of concerns

## Initialization Flow

```
1. activate() called
2. Create OutputChannel
3. await initializeServiceContainer()
   a. container.reset()
   b. Register infrastructure tokens (values)
   c. await import("./LoggerService.js")
   d. Register LoggerService
   e. await import("./ConfigService.js")
   f. Register ConfigService
   g. ... (repeat for other services)
4. getService(ILOGGER_TOKEN) → LoggerService instance
```

## ESM Compliance

### Why `.js` Extensions Matter

Node.js ESM does NOT auto-resolve extensions:
- ❌ `import { x } from "./module"` → NOT FOUND
- ✅ `import { x } from "./module.js"` → FOUND

TypeScript's `rewriteRelativeImportExtensions` only works if you write `.ts` in source:
- ✅ `import { x } from "./module.ts"` → Rewritten to `.js`
- ❌ `import { x } from "./module"` → NOT rewritten

## Remaining Dual DI System

**Note:** There's also `Container.ts` (custom DI) alongside tsyringe. Consider consolidating to single system in future.

