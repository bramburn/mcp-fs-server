import { 
    Button, 
    Card, 
    // CardHeader removed
    makeStyles, 
    Text, 
    tokens, 
    Badge 
} from "@fluentui/react-components";
import { 
    // CodeRegular removed
    PlayRegular, 
    EyeRegular, 
    DocumentAddRegular,
    DocumentEditRegular,
    SearchRegular
} from "@fluentui/react-icons";
import { ParsedAction, WEBVIEW_ACTION_IMPLEMENT, WEBVIEW_ACTION_PREVIEW } from "../../protocol.js";
import { useIpc } from "../contexts/ipc.js";

const useStyles = makeStyles({
    card: {
        backgroundColor: tokens.colorNeutralBackground1,
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        marginBottom: "8px",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "8px"
    },
    pathText: {
        fontFamily: "monospace",
        fontSize: "12px",
        fontWeight: "bold"
    },
    codeBlock: {
        backgroundColor: tokens.colorNeutralBackground2,
        padding: "8px",
        borderRadius: "4px",
        fontFamily: "monospace",
        fontSize: "11px",
        overflowX: "auto",
        whiteSpace: "pre",
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        marginBottom: "8px"
    },
    controls: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "8px",
        marginTop: "4px"
    }
});

interface ActionCardProps {
    action: ParsedAction;
    timestamp: number;
}

export const ActionCard = ({ action, timestamp }: ActionCardProps) => {
    const styles = useStyles();
    const ipc = useIpc();

    const handleImplement = (e: React.MouseEvent) => {
        e.stopPropagation();
        ipc.sendCommand(WEBVIEW_ACTION_IMPLEMENT, 'debugger', action);
    };

    const handlePreview = (e: React.MouseEvent) => {
        e.stopPropagation();
        ipc.sendCommand(WEBVIEW_ACTION_PREVIEW, 'debugger', action);
    };

    // Render helpers
    const getIcon = () => {
        if (action.type === 'search') return <SearchRegular />;
        if (action.action === 'create') return <DocumentAddRegular />;
        return <DocumentEditRegular />;
    };

    const getPreviewContent = () => {
        if (action.type === 'search') return action.content;
        if (action.action === 'replace') {
            return `<<<< SEARCH\n${action.searchBlock}\n==== REPLACE\n${action.replaceBlock}\n>>>>`;
        }
        return action.content;
    };

    return (
        <Card className={styles.card}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {getIcon()}
                    <Text className={styles.pathText}>
                        {action.path || (action.type === 'search' ? 'Semantic Search' : 'Unknown')}
                    </Text>
                </div>
                <Text size={100} style={{ opacity: 0.6 }}>
                    {new Date(timestamp).toLocaleTimeString()}
                </Text>
            </div>

            <div className={styles.codeBlock}>
                {getPreviewContent()?.slice(0, 300)}
                {(getPreviewContent()?.length || 0) > 300 && "..."}
            </div>

            {action.type === 'file' && (
                <div className={styles.controls}>
                    <Button 
                        size="small" 
                        icon={<EyeRegular />} 
                        onClick={handlePreview}
                    >
                        Preview
                    </Button>
                    <Button 
                        size="small" 
                        appearance="primary" 
                        icon={<PlayRegular />} 
                        onClick={handleImplement}
                    >
                        Implement
                    </Button>
                </div>
            )}
            
            {action.status === 'error' && (
                <Badge color="danger" style={{ marginTop: '8px' }}>
                    {action.errorDetails || "Error parsing command"}
                </Badge>
            )}
        </Card>
    );
};