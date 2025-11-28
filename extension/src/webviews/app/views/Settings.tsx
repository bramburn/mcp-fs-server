import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Loader2,
  Save,
  Server,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  LOAD_CONFIG_METHOD,
  SAVE_CONFIG_METHOD,
  START_INDEX_METHOD,
  TEST_CONFIG_METHOD,
  type QdrantOllamaConfig,
  type SaveConfigParams,
} from "../../protocol";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { Switch } from "../components/ui/switch";
import { useIpc } from "../contexts/ipc";
import { useAppStore } from "../store";

// Helper for Collapsible Sections
function AccordionItem({
  title,
  isOpen,
  onToggle,
  status,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  status?: "connected" | "failed" | null;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-md overflow-hidden bg-background">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full p-3 text-left bg-muted/20 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 font-medium text-sm">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {title}
        </div>
        {status && (
          <span
            className={`text-[10px] flex items-center gap-1 ${
              status === "connected" ? "text-green-500" : "text-red-500"
            }`}
          >
            {status === "connected" ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            {status === "connected" ? "Connected" : "Failed"}
          </span>
        )}
      </button>
      {isOpen && <div className="p-4 space-y-4 border-t">{children}</div>}
    </div>
  );
}

// Helper to get default dimension for common models
const getModelDefaults = (provider: string, model: string): number => {
  if (provider === "openai") {
    if (model.includes("text-embedding-3-large")) return 3072;
    if (model.includes("text-embedding-3-small") || model.includes("ada-002"))
      return 1536;
  }
  if (provider === "gemini") {
    // text-embedding-004 defaults to 768
    return 768;
  }
  if (provider === "ollama") {
    if (model.includes("nomic")) return 768;
    if (model.includes("mxbai")) return 1024;
    if (model.includes("llama")) return 4096;
  }
  return 768; // Safe fallback
};

export default function Settings() {
  const ipc = useIpc();
  const config = useAppStore((state) => state.config);
  const setConfig = useAppStore((state) => state.setConfig);
  const indexStatus = useAppStore((state) => state.indexStatus);
  const setView = useAppStore((state) => state.setView);

  // Local form state with all provider defaults
  const [formData, setFormData] = useState<QdrantOllamaConfig>({
    active_vector_db: "qdrant",
    active_embedding_provider: "ollama",
    index_info: { name: "codebase-index", embedding_dimension: 768 },
    qdrant_config: { url: "http://localhost:6333", api_key: "" },
    pinecone_config: { index_name: "", environment: "", api_key: "" },
    ollama_config: {
      base_url: "http://localhost:11434",
      model: "nomic-embed-text",
    },
    openai_config: { api_key: "", model: "text-embedding-3-small" },
    gemini_config: { api_key: "", model: "text-embedding-004" },
  });

  const [loading, setLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  // Update Test Result State to match new protocol
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    qdrantStatus: "connected" | "failed";
    ollamaStatus: "connected" | "failed";
  } | null>(null);

  // Track dirty state to show "Unsaved changes" if needed
  const [isDirty, setIsDirty] = useState(false);

  // New State for Save Location
  const [useGlobalStorage, setUseGlobalStorage] = useState(false);

  // Debug initial form state for tests
  console.log("Settings formData", formData);

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
          // Merge loaded config with defaults to ensure all fields exist
          setFormData((prev) => ({ ...prev, ...cfg }));
          setIsDirty(false);
        }
      })
      .finally(() => setLoading(false));
  }, [ipc, setConfig]);

  useEffect(() => {
    if (!config) refreshConfig();
  }, [config, refreshConfig]);

  // AUTO-POPULATE: Watch for provider/model changes and update dimension
  useEffect(() => {
    const provider = formData.active_embedding_provider;
    let model = "";

    if (provider === "openai") model = formData.openai_config?.model || "";
    else if (provider === "gemini") model = formData.gemini_config?.model || "";
    else if (provider === "ollama") model = formData.ollama_config?.model || "";

    const suggestedDim = getModelDefaults(provider, model);

    // Update only if different to avoid loops
    if (formData.index_info?.embedding_dimension !== suggestedDim) {
      setFormData((prev) => ({
        ...prev,
        index_info: {
          ...prev.index_info,
          name: prev.index_info?.name || "codebase-index",
          embedding_dimension: suggestedDim,
        },
      }));
    }
  }, [
    formData.active_embedding_provider,
    formData.openai_config?.model,
    formData.gemini_config?.model,
    formData.ollama_config?.model,
    formData.index_info?.embedding_dimension,
  ]);

  // Handle Input Changes - Generic handler for all config sections
  const handleInputChange = (
    section: keyof QdrantOllamaConfig,
    field: string,
    value: string
  ) => {
    setFormData((prev: any) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
    setTestResult(null);
    setIsDirty(true);
  };

  // Update Handle Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await ipc.sendRequest<any, any>(
        TEST_CONFIG_METHOD,
        "webview-mgmt",
        { config: formData }
      );
      setTestResult(response);
    } catch (error) {
      setTestResult({
        success: false,
        message: String(error),
        qdrantStatus: "failed",
        ollamaStatus: "failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Save Configuration
  const handleSave = async () => {
    setLoading(true);
    try {
      await ipc.sendRequest<SaveConfigParams, void>(
        SAVE_CONFIG_METHOD,
        "webview-mgmt",
        {
          config: formData,
          useGlobal: useGlobalStorage,
        }
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

          {/* Vector Database Provider Selection */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Vector Database</h3>
            </div>

            <AccordionItem
              title="Qdrant (Local/Cloud)"
              isOpen={formData.active_vector_db === "qdrant"}
              onToggle={() =>
                setFormData((p) => ({ ...p, active_vector_db: "qdrant" }))
              }
              status={
                formData.active_vector_db === "qdrant"
                  ? testResult?.qdrantStatus
                  : undefined
              }
            >
              <div className="grid gap-2">
                <Label>Server URL</Label>
                <Input
                  value={formData.qdrant_config?.url || ""}
                  onChange={(e) =>
                    handleInputChange("qdrant_config", "url", e.target.value)
                  }
                  placeholder="http://localhost:6333"
                />
              </div>
              <div className="grid gap-2">
                <Label>API Key (Optional)</Label>
                <Input
                  type="password"
                  value={formData.qdrant_config?.api_key || ""}
                  onChange={(e) =>
                    handleInputChange(
                      "qdrant_config",
                      "api_key",
                      e.target.value
                    )
                  }
                  placeholder="********"
                />
              </div>
            </AccordionItem>

            <AccordionItem
              title="Pinecone (Cloud)"
              isOpen={formData.active_vector_db === "pinecone"}
              onToggle={() =>
                setFormData((p) => ({ ...p, active_vector_db: "pinecone" }))
              }
              status={
                formData.active_vector_db === "pinecone"
                  ? testResult?.qdrantStatus
                  : undefined
              }
            >
              <div className="grid gap-2">
                <Label>Index Name</Label>
                <Input
                  value={formData.pinecone_config?.index_name || ""}
                  onChange={(e) =>
                    handleInputChange(
                      "pinecone_config",
                      "index_name",
                      e.target.value
                    )
                  }
                  placeholder="my-index"
                />
              </div>
              <div className="grid gap-2">
                <Label>Environment (e.g. gcp-starter)</Label>
                <Input
                  value={formData.pinecone_config?.environment || ""}
                  onChange={(e) =>
                    handleInputChange(
                      "pinecone_config",
                      "environment",
                      e.target.value
                    )
                  }
                  placeholder="gcp-starter"
                />
              </div>
              <div className="grid gap-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={formData.pinecone_config?.api_key || ""}
                  onChange={(e) =>
                    handleInputChange(
                      "pinecone_config",
                      "api_key",
                      e.target.value
                    )
                  }
                  placeholder="********"
                />
              </div>
            </AccordionItem>
          </section>

          <Separator />

          {/* Embedding Provider Selection */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Embedding Provider</h3>
            </div>

            <AccordionItem
              title="Ollama (Local)"
              isOpen={formData.active_embedding_provider === "ollama"}
              onToggle={() =>
                setFormData((p) => ({
                  ...p,
                  active_embedding_provider: "ollama",
                }))
              }
              status={
                formData.active_embedding_provider === "ollama"
                  ? testResult?.ollamaStatus
                  : undefined
              }
            >
              <div className="grid gap-2">
                <Label>Base URL</Label>
                <Input
                  value={formData.ollama_config?.base_url || ""}
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
                <Label>Model</Label>
                <Input
                  value={formData.ollama_config?.model || ""}
                  onChange={(e) =>
                    handleInputChange("ollama_config", "model", e.target.value)
                  }
                  placeholder="nomic-embed-text"
                />
              </div>
            </AccordionItem>

            <AccordionItem
              title="OpenAI (Cloud)"
              isOpen={formData.active_embedding_provider === "openai"}
              onToggle={() =>
                setFormData((p) => ({
                  ...p,
                  active_embedding_provider: "openai",
                }))
              }
              status={
                formData.active_embedding_provider === "openai"
                  ? testResult?.ollamaStatus
                  : undefined
              }
            >
              <div className="grid gap-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={formData.openai_config?.api_key || ""}
                  onChange={(e) =>
                    handleInputChange(
                      "openai_config",
                      "api_key",
                      e.target.value
                    )
                  }
                  placeholder="sk-..."
                />
              </div>
              <div className="grid gap-2">
                <Label>Model</Label>
                <Input
                  value={formData.openai_config?.model || ""}
                  onChange={(e) =>
                    handleInputChange("openai_config", "model", e.target.value)
                  }
                  placeholder="text-embedding-3-small"
                />
              </div>
            </AccordionItem>

            <AccordionItem
              title="Google Gemini (Cloud)"
              isOpen={formData.active_embedding_provider === "gemini"}
              onToggle={() =>
                setFormData((p) => ({
                  ...p,
                  active_embedding_provider: "gemini",
                }))
              }
              status={
                formData.active_embedding_provider === "gemini"
                  ? testResult?.ollamaStatus
                  : undefined
              }
            >
              <div className="grid gap-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={formData.gemini_config?.api_key || ""}
                  onChange={(e) =>
                    handleInputChange(
                      "gemini_config",
                      "api_key",
                      e.target.value
                    )
                  }
                  placeholder="AIza..."
                />
              </div>
              <div className="grid gap-2">
                <Label>Model</Label>
                <Input
                  value={formData.gemini_config?.model || ""}
                  onChange={(e) =>
                    handleInputChange("gemini_config", "model", e.target.value)
                  }
                  placeholder="text-embedding-004"
                />
              </div>
            </AccordionItem>
          </section>

          <Separator />

          {/* Storage Preference Section */}
          <section className="flex items-center justify-between p-3 border rounded-md bg-muted/20">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                {useGlobalStorage ? (
                  <Globe className="w-4 h-4" />
                ) : (
                  <HardDrive className="w-4 h-4" />
                )}
                <h4 className="text-sm font-medium">Configuration Storage</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                {useGlobalStorage
                  ? "Settings saved to User Profile (Shared across workspaces)"
                  : "Settings saved to .qdrant/ in this workspace"}
              </p>
            </div>
            <Switch
              checked={useGlobalStorage}
              onCheckedChange={setUseGlobalStorage}
            />
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
                Save & Create
              </Button>
            </div>

            {testResult && (
              <div className="flex items-center gap-2 text-xs">
                {testResult.success ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

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
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />{" "}
                      Indexing...
                    </>
                  ) : (
                    "Force Re-Index Workspace"
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
