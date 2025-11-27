import { PostHog } from "posthog-node";
import * as vscode from "vscode";

export class AnalyticsService {
  private client: PostHog | null = null;
  private readonly extensionId = "qdrant-codesearch";
  private readonly extensionVersion = "0.0.1";

  constructor(private context: vscode.ExtensionContext) {
    this.initialize();
  }

  private initialize(): void {
    try {
      // Check if telemetry is enabled in VS Code settings
      const telemetryConfig = vscode.workspace.getConfiguration("telemetry");
      const telemetryEnabled = telemetryConfig.get<boolean>(
        "enableTelemetry",
        true
      );

      if (!telemetryEnabled) {
        console.log("[PostHog] Telemetry is disabled in VS Code settings");
        return;
      }

      this.client = new PostHog(
        "phc_9ElKTCcUhLSXx1XAsz7whwrbFl6rGTiHkURpDufy8dg",  // !AI: Future - Hardcoded API key should be loaded from a secure configuration or environment variable, not directly in source.
        {
          host: "https://eu.i.posthog.com",
          flushAt: 1, // Send events immediately after each capture
          flushInterval: 500, // Flush every 500ms for better responsiveness
          requestTimeout: 5000, // 5 second timeout for requests
          disableGeoip: false, // Allow geolocation for better analytics
          persistence: "memory", // Use memory persistence
        }
      );

      // Identify the user (anonymized)
      const machineId = vscode.env.machineId;
      this.client?.identify({
        distinctId: machineId,
        properties: {
          extensionVersion: this.extensionVersion,
          vscodeVersion: vscode.version,
          platform: process.platform,
        },
      });

      // Track extension activation
      this.trackEvent("extension_activated");
      console.log(
        "[PostHog] Extension analytics initialized with machine ID:",
        machineId
      );
    } catch (error) {
      console.warn("[PostHog] Failed to initialize analytics:", error);
    }
  }

  trackEvent(eventName: string, properties?: Record<string, unknown>): void {
    if (!this.client) {
      console.warn(
        `[PostHog] Client not initialized, cannot track event: ${eventName}`
      );
      return;
    }

    try {
      const eventPayload = {
        distinctId: vscode.env.machineId,
        event: eventName,
        properties: {
          ...properties,  // !AI: Type safety - Spreading properties here can unintentionally overwrite 'extensionVersion' if 'properties' contains it.
          extensionVersion: this.extensionVersion,
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

  trackPageView(viewName: string): void {
    this.trackEvent("page_view", { view: viewName });
  }

  trackCommand(commandName: string, properties?: Record<string, unknown>): void {
    this.trackEvent("command_executed", {
      command: commandName,
      ...properties,
    });
  }

  trackIndexing(properties?: {
    duration?: number;
    fileCount?: number;
    success?: boolean;
  }): void {
    this.trackEvent("indexing_completed", properties);
  }

  trackSearch(properties?: {
    queryLength?: number;
    resultsCount?: number;
  }): void {
    this.trackEvent("search_performed", properties);
  }

  trackError(error: string | Error, context?: string): void {  // !AI: Type safety - Function signature should accept 'Error' object, not just 'string', to correctly handle caught exceptions.
    const properties: Record<string, unknown> = {
      errorType: error instanceof Error ? error.name : error,  // !AI: Correctness - Use error name if it's an Error object, otherwise use the string value.
    }; // !AI: Future - Omit 'context' property entirely if it is undefined to maintain cleaner event schema.
    if (context !== undefined) {
      properties.context = context;
    }
    this.trackEvent("error_occurred", properties);
  }

  async dispose(): Promise<void> {
    if (this.client) {
      try {
        console.log("[PostHog] Disposing extension analytics service...");

        // Flush any remaining events before shutting down
        console.log("[PostHog] Flushing pending events...");
        await this.client.shutdown();
        console.log(
          "[PostHog] Extension analytics client shutdown successfully"
        );
      } catch (error) {
        console.warn(
          "[PostHog] Error during extension analytics shutdown:",
          error
        );
      }
      this.client = null;
    }
  }
}
