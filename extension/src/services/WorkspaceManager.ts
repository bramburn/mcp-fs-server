import * as vscode from "vscode";
import {
  FallbackGitProvider,
  GitProvider,
  GitRepository,
  VsCodeGitProvider,
} from "../git/GitProvider.js";
import { ConfigService } from "./ConfigService.js";
import { ILogger } from "./LoggerService.js";

/**
 * Workspace change event data
 */
export interface WorkspaceChangeEvent {
  type: "folder_added" | "folder_removed" | "configuration_changed";
  folders: readonly vscode.WorkspaceFolder[];
}

export type WorkspaceChangeListener = (event: WorkspaceChangeEvent) => void;

/**
 * Service responsible for managing workspace context, repository discovery,
 * and coordinating the active configuration with Git integration
 */
export class WorkspaceManager implements vscode.Disposable {
  private readonly _disposable: vscode.Disposable;
  private _repositories: GitRepository[] = [];
  private _gitProvider: GitProvider;
  private _listeners: WorkspaceChangeListener[] = [];

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _configService: ConfigService,
    private readonly _logger: ILogger,
    gitProvider?: GitProvider
  ) {
    // Use dependency injection for Git provider, with fallback
    this._gitProvider = gitProvider || this.createGitProvider();

    // This is where loadConfig is being called. Change it to loadQdrantConfig
    // It's inside checkWorkspaceIntegrity, so I need to find that call.
    // It's also called in the checkWorkspaceIntegrity method, not directly in the constructor.
    // The error came from line 49. Let's find line 49.
    // Line 49 is in checkWorkspaceIntegrity.

    // Initializing logic should be in initialize, but called in constructor for now
    this.initialize();

    // Listen for workspace folder additions/removals
    this._disposable = vscode.workspace.onDidChangeWorkspaceFolders(
      this.handleWorkspaceFoldersChanged,
      this
    );
  }

  private createGitProvider(): GitProvider {
    try {
      // Try to use VS Code Git provider first
      return new VsCodeGitProvider();
    } catch (error) {
      this._logger.log(
        `VS Code Git provider not available, using fallback: ${error}`,
        "WARN"
      );
      return new FallbackGitProvider();
    }
  }

  private async initialize(): Promise<void> {
    // Find repositories immediately upon activation
    await this.findRepositories();
  }

  private handleWorkspaceFoldersChanged(
    e: vscode.WorkspaceFoldersChangeEvent
  ): void {
    const event: WorkspaceChangeEvent = {
      type: e.added.length > 0 ? "folder_added" : "folder_removed",
      folders: vscode.workspace.workspaceFolders || [],
    };

    this._logger.log(
      `Workspace folders changed: Added ${e.added.length}, Removed ${e.removed.length}`
    );

    // Update repositories
    this.findRepositories()
      .then(() => {
        // Notify listeners after repositories are updated
        this.notifyListeners(event);
      })
      .catch((error) => {
        this._logger.log(
          `Error updating repositories after workspace change: ${error}`,
          "ERROR"
        );
      });
  }

  /**
   * Finds all Git repositories in the workspace
   */
  public async findRepositories(): Promise<string[]> {
    try {
      const repos = await this._gitProvider.findRepositories();
      this._repositories = repos;

      const repoPaths = repos.map((repo) => repo.rootPath);
      this._logger.log(`Found ${repoPaths.length} Git repositories`);

      return repoPaths;
    } catch (error) {
      this._logger.log(`Error finding repositories: ${error}`, "ERROR");
      this._repositories = [];
      return [];
    }
  }

  /**
   * Get all discovered repositories
   */
  public getRepositories(): GitRepository[] {
    return [...this._repositories]; // Return copy to prevent external mutation
  }

  /**
   * Get repository for a specific path
   */
  public async getRepository(path: string): Promise<GitRepository | null> {
    try {
      return await this._gitProvider.getRepository(path);
    } catch (error) {
      this._logger.log(
        `Error getting repository for path ${path}: ${error}`,
        "ERROR"
      );
      return null;
    }
  }

  /**
   * Check if a path is within a Git repository
   */
  public async isGitRepository(path: string): Promise<boolean> {
    try {
      return await this._gitProvider.isGitRepository(path);
    } catch (error) {
      this._logger.log(
        `Error checking if path is Git repository ${path}: ${error}`,
        "ERROR"
      );
      return false;
    }
  }

  /**
   * Get the primary workspace folder to use for indexing
   */
  public getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return undefined;

    // Priority: 1. Folder with active text editor, 2. First folder with Git repo, 3. First folder
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document?.uri) {
      const activeFolder = folders.find((folder) =>
        activeEditor.document.uri.fsPath.startsWith(folder.uri.fsPath)
      );
      if (activeFolder) {
        return activeFolder;
      }
    }

    // Look for first folder with a Git repository
    for (const folder of folders) {
      if (
        this._repositories.some(
          (repo) =>
            repo.rootPath.startsWith(folder.uri.fsPath) ||
            folder.uri.fsPath.startsWith(repo.rootPath)
        )
      ) {
        return folder;
      }
    }

    // Fallback to first folder
    return folders[0];
  }

  /**
   * Get repositories for a specific workspace folder
   */
  public getRepositoriesForFolder(
    folder: vscode.WorkspaceFolder
  ): GitRepository[] {
    return this._repositories.filter(
      (repo) =>
        repo.rootPath.startsWith(folder.uri.fsPath) ||
        folder.uri.fsPath.startsWith(repo.rootPath)
    );
  }

  /**
   * Check workspace integrity and report issues
   */
  public async checkWorkspaceIntegrity(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;

    if (!folders || folders.length === 0) {
      console.warn("No workspace folders found");
      return;
    }

    if (folders.length > 1) {
      // Multi-root workspace detected
      console.log("Multi-root workspace detected. Checking configurations...");

      // Count configurations and repositories
      let configCount = 0;
      let repoCount = 0;

      for (const folder of folders) {
        // Check for Qdrant configuration
        const configPath = vscode.Uri.joinPath(
          folder.uri,
          ".qdrant",
          "configuration.json"
        );
        try {
          await vscode.workspace.fs.stat(configPath);
          configCount++;
        } catch {
          // Config doesn't exist for this folder
        }

        // Count repositories in this folder
        const folderRepos = this.getRepositoriesForFolder(folder);
        repoCount += folderRepos.length;
      }

      if (configCount > 1) {
        vscode.window.showWarningMessage(
          "Multiple .qdrant configurations detected. The extension will use the configuration from the active workspace folder.",
          "Open Settings"
        );
      }

      this._logger.log(
        `Multi-root workspace: ${folders.length} folders, ${configCount} configurations, ${repoCount} repositories`
      );
    }
  }

  /**
   * Add a listener for workspace changes
   */
  public addWorkspaceChangeListener(listener: WorkspaceChangeListener): void {
    this._listeners.push(listener);
  }

  /**
   * Remove a workspace change listener
   */
  public removeWorkspaceChangeListener(
    listener: WorkspaceChangeListener
  ): void {
    const index = this._listeners.indexOf(listener);
    if (index > -1) {
      this._listeners.splice(index, 1);
    }
  }

  private notifyListeners(event: WorkspaceChangeEvent): void {
    this._listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        this._logger.log(
          `Error in workspace change listener: ${error}`,
          "ERROR"
        );
      }
    });
  }

  /**
   * Get the Git provider instance
   */
  public get gitProvider(): GitProvider {
    return this._gitProvider;
  }

  /**
   * Refresh repository discovery
   */
  public async refresh(): Promise<void> {
    await this.findRepositories();
    this.notifyListeners({
      type: "configuration_changed",
      folders: vscode.workspace.workspaceFolders || [],
    });
  }

  public dispose(): void {
    this._disposable.dispose();
    this._listeners = [];
    this._repositories = [];
  }
}
