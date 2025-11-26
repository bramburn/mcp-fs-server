# PostHog Configuration Guide

## Overview
PostHog analytics has been properly configured for both the MCP server and VS Code extension. The API key is: `phc_9ElKTCcUhLSXx1XAsz7whwrbFl6rGTiHkURpDufy8dg`

## Key Improvements Made

### 1. **MCP Server (`src/analytics.ts`)**
- ✅ Enhanced PostHog initialization with optimized settings:
  - `flushAt: 1` - Send events immediately after each capture
  - `flushInterval: 500ms` - Flush every 500ms for responsiveness
  - `requestTimeout: 5000ms` - 5 second timeout for requests
  - `persistence: 'memory'` - Memory-based persistence for server
  - Disabled automatic page view tracking (not applicable for server)

- ✅ Improved event tracking with logging:
  - Console logs for each event tracked
  - Better error handling and reporting
  - Detailed shutdown logging

- ✅ Graceful shutdown handling:
  - Proper event flushing before process exit
  - Handles SIGINT and SIGTERM signals
  - 100ms delay to ensure event queuing before flush

### 2. **VS Code Extension (`extension/src/services/AnalyticsService.ts`)**
- ✅ Same PostHog configuration optimizations
- ✅ Respects VS Code telemetry settings
- ✅ Proper disposal on extension deactivation
- ✅ Enhanced logging for debugging

### 3. **Service Container (`extension/src/services/ServiceContainer.ts`)**
- ✅ Improved `disposeContainer()` function:
  - Properly disposes all services before clearing container
  - Disposes in reverse dependency order
  - Ensures AnalyticsService flushes events before shutdown
  - Comprehensive error handling and logging

### 4. **MCP Server Cleanup (`src/index.ts`)**
- ✅ Enhanced cleanup handlers:
  - Calls `analytics.dispose()` before process exit
  - Proper async/await handling
  - Handles all shutdown signals (SIGINT, SIGTERM, uncaught exceptions)

## Testing PostHog Events

### For MCP Server:
```bash
# Start the server with logging
npm start

# You should see logs like:
# [PostHog] Analytics client initialized successfully
# [PostHog] Server analytics initialized with ID: <uuid>
# [PostHog] Event tracked: mcp_server_started
```

### For VS Code Extension:
1. Open VS Code with the extension loaded
2. Check the "Qdrant Code Search" output channel
3. You should see PostHog initialization logs
4. Perform actions (search, index, etc.) and check logs for event tracking

### Verify Events in PostHog Dashboard:
1. Go to https://us.i.posthog.com
2. Log in with your account
3. Navigate to Events
4. Filter by your distinct ID (server UUID or machine ID)
5. You should see events like:
   - `mcp_server_started`
   - `mcp_server_stopped`
   - `mcp_tool_used`
   - `mcp_search_performed`
   - `extension_activated`
   - `search_performed`
   - etc.

## Event Types Tracked

### Server Events:
- `mcp_server_started` - Server initialization
- `mcp_server_stopped` - Server shutdown
- `mcp_tool_used` - Tool execution with duration
- `mcp_search_performed` - Search queries
- `file_indexed` - File indexing events
- `mcp_connection_attempt` - Qdrant/Ollama connections
- `mcp_error` - Error tracking

### Extension Events:
- `extension_activated` - Extension startup
- `page_view` - View navigation
- `command_executed` - Command execution
- `search_performed` - Search queries
- `indexing_completed` - Indexing completion
- `connection_success/failed` - Connection status
- `error_occurred` - Error tracking

## Troubleshooting

### Events Not Appearing:
1. Check console logs for `[PostHog]` messages
2. Verify API key is correct: `phc_9ElKTCcUhLSXx1XAsz7whwrbFl6rGTiHkURpDufy8dg`
3. Ensure telemetry is enabled in VS Code settings
4. Check network connectivity to `https://us.i.posthog.com`
5. Verify `MCP_TELEMETRY_DISABLED` is not set to 'true'

### Disable Telemetry:
- **Server**: Set `MCP_TELEMETRY_DISABLED=true` environment variable
- **Extension**: Disable in VS Code telemetry settings

## Configuration Environment Variables

```bash
# Server telemetry
MCP_TELEMETRY_DISABLED=false  # Set to 'true' to disable

# PostHog is configured with:
# - Host: https://us.i.posthog.com
# - API Key: phc_9ElKTCcUhLSXx1XAsz7whwrbFl6rGTiHkURpDufy8dg
```

