import { vi } from 'vitest';

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

 // Mock VS Code API for unit tests
type MockUriInit = {
  fsPath: string;
  scheme?: string;
  authority?: string;
  path?: string;
  query?: string;
  fragment?: string;
};

const createMockUri = (init: MockUriInit) => {
  const scheme = init.scheme ?? 'file';
  const authority = init.authority ?? '';
  const path = init.path ?? init.fsPath;
  const query = init.query ?? '';
  const fragment = init.fragment ?? '';

  const base: any = {
    fsPath: init.fsPath,
    scheme,
    authority,
    path,
    query,
    fragment
  };

  base.with = (change: Partial<MockUriInit>) =>
    createMockUri({
      fsPath: change.fsPath ?? base.fsPath,
      scheme: change.scheme ?? base.scheme,
      authority: change.authority ?? base.authority,
      path: change.path ?? base.path,
      query: change.query ?? base.query,
      fragment: change.fragment ?? base.fragment
    });

  base.toString = () => base.fsPath;
  base.toJSON = () => ({
    scheme: base.scheme,
    authority: base.authority,
    path: base.path,
    query: base.query,
    fragment: base.fragment,
    fsPath: base.fsPath
  });

  return base;
};

export const mockUri = {
  file: vi.fn((path: string) =>
    createMockUri({
      fsPath: path
    })
  ),
  parse: vi.fn((uri: string) =>
    createMockUri({
      fsPath: uri,
      path: uri
    })
  ),
  joinPath: vi.fn((base: any, ...segments: string[]) => {
    const joined = [base.fsPath, ...segments].join('/');
    return createMockUri({
      fsPath: joined,
      path: joined
    });
  }),
  repoUri: vi.fn((uri: string) => uri)
};

export const mockWorkspace = {
  workspaceFolders: [
    {
      uri: mockUri.file('/test/workspace'),
      name: 'test-workspace',
      index: 0
    }
  ],
  getConfiguration: vi.fn(() => ({
    get: vi.fn()
  })),
  findFiles: vi.fn().mockResolvedValue([]), // ✅ FIX #3: Return iterable array by default
  fs: {
    readFile: vi.fn(),
    stat: vi.fn().mockResolvedValue({
      type: FileType.Unknown,
      ctime: 0,
      mtime: 0,
      size: 0
    }),
    createDirectory: vi.fn(),
    writeFile: vi.fn()
  },
  // ✅ FIX #1: Add missing asRelativePath method with proper implementation
  asRelativePath: vi.fn((pathOrUri: string | { fsPath: string }) => {
    // Simple mock implementation
    if (typeof pathOrUri === 'string') {
      return pathOrUri.replace('/test/workspace/', '');
    }
    return pathOrUri.fsPath.replace('/test/workspace/', '');
  }),
  // ✅ FIX: Add proper mock implementations for event handlers that return disposable objects
  onDidChangeWorkspaceFolders: vi.fn(() => ({
    dispose: vi.fn()
  })),
  onDidChangeConfiguration: vi.fn(() => ({
    dispose: vi.fn()
  })),
  onDidChangeTextEditorSelection: vi.fn(() => ({
    dispose: vi.fn()
  })),
  onDidChangeActiveTextEditor: vi.fn(() => ({
    dispose: vi.fn()
  }))
};

export const mockWindow = {
  createStatusBarItem: vi.fn(() => ({
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn()
  })),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInputBox: vi.fn(),
  showQuickPick: vi.fn(),
  registerWebviewViewProvider: vi.fn(),
  createWebviewPanel: vi.fn(),
  activeTextEditor: undefined,
  // ✅ FIX: Add proper mock implementations for event handlers that return disposable objects
  onDidChangeActiveTextEditor: vi.fn(() => ({
    dispose: vi.fn()
  })),
  onDidChangeTextEditorSelection: vi.fn(() => ({
    dispose: vi.fn()
  }))
};

export const mockCommands = {
  registerCommand: vi.fn(() => ({
    dispose: vi.fn()
  })),
  executeCommand: vi.fn(),
  registerTextEditorCommand: vi.fn(() => ({
    dispose: vi.fn()
  }))
};

export const mockLanguages = {
  createDiagnosticCollection: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn()
  })),
  getLanguages: vi.fn(() => Promise.resolve(['typescript', 'javascript']))
};

