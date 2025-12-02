import {
  Button,
  Caption1,
  Card,
  Checkbox,
  Divider,
  Dropdown,
  Field,
  Input,
  Label,
  makeStyles,
  Option as FluentOption,
  Radio,
  RadioGroup,
  shorthands,
  Slider,
  Spinner,
  Switch,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  ArrowImportRegular,
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  DatabaseRegular,
  DismissCircleRegular,
  PlayRegular,
  SaveRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import {
  FETCH_PINECONE_INDICES_METHOD,
  FetchPineconeIndicesParams,
  GET_VSCODE_SETTINGS_METHOD,
  LOAD_CONFIG_METHOD,
  PineconeIndex,
  QdrantOllamaConfig,
  START_INDEX_METHOD,
  TEST_CONFIG_METHOD,
  UPDATE_VSCODE_SETTINGS_METHOD,
  type VSCodeSettings,
} from "../../protocol.js";
import { useIpc } from "../contexts/ipc.js";
// import { useAppStore } from "../store.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.padding("12px"),
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke1),
    backgroundColor: tokens.colorNeutralBackground1,
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  content: {
    flexGrow: 1,
    overflowY: "auto",
    ...shorthands.padding("24px"),
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("32px"),
    maxWidth: "800px",
    width: "100%",
    alignSelf: "center",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("16px"),
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("8px"),
    marginBottom: "8px",
  },
  radioGroup: {
    display: "flex",
    flexDirection: "row",
    ...shorthands.gap("24px"),
    marginBottom: "16px",
  },
  configPanel: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("16px"),
    ...shorthands.padding("16px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
  },
  gridTwoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    ...shorthands.gap("16px"),
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("4px"),
    fontSize: "12px",
    marginLeft: "auto",
  },
  maintenanceZone: {
    marginTop: "24px",
    ...shorthands.padding("16px"),
    backgroundColor: tokens.colorNeutralBackgroundAlpha,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "dashed", tokens.colorNeutralStroke1),
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("12px"),
  },
  maintenanceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
});

// Helper to get default dimension for common models
const getModelDefaults = (provider: string, model: string): number => {
  if (provider === "openai") {
    if (model.includes("3-large")) return 3072;
    if (model.includes("3-small") || model.includes("ada-002")) return 1536;
  }
  if (provider === "gemini") return 768;
  if (provider === "ollama") {
    if (model.includes("nomic")) return 768;
    if (model.includes("mxbai")) return 1024;
    if (model.includes("llama")) return 4096;
  }
  return 768;
};

