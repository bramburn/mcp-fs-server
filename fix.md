

I'll help you update the settings to store everything in VS Code settings instead of the JSON file. Let's analyze the current code and make the necessary changes.

Looking at the code, I can see that there are currently two separate saving mechanisms - one for the main configuration and another for search settings. We need to consolidate these and use VS Code settings instead.

Here's how we'll modify the code:

```typescript
// File: extension/src/webviews/app/views/Settings.tsx

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
  LOAD_CONFIG_METHOD,
  type QdrantOllamaConfig,
  SAVE_CONFIG_METHOD,
  type SaveConfigParams,
  START_INDEX_METHOD,
  TEST_CONFIG_METHOD,
  UPDATE_SEARCH_SETTINGS_METHOD,
  type UpdateSearchSettingsParams,
  GET_VSCODE_SETTINGS_METHOD,
  UPDATE_VSCODE_SETTINGS_METHOD,
  type VSCodeSettings,
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

  // Initialize with default values
  const [formData, setFormData] = useState<QdrantOllamaConfig>({
    active_vector_db: "qdrant",
    active_embedding_provider: "ollama",
    index_info: { name: "", embedding_dimension: 768 },
    qdrant_config: { url: "http://localhost:6333", api_key: "" },
    pinecone_config: { index_name: "", environment: "", api_key: "" },
    ollama_config: {
      base_url: "http://localhost:11434",
      model: "nomic-embed-text",
    },
    openai_config: { api_key: "", model: "text-embedding-3-small" },
    gemini_config: { api_key: "", model: "text-embedding-004" },
  });

  // Search settings state
  const [searchLimit, setSearchLimit] = useState(10);
  const [searchThreshold, setSearchThreshold] = useState(0.7);
  const [includeQueryInCopy, setIncludeQueryInCopy] = useState(false);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    qdrantStatus: "connected" | "failed";
    ollamaStatus: "connected" | "failed";
  } | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Load settings from VS Code settings on mount
  const loadSettings = useCallback(async () => {
    try {
      // Load all settings from VS Code settings
      const settings = await ipc.sendRequest<Record<string, never>, VSCodeSettings>(
        GET_VSCODE_SETTINGS_METHOD,
        "webview-mgmt",
        {}
      );

      if (settings) {
        // Update form data with loaded settings
        setFormData((prev) => ({
          ...prev,
          active_vector_db: settings.activeVectorDb || "qdrant",
          active_embedding_provider: settings.activeEmbeddingProvider || "ollama",
          index_info: {
            name: settings.indexName || "",
            embedding_dimension: settings.embeddingDimension || 768,
          },
          qdrant_config: {
            url: settings.qdrantUrl || "http://localhost:6333",
            api_key: settings.qdrantApiKey || "",
          },
          pinecone_config: {
            index_name: settings.pineconeIndexName || "",
            environment: settings.pineconeEnvironment || "",
            api_key: settings.pineconeApiKey || "",
          },
          ollama_config: {
            base_url: settings.ollamaBaseUrl || "http://localhost:11434",
            model: settings.ollamaModel || "nomic-embed-text",
          },
          openai_config: {
            api_key: settings.openaiApiKey || "",
            model: settings.openaiModel || "text-embedding-3-small",
          },
          gemini_config: {
            api_key: settings.geminiApiKey || "",
            model: settings.geminiModel || "text-embedding-004",
          },
        }));

        // Update search settings
        setSearchLimit(settings.searchLimit || 10);
        setSearchThreshold(settings.searchThreshold || 0.7);
        setIncludeQueryInCopy(settings.includeQueryInCopy || false);

        setIsDirty(false);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }, [ipc]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Update embedding dimension when model changes
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

  const handleSearchSettingChange = (
    setting: "searchLimit" | "searchThreshold" | "includeQueryInCopy",
    value: number | boolean
  ) => {
    if (setting === "searchLimit") {
      setSearchLimit(value as number);
    } else if (setting === "searchThreshold") {
      setSearchThreshold(value as number);
    } else if (setting === "includeQueryInCopy") {
      setIncludeQueryInCopy(value as boolean);
    }
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
      // Save all settings to VS Code settings
      await ipc.sendRequest<any, void>(
        UPDATE_VSCODE_SETTINGS_METHOD,
        "webview-mgmt",
        {
          // Vector DB settings
          activeVectorDb: formData.active_vector_db,
          qdrantUrl: formData.qdrant_config?.url || "",
          qdrantApiKey: formData.qdrant_config?.api_key || "",
          pineconeIndexName: formData.pinecone_config?.index_name || "",
          pineconeEnvironment: formData.pinecone_config?.environment || "",
          pineconeApiKey: formData.pinecone_config?.api_key || "",
          
          // Embedding provider settings
          activeEmbeddingProvider: formData.active_embedding_provider,
          ollamaBaseUrl: formData.ollama_config?.base_url || "",
          ollamaModel: formData.ollama_config?.model || "",
          openaiApiKey: formData.openai_config?.api_key || "",
          openaiModel: formData.openai_config?.model || "",
          geminiApiKey: formData.gemini_config?.api_key || "",
          geminiModel: formData.gemini_config?.model || "",
          
          // Index settings
          indexName: formData.index_info?.name || "",
          embeddingDimension: formData.index_info?.embedding_dimension || 768,
          
          // Search settings
          searchLimit,
          searchThreshold,
          includeQueryInCopy,
        }
      );
      
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to save settings:", error);
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

  const handleReIndex = () => {
    ipc.sendCommand(START_INDEX_METHOD, "qdrantIndex", {});
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
            Configure semantic search behavior.
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
                    handleSearchSettingChange("searchLimit", value);
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
                    handleSearchSettingChange("searchThreshold", value);
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
                  handleSearchSettingChange("includeQueryInCopy", d.checked);
                }}
              />
            </div>
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
                  <Field label="Environment (e.g. gcp-starter)">
                    <Input
                      value={formData.pinecone_config?.environment || ""}
                      onChange={(_e, d) =>
                        handleInputChange(
                          "pinecone_config",
                          "environment",
                          d.value
                        )
                      }
                      placeholder="gcp-starter"
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
                      />
                    />
                  </Field>
                </div>
              </AccordionPanel>
            </AccordionItem>

            <AccordionItem value="gemini">
              <AccordionHeader>
                <div className={styles.accordionHeaderContent}>
                  <span>Google Gemini (Cloud)</span>
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
                      placeholder="AI..."
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={formData.gemini_config?.model || ""}
                      onChange={(_e, d) =>
                        handleInputChange("gemini_config", "model", d.value)
                      />
                    />
                  </Field>
                </div>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </section>

        <Divider />

        {/* Actions */}
        <section className={styles.section}>
          <div className={styles.buttonGroup}>
            <Button
              appearance="secondary"
              icon={<PlayRegular />}
              disabled={isTesting}
              onClick={handleTestConnection}
            >
              {isTesting ? <Spinner size="tiny" /> : "Test Connection"}
            </Button>
            <Button
              appearance="primary"
              icon={<SaveRegular />}
              disabled={!isDirty || isSaving}
              onClick={handleSave}
            >
              {isSaving ? <Spinner size="tiny" /> : "Save Settings"}
            </Button>
          </div>
        </section>

        <Divider />

        {/* Maintenance Zone */}
        <section className={styles.maintenanceZone}>
          <div>
            <Text weight="semibold">Index Maintenance</Text>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              Force re-index your entire codebase. This may take a while.
            </Caption1>
          </div>
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            disabled={indexStatus === "indexing"}
            onClick={handleReIndex}
          >
            Force Re-Index
          </Button>
        </section>
      </div>
    </div>
  );
}
```

