import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../store";
import { useIpc } from "../contexts/ipc";
import {
  LOAD_CONFIG_METHOD,
  START_INDEX_METHOD,
  SAVE_CONFIG_METHOD,
  TEST_CONFIG_METHOD,
  type QdrantOllamaConfig,
  type TestConfigResponse,
} from "../../protocol";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import {
  ChevronLeft,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Database,
  Server,
  Cpu,
} from "lucide-react";

export default function Settings() {
  const ipc = useIpc();
  const config = useAppStore((state) => state.config);
  const setConfig = useAppStore((state) => state.setConfig);
  const indexStatus = useAppStore((state) => state.indexStatus);
  const setView = useAppStore((state) => state.setView);

  // Local form state
  const [formData, setFormData] = useState<QdrantOllamaConfig>({
    index_info: { name: "codebase-index" },
    qdrant_config: { url: "http://localhost:6333", api_key: "" },
    ollama_config: {
      base_url: "http://localhost:11434",
      model: "nomic-embed-text",
    },
  });

  const [loading, setLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Track dirty state to show "Unsaved changes" if needed
  const [isDirty, setIsDirty] = useState(false);

  // Load initial config
  const refreshConfig = useCallback(() => {
    setLoading(true);
    ipc
      .sendRequest<Record<string, never>, QdrantOllamaConfig | null>(
        LOAD_CONFIG_METHOD,
        "qdrantIndex",
        {}
      )
      .then((cfg) => {
        if (cfg) {
          setConfig(cfg);
          setFormData(cfg);
          setIsDirty(false);
        }
      })
      .finally(() => setLoading(false));
  }, [ipc, setConfig]);

  useEffect(() => {
    if (!config) refreshConfig();
  }, [config, refreshConfig]);

  // Handle Input Changes
  const handleInputChange = (
    section: "qdrant_config" | "ollama_config" | "index_info",
    field: string,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
    setTestResult(null);
    setIsDirty(true);
  };

  // Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await ipc.sendRequest<
        { config: QdrantOllamaConfig },
        TestConfigResponse
      >(TEST_CONFIG_METHOD, "webview-mgmt", { config: formData });
      setTestResult(response);
    } catch (error) {
      setTestResult({ success: false, message: String(error) });
    } finally {
      setIsTesting(false);
    }
  };

  // Save Configuration
  const handleSave = async () => {
    setLoading(true);
    try {
      await ipc.sendRequest<{ config: QdrantOllamaConfig }, void>(
        SAVE_CONFIG_METHOD,
        "webview-mgmt",
        { config: formData }
      );
      setIsDirty(false);
      refreshConfig();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Navigation Header - Minimalist */}
      <div className="flex-none px-4 py-3 border-b bg-background/95 backdrop-blur z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView("search")}
            className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">Settings</span>
        </div>

        {/* Quick Save Action in header if dirty */}
        {isDirty && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={loading}
            className="h-7 px-3 text-xs"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
            ) : (
              "Save"
            )}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-8">
          {/* Index Settings Section */}
          <section className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold tracking-tight">
                  Index Settings
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure the identity of your codebase index.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="indexName">Index Name</Label>
              <Input
                id="indexName"
                value={formData.index_info?.name || ""}
                onChange={(e) =>
                  handleInputChange("index_info", "name", e.target.value)
                }
                placeholder="codebase-index"
                className="max-w-md"
              />
            </div>
          </section>

          <Separator />

          {/* Qdrant Configuration Section */}
          <section className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold tracking-tight">
                  Qdrant Server
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure the connection to your Qdrant vector database instance.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="qdrantUrl">Server URL</Label>
                  {/* Visual feedback for connection test */}
                  {testResult && !testResult.success && (
                    <span className="text-[10px] text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Connection Failed
                    </span>
                  )}
                  {testResult && testResult.success && (
                    <span className="text-[10px] text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Verified
                    </span>
                  )}
                </div>
                <Input
                  id="qdrantUrl"
                  value={formData.qdrant_config.url}
                  onChange={(e) =>
                    handleInputChange("qdrant_config", "url", e.target.value)
                  }
                  placeholder="http://localhost:6333"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="qdrantApiKey">
                  API Key{" "}
                  <span className="text-muted-foreground font-normal">
                    (Optional)
                  </span>
                </Label>
                <Input
                  id="qdrantApiKey"
                  type="password"
                  value={formData.qdrant_config.api_key || ""}
                  onChange={(e) =>
                    handleInputChange("qdrant_config", "api_key", e.target.value)
                  }
                  placeholder="Enter API Key"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Ollama Configuration Section */}
          <section className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold tracking-tight">
                  Ollama Server
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure the connection to your local LLM provider.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="ollamaUrl">Base URL</Label>
                <Input
                  id="ollamaUrl"
                  value={formData.ollama_config.base_url}
                  onChange={(e) =>
                    handleInputChange(
                      "ollama_config",
                      "base_url",
                      e.target.value
                    )
                  }
                  placeholder="http://localhost:11434"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ollamaModel">Embedding Model</Label>
                <Input
                  id="ollamaModel"
                  value={formData.ollama_config.model}
                  onChange={(e) =>
                    handleInputChange("ollama_config", "model", e.target.value)
                  }
                  placeholder="nomic-embed-text"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Actions Footer */}
          <div className="pt-2 pb-10 space-y-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting || loading}
                className="flex-1"
              >
                {isTesting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Server className="mr-2 h-4 w-4" />
                )}
                Test Connection
              </Button>
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Configuration
              </Button>
            </div>

            {/* Maintenance Zone */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 mt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-medium">Re-index Workspace</h4>
                  <p className="text-xs text-muted-foreground">
                    Force a complete re-indexing of the current workspace.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    ipc.sendCommand(START_INDEX_METHOD, "qdrantIndex", {})
                  }
                  disabled={indexStatus === "indexing"}
                >
                  {indexStatus === "indexing" ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Indexing...
                    </>
                  ) : (
                    "Re-Index"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}