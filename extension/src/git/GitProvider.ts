import * as vscode from 'vscode';

/**
 * Git repository information
 */
export interface GitRepository {
    rootPath: string;
    branch: string;
    remote?: string | null;
    isDirty: boolean;
    lastCommit?: string | null;
}

/**
 * Git provider interface for dependency injection
 */
export interface GitProvider {
    /**
     * Find all Git repositories in the workspace
     */
    findRepositories(): Promise<GitRepository[]>;

    /**
     * Get repository information for a specific path
     */
    getRepository(path: string): Promise<GitRepository | null>;

    /**
     * Check if a path is within a Git repository
     */
    isGitRepository(path: string): Promise<boolean>;

    /**
     * Get the current branch for a repository
     */
    getCurrentBranch(repositoryPath: string): Promise<string>;

    /**
     * Get the remote URL for a repository
     */
    getRemoteUrl(repositoryPath: string): Promise<string | null>;

    /**
     * Check if repository has uncommitted changes
     */
    isDirty(repositoryPath: string): Promise<boolean>;

    /**
     * Get the last commit hash
     */
    getLastCommit(repositoryPath: string): Promise<string | null>;
}

/**
 * Default Git provider implementation using VS Code's Git API
 */
export class VsCodeGitProvider implements GitProvider {
    private readonly gitApi: any;

    constructor() {
        // Try to get the built-in Git API
        try {
            const extension = vscode.extensions.getExtension('vscode.git');
            if (extension && extension.isActive) {
                this.gitApi = extension.exports.getAPI(1);
            }
        } catch (error) {
            console.warn('Git extension not available:', error);
        }
    }

    public async findRepositories(): Promise<GitRepository[]> {
        if (!this.gitApi) {
            return [];
        }

        const repositories: GitRepository[] = [];
        
        for (const repo of this.gitApi.repositories) {
            try {
                const repoInfo = await this.getRepositoryInfo(repo);
                if (repoInfo) {
                    repositories.push(repoInfo);
                }
            } catch (error) {
                console.error('Error processing repository:', error);
            }
        }

        return repositories;
    }

    public async getRepository(path: string): Promise<GitRepository | null> {
        if (!this.gitApi) {
            return null;
        }

        for (const repo of this.gitApi.repositories) {
            if (repo.rootUri?.fsPath === path || path.startsWith(repo.rootUri?.fsPath)) {
                return this.getRepositoryInfo(repo);
            }
        }

        return null;
    }

    public async isGitRepository(path: string): Promise<boolean> {
        const repo = await this.getRepository(path);
        return repo !== null;
    }

    public async getCurrentBranch(repositoryPath: string): Promise<string> {
        if (!this.gitApi) {
            return 'main';
        }

        const repo = this.findRepoByPath(repositoryPath);
        if (!repo || !repo.state.HEAD) {
            return 'main';
        }

        return repo.state.HEAD.name || repo.state.HEAD.commit || 'main';
    }

    public async getRemoteUrl(repositoryPath: string): Promise<string | null> {
        if (!this.gitApi) {
            return null;
        }

        const repo = this.findRepoByPath(repositoryPath);
        if (!repo) {
            return null;
        }

        try {
            const remotes = await repo.getRemotes();
            if (remotes.length > 0) {
                return remotes[0].fetchUrl || remotes[0].pushUrl || null;
            }
        } catch (error) {
            console.error('Error getting remote URL:', error);
        }

        return null;
    }

    public async isDirty(repositoryPath: string): Promise<boolean> {
        if (!this.gitApi) {
            return false;
        }

        const repo = this.findRepoByPath(repositoryPath);
        if (!repo) {
            return false;
        }

        return repo.state.workingTreeChanges.length > 0 || 
               repo.state.indexChanges.length > 0 ||
               repo.state.mergeChanges.length > 0;
    }

    public async getLastCommit(repositoryPath: string): Promise<string | null> {
        if (!this.gitApi) {
            return null;
        }

        const repo = this.findRepoByPath(repositoryPath);
        if (!repo || !repo.state.HEAD) {
            return null;
        }

        return repo.state.HEAD.commit || null;
    }

    private async getRepositoryInfo(repo: any): Promise<GitRepository | null> {
        try {
            const rootPath = repo.rootUri?.fsPath;
            if (!rootPath) {
                return null;
            }

            const branch = await this.getCurrentBranch(rootPath);
            const remote = await this.getRemoteUrl(rootPath);
            const isDirty = await this.isDirty(rootPath);
            const lastCommit = await this.getLastCommit(rootPath);

            return {
                rootPath,
                branch,
                remote,
                isDirty,
                lastCommit
            };
        } catch (error) {
            console.error('Error getting repository info:', error);
            return null;
        }
    }

    private findRepoByPath(repositoryPath: string): any {
        if (!this.gitApi) {
            return null;
        }

        return this.gitApi.repositories.find((repo: any) => 
            repo.rootUri?.fsPath === repositoryPath || 
            repositoryPath.startsWith(repo.rootUri?.fsPath)
        );
    }
}

/**
 * Fallback Git provider that uses basic file system checks
 */
export class FallbackGitProvider implements GitProvider {
    public async findRepositories(): Promise<GitRepository[]> {
        const repositories: GitRepository[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders || [];

        for (const folder of workspaceFolders) {
            if (await this.isGitRepository(folder.uri.fsPath)) {
                repositories.push({
                    rootPath: folder.uri.fsPath,
                    branch: 'main',
                    isDirty: false
                });
            }
        }

        return repositories;
    }

    public async getRepository(path: string): Promise<GitRepository | null> {
        if (await this.isGitRepository(path)) {
            return {
                rootPath: path,
                branch: 'main',
                isDirty: false
            };
        }
        return null;
    }

    public async isGitRepository(path: string): Promise<boolean> {
        try {
            const gitDir = vscode.Uri.joinPath(vscode.Uri.file(path), '.git');
            await vscode.workspace.fs.stat(gitDir);
            return true;
        } catch {
            return false;
        }
    }

    public async getCurrentBranch(repositoryPath: string): Promise<string> {
        return 'main';
    }

    public async getRemoteUrl(repositoryPath: string): Promise<string | null> {
        return null;
    }

    public async isDirty(repositoryPath: string): Promise<boolean> {
        return false;
    }

    public async getLastCommit(repositoryPath: string): Promise<string | null> {
        return null;
    }
}