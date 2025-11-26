import * as vscode from 'vscode';

export type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'COMMAND' | 'SEARCH' | 'OPEN' | 'CONFIG' | 'FATAL';

export interface ILogger {
    log(message: string, level?: LogLevel): void;
}

export class LoggerService implements ILogger {
    private readonly traceEnabled: boolean;
    private readonly outputChannel: vscode.OutputChannel;

    constructor(
        outputChannel: vscode.OutputChannel,
        traceEnabled: boolean
    ) {
        this.outputChannel = outputChannel;
        this.traceEnabled = traceEnabled;
    }

    log(message: string, level: LogLevel = 'INFO'): void {
        if (this.traceEnabled || level === 'ERROR' || level === 'FATAL') {
            this.outputChannel.appendLine(`[${level}] ${message}`);
        }
    }
}