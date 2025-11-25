import type { IpcMessage, IpcScope } from '../../protocol';
import { Scope } from '../../protocol';

/**
 * Type definition for the VS Code Webview API.
 */
interface VsCodeApi {
    postMessage(message: IpcMessage): void;
    getState(): any;
    setState(state: any): void;
}

// Global declaration to satisfy TS
declare global {
    function acquireVsCodeApi(): VsCodeApi;
}

class VsCodeWrapper {
    private readonly _vscode: VsCodeApi;

    constructor() {
        if (typeof acquireVsCodeApi === 'function') {
            this._vscode = acquireVsCodeApi();
        } else {
            // Fallback for development outside VS Code (e.g. browser)
            console.warn('VS Code API not found, using mock.');
            this._vscode = {
                postMessage: (msg) => console.log('Mock PostMessage:', msg),
                getState: () => ({}),
                setState: () => {}
            };
        }
    }

    /**
     * Sends a typed IPC message to the Extension Host.
     */
    public postMessage(method: string, params: any = {}, kind: 'command' | 'request' = 'command') {
        const message: IpcMessage = {
            id: crypto.randomUUID(),
            scope: Scope,
            method,
            timestamp: Date.now(),
            // @ts-ignore - structural typing overlap handled by receiver
            kind, 
            params
        };
        this._vscode.postMessage(message);
    }
}

export const vscode = new VsCodeWrapper();