# ESM Module Resolution & Circular Dependency Fixes

## Problem Summary

The VS Code extension was failing to activate with error:
```
Cannot find module 'c:\dev\mcp-fs-server\extension\out\extension\src\services\ServiceContainer' 
imported from c:\dev\mcp-fs-server\extension\out\extension\src\extension.js
```

### Root Causes

1. **Missing `.js` Extensions in ESM Imports**: Node.js ESM requires explicit file extensions
2. **Circular Dependencies**: ServiceContainer imported all services at module load time, creating circular references
3. **Mixed Module Systems**: Using `require()` in ESM context instead of dynamic imports

## Fixes Implemented

### Fix 1: Add `.js` Extensions to All Imports (extension/src/extension.ts)

**Changed:**
```typescript
import { ... } from "./services/ServiceContainer";
import { WebviewController } from "./webviews/WebviewController";
```

**To:**
```typescript
import { ... } from "./services/ServiceContainer.js";
import { WebviewController } from "./webviews/WebviewController.js";
```

All type imports also updated with `.js` extensions.

### Fix 2: Break Circular Dependencies (extension/src/services/ServiceContainer.ts)

**Changed top-level imports from:**
```typescript
import { LoggerService } from "./LoggerService.js";
import { ConfigService } from "./ConfigService.js";
// ... etc
```

**To:**
```typescript
import type { LoggerService } from "./LoggerService.js";
import type { ConfigService } from "./ConfigService.js";
// ... etc (all as type imports)
```

### Fix 3: Use Dynamic Imports in Initialization

**Changed from:**
```typescript
export function initializeServiceContainer(...): void {
  const { LoggerService } = require("./LoggerService");
  container.registerSingleton("LoggerService", LoggerService);
}
```

**To:**
```typescript
export async function initializeServiceContainer(...): Promise<void> {
  const { LoggerService } = await import("./LoggerService.js");
  container.registerSingleton(ILOGGER_TOKEN, LoggerService);
  container.registerSingleton("LoggerService", LoggerService);
}
```

### Fix 4: Await Async Initialization (extension/src/extension.ts)

**Changed:**
```typescript
initializeServiceContainer(context, outputChannel, traceEnabled);
```

**To:**
```typescript
await initializeServiceContainer(context, outputChannel, traceEnabled);
```

## Verification

✅ All services already import tokens from `ServiceTokens.js` (not ServiceContainer)
✅ No circular imports detected
✅ TypeScript compilation: No errors
✅ All `.js` extensions properly added for ESM compatibility

## Benefits

1. **Fixes Module Resolution**: ESM now correctly resolves all imports
2. **Eliminates Circular Dependencies**: Dynamic imports break the circular reference chain
3. **Proper Async Handling**: Initialization properly awaited
4. **Type Safety**: Using `import type` prevents runtime circular issues
5. **ESM Compliance**: Fully compliant with Node.js ESM requirements

