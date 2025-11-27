import * as vscode from "vscode";

export type LogLevel =
  | "INFO"
  | "ERROR"
  | "WARN"
  | "COMMAND"
  | "SEARCH"
  | "OPEN"
  | "CONFIG"
  | "FATAL"
  | "WEBVIEW"
  | "IPC";

export interface ILogger {
  log(message: string, level?: LogLevel): void;
}

export class LoggerService implements ILogger {
  private readonly traceEnabled: boolean;

  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    traceEnabled: boolean
  ) {
    this.traceEnabled = traceEnabled;

    const initMsg = `[${new Date().toISOString()}] [INFO] LoggerService initialized with traceEnabled=${traceEnabled}`;
    this.outputChannel.appendLine(initMsg);
  }

  log(message: string, level: LogLevel = "INFO"): void {
    const shouldLog =
      this.traceEnabled ||
      level === "ERROR" ||
      level === "FATAL" ||
      level === "WARN";

    if (shouldLog) {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] [${level}] ${message}`;

      this.outputChannel.appendLine(logLine);

      if (level === "ERROR" || level === "FATAL") {
        console.error(logLine);
      }
    }
  }
}