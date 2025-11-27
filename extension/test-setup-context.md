# Task Context: VS Code Extension Test Setup Fix

## 1. Current Setup Analysis (Internal Context)

The test environment is split between a global setup and a per-file setup, leading to potential conflicts and incomplete environment setup.

### 1.1 Files Analyzed
- [`extension/src/test/setup.ts`](extension/src/test/setup.ts:1): Contains comprehensive mocking for ResizeObserver, HTMLElement.prototype.scrollIntoView, fetch, and a large subset of the vscode API. It also defines a custom afterEach hook.
- [`extension/src/test/global-setup.ts`](extension/src/test/global-setup.ts:1): Provides minimal setup for Node-like globals (process.on, process.env, process.versions.node), intended to satisfy dependencies that expect Node runtime semantics.

### 1.2 Identified Problems
1. `TypeError: Cannot read properties of undefined (reading 'on')`: Likely caused by overlapping or conflicting process mocks between global-setup and setup files, or by the process mock being applied too late relative to library initialization.
2. `undici / Node runtime mismatch`: Some libraries check `process.version` or `process.versions.node` to decide runtime behavior. If those values are missing or inconsistent, code paths that expect Node will fail.
3. `No test suite found in file` for UI tests: Indicates webview/Svelte component tests are not being executed under the expected environment (JSDOM) or that vitest configuration/test globs are excluding the files.

## 2. Summary of Internal Findings

- There is duplication between global setup and per-file setup for `process`-related properties.
- DOM-related mocks (ResizeObserver, scrollIntoView) live in the per-file setup and are appropriate for UI tests, but their placement relative to global setup needs verifying.
- The global `vscode` mock exists in setup.ts; it should be idempotent and ideally initialized once.

## 3. Best Practices and Remediation Strategy (Implementation blueprint)

The objective is to centralize node-like runtime mocks in the global setup, keep DOM and UI mocks in per-test setup, and ensure test environment selection is explicit for UI vs extension tests.

### 3.1 Consolidated setup plan (high level)
- Move minimal Node runtime polyfills to [`extension/src/test/global-setup.ts`](extension/src/test/global-setup.ts:1): process.version, process.versions.node, stdout/stderr/stdin, nextTick, and event-emitter style methods implemented as no-ops or vi.fn as needed.
- Remove any full `process` replacements from [`extension/src/test/setup.ts`](extension/src/test/setup.ts:1) to avoid conflicts.
- Keep DOM-specific mocks (ResizeObserver, HTMLElement.prototype.scrollIntoView) and UI library shims (Radix mocks) in [`extension/src/test/setup.ts`](extension/src/test/setup.ts:1).
- Ensure the global `vscode` mock runs once and is guarded (only assign if not already present).

### 3.2 Lifecycle and ordering
- Ensure `global-setup.ts` is registered in `vitest.config.ts` under `globalSetup` so it runs before any test files or setup files.
- Ensure `setup.ts` is referenced in `vitest.config.ts` via `setupFiles` or `setupFilesAfterEnv` so it executes early for tests that require the DOM mocks.

### 3.3 Specific issues to address
- Replace the custom afterEach logic in [`extension/src/test/setup.ts`](extension/src/test/setup.ts:1) with a simple call to `vi.clearAllMocks()` in a `afterEach` hook so Vitest lifecycle is respected.
- Verify import/init order for any modules that may initialize `undici` or other network libraries during module initialization; such modules must be loaded after global polyfills are applied.

## 4. Step-by-step implementation plan for Code Mode

1. Open and inspect `vitest.config.ts` at project root to confirm `globalSetup` path and test environment defaults.
2. Edit [`extension/src/test/global-setup.ts`](extension/src/test/global-setup.ts:1) to ensure it contains full minimal Node runtime entries required by `undici` and similar libs:
   - process.versions.node (string, e.g., "18.0.0")
   - process.version
   - process.stdout/stderr.write
   - process.stdin.on and isTTY
   - process.nextTick implementation
3. Remove `process` object reconstruction from [`extension/src/test/setup.ts`](extension/src/test/setup.ts:1). Keep only DOM and UI mocks:
   - ResizeObserver
   - HTMLElement.prototype.scrollIntoView
   - fetch = vi.fn()
   - Radix mocks and other UI shims
4. Replace the custom `afterEach` wrapper in `setup.ts` with:
   - afterEach(() => { vi.clearAllMocks(); })
5. Ensure `vscode` mock is assigned once:
   - if (!(global as any).vscode) (global as any).vscode = vscodeMock
6. Run `npm run test` or `npm run vitest` to observe failing tests and iterate.

## 5. Recommendations for handling empty or undiscovered UI test files
- Verify `testMatch` or `include` globs in `vitest.config.ts` include `extension/src/webviews/**` and `*.test.tsx`/`*.test.ts` files.
- If UI tests require `jsdom`, ensure either:
  - the default test environment in `vitest.config.ts` is `jsdom`, or
  - test files that require DOM set `/** @vitest-environment jsdom */` at top or use a dedicated config.

## 6. Risks and notes
- Changing global objects can mask problems; prefer minimal, well-scoped mocks and rely on existing polyfills where possible.
- Ensure mocks are idempotent and safe to run multiple times.
- If third-party libs initialize on import and require Node semantics, lazy-load them or mock earlier.

## 7. Files and locations to edit (explicit)
- [`extension/vitest.config.ts`](extension/vitest.config.ts:1) (verify globalSetup and environment)
- [`extension/src/test/global-setup.ts`](extension/src/test/global-setup.ts:1) (centralize Node runtime patches)
- [`extension/src/test/setup.ts`](extension/src/test/setup.ts:1) (keep DOM/UI mocks, remove process overwrite)

## 8. Next steps (actions for Code Mode)
- Implement the changes in the files above following the step-by-step plan.
- Run `npm run compile` then `npm test` and resolve any remaining failures.

## 9. Contact points
- If you want I can now implement the changes. Please confirm and I will apply the edits to the files listed.