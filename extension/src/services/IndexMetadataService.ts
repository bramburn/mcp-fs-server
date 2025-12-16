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

// Type definition for SQL.js database
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsStatement {
  bind(params: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

export interface RepoIndexState {
  repoId: string;
  lastHash: string;
  lastIndexed: number;
  gitignoreHash?: string;
}

/**
 * Service for managing repository index metadata using SQLite WASM.
 * Provides persistent storage for tracking repository indexing state.
 */
export class IndexMetadataService {
  private db: SqlJsDatabase | null = null;
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
      let isNewDatabase = false;
      try {
        const uint8array = new Uint8Array(await vscode.workspace.fs.readFile(this.dbUri));
        this.db = new SQL.Database(uint8array) as unknown as SqlJsDatabase;
      } catch {
        // Database doesn't exist, create new one
        this.db = new SQL.Database() as unknown as SqlJsDatabase;
        isNewDatabase = true;
      }

      // Always run createTables to handle migrations
      this.createTables(isNewDatabase);

      this.isInitialized = true;
      console.log('[IndexMetadataService] Initialized successfully');
    } catch (error) {
      console.error('[IndexMetadataService] Failed to initialize:', error);
      throw error;
    }
  }

  private createTables(isNewDatabase: boolean = false): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Always create the table if it doesn't exist
    this.db.run(`
      CREATE TABLE IF NOT EXISTS repo_index (
        repoid TEXT PRIMARY KEY,
        last_hash TEXT NOT NULL,
        last_indexed INTEGER NOT NULL,
        gitignore_hash TEXT
      )
    `);

    // For existing databases, check and add missing columns
    if (!isNewDatabase) {
      // Check if gitignore_hash column exists and add it if it doesn't
      try {
        this.db.run(`SELECT gitignore_hash FROM repo_index LIMIT 1`);
        console.log('[IndexMetadataService] gitignore_hash column already exists');
      } catch {
        // Column doesn't exist, add it
        console.log('[IndexMetadataService] Adding gitignore_hash column to existing database');
        this.db.run(`ALTER TABLE repo_index ADD COLUMN gitignore_hash TEXT`);
      }
    }
  }

  /**
   * Update the index metadata for a repository
   */
  async update(repoId: string, hash: string, gitignoreHash?: string): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.db.run(
        'INSERT OR REPLACE INTO repo_index (repoid, last_hash, last_indexed, gitignore_hash) VALUES (?, ?, ?, ?)',
        [repoId, hash, Date.now(), gitignoreHash || null]
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
    if (!this.isInitialized || !this.db) {
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
          repoId: row.repoid as string,
          lastHash: row.last_hash as string,
          lastIndexed: row.last_indexed as number,
          gitignoreHash: (row.gitignore_hash as string) || undefined
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
    if (!this.isInitialized || !this.db) {
      console.warn('[IndexMetadataService] Service not initialized');
      return [];
    }

    try {
      const results: RepoIndexState[] = [];
      const stmt = this.db.prepare('SELECT * FROM repo_index ORDER BY last_indexed DESC');

      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          repoId: row.repoid as string,
          lastHash: row.last_hash as string,
          lastIndexed: row.last_indexed as number,
          gitignoreHash: (row.gitignore_hash as string) || undefined
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

    if (!this.db) {
      throw new Error('Database not initialized');
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
      this.db = null;
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