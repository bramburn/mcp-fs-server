import { randomUUID } from "node:crypto";
import { PostHog } from "posthog-node";

let analyticsInstance: AnalyticsService | null = null;
let signalHandlersRegistered = false;

export class AnalyticsService {
  private client: PostHog | null = null;
  private readonly serverId: string;
  private readonly version = "1.0.4";

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
      if (process.env.MCP_TELEMETRY_DISABLED === "true") {
        console.log("MCP telemetry is disabled");
        return;
      }

      this.client = new PostHog(
        "phc_9ElKTCcUhLSXx1XAsz7whwrbFl6rGTiHkURpDufy8dg",
        {
          host: "https://us.i.posthog.com",
          flushAt: 1, // Send events immediately after each capture
          flushInterval: 500, // Flush every 500ms for better responsiveness
          requestTimeout: 5000, // 5 second timeout for requests
          disableGeoip: false, // Allow geolocation for better analytics
          persistence: "memory", // Use memory persistence for server
          capturePageViews: false, // Disable automatic page views
          capturePageLeave: false, // Disable automatic page leave tracking
          loaded: (client) => {
            console.log("[PostHog] Analytics client initialized successfully");
          },
        }
      );

      // Identify the server
      this.client?.identify({
        distinctId: this.serverId,
        properties: {
          serverVersion: this.version,
          nodeVersion: process.version,
          platform: process.platform,
          environment: process.env.NODE_ENV || "development",
        },
      });

      // Track server start
      this.trackEvent("mcp_server_started");
      console.log(
        "[PostHog] Server analytics initialized with ID:",
        this.serverId
      );
    } catch (error) {
      console.warn("Failed to initialize analytics:", error);
    }
  }

  trackEvent(eventName: string, properties?: Record<string, any>): void {
    if (!this.client) {
      console.warn(
        `[PostHog] Client not initialized, cannot track event: ${eventName}`
      );
      return;
    }

    try {
      const eventPayload = {
        distinctId: this.serverId,
        event: eventName,
        properties: {
          ...properties,
          serverVersion: this.version,
          timestamp: new Date().toISOString(),
        },
      };

      this.client.capture(eventPayload);
      console.log(
        `[PostHog] Event tracked: ${eventName}`,
        eventPayload.properties
      );
    } catch (error) {
      console.warn(
        `[PostHog] Failed to track analytics event "${eventName}":`,
        error
      );
    }
  }

  trackToolUse(
    toolName: string,
    duration?: number,
    success: boolean = true,
    error?: string
  ): void {
    this.trackEvent("mcp_tool_used", {
      toolName,
      duration,
      success,
      error: error ? true : false,
      errorMessage: error,
    });
  }

  trackFileIndexed(filePath: string, indexingDuration: number): void {
    this.trackEvent("file_indexed", {
      fileType: this.getFileType(filePath),
      indexingDuration,
      filePath: this.sanitizePath(filePath),
    });
  }

  trackSearchPerformed(
    query: string,
    resultsCount: number,
    duration: number
  ): void {
    this.trackEvent("mcp_search_performed", {
      queryLength: query.length,
      resultsCount,
      duration,
      hasResults: resultsCount > 0,
    });
  }

  trackConnection(
    service: "qdrant" | "ollama",
    success: boolean,
    duration: number,
    error?: string
  ): void {
    this.trackEvent("mcp_connection_attempt", {
      service,
      success,
      duration,
      error: error ? true : false,
      errorMessage: error,
    });
  }

  trackError(error: string, context?: string): void {
    this.trackEvent("mcp_error", {
      errorType: error,
      context,
    });
  }

  private getFileType(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!ext) return "unknown";

    const typeMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript-react",
      js: "javascript",
      jsx: "javascript-react",
      py: "python",
      java: "java",
      rs: "rust",
      go: "go",
      kt: "kotlin",
      json: "json",
      md: "markdown",
      yml: "yaml",
      yaml: "yaml",
    };

    return typeMap[ext] || ext;
  }

  private sanitizePath(filePath: string): string {
    // Remove sensitive information from file paths
    return filePath
      .replace(/\/Users\/[^\/]+/g, "/Users/[user]")
      .replace(/\/home\/[^\/]+/g, "/home/[user]")
      .replace(/C:\\Users\\[^\\]+/g, "C:\\Users\\[user]");
  }

  async dispose(): Promise<void> {
    if (this.client) {
      try {
        console.log("[PostHog] Disposing analytics service...");

        // Track server shutdown
        this.trackEvent("mcp_server_stopped");

        // Give a moment for the event to be queued
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Flush any remaining events before shutting down
        console.log("[PostHog] Flushing pending events...");
        await this.client.shutdown();
        console.log("[PostHog] Analytics client shutdown successfully");
      } catch (error) {
        console.warn("[PostHog] Error during analytics shutdown:", error);
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

// Register signal handlers only once to prevent listener leaks
function registerSignalHandlers() {
  if (signalHandlersRegistered) {
    return;
  }

  process.on("SIGINT", async () => {
    if (analyticsInstance) {
      await analyticsInstance.dispose();
    }
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    if (analyticsInstance) {
      await analyticsInstance.dispose();
    }
    process.exit(0);
  });

  signalHandlersRegistered = true;
}

// Register handlers when module is loaded
registerSignalHandlers();
