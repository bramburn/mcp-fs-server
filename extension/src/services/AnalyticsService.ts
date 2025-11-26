import * as vscode from 'vscode';
import { PostHog } from 'posthog-node';

export class AnalyticsService {
    private client: PostHog | null = null;
    private readonly extensionId = 'qdrant-codesearch';
    private readonly extensionVersion = '0.0.1';

    constructor(private context: vscode.ExtensionContext) {
        this.initialize();
    }

    private initialize(): void {
        try {
            // Check if telemetry is enabled in VS Code settings
            const telemetryConfig = vscode.workspace.getConfiguration('telemetry');
            const telemetryEnabled = telemetryConfig.get<boolean>('enableTelemetry', true);

            if (!telemetryEnabled) {
                console.log('Telemetry is disabled in VS Code settings');
                return;
            }

            this.client = new PostHog('phc_9ElKTCcUhLSXx1XAsz7whwrbFl6rGTiHkURpDufy8dg', {
                host: 'https://us.i.posthog.com',
                flushAt: 1, // Send events immediately
                flushInterval: 1000 // Flush every second
            });

            // Identify the user (anonymized)
            const machineId = vscode.env.machineId;
            this.client?.identify({
                distinctId: machineId,
                properties: {
                    extensionVersion: this.extensionVersion,
                    vscodeVersion: vscode.version,
                    platform: process.platform
                }
            });

            // Track extension activation
            this.trackEvent('extension_activated');
        } catch (error) {
            console.warn('Failed to initialize analytics:', error);
        }
    }

    trackEvent(eventName: string, properties?: Record<string, any>): void {
        if (!this.client) {
            return;
        }

        try {
            this.client.capture({
                distinctId: vscode.env.machineId,
                event: eventName,
                properties: {
                    ...properties,
                    extensionVersion: this.extensionVersion,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.warn('Failed to track analytics event:', error);
        }
    }

    trackPageView(viewName: string): void {
        this.trackEvent('page_view', { view: viewName });
    }

    trackCommand(commandName: string, properties?: Record<string, any>): void {
        this.trackEvent('command_executed', {
            command: commandName,
            ...properties
        });
    }

    trackIndexing(properties?: { duration?: number; fileCount?: number; success?: boolean }): void {
        this.trackEvent('indexing_completed', properties);
    }

    trackSearch(properties?: { queryLength?: number; resultsCount?: number }): void {
        this.trackEvent('search_performed', properties);
    }

    trackError(error: string, context?: string): void {
        this.trackEvent('error_occurred', {
            errorType: error,
            context: context
        });
    }

    async dispose(): Promise<void> {
        if (this.client) {
            try {
                // Flush any remaining events before shutting down
                await this.client.shutdown();
            } catch (error) {
                console.warn('Failed to shutdown analytics client:', error);
            }
            this.client = null;
        }
    }
}