export default function Settings() {
  const styles = useStyles();
  const ipc = useIpc();
  // const setView = useAppStore((state) => state.setView); // Retained but not used for navigation

  // State maps directly to VSCodeSettings interface
  const [settings, setSettings] = useState<VSCodeSettings>({
    activeVectorDb: "qdrant",
    qdrantUrl: "http://localhost:6333",
    qdrantApiKey: "",
    pineconeIndexName: "",
    pineconeHost: "",
    pineconeApiKey: "",
    activeEmbeddingProvider: "ollama",
    ollamaBaseUrl: "http://localhost:11434",
    ollamaModel: "nomic-embed-text",
    openaiApiKey: "",
    openaiModel: "text-embedding-3-small",
    geminiApiKey: "",
    geminiModel: "text-embedding-004",
    indexName: "codebase-index",
    embeddingDimension: 768,
    searchLimit: 10,
    searchThreshold: 0.7,
    includeQueryInCopy: false,
  });

  const [initialSettings, setInitialSettings] =
    useState<VSCodeSettings>(settings);
  const [dimensionOverride, setDimensionOverride] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pineconeIndices, setPineconeIndices] = useState<PineconeIndex[]>([]);
  const [isLoadingIndices, setIsLoadingIndices] = useState(false);

  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    qdrantStatus?: string;
    pineconeStatus?: string;
    ollamaStatus?: string;
    openaiStatus?: string;
    geminiStatus?: string;
  } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const loaded = await ipc.sendRequest<
        Record<string, never>,
        VSCodeSettings
      >(GET_VSCODE_SETTINGS_METHOD, "webview-mgmt", {});
      if (loaded) {
        setSettings(loaded);
        setInitialSettings(loaded);

        // Determine if dimension was manually set
        const autoDim = getModelDefaults(
          loaded.activeEmbeddingProvider,
          loaded.ollamaModel || loaded.openaiModel || loaded.geminiModel
        );
        setDimensionOverride(loaded.embeddingDimension !== autoDim);

        setIsDirty(false);
      }
    } catch (e) {
      console.error(e);
    }
  }, [ipc]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    // Efficient deep equality check for dirty state
    const isNowDirty = Object.keys(settings).some((key) => {
      const settingKey = key as keyof VSCodeSettings;
      return settings[settingKey] !== initialSettings[settingKey];
    });
    setIsDirty(isNowDirty);
    setTestResult(null); // Clear test result if settings change
  }, [settings, initialSettings]);

  // Auto-update dimension unless overridden
  useEffect(() => {
    if (dimensionOverride) return;

    let model = "";
    if (settings.activeEmbeddingProvider === "openai")
      model = settings.openaiModel;
    else if (settings.activeEmbeddingProvider === "gemini")
      model = settings.geminiModel;
    else model = settings.ollamaModel;

    const def = getModelDefaults(settings.activeEmbeddingProvider, model);
    if (settings.embeddingDimension !== def) {
      updateSetting("embeddingDimension", def);
    }
  }, [
    settings.activeEmbeddingProvider,
    settings.openaiModel,
    settings.geminiModel,
    settings.ollamaModel,
    dimensionOverride,
    settings.embeddingDimension, // Added dependency
  ]);

  const updateSetting = (key: keyof VSCodeSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await ipc.sendRequest(
        UPDATE_VSCODE_SETTINGS_METHOD,
        "webview-mgmt",
        settings
      );
      setInitialSettings(settings); // Update initial state on successful save
      setIsDirty(false);
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    // Map flat settings back to nested config for the existing test endpoint
    const configStub: QdrantOllamaConfig = {
      active_vector_db: settings.activeVectorDb as "qdrant" | "pinecone",
      active_embedding_provider: settings.activeEmbeddingProvider as
        | "ollama"
        | "openai"
        | "gemini",
      index_info: {
        name: settings.indexName,
        embedding_dimension: settings.embeddingDimension,
      },
      qdrant_config: {
        url: settings.qdrantUrl,
        api_key: settings.qdrantApiKey,
      },
      pinecone_config: {
        index_name: settings.pineconeIndexName,
        environment: "", // Deprecated
        api_key: settings.pineconeApiKey,
      },
      ollama_config: {
        base_url: settings.ollamaBaseUrl,
        model: settings.ollamaModel,
      },
      openai_config: {
        api_key: settings.openaiApiKey,
        model: settings.openaiModel,
      },
      gemini_config: {
        api_key: settings.geminiApiKey,
        model: settings.geminiModel,
      },
    };

    try {
      const res = await ipc.sendRequest<
        { config: QdrantOllamaConfig },
        {
          success: boolean;
          message: string;
          qdrantStatus?: string;
          pineconeStatus?: string;
          ollamaStatus?: string;
          openaiStatus?: string;
          geminiStatus?: string;
        }
      >(TEST_CONFIG_METHOD, "webview-mgmt", { config: configStub });
      setTestResult(res);
    } catch (e) {
      setTestResult({ success: false, message: String(e) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleImportLegacy = async () => {
    try {
      const legacy = await ipc.sendRequest<any, QdrantOllamaConfig | null>(
        LOAD_CONFIG_METHOD,
        "webview-mgmt",
        {}
      );
      if (legacy) {
        setSettings((prev) => ({
          ...prev,
          // Map properties from nested legacy object to flat VSCodeSettings
          activeVectorDb: legacy.active_vector_db,
          qdrantUrl: legacy.qdrant_config?.url || prev.qdrantUrl,
          qdrantApiKey: legacy.qdrant_config?.api_key || prev.qdrantApiKey,
          pineconeIndexName:
            legacy.pinecone_config?.index_name || prev.pineconeIndexName,
          pineconeApiKey:
            legacy.pinecone_config?.api_key || prev.pineconeApiKey,
          activeEmbeddingProvider: legacy.active_embedding_provider,
          ollamaBaseUrl: legacy.ollama_config?.base_url || prev.ollamaBaseUrl,
          ollamaModel: legacy.ollama_config?.model || prev.ollamaModel,
          openaiApiKey: legacy.openai_config?.api_key || prev.openaiApiKey,
          openaiModel: legacy.openai_config?.model || prev.openaiModel,
          geminiApiKey: legacy.gemini_config?.api_key || prev.geminiApiKey,
          geminiModel: legacy.gemini_config?.model || prev.geminiModel,
          indexName: legacy.index_info?.name || prev.indexName,
          embeddingDimension:
            legacy.index_info?.embedding_dimension || prev.embeddingDimension,
          // Search settings are assumed to be in VS Code settings already and not overridden by legacy file
        }));

        // Determine if dimension should be overridden based on imported values
        const autoDim = getModelDefaults(
          legacy.active_embedding_provider,
          legacy.ollama_config?.model ||
            legacy.openai_config?.model ||
            legacy.gemini_config?.model ||
            ""
        );
        const importedDim =
          legacy.index_info?.embedding_dimension || settings.embeddingDimension;

        if (importedDim !== autoDim) {
          setDimensionOverride(true);
        }

        // Note: isDirty becomes true automatically
        // Use window.alert instead of vscode.window.showInformationMessage
        window.alert(
          "Legacy configuration loaded into form. Press 'Save All' to apply settings."
        );
      } else {
        window.alert(
          "No legacy .qdrant/configuration.json file found to import."
        );
      }
    } catch (e) {
      console.error("Import failed", e);
      window.alert(
        `Import failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  const StatusIcon = ({ status }: { status?: string }) => {
    if (!status) return null;
    const isSuccess = status === "connected";
    return (
      <div
        className={styles.statusBadge}
        style={{
          color: isSuccess
            ? tokens.colorPaletteGreenForeground1
            : tokens.colorPaletteRedForeground1,
        }}
      >
        {isSuccess ? (
          <CheckmarkCircleRegular fontSize={16} />
        ) : (
          <DismissCircleRegular fontSize={16} />
        )}
        <Text>{isSuccess ? "Connected" : "Failed"}</Text>
      </div>
    );
  };

  const handleFetchIndices = async () => {
    if (!settings.pineconeApiKey) {
      window.alert("Please enter a Pinecone API Key first.");
      return;
    }

    setIsLoadingIndices(true);
    try {
      const indices = await ipc.sendRequest<
        FetchPineconeIndicesParams,
        PineconeIndex[]
      >(FETCH_PINECONE_INDICES_METHOD, "webview-mgmt", {
        apiKey: settings.pineconeApiKey,
      });
      setPineconeIndices(indices);
      if (indices.length === 0) {
        window.alert("No indexes found for this API key.");
      }
    } catch (e) {
      console.error("Failed to fetch indices", e);
      window.alert(
        `Failed to fetch indices: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setIsLoadingIndices(false);
    }
  };

  const handleIndexSelect = (
    _e: any,
    data: { optionValue?: string; value?: string }
  ) => {
    // FluentUI Dropdown passes value in data.optionValue or data.value depending on version/component
    const selectedName = data.optionValue || data.value;
    if (!selectedName) return;

    const selectedIndex = pineconeIndices.find((i) => i.name === selectedName);
    if (selectedIndex) {
      setSettings((prev) => ({
        ...prev,
        pineconeIndexName: selectedIndex.name,
        pineconeHost: selectedIndex.host,
      }));
    }
  };

  const currentAutoDimension = getModelDefaults(
    settings.activeEmbeddingProvider,
    settings.ollamaModel || settings.openaiModel || settings.geminiModel
  );
  const dimensionHelperText = dimensionOverride
    ? "Manually set vector size."
    : `Auto-managed by model: ${currentAutoDimension} dimensions.`;

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {/* REMOVED BACK BUTTON */}
          <Text weight="semibold">Settings (VS Code)</Text>
        </div>
        <Button
          appearance="primary"
          icon={<SaveRegular />}
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? <Spinner size="tiny" /> : "Save All Settings"}
        </Button>
      </div>

      <div className={styles.content}>
        {/* 1. Vector Database */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <DatabaseRegular />
            <Text weight="semibold">Vector Database</Text>
          </div>

          <Caption1 block>
            Choose where your code embeddings will be stored.
          </Caption1>

          <RadioGroup
            layout="horizontal"
            className={styles.radioGroup}
            value={settings.activeVectorDb}
            onChange={(_, data) => updateSetting("activeVectorDb", data.value)}
          >
            <Radio value="qdrant" label="Qdrant" />
            <Radio value="pinecone" label="Pinecone" />
          </RadioGroup>

          {settings.activeVectorDb === "qdrant" && (
            <div className={styles.configPanel}>
              <Field label="Server URL">
                <Input
                  value={settings.qdrantUrl}
                  onChange={(_, d) => updateSetting("qdrantUrl", d.value)}
                  placeholder="http://localhost:6333"
                />
              </Field>
              <Field label="API Key (Optional)">
                <Input
                  type="password"
                  value={settings.qdrantApiKey}
                  onChange={(_, d) => updateSetting("qdrantApiKey", d.value)}
                  placeholder="********"
                />
              </Field>
              {/* Status and Test Button here for immediate feedback */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "8px",
                }}
              >
                <StatusIcon status={testResult?.pineconeStatus} />
              </div>
            </div>
          )}

          {settings.activeVectorDb === "pinecone" && (
            <div className={styles.configPanel}>
              <Field label="API Key">
                <Input
                  type="password"
                  value={settings.pineconeApiKey}
                  onChange={(_, d) => updateSetting("pineconeApiKey", d.value)}
                  placeholder="********"
                />
              </Field>

              <div style={{ display: "flex", gap: "8px" }}>
                <Button
                  size="small"
                  icon={<ArrowSyncRegular />}
                  onClick={handleFetchIndices}
                  disabled={isLoadingIndices || !settings.pineconeApiKey}
                >
                  {isLoadingIndices ? "Fetching..." : "Fetch Indexes"}
                </Button>
              </div>

              <Field label="Pinecone Index">
                <Dropdown
                  placeholder="Select an index"
                  value={settings.pineconeIndexName}
                  onOptionSelect={handleIndexSelect}
                  disabled={pineconeIndices.length === 0 && !isLoadingIndices}
                >
                  {pineconeIndices.map((idx) => (
                    <FluentOption key={idx.name} value={idx.name} text={idx.name}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          width: "100%",
                        }}
                      >
                        <span>{idx.name}</span>
                        <Caption1 style={{ marginLeft: "8px" }}>
                          ({idx.dimension}d, {idx.metric})
                        </Caption1>
                      </div>
                    </FluentOption>
                  ))}
                  {/* Allow manual entry if list is empty but value exists (legacy support) */}
                  {pineconeIndices.length === 0 &&
                    settings.pineconeIndexName && (
                      <FluentOption
                        key={settings.pineconeIndexName}
                        value={settings.pineconeIndexName}
                      >
                        {settings.pineconeIndexName}
                      </FluentOption>
                    )}
                </Dropdown>
              </Field>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "8px",
                }}
              >
                <StatusIcon status={testResult?.qdrantStatus} />
              </div>
            </div>
          )}
        </section>

        <Divider />

        {/* 2. Embedding Provider */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Text weight="semibold">Embedding Provider</Text>
          </div>

          <Caption1 block>
            The service used to convert code snippets into vector embeddings.
          </Caption1>

          <RadioGroup
            layout="horizontal"
            className={styles.radioGroup}
            value={settings.activeEmbeddingProvider}
            onChange={(_, data) =>
              updateSetting("activeEmbeddingProvider", data.value)
            }
          >
            <Radio value="ollama" label="Ollama (Local)" />
            <Radio value="openai" label="OpenAI (Cloud)" />
            <Radio value="gemini" label="Gemini (Cloud)" />
          </RadioGroup>

          {settings.activeEmbeddingProvider === "ollama" && (
            <div className={styles.configPanel}>
              <Field label="Base URL">
                <Input
                  value={settings.ollamaBaseUrl}
                  onChange={(_, d) => updateSetting("ollamaBaseUrl", d.value)}
                  placeholder="http://localhost:11434"
                />
              </Field>
              <Field label="Model">
                <Input
                  value={settings.ollamaModel}
                  onChange={(_, d) => updateSetting("ollamaModel", d.value)}
                  placeholder="nomic-embed-text"
                />
              </Field>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "8px",
                }}
              >
                <StatusIcon status={testResult?.ollamaStatus} />
              </div>
            </div>
          )}

          {settings.activeEmbeddingProvider === "openai" && (
            <div className={styles.configPanel}>
              <Field label="API Key">
                <Input
                  type="password"
                  value={settings.openaiApiKey}
                  onChange={(_, d) => updateSetting("openaiApiKey", d.value)}
                  placeholder="sk-..."
                />
              </Field>
              <Field label="Model">
                <Input
                  value={settings.openaiModel}
                  onChange={(_, d) => updateSetting("openaiModel", d.value)}
                  placeholder="text-embedding-3-small"
                />
              </Field>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "8px",
                }}
              >
                <StatusIcon status={testResult?.openaiStatus} />
              </div>
            </div>
          )}

          {settings.activeEmbeddingProvider === "gemini" && (
            <div className={styles.configPanel}>
              <Field label="API Key">
                <Input
                  type="password"
                  value={settings.geminiApiKey}
                  onChange={(_, d) => updateSetting("geminiApiKey", d.value)}
                  placeholder="AI..."
                />
              </Field>
              <Field label="Model">
                <Input
                  value={settings.geminiModel}
                  onChange={(_, d) => updateSetting("geminiModel", d.value)}
                  placeholder="text-embedding-004"
                />
              </Field>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "8px",
                }}
              >
                <StatusIcon status={testResult?.geminiStatus} />
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "8px",
            }}
          >
            <Button
              appearance="subtle"
              icon={<PlayRegular />}
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? <Spinner size="tiny" /> : "Test Connection"}
            </Button>
          </div>
        </section>

        <Divider />

        {/* 3. Index & Search Settings */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <SearchRegular />
            <Text weight="semibold">Index & Search Parameters</Text>
          </div>

          <div className={styles.gridTwoCol}>
            <Field label="Index Name">
              <Input
                value={settings.indexName}
                onChange={(_, d) => updateSetting("indexName", d.value)}
                placeholder="codebase-index"
              />
            </Field>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <Checkbox
                label="Manual Dimension Override"
                checked={dimensionOverride}
                onChange={(_, d) => setDimensionOverride(d.checked as boolean)}
                title="Override the default vector size set by the embedding model."
              />
              <Input
                type="number"
                value={settings.embeddingDimension.toString()}
                disabled={!dimensionOverride}
                onChange={(_, d) =>
                  updateSetting("embeddingDimension", parseInt(d.value))
                }
                title={dimensionHelperText}
                placeholder={currentAutoDimension.toString()}
              />
              <Caption1>{dimensionHelperText}</Caption1>
            </div>
          </div>

          <Field
            label={`Score Threshold (${(settings.searchThreshold * 100).toFixed(
              0
            )}%)`}
          >
            <Slider
              min={0}
              max={100}
              step={5}
              value={settings.searchThreshold * 100}
              onChange={(_, d) =>
                updateSetting("searchThreshold", d.value / 100)
              }
              title="Minimum similarity score for a result to be considered relevant (0.0 to 1.0)."
            />
          </Field>

          <Field label="Max Results">
            <Input
              type="number"
              min={1}
              max={100}
              value={settings.searchLimit.toString()}
              onChange={(_, d) =>
                updateSetting("searchLimit", parseInt(d.value))
              }
            />
          </Field>

          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px",
              }}
            >
              <Label>Include Search Query in Copy</Label>
              <Switch
                checked={settings.includeQueryInCopy}
                onChange={(_, d) =>
                  updateSetting("includeQueryInCopy", d.checked)
                }
              />
            </div>
          </Card>
        </section>

        <Divider />

        {/* 4. Maintenance / Migration */}
        <section className={styles.maintenanceZone}>
          <div className={styles.maintenanceRow}>
            <div>
              <Text weight="medium">Migration</Text>
              <Caption1 block>
                Import configuration from legacy `.qdrant/configuration.json`
                file. This action will populate the form above.
              </Caption1>
            </div>
            <Button icon={<ArrowImportRegular />} onClick={handleImportLegacy}>
              Import from .qdrant/json
            </Button>
          </div>
          <Divider />
          <div className={styles.maintenanceRow}>
            <div>
              <Text weight="medium">Index Maintenance</Text>
              <Caption1 block>
                Force full re-indexing of the workspace. This should be done
                after configuration changes or major file updates.
              </Caption1>
            </div>
            <Button
              icon={<ArrowClockwiseRegular />}
              onClick={() =>
                ipc.sendCommand(START_INDEX_METHOD, "qdrantIndex", {})
              }
            >
              Force Re-Index
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}