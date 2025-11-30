import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionToggleEvent,
  Button,
  Caption1,
  Divider,
  Field,
  Input,
  makeStyles,
  MessageBar,
  MessageBarBody,
  shorthands,
  Spinner,
  Switch,
  Text,
  Title3,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  ArrowLeftRegular,
  CheckmarkCircleRegular,
  DatabaseRegular,
  DismissCircleRegular,
  GlobeRegular,
  HardDriveRegular,
  PlayRegular,
  SaveRegular,
  SearchRegular,
  ServerRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import {
  GET_SEARCH_SETTINGS_METHOD,
  type GetSearchSettingsResponse,
  LOAD_CONFIG_METHOD,
  type QdrantOllamaConfig,
  SAVE_CONFIG_METHOD,
  type SaveConfigParams,
  START_INDEX_METHOD,
  TEST_CONFIG_METHOD,
  UPDATE_SEARCH_SETTINGS_METHOD,
  type UpdateSearchSettingsParams,
} from "../../protocol";
import { useIpc } from "../contexts/ipc";
import { useAppStore } from "../store";

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
  headerTitle: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("8px"),
  },
  content: {
    flexGrow: 1,
    overflowY: "auto",
    ...shorthands.padding("24px"),
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("24px"),
    maxWidth: "800px",
    width: "100%",
    alignSelf: "center",
    boxSizing: "border-box",
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
    marginBottom: "4px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    ...shorthands.gap("16px"),
  },
  card: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.padding("12px"),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground2,
  },
  cardContent: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("4px"),
  },
  footer: {
    ...shorthands.padding("24px", "0px"),
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("16px"),
  },
  buttonGroup: {
    display: "flex",
    ...shorthands.gap("12px"),
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("4px"),
    fontSize: "12px",
  },
  statusSuccess: {
    color: tokens.colorPaletteGreenForeground1,
  },
  statusError: {
    color: tokens.colorPaletteRedForeground1,
  },
  maintenanceZone: {
    marginTop: "24px",
    ...shorthands.padding("16px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // New style for Accordion Header content layout
  accordionHeaderContent: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingRight: "8px",
  },
});