export const mockDiagCollection = {
  set: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
  name: 'test-diag'
};

export const mockDiag = {
  createDiagnosticCollection: vi.fn(() => mockDiagCollection)
};

export const mockEnv = {
  appName: 'VS Code',
  appRoot: '/test/vscode',
  language: 'en',
  sessionId: 'test-session',
  shell: '/bin/bash',
  uriScheme: 'vscode',
  remoteName: undefined
};

export const mockWebview = {
  asWebviewUri: vi.fn((uri: any) => uri),
  postMessage: vi.fn(),
  // ✅ FIX: Add proper mock implementation for event handler that returns disposable object
  onDidReceiveMessage: vi.fn(() => ({
    dispose: vi.fn()
  })),
  html: '',
  options: {},
  cspSource: ''
};

export const mockExtensionContext = {
  extensionUri: { fsPath: '/test/extension' },
  extensionPath: '/test/extension',
  subscriptions: [],
  globalState: {
    get: vi.fn(),
    update: vi.fn(),
    keys: vi.fn(() => []),
    setKeysForSync: vi.fn()
  },
  workspaceState: {
    get: vi.fn(),
    update: vi.fn(),
    keys: vi.fn(() => [])
  },
  storagePath: '/test/storage',
  globalStoragePath: '/test/global-storage',
  logPath: '/test/log',
  secrets: {
    get: vi.fn(),
    store: vi.fn(),
    delete: vi.fn()
  },
  environmentVariableCollection: {
    persistent: true,
    clear: vi.fn(),
    replace: vi.fn(),
    append: vi.fn(),
    prepend: vi.fn(),
    get: vi.fn(() => ({}))
  }
};

