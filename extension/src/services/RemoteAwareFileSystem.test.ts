import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create proper mock Uri objects
const createMockUri = (init: {
  fsPath: string;
  scheme?: string;
  authority?: string;
  path?: string;
  query?: string;
  fragment?: string;
}) => {
  const scheme = init.scheme ?? "file";
  const authority = init.authority ?? "";
  const path = init.path ?? init.fsPath;
  const query = init.query ?? "";
  const fragment = init.fragment ?? "";

  return {
    fsPath: init.fsPath,
    scheme,
    authority,
    path,
    query,
    fragment,
    with: vi.fn(),
    toJSON: () => ({
      scheme,
      authority,
      path,
      query,
      fragment,
      fsPath: init.fsPath,
    }),
    toString: () => init.fsPath,
  };
};

// Mock the VS Code API before importing - use inline definition to avoid hoisting issues
vi.mock("vscode", () => ({
  env: {
    get remoteName() {
      return undefined;
    },
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
      stat: vi.fn(),
    },
    get workspaceFolders() {
      return [];
    },
  },
  window: {
    get activeTextEditor() {
      return undefined;
    },
  },
  Uri: {
    file: vi.fn((path: string) => createMockUri({ fsPath: path })),
    from: vi.fn(
      (opts: { scheme?: string; authority?: string; path?: string }) =>
        createMockUri({
          fsPath: opts.path || "",
          scheme: opts.scheme,
          authority: opts.authority,
          path: opts.path,
        })
    ),
    parse: vi.fn(),
  },
}));

import * as vscode from "vscode";
import { RemoteAwareFileSystem } from "./RemoteAwareFileSystem.js";

describe("RemoteAwareFileSystem", () => {
  let fileSystem: RemoteAwareFileSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    fileSystem = new RemoteAwareFileSystem();

    // Default: Mock successful binary read
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      new Uint8Array([1, 2, 3])
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should treat the environment as Local when remoteName is undefined", async () => {
    // Mock local environment
    vi.spyOn(vscode.env, "remoteName", "get").mockReturnValue(undefined);

    const windowsPath = "C:\\Users\\User\\bin\\app.exe";
    const expectedUri = createMockUri({ scheme: "file", fsPath: windowsPath });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(vscode.Uri.file).mockReturnValue(expectedUri as any);

    await fileSystem.readBinaryFile(windowsPath);

    expect(vscode.Uri.file).toHaveBeenCalledWith(windowsPath);
    expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(expectedUri);
  });

  it("should construct a vscode-remote URI when in a Remote environment", async () => {
    // Mock remote environment
    vi.spyOn(vscode.env, "remoteName", "get").mockReturnValue("ssh-remote");

    const mockAuthority = "ssh-remote+mac-host";
    const mockWorkspaceUri = createMockUri({
      fsPath: "/workspace",
      authority: mockAuthority,
    });
    vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { uri: mockWorkspaceUri as any, name: "workspace", index: 0 },
    ]);

    const macPath = "/Users/username/bin/app";
    const expectedUri = createMockUri({
      scheme: "vscode-remote",
      authority: mockAuthority,
      path: macPath,
      fsPath: macPath,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(vscode.Uri.from).mockReturnValue(expectedUri as any);

    await fileSystem.readBinaryFile(macPath);

    expect(vscode.Uri.from).toHaveBeenCalledWith({
      scheme: "vscode-remote",
      authority: mockAuthority,
      path: macPath,
    });
    expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(expectedUri);
  });

  it("should throw error if remote authority cannot be determined", async () => {
    // Mock remote environment with no context
    vi.spyOn(vscode.env, "remoteName", "get").mockReturnValue("ssh-remote");
    vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue([]);
    vi.spyOn(vscode.window, "activeTextEditor", "get").mockReturnValue(
      undefined
    );

    await expect(fileSystem.readBinaryFile("/some/file")).rejects.toThrow(
      "Unable to determine Remote Authority"
    );
  });

  it("should handle fileExists correctly", async () => {
    // Mock file exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({ type: 1 } as any);
    vi.spyOn(vscode.env, "remoteName", "get").mockReturnValue(undefined);

    const exists = await fileSystem.fileExists("/tmp/test.txt");
    expect(exists).toBe(true);
    expect(vscode.workspace.fs.stat).toHaveBeenCalled();
  });

  it("should handle file not existing", async () => {
    // Mock file doesn't exist
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
      new Error("File not found")
    );
    vi.spyOn(vscode.env, "remoteName", "get").mockReturnValue(undefined);

    const exists = await fileSystem.fileExists("/tmp/nonexistent.txt");
    expect(exists).toBe(false);
  });

  it("should handle readTextFile correctly", async () => {
    const textContent = "Hello, World!";
    const binaryData = new TextEncoder().encode(textContent);
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(binaryData);
    vi.spyOn(vscode.env, "remoteName", "get").mockReturnValue(undefined);

    const result = await fileSystem.readTextFile("/tmp/test.txt");
    expect(result).toBe(textContent);
  });

  it("should provide correct environment info for local setup", () => {
    vi.spyOn(vscode.env, "remoteName", "get").mockReturnValue(undefined);
    const mockUri = createMockUri({
      fsPath: "/Users/bramburn/dev/mcp-fs-server",
      authority: "",
    });
    vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { uri: mockUri as any, name: "workspace", index: 0 },
    ]);

    const envInfo = fileSystem.getEnvironmentInfo();
    expect(envInfo).toEqual({
      isRemote: false,
      remoteName: undefined,
      authority: "",
      workspaceFolders: ["/Users/bramburn/dev/mcp-fs-server"],
    });
  });

  it("should provide correct environment info for remote setup", () => {
    vi.spyOn(vscode.env, "remoteName", "get").mockReturnValue("ssh-remote");
    const mockUri = createMockUri({
      fsPath: "/home/user/project",
      authority: "ssh-remote+mac-server",
    });
    vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { uri: mockUri as any, name: "workspace", index: 0 },
    ]);

    const envInfo = fileSystem.getEnvironmentInfo();
    expect(envInfo).toEqual({
      isRemote: true,
      remoteName: "ssh-remote",
      authority: "ssh-remote+mac-server",
      workspaceFolders: ["/home/user/project"],
    });
  });
});
