import { PostHog } from 'posthog-node';
import { randomUUID } from 'node:crypto';

let analyticsInstance: AnalyticsService | null = null;

export class AnalyticsService {
    private client: PostHog | null = null;
    private readonly serverId: string;
    private readonly version = '1.0.4';

    constructor() {
        this.serverId = this.getServerId();
        this.initialize();
    }

    private getServerId(): string {
        // Try to get a persistent server ID from environment or generate one
        if (process.env.MCP_SERVER_ID) {
            return process.env.MCP_SERVER_ID;
        }

        // Generate a persistent UUID for this server instance
        // In a real deployment, you might want to store this somewhere persistent
        return randomUUID();
    }

    private initialize(): void {
        try {
            // Check if telemetry is disabled
            if (process.env.MCP_TELEMETRY_DISABLED === 'true') {
                console.log('MCP telemetry is disabled');
                return;
            }

            this.client = new PostHog('phc_9ElKTCcUhLSXx1XAsz7whwrbFl6rGTiHkURpDufy8dg', {
                host: 'https://us.i.posthog.com',
                flushAt: 1, // Send events immediately
                flushInterval: 1000 // Flush every second
            });

            // Identify the server
            this.client?.identify({
                distinctId: this.serverId,
                properties: {
                    serverVersion: this.version,
                    nodeVersion: process.version,
                    platform: process.platform,
                    environment: process.env.NODE_ENV || 'development'
                }
            });

            // Track server start
            this.trackEvent('mcp_server_started');
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
                distinctId: this.serverId,
                event: eventName,
                properties: {
                    ...properties,
                    serverVersion: this.version,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.warn('Failed to track analytics event:', error);
        }
    }

    trackToolUse(toolName: string, duration?: number, success: boolean = true, error?: string): void {
        this.trackEvent('mcp_tool_used', {
            toolName,
            duration,
            success,
            error: error ? true : false,
            errorMessage: error
        });
    }

    trackFileIndexed(filePath: string, indexingDuration: number): void {
        this.trackEvent('file_indexed', {
            fileType: this.getFileType(filePath),
            indexingDuration,
            filePath: this.sanitizePath(filePath)
        });
    }

    trackSearchPerformed(query: string, resultsCount: number, duration: number): void {
        this.trackEvent('mcp_search_performed', {
            queryLength: query.length,
            resultsCount,
            duration,
            hasResults: resultsCount > 0
        });
    }

    trackConnection(service: 'qdrant' | 'ollama', success: boolean, duration: number, error?: string): void {
        this.trackEvent('mcp_connection_attempt', {
            service,
            success,
            duration,
            error: error ? true : false,
            errorMessage: error
        });
    }

    trackError(error: string, context?: string): void {
        this.trackEvent('mcp_error', {
            errorType: error,
            context
        });
    }

    private getFileType(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (!ext) return 'unknown';

        const typeMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescript-react',
            'js': 'javascript',
            'jsx': 'javascript-react',
            'py': 'python',
            'java': 'java',
            'rs': 'rust',
            'go': 'go',
            'kt': 'kotlin',
            'json': 'json',
            'md': 'markdown',
            'yml': 'yaml',
            'yaml': 'yaml'
        };

        return typeMap[ext] || ext;
    }

    private sanitizePath(filePath: string): string {
        // Remove sensitive information from file paths
        return filePath
            .replace(/\/Users\/[^\/]+/g, '/Users/[user]')
            .replace(/\/home\/[^\/]+/g, '/home/[user]')
            .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[user]');
    }

    async dispose(): Promise<void> {
        if (this.client) {
            try {
                // Track server shutdown
                this.trackEvent('mcp_server_stopped');

                // Flush any remaining events before shutting down
                await this.client.shutdown();
            } catch (error) {
                console.warn('Failed to shutdown analytics client:', error);
            }
            this.client = null;
        }
    }
}

export function getAnalyticsService(): AnalyticsService {
    if (!analyticsInstance) {
        analyticsInstance = new AnalyticsService();
    }
    return analyticsInstance;
}

// Graceful shutdown
process.on('SIGINT', async () => {
    if (analyticsInstance) {
        await analyticsInstance.dispose();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (analyticsInstance) {
        await analyticsInstance.dispose();
    }
    process.exit(0);
});