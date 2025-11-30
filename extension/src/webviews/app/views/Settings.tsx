import {
  Button,
  Caption1,
  Card,
  Checkbox,
  Divider,
  Field,
  Input,
  Label,
  makeStyles,
  Radio,
  RadioGroup,
  shorthands,
  Slider,
  Spinner,
  Switch,
  Text,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  ArrowImportRegular,
  ArrowLeftRegular,
  CheckmarkCircleRegular,
  DatabaseRegular,
  DismissCircleRegular,
  PlayRegular,
  SaveRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import {
  GET_VSCODE_SETTINGS_METHOD,
  LOAD_CONFIG_METHOD,
  QdrantOllamaConfig,
  START_INDEX_METHOD,
  TEST_CONFIG_METHOD,
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
  }
});

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
  const setView = useAppStore((state) => state.setView);
  const indexStatus = useAppStore((state) => state.indexStatus);

  // State maps directly to VSCodeSettings interface
  const [settings, setSettings] = useState<VSCodeSettings>({
    activeVectorDb: "qdrant",
    qdrantUrl: "",
    qdrantApiKey: "",
    pineconeIndexName: "",
    pineconeEnvironment: "",
    pineconeApiKey: "",
    activeEmbeddingProvider: "ollama",
    ollamaBaseUrl: "",
    ollamaModel: "",
    openaiApiKey: "",
    openaiModel: "",
    geminiApiKey: "",
    geminiModel: "",
    indexName: "",
    embeddingDimension: 768,
    searchLimit: 10,
    searchThreshold: 0.7,
    includeQueryInCopy: false,
  });

  const [dimensionOverride, setDimensionOverride] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const loaded = await ipc.sendRequest<any, VSCodeSettings>(GET_VSCODE_SETTINGS_METHOD, "webview-mgmt", {});
      if (loaded) {
        setSettings(loaded);
        setIsDirty(false);
      }
    } catch (e) {
      console.error(e);
    }
  }, [ipc]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Auto-update dimension unless overridden
  useEffect(() => {
    if (dimensionOverride) return;
    
    let model = "";
    if (settings.activeEmbeddingProvider === "openai") model = settings.openaiModel;
    else if (settings.activeEmbeddingProvider === "gemini") model = settings.geminiModel;
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
    dimensionOverride
  ]);

  const updateSetting = (key: keyof VSCodeSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setTestResult(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await ipc.sendRequest(UPDATE_VSCODE_SETTINGS_METHOD, "webview-mgmt", settings);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    // Convert flat settings back to nested config for the legacy test endpoint
    // OR create a new test endpoint. For now, we map it locally.
    const configStub: QdrantOllamaConfig = {
      active_vector_db: settings.activeVectorDb as any,
      active_embedding_provider: settings.activeEmbeddingProvider as any,
      qdrant_config: { url: settings.qdrantUrl, api_key: settings.qdrantApiKey },
      pinecone_config: { index_name: settings.pineconeIndexName, environment: settings.pineconeEnvironment, api_key: settings.pineconeApiKey },
      ollama_config: { base_url: settings.ollamaBaseUrl, model: settings.ollamaModel },
      openai_config: { api_key: settings.openaiApiKey, model: settings.openaiModel },
      gemini_config: { api_key: settings.geminiApiKey, model: settings.geminiModel }
    };

    try {
      const res = await ipc.sendRequest<any, any>(TEST_CONFIG_METHOD, "webview-mgmt", { config: configStub });
      setTestResult(res);
    } catch (e) {
      setTestResult({ success: false, message: String(e) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleImportLegacy = async () => {
    try {
      const legacy = await ipc.sendRequest<any, QdrantOllamaConfig | null>(LOAD_CONFIG_METHOD, "webview-mgmt", {});
      if (legacy) {
        setSettings(prev => ({
          ...prev,
          activeVectorDb: legacy.active_vector_db,
          qdrantUrl: legacy.qdrant_config?.url || "",
          qdrantApiKey: legacy.qdrant_config?.api_key || "",
          pineconeIndexName: legacy.pinecone_config?.index_name || "",
          pineconeApiKey: legacy.pinecone_config?.api_key || "",
          activeEmbeddingProvider: legacy.active_embedding_provider,
          ollamaBaseUrl: legacy.ollama_config?.base_url || "",
          ollamaModel: legacy.ollama_config?.model || "",
          // ... map rest
        }));
        setIsDirty(true);
      }
    } catch (e) {
      console.error("Import failed", e);
    }
  };

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => setView("search")}>Back</Button>
          <Text weight="semibold">Settings (VS Code)</Text>
        </div>
        {isDirty && (
          <Button 
            appearance="primary" 
            icon={<SaveRegular />} 
            onClick={handleSave}
            disabled={isSaving}
          >
            Save All
          </Button>
        )}
      </div>

      <div className={styles.content}>
        
        {/* 1. Vector Database */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <DatabaseRegular />
            <Text weight="semibold">Vector Database</Text>
          </div>
          
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
                <Input value={settings.qdrantUrl} onChange={(_, d) => updateSetting("qdrantUrl", d.value)} />
              </Field>
              <Field label="API Key (Optional)">
                <Input type="password" value={settings.qdrantApiKey} onChange={(_, d) => updateSetting("qdrantApiKey", d.value)} />
              </Field>
            </div>
          )}

          {settings.activeVectorDb === "pinecone" && (
            <div className={styles.configPanel}>
              <Field label="Pinecone Index Name">
                <Input value={settings.pineconeIndexName} onChange={(_, d) => updateSetting("pineconeIndexName", d.value)} />
              </Field>
              <Field label="Environment">
                <Input value={settings.pineconeEnvironment} onChange={(_, d) => updateSetting("pineconeEnvironment", d.value)} />
              </Field>
              <Field label="API Key">
                <Input type="password" value={settings.pineconeApiKey} onChange={(_, d) => updateSetting("pineconeApiKey", d.value)} />
              </Field>
            </div>
          )}
        </section>

        {/* 2. Embedding Provider */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Text weight="semibold">Embedding Provider</Text>
          </div>

          <RadioGroup 
            layout="horizontal" 
            className={styles.radioGroup}
            value={settings.activeEmbeddingProvider}
            onChange={(_, data) => updateSetting("activeEmbeddingProvider", data.value)}
          >
            <Radio value="ollama" label="Ollama" />
            <Radio value="openai" label="OpenAI" />
            <Radio value="gemini" label="Gemini" />
          </RadioGroup>

          {settings.activeEmbeddingProvider === "ollama" && (
            <div className={styles.configPanel}>
              <Field label="Base URL">
                <Input value={settings.ollamaBaseUrl} onChange={(_, d) => updateSetting("ollamaBaseUrl", d.value)} />
              </Field>
              <Field label="Model">
                <Input value={settings.ollamaModel} onChange={(_, d) => updateSetting("ollamaModel", d.value)} />
              </Field>
            </div>
          )}
          {/* ... Add panels for OpenAI/Gemini similar to above ... */}
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
             <Button appearance="subtle" icon={<PlayRegular />} onClick={handleTestConnection} disabled={isTesting}>
               {isTesting ? <Spinner size="tiny" /> : "Test Connection"}
             </Button>
             {testResult && (
                <div className={styles.statusBadge} style={{ 
                  color: testResult.success ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 
                }}>
                  {testResult.success ? <CheckmarkCircleRegular /> : <DismissCircleRegular />}
                  <Text>{testResult.success ? "Connected" : "Failed"}</Text>
                </div>
             )}
          </div>
        </section>

        <Divider />

        {/* 3. Index & Search Settings */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <SearchRegular />
            <Text weight="semibold">Index & Search</Text>
          </div>

          <div className={styles.gridTwoCol}>
            <Field label="Index Name">
              <Input value={settings.indexName} onChange={(_, d) => updateSetting("indexName", d.value)} />
            </Field>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Checkbox 
                label="Manual Dimension Override" 
                checked={dimensionOverride} 
                onChange={(_, d) => setDimensionOverride(d.checked as boolean)} 
              />
              <Input 
                type="number" 
                value={settings.embeddingDimension.toString()} 
                disabled={!dimensionOverride}
                onChange={(_, d) => updateSetting("embeddingDimension", parseInt(d.value))} 
              />
            </div>
          </div>

          <Field label={`Score Threshold (${(settings.searchThreshold * 100).toFixed(0)}%)`}>
            <Slider 
              min={0} max={100} step={5} 
              value={settings.searchThreshold * 100}
              onChange={(_, d) => updateSetting("searchThreshold", d.value / 100)} 
            />
          </Field>

          <Field label="Max Results">
             <Input type="number" min={1} max={100} value={settings.searchLimit.toString()} onChange={(_, d) => updateSetting("searchLimit", parseInt(d.value))} />
          </Field>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px' }}>
              <Label>Include Search Query in Copy</Label>
              <Switch checked={settings.includeQueryInCopy} onChange={(_, d) => updateSetting("includeQueryInCopy", d.checked)} />
            </div>
          </Card>
        </section>

        {/* 4. Maintenance / Migration */}
        <section className={styles.maintenanceZone}>
           <div className={styles.maintenanceRow}>
              <div>
                <Text weight="medium">Migration</Text>
                <Caption1 block>Import settings from legacy .qdrant/configuration.json</Caption1>
              </div>
              <Button icon={<ArrowImportRegular />} onClick={handleImportLegacy}>Import from .qdrant/json</Button>
           </div>
           <Divider />
           <div className={styles.maintenanceRow}>
              <div>
                 <Text weight="medium">Index Maintenance</Text>
                 <Caption1 block>Force full re-indexing of the workspace.</Caption1>
              </div>
              <Button icon={<ArrowClockwiseRegular />} onClick={() => ipc.sendCommand(START_INDEX_METHOD, "qdrantIndex", {})}>Force Re-Index</Button>
           </div>
        </section>

      </div>
    </div>
  );
}