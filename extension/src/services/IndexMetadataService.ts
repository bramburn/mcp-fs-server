import * as vscode from 'vscode';
import { LoggerService } from './LoggerService.js';

export class IndexMetadataService {
  private _context: vscode.ExtensionContext;
  private _logger: LoggerService;

  constructor(context: vscode.ExtensionContext, logger: LoggerService) {
    this._context = context;
    this._logger = logger;
  }

  /**
   * Gets the timestamp of when the workspace was last fully indexed.
   * Returns null if it has never been indexed.
   */
  async getLastIndexedTimestamp(): Promise<number | null> {
    const timestamp = this._context.workspaceState.get<number>('lastIndexed');
    return timestamp || null;
  }

  async updateLastIndexedTimestamp(): Promise<void> {
    await this._context.workspaceState.update('lastIndexed', Date.now());
  }

  async getFileHash(path: string): Promise<string | undefined> {
    return this._context.workspaceState.get<string>(`hash:${path}`);
  }

  async updateFileHash(path: string, hash: string): Promise<void> {
    await this._context.workspaceState.update(`hash:${path}`, hash);
  }

  async clearIndex(): Promise<void> {
    // Clear the last indexed timestamp
    await this._context.workspaceState.update('lastIndexed', undefined);

    // Note: We don't verify clear all file hashes here as they are numerous
    // and keys are dynamic. In a real SQLite implementation, we would DROP TABLE or DELETE FROM.
    // For Memento, we rely on overwriting or specific key management.
    this._logger.log('Index metadata cleared');
  }
}