Now we need to update the protocol file to add the new methods for VS Code settings:

```typescript
// File: extension/src/protocol.ts

// Add these new types and methods to the existing protocol file

export interface VSCodeSettings {
  // Vector DB settings
  activeVectorDb?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
  pineconeIndexName?: string;
  pineconeEnvironment?: string;
  pineconeApiKey?: string;
  
  // Embedding provider settings
  activeEmbeddingProvider?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  
  // Index settings
  indexName?: string;
  embeddingDimension?: number;
  
  // Search settings
  searchLimit?: number;
  searchThreshold?: number;
  includeQueryInCopy?: boolean;
}

// Add these new methods to the existing methods list
export const GET_VSCODE_SETTINGS_METHOD = "getVSCodeSettings";
export const UPDATE_VSCODE_SETTINGS_METHOD = "updateVSCodeSettings";
```

Now we need to update the extension side to handle these new methods and store the settings in VS Code settings. Let's create a new file for this:

```typescript
// File: extension/src/settings.ts

import * as vscode from 'vscode';
import { VSCodeSettings } from './protocol';

export class SettingsManager {
  private static readonly SECTION_ID = 'semanticSearch';
  
  // Get all settings from VS Code configuration
  static getSettings(): VSCodeSettings {
    const config = vscode.workspace.getConfiguration(this.SECTION_ID);
    return {
      // Vector DB settings
      activeVectorDb: config.get<string>('activeVectorDb', 'qdrant'),
      qdrantUrl: config.get<string>('qdrantUrl', 'http://localhost:6333'),
      qdrantApiKey: config.get<string>('qdrantApiKey', ''),
      pineconeIndexName: config.get<string>('pineconeIndexName', ''),
      pineconeEnvironment: config.get<string>('pineconeEnvironment', ''),
      pineconeApiKey: config.get<string>('pineconeApiKey', ''),
      
      // Embedding provider settings
      activeEmbeddingProvider: config.get<string>('activeEmbeddingProvider', 'ollama'),
      ollamaBaseUrl: config.get<string>('ollamaBaseUrl', 'http://localhost:11434'),
      ollamaModel: config.get<string>('ollamaModel', 'nomic-embed-text'),
      openaiApiKey: config.get<string>('openaiApiKey', ''),
      openaiModel: config.get<string>('openaiModel', 'text-embedding-3-small'),
      geminiApiKey: config.get<string>('geminiApiKey', ''),
      geminiModel: config.get<string>('geminiModel', 'text-embedding-004'),
      
      // Index settings
      indexName: config.get<string>('indexName', ''),
      embeddingDimension: config.get<number>('embeddingDimension', 768),
      
      // Search settings
      searchLimit: config.get<number>('searchLimit', 10),
      searchThreshold: config.get<number>('searchThreshold', 0.7),
      includeQueryInCopy: config.get<boolean>('includeQueryInCopy', false),
    };
  }
  
  // Update settings in VS Code configuration
  static async updateSettings(settings: Partial<VSCodeSettings>): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.SECTION_ID);
    
    // Create a list of promises for all updates
    const updates: Promise<void>[] = [];
    
    // Vector DB settings
    if (settings.activeVectorDb !== undefined) {
      updates.push(config.update('activeVectorDb', settings.activeVectorDb));
    }
    if (settings.qdrantUrl !== undefined) {
      updates.push(config.update('qdrantUrl', settings.qdrantUrl));
    }
    if (settings.qdrantApiKey !== undefined) {
      updates.push(config.update('qdrantApiKey', settings.qdrantApiKey));
    }
    if (settings.pineconeIndexName !== undefined) {
      updates.push(config.update('pineconeIndexName', settings.pineconeIndexName));
    }
    if (settings.pineconeEnvironment !== undefined) {
      updates.push(config.update('pineconeEnvironment', settings.pineconeEnvironment));
    }
    if (settings.pineconeApiKey !== undefined) {
      updates.push(config.update('pineconeApiKey', settings.pineconeApiKey));
    }
    
    // Embedding provider settings
    if (settings.activeEmbeddingProvider !== undefined) {
      updates.push(config.update('activeEmbeddingProvider', settings.activeEmbeddingProvider));
    }
    if (settings.ollamaBaseUrl !== undefined) {
      updates.push(config.update('ollamaBaseUrl', settings.ollamaBaseUrl));
    }
    if (settings.ollamaModel !== undefined) {
      updates.push(config.update('ollamaModel', settings.ollamaModel));
    }
    if (settings.openaiApiKey !== undefined) {
      updates.push(config.update('openaiApiKey', settings.openaiApiKey));
    }
    if (settings.openaiModel !== undefined) {
      updates.push(config.update('openaiModel', settings.openaiModel));
    }
    if (settings.geminiApiKey !== undefined) {
      updates.push(config.update('geminiApiKey', settings.geminiApiKey));
    }
    if (settings.geminiModel !== undefined) {
      updates.push(config.update('geminiModel', settings.geminiModel));
    }
    
    // Index settings
    if (settings.indexName !== undefined) {
      updates.push(config.update('indexName', settings.indexName));
    }
    if (settings.embeddingDimension !== undefined) {
      updates.push(config.update('embeddingDimension', settings.embeddingDimension));
    }
    
    // Search settings
    if (settings.searchLimit !== undefined) {
      updates.push(config.update('searchLimit', settings.searchLimit));
    }
    if (settings.searchThreshold !== undefined) {
      updates.push(config.update('searchThreshold', settings.searchThreshold));
    }
    if (settings.includeQueryInCopy !== undefined) {
      updates.push(config.update('includeQueryInCopy', settings.includeQueryInCopy));
    }
    
    // Wait for all updates to complete
    await Promise.all(updates);
  }
}
```

