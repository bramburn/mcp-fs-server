import * as vscode from 'vscode';

/**
 * Environment-aware file system reader that handles both local and remote (SSH) contexts.
 * Uses vscode.workspace.fs API to transparently handle remote file operations through SSH tunnels.
 */
export class RemoteAwareFileSystem {

    /**
     * Reads a binary file from the current workspace context (Local or Remote).
     * @param filePath - The absolute path to the file on the target machine.
     * @returns Uint8Array - The binary content of the file.
     */
    public async readBinaryFile(filePath: string): Promise<Uint8Array> {
        const fileUri = this.resolveUri(filePath);

        try {
            // This API works for both Local and Remote-SSH contexts automatically
            // It uses the underlying FileSystemProvider of the Remote-SSH extension
            return await vscode.workspace.fs.readFile(fileUri);
        } catch (error) {
            console.error(`Failed to read file: ${filePath}`, error);
            throw new Error(`Could not read binary file. Ensure you are connected to the remote host. Error: ${error}`);
        }
    }

    /**
     * Reads a text file from the current workspace context (Local or Remote).
     * @param filePath - The absolute path to the file on the target machine.
     * @returns string - The text content of the file.
     */
    public async readTextFile(filePath: string): Promise<string> {
        const fileUri = this.resolveUri(filePath);

        try {
            return await vscode.workspace.fs.readFile(fileUri).then(data => {
                return Buffer.from(data).toString('utf8');
            });
        } catch (error) {
            console.error(`Failed to read file: ${filePath}`, error);
            throw new Error(`Could not read text file. Ensure you are connected to the remote host. Error: ${error}`);
        }
    }

    /**
     * Checks if a file exists at the given path.
     * @param filePath - The absolute path to check.
     * @returns boolean - True if file exists, false otherwise.
     */
    public async fileExists(filePath: string): Promise<boolean> {
        try {
            const fileUri = this.resolveUri(filePath);
            await vscode.workspace.fs.stat(fileUri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Gets file statistics (size, permissions, etc.).
     * @param filePath - The absolute path to the file.
     * @returns vscode.FileStat - File statistics.
     */
    public async getFileStats(filePath: string): Promise<vscode.FileStat> {
        const fileUri = this.resolveUri(filePath);
        return await vscode.workspace.fs.stat(fileUri);
    }

    /**
     * Resolves the correct URI based on whether we are in a Remote-SSH session or Local.
     */
    private resolveUri(filePath: string): vscode.Uri {
        // 1. Check if we are in a Remote Environment (e.g., 'ssh-remote')
        const remoteName = vscode.env.remoteName;

        if (remoteName) {
            // We are remote! We need to construct a 'vscode-remote://' URI.
            // We extract the 'authority' (e.g., 'ssh-remote+mac-server') from the workspace.
            const authority = this.getRemoteAuthority();

            if (!authority) {
                // Fallback: If no workspace is open, we can't easily guess the authority.
                // We might try to infer it from active editor, but throwing is safer here.
                throw new Error("Unable to determine Remote Authority. Please ensure a remote folder is open.");
            }

            // Construct the remote URI: vscode-remote://ssh-remote+<host>/path/to/file
            return vscode.Uri.from({
                scheme: 'vscode-remote',
                authority: authority,
                path: filePath
            });
        }

        // 2. We are Local (Windows side)
        return vscode.Uri.file(filePath);
    }

    /**
     * Helper to get the current Remote Authority (e.g., "ssh-remote+mac-host")
     */
    private getRemoteAuthority(): string | undefined {
        // Strategy A: Check active workspace folder (Most reliable)
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return vscode.workspace.workspaceFolders[0].uri.authority;
        }

        // Strategy B: Check active text editor (If a file is open but no folder)
        if (vscode.window.activeTextEditor) {
            return vscode.window.activeTextEditor.document.uri.authority;
        }

        return undefined;
    }

    /**
     * Gets information about the current environment
     */
    public getEnvironmentInfo(): {
        isRemote: boolean;
        remoteName?: string;
        authority?: string;
        workspaceFolders: string[];
    } {
        const remoteName = vscode.env.remoteName;
        const authority = this.getRemoteAuthority();
        const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];

        return {
            isRemote: !!remoteName,
            remoteName,
            authority,
            workspaceFolders
        };
    }
}