import {
  Button,
  Card,
  CardHeader,
  Input,
  makeStyles,
  shorthands,
  Text,
  tokens,
} from "@fluentui/react-components";
import {
  DismissRegular,
  PlayRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useCallback, useMemo, useState } from "react";
import type { IpcScope } from "../../protocol.js";
import { useIpc } from "../contexts/ipc.js";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.padding("20px"),
    ...shorthands.gap("16px"),
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap("12px"),
  },
  commandList: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap("8px"),
  },
  commandItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.padding("8px", "12px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground2Hover,
    },
  },
  commandInfo: {
    display: "flex",
    flexDirection: "column",
  },
  infoPanel: {
    marginTop: "20px",
    ...shorthands.padding("12px"),
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    borderLeft: `4px solid ${tokens.colorBrandStroke1}`,
  },
});

interface PaletteCommand {
  label: string;
  description: string;
  action: {
    command: string;
    params?: Record<string, unknown>;
    scope: IpcScope;
  };
}

const fileCommands: PaletteCommand[] = [
  {
    label: "New File",
    description: "Create a new file",
    action: {
      command: "webview/execute-command",
      params: { command: "workbench.action.files.newUntitledFile" },
      scope: "webview-mgmt",
    },
  },
  {
    label: "Save File",
    description: "Save the current file",
    action: {
      command: "webview/execute-command",
      params: { command: "workbench.action.files.save" },
      scope: "webview-mgmt",
    },
  },
];

const sampleCommands: PaletteCommand[] = [
  {
    label: "Open File",
    description: "Open a file in the editor",
    action: {
      command: "file/open",
      params: { uri: "file:///example.txt", line: 1 },
      scope: "qdrantIndex",
    },
  },
  {
    label: "Search",
    description: "Search for files",
    action: {
      command: "search",
      params: { query: "test" },
      scope: "qdrantIndex",
    },
  },
  {
    label: "Settings",
    description: "Open extension settings",
    action: {
      command: "webview/execute-command",
      params: {
        command: "workbench.action.openSettings",
        args: ["mcpFsServer"],
      },
      scope: "webview-mgmt",
    },
  },
];

export default function CommandPaletteTest() {
  const styles = useStyles();
  const ipc = useIpc();

  const [isVisible, setIsVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastAction, setLastAction] = useState<string>("");

  const ipcAvailable = Boolean(ipc);

  const toggleVisibility = useCallback(() => {
    setIsVisible((v) => !v);
  }, []);

  const handleSelect = useCallback(
    (cmd: PaletteCommand) => {
      setLastAction(`Executed: ${cmd.label}`);
      ipc.sendCommand(
        cmd.action.command,
        cmd.action.scope,
        cmd.action.params ?? {}
      );
    },
    [ipc]
  );

  const filteredCommands = useMemo(() => {
    const all = [...fileCommands, ...sampleCommands];
    if (!searchQuery) return all;
    return all.filter((c) =>
      c.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text weight="semibold" size={400}>
          Command Palette Test
        </Text>
        <div className={styles.controls}>
          <Button
            appearance="subtle"
            onClick={toggleVisibility}
            icon={isVisible ? <DismissRegular /> : <PlayRegular />}
          >
            {isVisible ? "Hide" : "Show"} Palette
          </Button>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            IPC: {ipcAvailable ? "✅ Ready" : "❌ Unavailable"}
          </Text>
        </div>
      </div>

      {isVisible && (
        <Card>
          <CardHeader
            header={
              <Input
                contentAfter={<SearchRegular />}
                placeholder="Type a command or search..."
                value={searchQuery}
                onChange={(_e, d) => setSearchQuery(d.value)}
                style={{ width: "100%" }}
              />
            }
          />

          <div className={styles.commandList}>
            {filteredCommands.length === 0 && (
              <Text align="center" style={{ padding: "20px" }}>
                No commands found.
              </Text>
            )}

            {filteredCommands.map((cmd) => (
              <div
                key={cmd.label}
                className={styles.commandItem}
                onClick={() => handleSelect(cmd)}
              >
                <div className={styles.commandInfo}>
                  <Text weight="medium">{cmd.label}</Text>
                  <Text
                    size={200}
                    style={{ color: tokens.colorNeutralForeground3 }}
                  >
                    {cmd.description}
                  </Text>
                </div>
                <PlayRegular fontSize={16} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className={styles.infoPanel}>
        <Text weight="semibold" block>
          Debug Info
        </Text>
        <Text font="monospace" block style={{ marginTop: "4px" }}>
          Last Action: {lastAction || "None"}
        </Text>
        <Text font="monospace" block>
          Search Query: {searchQuery || "Empty"}
        </Text>
      </div>
    </div>
  );
}