// Mock vscode API
export const vscode = {
  workspace: mockWorkspace,
  window: mockWindow,
  commands: mockCommands,
  languages: mockLanguages,
  diagnostics: mockDiag,
  env: mockEnv,
  Uri: mockUri,
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { One: 1, Two: 2, Three: 3, Active: -1, Beside: -2 },
  TextEditorRevealType: {
    InCenter: 1,
    InCenterIfOutsideViewport: 2,
    AtTop: 3
  },
  Range: class Range {
    constructor(public start: any, public end: any) {
      this.start = start;
      this.end = end;
    }

    contains(position: any) {
      return position.line >= this.start.line &&
             position.line <= this.end.line;
    }

    isEqual(other: any) {
      return this.start.line === other.start.line &&
             this.end.line === other.end.line;
    }
  },
  Position: class Position {
    constructor(public line: number, public character: number) {
      this.line = line;
      this.character = character;
    }

    isBefore(other: any) {
      return this.line < other.line ||
             (this.line === other.line && this.character < other.character);
    }
  },
  Selection: class Selection {
    constructor(public anchor: any, public active: any) {
      this.anchor = anchor;
      this.active = active;
    }

    isReversed() {
      return this.active.isBefore(this.anchor);
    }

    contains(position: any) {
      const start = this.isReversed() ? this.active : this.anchor;
      const end = this.isReversed() ? this.anchor : this.active;

      return position.line >= start.line &&
             position.line <= end.line;
    }
  },
  EventEmitter: class EventEmitter {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  Disposable: class Disposable {
    constructor(private callOnDispose: any) {}
    dispose() {
      if (this.callOnDispose) {
        this.callOnDispose();
      }
    }

    static from(...disposables: any[]) {
      return {
        dispose: () => disposables.forEach(d => d.dispose())
      };
    }
  },
  ExtensionContext: mockExtensionContext,
  TreeItem: class TreeItem {
    collapsibleState: any;
    tooltip?: string;
    description?: string;
    command?: { command: string; title: string };
    contextValue?: string;
    iconPath?: any;
    accessibilityInformation?: { label: string; role?: string };

    constructor(public label: string, collapsibleState?: any) {
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  WorkspaceConfiguration: class WorkspaceConfiguration {
    constructor(private config: any = {}) {}

    get(section: string, defaultValue?: any) {
      return section in this.config ? this.config[section] : defaultValue;
    }

    has(section: string) {
      return section in this.config;
    }

    inspect(section: string) {
      return {
        key: section,
        defaultValue: undefined,
        globalValue: this.config[section],
        workspaceValue: undefined,
        workspaceFolderValue: undefined,
        defaultLanguageValue: undefined,
        globalLanguageValue: undefined,
        workspaceLanguageValue: undefined,
        workspaceFolderLanguageValue: undefined
      };
    }

    update(section: string, value: any, configurationTarget?: any) {
      this.config[section] = value;
    }
  },
  CompletionItem: class CompletionItem {
    kind: any;

    constructor(public label: string, kind?: any) {
      this.kind = kind;
    }
  },
  CompletionItemKind: {
    Text: 1, Method: 2, Function: 3, Constructor: 4, Field: 5,
    Variable: 6, Class: 7, Interface: 8, Module: 9, Property: 10,
    Unit: 11, Value: 12, Enum: 13, Keyword: 14, Snippet: 15,
    Color: 16, File: 17, Reference: 18, Folder: 19, EnumMember: 20,
    Constant: 21, Struct: 22, Event: 23, Operator: 24, TypeParameter: 25
  },
  CodeAction: class CodeAction {
    kind: any;

    constructor(public title: string, kind?: any) {
      this.kind = kind;
    }
  },
  CodeActionKind: {
    QuickFix: 'quickfix',
    Refactor: 'refactor',
    RefactorExtract: 'refactor.extract',
    RefactorInline: 'refactor.inline',
    RefactorRewrite: 'refactor.rewrite',
    Source: 'source',
    SourceOrganizeImports: 'source.organizeImports',
    SourceFixAll: 'source.fixAll'
  },
  Diagnostic: class Diagnostic {
    message: string;
    severity: any;
    source?: string;
    code?: string | number;
    relatedInformation?: any[];
    tags?: any[];

    constructor(public range: any, message: string, severity?: any) {
      this.message = message;
      this.severity = severity;
    }
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
  },
  Location: class Location {
    constructor(public uri: any, public range: any) {}
  },
  CodeLens: class CodeLens {
    command: { command: string; title: string } | undefined;

    constructor(public range: any, command?: { command: string; title: string }) {
      this.command = command;
    }
  },
  SymbolKind: {
    File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4,
    Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9,
    Interface: 10, Function: 11, Variable: 12, Constant: 13,
    String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18,
    Key: 19, Null: 20, EnumMember: 21, Struct: 22, Event: 23,
    Operator: 24, TypeParameter: 25
  },
  FileType
};

declare global {
  namespace NodeJS {
    interface Global {
      acquireVsCodeApi: () => {
        postMessage: Function;
        getState: () => any;
        setState: (state: any) => void;
      };
      crypto: {
        randomUUID: () => `${string}-${string}-${string}-${string}-${string}`;
      };
      fetch: Function; // Augment fetch as well
    }
  }
}

// Global mocks for VS Code environment
(global as any).acquireVsCodeApi = vi.fn(() => ({
  postMessage: vi.fn(),
  getState: vi.fn(() => ({})),
  setState: vi.fn()
}));

// Mock crypto.randomUUID
if (!(global as any).crypto) {
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: vi.fn(() => {
        const uuid = 'test-uuid-' + Math.random().toString(36).substr(2, 9);
        return uuid as `${string}-${string}-${string}-${string}-${string}`;
      })
    },
    writable: true,
    configurable: true,
  });
}

// Mock fetch for API calls
if (!(global as any).fetch) { // Check if fetch already exists
    Object.defineProperty(global, 'fetch', {
        value: vi.fn(),
        writable: true,
        configurable: true,
    });
}

 // Mock location.href (needed for some webview components)
 if (typeof window !== 'undefined') {
   Object.defineProperty(window, 'location', {
     value: {
       href: 'vscode-webview://test',
       origin: 'vscode-webview://test',
       protocol: 'vscode-webview:'
     },
     writable: true
   });
 }

 // Mock matchMedia for React components
 if (typeof window !== 'undefined') {
   Object.defineProperty(window, 'matchMedia', {
     writable: true,
     value: vi.fn().mockImplementation(query => ({
       matches: false,
       media: query,
       onchange: null,
       addListener: vi.fn(),
       removeListener: vi.fn(),
       addEventListener: vi.fn(),
       removeEventListener: vi.fn(),
       dispatchEvent: vi.fn(),
     })),
   });
 }

export default vscode;