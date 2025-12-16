import * as vscode from 'vscode';

// Use dynamic import for sql.js as it's a CommonJS module
const loadSqlJs = async () => {
  try {
    // Try to import sql.js
    const sqlJsModule = await import('sql.js');
    return sqlJsModule.default;
  } catch (error) {
    console.error('Failed to load sql.js:', error);
    throw error;
  }
};

export interface RepoIndexState {
  repoId: string;
  lastHash: string;
  lastIndexed: number;
}

/**
 * Service for managing repository index metadata using SQLite WASM.
 * Provides persistent storage for tracking repository indexing state.
 */
export class IndexMetadataService {
  private db: any;
  private dbUri: vscode.Uri;
  private isInitialized = false;

  constructor(private context: vscode.ExtensionContext) {
    this.dbUri = vscode.Uri.joinPath(context.globalStorageUri, 'repo_index.db');
  }

  async init(): Promise<void> {
    try {
      // Ensure global storage directory exists
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);

      // Initialize sql.js with local WASM file
      const locateFile = (file: string): string => {
        return vscode.Uri.joinPath(this.context.extensionUri, 'resources', file).toString(true);
      };

      const initSqlJs = await loadSqlJs();
      const SQL = await initSqlJs({ locateFile });

      // Try to load existing database or create new one
      try {
        const uint8array = new Uint8Array(await vscode.workspace.fs.readFile(this.dbUri));
        this.db = new SQL.Database(uint8array);
      } catch {
        // Database doesn't exist, create new one
        this.db = new SQL.Database();
        this.createTables();
      }

      this.isInitialized = true;
      console.log('[IndexMetadataService] Initialized successfully');
    } catch (error) {
      console.error('[IndexMetadataService] Failed to initialize:', error);
      throw error;
    }
  }

  private createTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS repo_index (
        repoid TEXT PRIMARY KEY,
        last_hash TEXT NOT NULL,
        last_indexed INTEGER NOT NULL
      )
    `);
  }

  /**
   * Update the index metadata for a repository
   */
  async update(repoId: string, hash: string): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      this.db.run(
        'INSERT OR REPLACE INTO repo_index (repoid, last_hash, last_indexed) VALUES (?, ?, ?)',
        [repoId, hash, Date.now()]
      );

      // Persist changes to disk
      const data = this.db.export();
      await vscode.workspace.fs.writeFile(this.dbUri, data);

      console.log(`[IndexMetadataService] Updated metadata for repo ${repoId}`);
    } catch (error) {
      console.error('[IndexMetadataService] Failed to update metadata:', error);
      throw error;
    }
  }

  /**
   * Get index metadata for a repository
   */
  get(repoId: string): RepoIndexState | null {
    if (!this.isInitialized) {
      console.warn('[IndexMetadataService] Service not initialized');
      return null;
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM repo_index WHERE repoid = ?');
      stmt.bind([repoId]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();

        return {
          repoId: row.repoid,
          lastHash: row.last_hash,
          lastIndexed: row.last_indexed
        };
      }

      stmt.free();
      return null;
    } catch (error) {
      console.error('[IndexMetadataService] Failed to get metadata:', error);
      return null;
    }
  }

  /**
   * Get all repositories with their index metadata
   */
  getAll(): RepoIndexState[] {
    if (!this.isInitialized) {
      console.warn('[IndexMetadataService] Service not initialized');
      return [];
    }

    try {
      const results: RepoIndexState[] = [];
      const stmt = this.db.prepare('SELECT * FROM repo_index ORDER BY last_indexed DESC');

      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          repoId: row.repoid,
          lastHash: row.last_hash,
          lastIndexed: row.last_indexed
        });
      }

      stmt.free();
      return results;
    } catch (error) {
      console.error('[IndexMetadataService] Failed to get all metadata:', error);
      return [];
    }
  }

  /**
   * Remove metadata for a repository
   */
  async remove(repoId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      this.db.run('DELETE FROM repo_index WHERE repoid = ?', [repoId]);

      // Persist changes to disk
      const data = this.db.export();
      await vscode.workspace.fs.writeFile(this.dbUri, data);

      console.log(`[IndexMetadataService] Removed metadata for repo ${repoId}`);
    } catch (error) {
      console.error('[IndexMetadataService] Failed to remove metadata:', error);
      throw error;
    }
  }

  /**
   * Close the database and persist final changes
   */
  async close(): Promise<void> {
    if (!this.isInitialized || !this.db) {
      return;
    }

    try {
      const data = this.db.export();
      await vscode.workspace.fs.writeFile(this.dbUri, data);

      this.db.close();
      this.isInitialized = false;

      console.log('[IndexMetadataService] Database closed');
    } catch (error) {
      console.error('[IndexMetadataService] Failed to close database:', error);
    }
  }

  /**
   * Check if service is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}