 // Minimal plain vscode mock for global-setup (avoid importing vitest/vi here)
 const plainVscode = {
   workspace: {
     workspaceFolders: [],
     getConfiguration: () => ({ get: () => undefined }),
     findFiles: () => Promise.resolve([]),
     fs: {
       readFile: () => Promise.resolve(new Uint8Array()),
       stat: () => Promise.resolve({ type: 0 }),
     },
     asRelativePath: (pathOrUri: any) => {
       if (typeof pathOrUri === 'string') return pathOrUri.replace('/test/workspace/', '');
       return pathOrUri.fsPath.replace('/test/workspace/', '');
     },
     onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
     onDidChangeConfiguration: () => ({ dispose: () => {} }),
     onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
     onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
   },
   window: {
     createStatusBarItem: () => ({ text: '', tooltip: '', command: '', show: () => {}, hide: () => {}, dispose: () => {} }),
     showInformationMessage: () => {},
     showWarningMessage: () => {},
     showErrorMessage: () => {},
     showInputBox: () => Promise.resolve(''),
     showQuickPick: () => Promise.resolve([]),
     registerWebviewViewProvider: () => ({}),
     createWebviewPanel: () => ({}),
     activeTextEditor: undefined,
     onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
     onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
   },
   commands: {
     registerCommand: () => ({ dispose: () => {} }),
     executeCommand: () => Promise.resolve(),
     registerTextEditorCommand: () => ({ dispose: () => {} }),
   },
   languages: {
     createDiagnosticCollection: () => ({ set: () => {}, delete: () => {}, clear: () => {}, dispose: () => {} }),
     getLanguages: () => Promise.resolve(['typescript', 'javascript']),
   },
   Uri: {
     file: (fsPath: string) => ({ fsPath, scheme: 'file', path: fsPath, with: () => ({ fsPath, scheme: 'file', path: fsPath, toString: () => '' }) }),
     parse: (uri: string) => ({ fsPath: uri, scheme: 'file', path: uri, with: () => ({ fsPath: uri, scheme: 'file', path: uri, toString: () => '' }) }),
   },
 };

 // Vitest global setup to provide minimal Node-like globals and central mocks
 export default async function globalSetup() {
   const g: any = globalThis as any;
 
   // Assign a more complete process polyfill if it doesn't exist.
   // This is to ensure that libraries like 'undici' which expect a full process object
   // (including event emitter methods, properties like version, env, etc.) do not fail.
   if (!g.process) {
     // Create a simple EventEmitter-like implementation used by libraries that
     // probe for event methods on `process`. This is intentionally minimal but
     // provides the standard API signatures.
     const _listeners: Record<string, Function[]> = {};
     const emitter = {
       on: (ev: string, fn: Function) => {
         _listeners[ev] = _listeners[ev] || [];
         _listeners[ev].push(fn);
         return emitter;
       },
       addListener: (ev: string, fn: Function) => emitter.on(ev, fn),
       once: (ev: string, fn: Function) => {
         const wrapper = (...args: any[]) => {
           emitter.removeListener(ev, wrapper);
           fn(...args);
         };
         return emitter.on(ev, wrapper);
       },
       off: (ev: string, fn?: Function) => {
         if (!fn) { delete _listeners[ev]; return emitter; }
         _listeners[ev] = (_listeners[ev] || []).filter(f => f !== fn);
         return emitter;
       },
       removeListener: (ev: string, fn?: Function) => emitter.off(ev, fn),
       removeAllListeners: (ev?: string) => {
         if (ev) delete _listeners[ev];
         else {
           for (const k of Object.keys(_listeners)) delete _listeners[k];
         }
         return emitter;
       },
       listeners: (ev: string) => (_listeners[ev] || []).slice(),
       emit: (ev: string, ...args: any[]) => {
         const fns = (_listeners[ev] || []).slice();
         if (!fns.length) return false;
         for (const fn of fns) {
           try { fn(...args); } catch (e) { /* swallow in test env */ }
         }
         return true;
       },
     };

     g.process = {
       // Event emitter methods (forward to emitter)
       on: emitter.on,
       off: emitter.off,
       once: emitter.once,
       emit: emitter.emit,
       removeAllListeners: emitter.removeAllListeners,
       addListener: emitter.addListener,
       removeListener: emitter.removeListener,
       listeners: emitter.listeners,
       // Standard properties
       env: { NODE_ENV: 'test' },
       version: 'v18.0.0',
       versions: {
         node: '18.0.0',
         v8: '10.2.154.26-node.26',
         uv: '1.48.0',
         zlib: '1.2.13',
         brotli: '1.1.0',
         ares: '1.19.1',
         modules: '114',
         nghttp2: '1.59.0',
         napi: '10',
         llhttp: '8.1.2',
         openssl: '3.0.13+quic',
         cldr: '44.1',
         icu: '74.2',
         tz: '2024a',
         unicode: '15.1',
       },
       // Standard streams (provide write and isTTY)
       stdout: { write: (..._args: any[]) => {}, isTTY: false },
       stderr: { write: (..._args: any[]) => {}, isTTY: false },
       stdin: { on: (..._args: any[]) => {}, isTTY: false, destroy: () => {}, destroySoon: () => {} },
       // Other common properties
       argv: [],
       pid: 12345,
       ppid: 12344,
       title: 'vitest',
       arch: 'x64',
       platform: 'linux',
       // nextTick - microtask scheduling
       nextTick: (cb: (...args: any[]) => void, ...args: any[]) => {
         Promise.resolve().then(() => cb(...args));
       },
       // Other methods that might be checked
       cwd: () => '/test/workspace',
       chdir: (_dir?: string) => {},
       umask: () => 18,
       hrtime: () => [0, 0],
       // Expose the emitter for advanced use if needed
       _emitter: emitter,
     };
   } else {
     // If process already exists (e.g. from a partial mock), ensure critical parts are present.
     const p: any = g.process;
     const ensureFn = (obj: any, name: string, fn: Function) => {
       if (typeof obj[name] !== 'function') obj[name] = fn;
     };

     // Ensure event emitter methods exist and are functional
     if (typeof p.on !== 'function' || typeof p.emit !== 'function') {
       const _listeners: Record<string, Function[]> = {};
       ensureFn(p, 'on', (ev: string, fn: Function) => {
         _listeners[ev] = _listeners[ev] || [];
         _listeners[ev].push(fn);
         return p;
       });
       ensureFn(p, 'addListener', (ev: string, fn: Function) => p.on(ev, fn));
       ensureFn(p, 'once', (ev: string, fn: Function) => {
         const wrapper = (...args: any[]) => {
           (p.removeListener || (() => {}))(ev, wrapper);
           fn(...args);
         };
         return p.on(ev, wrapper);
       });
       ensureFn(p, 'off', (ev: string, fn?: Function) => {
         if (!fn) { delete _listeners[ev]; return p; }
         _listeners[ev] = (_listeners[ev] || []).filter(f => f !== fn);
         return p;
       });
       ensureFn(p, 'removeListener', (ev: string, fn?: Function) => p.off(ev, fn));
       ensureFn(p, 'removeAllListeners', (ev?: string) => {
         if (ev) delete _listeners[ev];
         else {
           for (const k of Object.keys(_listeners)) delete _listeners[k];
         }
         return p;
       });
       ensureFn(p, 'listeners', (ev: string) => (_listeners[ev] || []).slice());
       ensureFn(p, 'emit', (ev: string, ...args: any[]) => {
         const fns = (_listeners[ev] || []).slice();
         if (!fns.length) return false;
         for (const fn of fns) {
           try { fn(...args); } catch (e) { /* swallow */ }
         }
         return true;
       });
     }

     if (!p.env) p.env = { NODE_ENV: 'test' };
     if (!p.version) p.version = 'v18.0.0';
     if (!p.versions) p.versions = { node: '18.0.0' };
     if (!p.stdout) p.stdout = { write: (..._args: any[]) => {}, isTTY: false };
     if (!p.stderr) p.stderr = { write: (..._args: any[]) => {}, isTTY: false };
     if (!p.stdin) p.stdin = { on: (..._args: any[]) => {}, isTTY: false, destroy: () => {}, destroySoon: () => {} };
     if (typeof p.nextTick !== 'function') p.nextTick = (cb: (...args: any[]) => void, ...args: any[]) => Promise.resolve().then(() => cb(...args));
   }

  // Ensure the VS Code mock is installed once at the global level so it's
  // available to both node- and jsdom-based tests. Guard to make this idempotent.
  try {
    if (!(g as any).vscode) {
      // Use the plain, vitest-free mock defined at the top of this file.
      (g as any).vscode = plainVscode;
    }
  } catch (e) {
    // Fail gracefully - tests will fallback to lighter mocks if needed.
    // eslint-disable-next-line no-console
    console.warn('global-setup: failed to assign vscode mock', e);
  }
}