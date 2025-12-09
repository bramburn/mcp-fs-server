import { IndexHandler } from "./IndexHandler.js";
import { IndexingService } from "../../services/IndexingService.js";
import { WorkspaceManager } from "../../services/WorkspaceManager.js";
import { IpcContext } from "../ipc/IpcRouter.js";
import { INDEX_STATUS_METHOD } from "../protocol.js";
import { describe, it, expect, beforeEach, vi, Mock } from "vitest";

// Mock dependencies
const mockIndexingService = {
  initializeForSearch: vi.fn(),
  getRepoId: vi.fn().mockResolvedValue("mock-repo-id"),
  getRepoIndexState: vi.fn(),
  isIndexing: false
} as unknown as IndexingService;

const mockWorkspaceManager = {
  getActiveWorkspaceFolder: vi.fn().mockReturnValue({ uri: { fsPath: "/mock/path" } }),
  gitProvider: {
    getLastCommit: vi.fn().mockResolvedValue("mock-commit")
  }
} as unknown as WorkspaceManager;

const mockPostMessage = vi.fn();
const mockContext = {
  postMessage: mockPostMessage
} as unknown as IpcContext;

describe("IndexHandler", () => {
  let handler: IndexHandler;

  beforeEach(() => {
    handler = new IndexHandler(mockIndexingService, mockWorkspaceManager);
    vi.clearAllMocks();
  });

  it("should send 'notIndexed' status when no stored state exists", async () => {
    (mockIndexingService.getRepoIndexState as Mock).mockReturnValue(undefined);

    await handler.handleCommand(
      { kind: "command", method: INDEX_STATUS_METHOD, id: "1", scope: "qdrantIndex", timestamp: Date.now(), params: {} },
      mockContext
    );

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({
        status: "notIndexed"
      })
    }));
  });

  it("should send 'notIndexed' status when stored state exists but vectorCount is 0", async () => {
    (mockIndexingService.getRepoIndexState as Mock).mockReturnValue({
        vectorCount: 0,
        lastIndexedCommit: "old-commit"
    });

    await handler.handleCommand(
      { kind: "command", method: INDEX_STATUS_METHOD, id: "1", scope: "qdrantIndex", timestamp: Date.now(), params: {} },
      mockContext
    );

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({
        status: "notIndexed"
      })
    }));
  });

  it("should send 'ready' status when stored state exists and commits match", async () => {
    (mockIndexingService.getRepoIndexState as Mock).mockReturnValue({
        vectorCount: 100,
        lastIndexedCommit: "mock-commit"
    });

    await handler.handleCommand(
      { kind: "command", method: INDEX_STATUS_METHOD, id: "1", scope: "qdrantIndex", timestamp: Date.now(), params: {} },
      mockContext
    );

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({
        status: "ready"
      })
    }));
  });
});
