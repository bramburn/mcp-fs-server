import * as vscode from "vscode";
import { AnalyticsService } from "../services/AnalyticsService.js";
import { ClipboardService } from "../services/ClipboardService.js";
import { ConfigService } from "../services/ConfigService.js";
import { IndexingService } from "../services/IndexingService.js";
import { LoggerService } from "../services/LoggerService.js";
import { WorkspaceManager } from "../services/WorkspaceManager.js";

export class Container implements vscode.Disposable {
  static instance: Container | undefined;

  static create(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    traceEnabled: boolean
  ): Container {
    if (Container.instance) {
      Container.instance.dispose();
    }
    Container.instance = new Container(context, outputChannel, traceEnabled);
    return Container.instance;
  }

  readonly disposables: vscode.Disposable[] = [];

  readonly logger: LoggerService;
  readonly configService: ConfigService;
  readonly analyticsService: AnalyticsService;
  readonly workspaceManager: WorkspaceManager;
  readonly indexingService: IndexingService;
  readonly statusBarItem: vscode.StatusBarItem;
  readonly clipboardService: ClipboardService;

  private readonly _readyPromise: Promise<void>;

  private constructor(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    traceEnabled: boolean
  ) {
    this.logger = new LoggerService(outputChannel, traceEnabled);
    this.configService = new ConfigService(this.logger);
    this.analyticsService = new AnalyticsService(context);
    this.workspaceManager = new WorkspaceManager(
      context,
      this.configService,
      this.logger
    );
    this.indexingService = new IndexingService(
      this.configService,
      context,
      this.analyticsService,
      this.logger
    );
    this.clipboardService = new ClipboardService(context, outputChannel);

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.text = "$(database) Qdrant: Initializing...";
    this.statusBarItem.command = "qdrant.openSettings";
    this.disposables.push(this.statusBarItem);

    this._readyPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await Promise.all([
        this.workspaceManager.initialize(),
        (async () => {
          const folder = this.workspaceManager.getActiveWorkspaceFolder();
          if (folder) {
            await this.configService.loadQdrantConfig(folder);
          }
        })(),
        this.indexingService.initializeSplitter(),
      ]);

      this.registerListeners();
      // Start clipboard monitoring once container initialized
      try {
        this.clipboardService.start();
      } catch (err) {
        this.logger.log(`Failed to start ClipboardService: ${err}`, "ERROR");
      }
      this.statusBarItem.text = "$(database) Qdrant: Ready";
      this.statusBarItem.show();
    } catch (err) {
      this.logger.log(`Container initialization failed: ${err}`, "ERROR");
      this.statusBarItem.text = "$(error) Qdrant: Error";
      this.statusBarItem.show();
    }
  }

  private registerListeners(): void {
    this.indexingService.addProgressListener((progress) => {
      if (progress.status === "indexing") {
        this.statusBarItem.text = `$(sync~spin) Indexing ${progress.current}/${progress.total}`;
      } else if (
        progress.status === "completed" ||
        (progress as any).status === "ready"
      ) {
        this.statusBarItem.text = "$(database) Qdrant: Ready";
      } else if (progress.status === "error") {
        this.statusBarItem.text = "$(error) Qdrant: Error";
      }
    });

    this.configService.addConfigurationChangeListener((e) => {
      this.logger.log(`Configuration changed: ${e.section}`, "CONFIG");
    });
  }

  get ready(): Promise<void> {
    return this._readyPromise;
  }

  dispose(): void {
    this.disposables.reverse().forEach((d) => d.dispose());
    // Dispose clipboard service first
    try {
      this.clipboardService.dispose();
    } catch (err) {
      this.logger.log(`Error disposing ClipboardService: ${err}`, "ERROR");
    }
    this.indexingService.dispose();
    this.workspaceManager.dispose();
    this.configService.dispose();
    void this.analyticsService.dispose();
  }
}
