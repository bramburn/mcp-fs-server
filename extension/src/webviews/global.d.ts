/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module '*.svelte' {
  import type { ComponentType } from 'svelte';
  const component: ComponentType;
  export default component;
}
declare interface Window {
  acquireVsCodeApi: () => {
    getState: <T>() => T | undefined;
    setState: (newState: any) => void;
    postMessage: (message: any) => void;
  };
}

// Define a global VSCode object type for consumer use after acquisition
declare const vscode: {
    getState: <T>() => T | undefined;
    setState: (newState: any) => void;
    postMessage: (message: any) => void;
};

