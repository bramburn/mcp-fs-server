# Testing Recommendations for DI Fixes

## Manual Testing Steps

### 1. Extension Activation Test
```
1. Open VS Code
2. Load the extension in development mode (F5)
3. Check Output Channel for:
   ✅ "📦 Initializing DI container..."
   ✅ "✅ DI container initialized"
   ✅ "🎉 Extension Ready!"
4. Verify no "Cannot find module" errors
```

### 2. Service Resolution Test
```typescript
// In extension.ts after initialization
const logger = getService(ILOGGER_TOKEN);
const config = getService("ConfigService");
const analytics = getService("AnalyticsService");

// All should resolve without errors
console.assert(logger !== undefined, "Logger not resolved");
console.assert(config !== undefined, "ConfigService not resolved");
console.assert(analytics !== undefined, "AnalyticsService not resolved");
```

### 3. Hot Reload Test
```
1. Make a change to a service file
2. Reload extension (Ctrl+R in debug console)
3. Verify container reinitializes without errors
4. Verify services are still accessible
```

### 4. Circular Dependency Test
```
Run: npm run build
Expected: No circular dependency warnings
```

## Automated Tests to Add

### Test 1: Container Initialization
```typescript
describe("ServiceContainer", () => {
  it("should initialize without circular dependency errors", async () => {
    const context = createMockContext();
    const outputChannel = createMockOutputChannel();
    
    await initializeServiceContainer(context, outputChannel, false);
    
    expect(isServiceRegistered(ILOGGER_TOKEN)).toBe(true);
    expect(isServiceRegistered("ConfigService")).toBe(true);
  });
});
```

### Test 2: Service Resolution
```typescript
it("should resolve all registered services", async () => {
  const logger = getService(ILOGGER_TOKEN);
  const config = getService("ConfigService");
  
  expect(logger).toBeDefined();
  expect(config).toBeDefined();
});
```

### Test 3: ESM Import Resolution
```typescript
it("should resolve .js extensions in ESM", async () => {
  // This test verifies the compiled output has correct extensions
  const extensionJs = fs.readFileSync("out/extension/src/extension.js", "utf-8");
  
  expect(extensionJs).toContain('from "./services/ServiceContainer.js"');
  expect(extensionJs).toContain('from "./webviews/WebviewController.js"');
});
```

## Debugging Tips

### If Module Not Found Error Persists

1. **Check compiled output:**
   ```bash
   cat out/extension/src/extension.js | grep "from.*services"
   ```
   Should show `.js` extensions

2. **Check tsconfig.json:**
   ```json
   {
     "moduleResolution": "bundler",
     "rewriteRelativeImportExtensions": true
   }
   ```

3. **Verify source imports:**
   ```bash
   grep -r "from.*services" src/extension.ts
   ```
   Should show `.js` extensions

### If Circular Dependency Detected

1. Check for top-level imports in ServiceContainer.ts
2. Verify all services import tokens from ServiceTokens.js
3. Run: `npm run build -- --listFiles` to see import order

## Performance Considerations

- **Dynamic imports add ~50-100ms** to initialization (acceptable for extension startup)
- **Lazy loading** of services happens on first `getService()` call
- **Singleton caching** ensures services created only once

## Future Improvements

1. **Consolidate DI systems**: Choose between tsyringe or custom Container
2. **Add service lifecycle hooks**: onInitialize, onDispose
3. **Implement service factory pattern** for complex dependencies
4. **Add dependency graph visualization** for debugging

