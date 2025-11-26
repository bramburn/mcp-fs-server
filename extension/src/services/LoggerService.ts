import "reflect-metadata";
import { inject, injectable } from "tsyringe";
import * as vscode from "vscode";
import {
  OUTPUT_CHANNEL_TOKEN,
  TRACE_ENABLED_TOKEN,
} from "./ServiceTokens.js";

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

@injectable()
export class LoggerService implements ILogger {
    private readonly traceEnabled: boolean;

    constructor(
        @inject(OUTPUT_CHANNEL_TOKEN)
        private readonly outputChannel: vscode.OutputChannel,
        @inject(TRACE_ENABLED_TOKEN) traceEnabled: boolean
    ) {
        this.traceEnabled = traceEnabled;

        // Log initialization
        const initMsg = `[${new Date().toISOString()}] [INFO] LoggerService initialized with traceEnabled=${traceEnabled}`;
        this.outputChannel.appendLine(initMsg);
    }

    log(message: string, level: LogLevel = "INFO"): void {
        // Always log ERRORS and FATAL regardless of trace setting
        const shouldLog =
            this.traceEnabled ||
            level === "ERROR" ||
            level === "FATAL" ||
            level === "WARN";

        if (shouldLog) {
            const timestamp = new Date().toISOString();
            const logLine = `[${timestamp}] [${level}] ${message}`;

            // Append to output channel (primary destination)
            this.outputChannel.appendLine(logLine);

            // Also console for critical errors
            if (level === "ERROR" || level === "FATAL") {
                console.error(logLine);
            }
        }
    }
}