// Helper to get default dimension for common models
const getModelDefaults = (provider: string, model: string): number => {
  if (provider === "openai") {
    if (model.includes("text-embedding-3-large")) return 3072;
    if (model.includes("text-embedding-3-small") || model.includes("ada-002"))
      return 1536;
  }
  if (provider === "gemini") {
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
  const styles = useStyles();
  const ipc = useIpc();
  const config = useAppStore((state) => state.config);
  const setConfig = useAppStore((state) => state.setConfig);
  const indexStatus = useAppStore((state) => state.indexStatus);
  const setView = useAppStore((state) => state.setView);

  const [formData, setFormData] = useState<QdrantOllamaConfig>({
    active_vector_db: "qdrant",
    active_embedding_provider: "ollama",
    index_info: { name: "", embedding_dimension: 768 },
    qdrant_config: { url: "http://localhost:6333", api_key: "" },
    pinecone_config: { index_name: "", api_key: "" },
    ollama_config: {
      base_url: "http://localhost:11434",
      model: "nomic-embed-text",
    },
    openai_config: { api_key: "", model: "text-embedding-3-small" },
    gemini_config: { api_key: "", model: "text-embedding-004" },
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    qdrantStatus: "connected" | "failed";
    ollamaStatus: "connected" | "failed";
  } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [useGlobalStorage, setUseGlobalStorage] = useState(false);

  // Search settings state
  const [searchLimit, setSearchLimit] = useState(10);
  const [searchThreshold, setSearchThreshold] = useState(0.7);
  const [includeQueryInCopy, setIncludeQueryInCopy] = useState(false);
  const [searchSettingsDirty, setSearchSettingsDirty] = useState(false);

  const refreshConfig = useCallback(() => {
    ipc
      .sendRequest<Record<string, never>, QdrantOllamaConfig | null>(
        LOAD_CONFIG_METHOD,
        "qdrantIndex",
        {}
      )
      .then((cfg) => {
        if (cfg) {
          setConfig(cfg);
          setFormData((prev) => ({ ...prev, ...cfg }));
          setIsDirty(false);
        }
      });
  }, [ipc, setConfig]);

  useEffect(() => {
    if (!config) refreshConfig();
  }, [config, refreshConfig]);

  const loadSearchSettings = useCallback(() => {
    ipc
      .sendRequest<Record<string, never>, GetSearchSettingsResponse>(
        GET_SEARCH_SETTINGS_METHOD,
        "qdrantIndex",
        {}
      )
      .then((settings) => {
        if (settings) {
          setSearchLimit(settings.limit);
          setSearchThreshold(settings.threshold);
          if (settings.includeQueryInCopy !== undefined) {
            setIncludeQueryInCopy(settings.includeQueryInCopy);
          }
          setSearchSettingsDirty(false);
        }
      });
  }, [ipc]);

  useEffect(() => {
    loadSearchSettings();
  }, [loadSearchSettings]);

  const saveSearchSettings = useCallback(async () => {
    try {
      await ipc.sendRequest<UpdateSearchSettingsParams, { success: boolean }>(
        UPDATE_SEARCH_SETTINGS_METHOD,
        "qdrantIndex",
        {
          limit: searchLimit,
          threshold: searchThreshold,
          includeQueryInCopy,
        }
      );
      setSearchSettingsDirty(false);
    } catch (error) {
      console.error("Failed to save search settings:", error);
    }
  }, [ipc, searchLimit, searchThreshold, includeQueryInCopy]);

  useEffect(() => {
    const provider = formData.active_embedding_provider;
    let model = "";

    if (provider === "openai") model = formData.openai_config?.model || "";
    else if (provider === "gemini") model = formData.gemini_config?.model || "";
    else if (provider === "ollama") model = formData.ollama_config?.model || "";

    const suggestedDim = getModelDefaults(provider, model);

    if (formData.index_info?.embedding_dimension !== suggestedDim) {
      setFormData((prev) => ({
        ...prev,
        index_info: {
          ...prev.index_info,
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

  const handleSave = async () => {
    setIsSaving(true);
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
      setIsSaving(false);
    }
  };

  const StatusIcon = ({ status }: { status?: "connected" | "failed" }) => {
    if (!status) return null;
    return status === "connected" ? (
      <div className={`${styles.statusBadge} ${styles.statusSuccess}`}>
        <CheckmarkCircleRegular fontSize={16} />
        <Text>Connected</Text>
      </div>
    ) : (
      <div className={`${styles.statusBadge} ${styles.statusError}`}>
        <DismissCircleRegular fontSize={16} />
        <Text>Failed</Text>
      </div>
    );
  };

  // Handle Accordion Toggle for Vector DB
  const handleVectorDbToggle = (
    event: AccordionToggleEvent,
    data: { value: unknown }
  ) => {
    // Only set if opening (value is the ID being opened)
    // We enforce single selection behavior here
    const newValue = data.value as "qdrant" | "pinecone";
    setFormData((prev) => ({ ...prev, active_vector_db: newValue }));
    setIsDirty(true);
  };

  // Handle Accordion Toggle for Embeddings
  const handleEmbeddingToggle = (
    event: AccordionToggleEvent,
    data: { value: unknown }
  ) => {
    const newValue = data.value as "ollama" | "openai" | "gemini";
    setFormData((prev) => ({ ...prev, active_embedding_provider: newValue }));
    setIsDirty(true);
  };

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Button
            appearance="subtle"
            icon={<ArrowLeftRegular />}
            onClick={() => setView("search")}
          >
            Back
          </Button>
          <Text weight="semibold" size={400}>
            Settings
          </Text>
        </div>

        {isDirty && (
          <Button
            appearance="primary"
            size="small"
            onClick={handleSave}
            disabled={isSaving}
            icon={isSaving ? <Spinner size="tiny" /> : <SaveRegular />}
          >
            Save
          </Button>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Index Settings */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <DatabaseRegular />
            <Text weight="semibold">Index Settings</Text>
          </div>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
            Configure the identity of your codebase index.
          </Caption1>
          <Field label="Index Name">
            <Input
              value={formData.index_info?.name || ""}
              onChange={(_e, d) =>
                handleInputChange("index_info", "name", d.value)
              }
              placeholder="codebase-index"
            />
          </Field>
        </section>

        <Divider />

        {/* Search Settings */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <SearchRegular />
            <Text weight="semibold">Search Settings</Text>
          </div>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
            Configure semantic search behavior. These settings are stored
            globally.
          </Caption1>

          <div className={styles.grid}>
            <Field
              label={`Maximum Results (${searchLimit})`}
              hint="Number of search results to return (5-100)"
            >
              <Input
                type="number"
                min={5}
                max={100}
                value={searchLimit.toString()}
                onChange={(_e, d) => {
                  const value = parseInt(d.value, 10);
                  if (!isNaN(value) && value >= 5 && value <= 100) {
                    setSearchLimit(value);
                    setSearchSettingsDirty(true);
                  }
                }}
              />
            </Field>

            <Field
              label={`Score Threshold (${searchThreshold.toFixed(2)})`}
              hint="Minimum similarity score for results (0.0-1.0)"
            >
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={searchThreshold.toString()}
                onChange={(_e, d) => {
                  const value = parseFloat(d.value);
                  if (!isNaN(value) && value >= 0 && value <= 1) {
                    setSearchThreshold(value);
                    setSearchSettingsDirty(true);
                  }
                }}
              />
            </Field>

            <div className={styles.card}>
              <div className={styles.cardContent}>
                <Text weight="medium">Include Search Query in Copies</Text>
                <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                  Prepends "Instruction: [your query]" to copied content
                </Caption1>
              </div>
              <Switch
                checked={includeQueryInCopy}
                onChange={(_e, d) => {
                  setIncludeQueryInCopy(d.checked);
                  setSearchSettingsDirty(true);
                }}
              />
            </div>

            {searchSettingsDirty && (
              <Button
                icon={<SaveRegular />}
                size="small"
                onClick={saveSearchSettings}
                style={{ width: "fit-content" }}
              >
                Save Search Settings
              </Button>
            )}
          </div>
        </section>

        <Divider />

        {/* Vector DB */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <ServerRegular />
            <Text weight="semibold">Vector Database</Text>
          </div>

          <Accordion
            collapsible
            openItems={formData.active_vector_db}
            onToggle={handleVectorDbToggle}
          >
            <AccordionItem value="qdrant">
              <AccordionHeader>
                <div className={styles.accordionHeaderContent}>
                  <span>Qdrant (Local/Cloud)</span>
                  <StatusIcon status={testResult?.qdrantStatus} />
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.grid}>
                  <Field label="Server URL">
                    <Input
                      value={formData.qdrant_config?.url || ""}
                      onChange={(_e, d) =>
                        handleInputChange("qdrant_config", "url", d.value)
                      }
                      placeholder="http://localhost:6333"
                    />
                  </Field>
                  <Field label="API Key (Optional)">
                    <Input
                      type="password"
                      value={formData.qdrant_config?.api_key || ""}
                      onChange={(_e, d) =>
                        handleInputChange("qdrant_config", "api_key", d.value)
                      }
                      placeholder="********"
                    />
                  </Field>
                </div>
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="pinecone">
              <AccordionHeader>
                <div className={styles.accordionHeaderContent}>
                  <span>Pinecone (Cloud)</span>
                  {formData.active_vector_db === "pinecone" && (
                    <StatusIcon status={testResult?.qdrantStatus} />
                  )}
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.grid}>
                  <Field label="Pinecone Index Name">
                    <Input
                      value={formData.pinecone_config?.index_name || ""}
                      onChange={(_e, d) =>
                        handleInputChange(
                          "pinecone_config",
                          "index_name",
                          d.value
                        )
                      }
                      placeholder="my-index"
                    />
                  </Field>
                  <Field label="API Key">
                    <Input
                      type="password"
                      value={formData.pinecone_config?.api_key || ""}
                      onChange={(_e, d) =>
                        handleInputChange("pinecone_config", "api_key", d.value)
                      }
                      placeholder="********"
                    />
                  </Field>
                </div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </section>

        <Divider />

        {/* Embedding Provider */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Title3>Embedding Provider</Title3>
          </div>

          <Accordion
            collapsible
            openItems={formData.active_embedding_provider}
            onToggle={handleEmbeddingToggle}
          >
            <AccordionItem value="ollama">
              <AccordionHeader>
                <div className={styles.accordionHeaderContent}>
                  <span>Ollama (Local)</span>
                  {formData.active_embedding_provider === "ollama" && (
                    <StatusIcon status={testResult?.ollamaStatus} />
                  )}
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.grid}>
                  <Field label="Base URL">
                    <Input
                      value={formData.ollama_config?.base_url || ""}
                      onChange={(_e, d) =>
                        handleInputChange("ollama_config", "base_url", d.value)
                      }
                      placeholder="http://localhost:11434"
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={formData.ollama_config?.model || ""}
                      onChange={(_e, d) =>
                        handleInputChange("ollama_config", "model", d.value)
                      }
                      placeholder="nomic-embed-text"
                    />
                  </Field>
                </div>
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="openai">
              <AccordionHeader>
                <div className={styles.accordionHeaderContent}>
                  <span>OpenAI (Cloud)</span>
                  {formData.active_embedding_provider === "openai" && (
                    <StatusIcon status={testResult?.ollamaStatus} />
                  )}
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.grid}>
                  <Field label="API Key">
                    <Input
                      type="password"
                      value={formData.openai_config?.api_key || ""}
                      onChange={(_e, d) =>
                        handleInputChange("openai_config", "api_key", d.value)
                      }
                      placeholder="sk-..."
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={formData.openai_config?.model || ""}
                      onChange={(_e, d) =>
                        handleInputChange("openai_config", "model", d.value)
                      }
                      placeholder="text-embedding-3-small"
                    />
                  </Field>
                </div>
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="gemini">
              <AccordionHeader>
                <div className={styles.accordionHeaderContent}>
                  <span>Google Gemini (Cloud)</span>
                  {formData.active_embedding_provider === "gemini" && (
                    <StatusIcon status={testResult?.ollamaStatus} />
                  )}
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.grid}>
                  <Field label="API Key">
                    <Input
                      type="password"
                      value={formData.gemini_config?.api_key || ""}
                      onChange={(_e, d) =>
                        handleInputChange("gemini_config", "api_key", d.value)
                      }
                      placeholder="AIza..."
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={formData.gemini_config?.model || ""}
                      onChange={(_e, d) =>
                        handleInputChange("gemini_config", "model", d.value)
                      }
                      placeholder="text-embedding-004"
                    />
                  </Field>
                </div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </section>

        <Divider />

        {/* Storage Prefs */}
        <div className={styles.card}>
          <div className={styles.cardContent}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {useGlobalStorage ? <GlobeRegular /> : <HardDriveRegular />}
              <Text weight="medium">Configuration Storage</Text>
            </div>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              {useGlobalStorage
                ? "Settings saved to User Profile (Shared across workspaces)"
                : "Settings saved to .qdrant/ in this workspace"}
            </Caption1>
          </div>
          <Switch
            checked={useGlobalStorage}
            onChange={(_e, d) => {
              setUseGlobalStorage(d.checked);
              setTestResult(null);
            }}
          />
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          <div className={styles.buttonGroup}>
            <Button
              appearance="secondary"
              onClick={handleTestConnection}
              disabled={isTesting}
              style={{ flex: 1 }}
              icon={isTesting ? <Spinner size="tiny" /> : <PlayRegular />}
            >
              Test Connection
            </Button>
            <Button
              appearance="primary"
              onClick={handleSave}
              disabled={isSaving}
              style={{ flex: 1 }}
              icon={isSaving ? <Spinner size="tiny" /> : <SaveRegular />}
            >
              Save & Create
            </Button>
          </div>

          {testResult && (
            <MessageBar
              intent={testResult.success ? "success" : "error"}
              layout="multiline"
            >
              <MessageBarBody>{testResult.message}</MessageBarBody>
            </MessageBar>
          )}

          <div className={styles.maintenanceZone}>
            <div className={styles.cardContent}>
              <Text weight="medium">Re-index Workspace</Text>
              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                Force a complete re-indexing of the current workspace.
              </Caption1>
            </div>
            <Button
              appearance="outline"
              size="small"
              icon={
                indexStatus === "indexing" ? (
                  <Spinner size="tiny" />
                ) : (
                  <ArrowClockwiseRegular />
                )
              }
              onClick={() =>
                ipc.sendCommand(START_INDEX_METHOD, "qdrantIndex", {})
              }
              disabled={indexStatus === "indexing"}
            >
              {indexStatus === "indexing" ? "Indexing..." : "Force Re-Index"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}