Now we need to update the extension's package.json to register these settings:

```json
// File: extension/package.json

{
  "contributes": {
    "configuration": {
      "title": "Semantic Search",
      "properties": {
        "semanticSearch.activeVectorDb": {
          "type": "string",
          "enum": ["qdrant", "pinecone"],
          "default": "qdrant",
          "description": "The vector database to use for storing embeddings."
        },
        "semanticSearch.qdrantUrl": {
          "type": "string",
          "default": "http://localhost:6333",
          "description": "The URL of the Qdrant server."
        },
        "semanticSearch.qdrantApiKey": {
          "type": "string",
          "default": "",
          "description": "The API key for Qdrant (if required)."
        },
        "semanticSearch.pineconeIndexName": {
          "type": "string",
          "default": "",
          "description": "The name of the Pinecone index."
        },
        "semanticSearch.pineconeEnvironment": {
          "type": "string",
          "default": "",
          "description": "The Pinecone environment (e.g., gcp-starter)."
        },
        "semanticSearch.pineconeApiKey": {
          "type": "string",
          "default": "",
          "description": "The API key for Pinecone."
        },
        "semanticSearch.activeEmbeddingProvider": {
          "type": "string",
          "enum": ["ollama", "openai", "gemini"],
          "default": "ollama",
          "description": "The embedding provider to use for generating embeddings."
        },
        "semanticSearch.ollamaBaseUrl": {
          "type": "string",
          "default": "http://localhost:11434",
          "description": "The base URL of the Ollama server."
        },
        "semanticSearch.ollamaModel": {
          "type": "string",
          "default": "nomic-embed-text",
          "description": "The Ollama model to use for embeddings."
        },
        "semanticSearch.openaiApiKey": {
          "type": "string",
          "default": "",
          "description": "The API key for OpenAI."
        },
        "semanticSearch.openaiModel": {
          "type": "string",
          "default": "text-embedding-3-small",
          "description": "The OpenAI model to use for embeddings."
        },
        "semanticSearch.geminiApiKey": {
          "type": "string",
          "default": "",
          "description": "The API key for Google Gemini."
        },
        "semanticSearch.geminiModel": {
          "type": "string",
          "default": "text-embedding-004",
          "description": "The Google Gemini model to use for embeddings."
        },
        "semanticSearch.indexName": {
          "type": "string",
          "default": "",
          "description": "The name of the index for your codebase."
        },
        "semanticSearch.embeddingDimension": {
          "type": "number",
          "default": 768,
          "description": "The dimension of the embeddings."
        },
        "semanticSearch.searchLimit": {
          "type": "number",
          "default": 10,
          "minimum": 5,
          "maximum": 100,
          "description": "The maximum number of search results to return."
        },
        "semanticSearch.searchThreshold": {
          "type": "number",
          "default": 0.7,
          "minimum": 0,
          "maximum": 1,
          "description": "The minimum similarity score for search results."
        },
        "semanticSearch.includeQueryInCopy": {
          "type": "boolean",
          "default": false,
          "description": "Whether to include the search query when copying results."
        }
      }
    }
  }
}
```

Finally, we need to update the extension's main file to handle the new methods:

```typescript
// File: extension/src/extension.ts

// Add these imports to the existing imports
import { SettingsManager } from './settings';
import { GET_VSCODE_SETTINGS_METHOD, UPDATE_VSCODE_SETTINGS_METHOD } from './protocol';

// In the extension's activate function, add these handlers:

// Handle getting VS Code settings
ipc.onRequest(GET_VSCODE_SETTINGS_METHOD, async () => {
  return SettingsManager.getSettings();
});

// Handle updating VS Code settings
ipc.onRequest(UPDATE_VSCODE_SETTINGS_METHOD, async (_, settings) => {
  await SettingsManager.updateSettings(settings);
});
```

These changes will:

1. Store all settings in VS Code settings instead of a JSON file
2. Load settings from VS Code settings when the settings page is opened
3. Have a single "dirty" state and a single save button
4. Properly handle all the settings mentioned (Pinecone, Ollama, embedding service selection, etc.)
5. Migrate away from using the .qdrant/configuration.json file

The settings will now be persisted in VS Code's settings system, which is more robust and follows VS Code's standard practices.