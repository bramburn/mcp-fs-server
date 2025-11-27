import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import vscode from "./mocks/vscode-api";

// Minimal process polyfill for environments where it's missing
const g: any = globalThis as any;
if (!g.process) {
  g.process = {
    env: {},
    on: vi.fn(),
  };
} else if (g.process && typeof g.process.on !== "function") {
  g.process.on = vi.fn();
}

// Ensure we cleanup React Testing Library between tests
afterEach(() => {
  cleanup();
});

// Apply VS Code API mock globally for tests (no try/catch to avoid parse issues)
(global as any).vscode = vscode;

// Minimal VS Code API fallback shape (only if something overwrites it to undefined)
if (!(global as any).vscode) {
  (global as any).vscode = {
    workspace: {
      workspaceFolders: [],
      getConfiguration: () => ({ get: () => undefined }),
      findFiles: () => Promise.resolve([]),
      fs: {
        stat: () => Promise.resolve({ type: 0 }),
        readFile: () => Promise.resolve(new Uint8Array()),
      },
      asRelativePath: () => "",
      onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
      onDidChangeConfiguration: () => ({ dispose: () => {} }),
      onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
      onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    },
    window: {
      createStatusBarItem: () => ({
        text: "",
        tooltip: "",
        command: "",
        show: () => {},
        hide: () => {},
        dispose: () => {},
      }),
      showInformationMessage: () => {},
      showWarningMessage: () => {},
      showErrorMessage: () => {},
      showInputBox: () => Promise.resolve(""),
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
      createDiagnosticCollection: () => ({
        set: () => {},
        delete: () => {},
        clear: () => {},
        dispose: () => {},
      }),
      getLanguages: () => Promise.resolve(["typescript", "javascript"]),
    },
    diagnostics: {
      createDiagnosticCollection: () => ({
        set: () => {},
        delete: () => {},
        clear: () => {},
        dispose: () => {},
      }),
    },
    env: {
      appName: "VS Code",
      appRoot: "/test/vscode",
      language: "en",
      sessionId: "test-session",
      shell: "/bin/bash",
      uriScheme: "vscode",
      remoteName: undefined,
    },
    Uri: {
      file: () => ({
        fsPath: "",
        scheme: "file",
        path: "",
        query: "",
        fragment: "",
        with: () => ({
          fsPath: "",
          scheme: "file",
          path: "",
          query: "",
          fragment: "",
          toString: () => "",
        }),
      }),
      parse: () => ({
        fsPath: "",
        scheme: "file",
        path: "",
        query: "",
        fragment: "",
        with: () => ({
          fsPath: "",
          scheme: "file",
          path: "",
          query: "",
          fragment: "",
          toString: () => "",
        }),
      }),
      joinPath: () => ({
        fsPath: "",
        scheme: "file",
        path: "",
        query: "",
        fragment: "",
        with: () => ({
          fsPath: "",
          scheme: "file",
          path: "",
          query: "",
          fragment: "",
          toString: () => "",
        }),
      }),
      repoUri: () => "",
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { One: 1, Two: 2, Three: 3, Active: -1, Beside: -2 },
    TextEditorRevealType: {
      InCenter: 1,
      InCenterIfOutsideViewport: 2,
      AtTop: 3,
    },
  };
}

// Minimal VS Code API mock for webview tests on window
declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage: (message: unknown) => void;
      getState: <S = T>() => S | undefined;
      setState: (state: T) => void;
    };
  }
}

// Provide a default implementation if not already defined
if (typeof window !== "undefined" && !window.acquireVsCodeApi) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultApi = <T = unknown>(): any => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  });

  window.acquireVsCodeApi = defaultApi;
}

// jsdom polyfills for webview React components

// 1) ResizeObserver used internally by cmdk
if (
  typeof window !== "undefined" &&
  typeof (window as any).ResizeObserver === "undefined"
) {
  class ResizeObserver {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    observe(_target: any) {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unobserve(_target: any) {}
    disconnect() {}
  }
  (window as any).ResizeObserver = ResizeObserver;
}

// 2) scrollIntoView used by cmdk to keep active item visible
if (typeof window !== "undefined") {
  const protoTargets = [
    Element.prototype as any,
    (window as any).HTMLElement?.prototype,
  ].filter(Boolean);

  for (const proto of protoTargets) {
    if (typeof proto.scrollIntoView !== "function") {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      proto.scrollIntoView = () => {};
    }
  }
}
