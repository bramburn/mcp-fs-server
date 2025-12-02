import { 
    Button, 
    Card, 
    makeStyles, 
    Text, 
    tokens, 
    Badge, 
    // Link removed as unused
    Textarea,
    Input,
    shorthands // Added missing import for shorthands utility
} from "@fluentui/react-components";
import { 
    PlayRegular, 
    EyeRegular, 
    DocumentAddRegular,
    DocumentEditRegular,
    SearchRegular,
    WarningRegular,
    LineHorizontal3Regular
} from "@fluentui/react-icons";
import { ParsedAction, WEBVIEW_ACTION_IMPLEMENT, WEBVIEW_ACTION_PREVIEW } from "../../protocol.js";
import { useIpc } from "../contexts/ipc.js";
import { useState, useMemo } from "react";

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
    },
    errorPanel: {
        backgroundColor: tokens.colorPaletteRedBackground2,
        ...shorthands.padding("12px"),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        marginBottom: "8px",
    },
    suggestionItem: {
        display: "flex",
        flexDirection: "column",
        backgroundColor: tokens.colorNeutralBackground3,
        ...shorthands.padding("8px"),
        ...shorthands.borderRadius(tokens.borderRadiusSmall),
        marginBottom: "4px",
        cursor: 'pointer',
        ':hover': {
            backgroundColor: tokens.colorNeutralBackground3Hover,
        }
    },
    linesInput: {
        maxWidth: '120px',
    }
});

interface ActionCardProps {
    action: ParsedAction;
    timestamp: number;
}

export const ActionCard = ({ action, timestamp }: ActionCardProps) => {
    const styles = useStyles();
    const ipc = useIpc();

    const [selectedLines, setSelectedLines] = useState(action.lines || '');
    // Renamed to _isSuggesting to satisfy ESLint rule
    const [_isSuggesting, _setIsSuggesting] = useState(false); 

    // Memoize semantic suggestions parsing
    const semanticSuggestions = useMemo(() => {
        if (action.status === 'error' && action.errorDetails?.includes('Suggestions:')) {
            try {
                // Extract the JSON array string from the error message
                const jsonMatch = action.errorDetails.match(/Suggestions: (\[.*\])/);
                if (jsonMatch && jsonMatch[1]) {
                    const suggestions = JSON.parse(jsonMatch[1]);
                    // Only return suggestions that are structurally valid (filePath, lineStart, snippet)
                    if (Array.isArray(suggestions) && suggestions.every((s: any) => s.payload.filePath && s.payload.lineStart)) {
                        return suggestions;
                    }
                }
            } catch (e) {
                console.error("Failed to parse semantic suggestions:", e);
            }
        }
        return [];
    }, [action.status, action.errorDetails]);

    const handleImplement = (e: React.MouseEvent, useLines: boolean = false) => {
        e.stopPropagation();
        
        // Clone the action, potentially injecting line numbers
        const actionToImplement: ParsedAction = {
            ...action,
            lines: useLines ? selectedLines.trim() : action.lines,
            status: 'pending',
        };

        ipc.sendCommand(WEBVIEW_ACTION_IMPLEMENT, 'debugger', actionToImplement);
        _setIsSuggesting(false); // Hide suggestions after attempting implementation
    };

    const handlePreview = (e: React.MouseEvent) => {
        e.stopPropagation();
        ipc.sendCommand(WEBVIEW_ACTION_PREVIEW, 'debugger', action);
    };

    const handleSuggestionClick = (suggestion: any) => {
        // Set the suggested line range (e.g., "10-25") and focus on the lines input
        const lineRange = `${suggestion.payload.lineStart}-${suggestion.payload.lineEnd}`;
        setSelectedLines(lineRange);
        _setIsSuggesting(false); 
    }

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

            {action.status === 'error' && (
                <div className={styles.errorPanel}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: tokens.colorPaletteRedForeground1 }}>
                        <WarningRegular />
                        <Text weight="semibold" size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                            Error: {action.errorDetails?.split('. Suggestions:')[0]}
                        </Text>
                    </div>
                    {semanticSuggestions.length > 0 && (
                        <>
                            <div style={{ marginTop: '12px' }}>
                                <Text size={200} block>Did you mean one of these locations?</Text>
                                <div style={{ maxHeight: '150px', overflowY: 'auto', marginTop: '8px' }}>
                                    {semanticSuggestions.map((s: any, i: number) => (
                                        <div 
                                            key={i} 
                                            className={styles.suggestionItem}
                                            onClick={() => handleSuggestionClick(s)}
                                        >
                                            <Text size={200} style={{ color: tokens.colorBrandForeground1 }}>
                                                {s.payload.filePath}:{s.payload.lineStart} - Score: {(s.score * 100).toFixed(1)}%
                                            </Text>
                                            <Textarea 
                                                readOnly 
                                                size="small"
                                                value={s.payload.content} 
                                                style={{ height: '50px', marginTop: '4px', resize: 'none' }} 
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
            
            {action.type === 'file' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <LineHorizontal3Regular />
                        <Input
                            className={styles.linesInput}
                            placeholder="Line numbers (e.g., 12, 45-50)"
                            value={selectedLines}
                            onChange={(_, d) => setSelectedLines(d.value)}
                            title="Specify line numbers to resolve ambiguity or enforce target location."
                        />
                        {action.multiLineApprove && (
                            <Badge appearance="outline" color="brand">Multi-Approve</Badge>
                        )}
                        <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>
                            (Optional)
                        </Text>
                    </div>
                    
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
                            onClick={(e) => handleImplement(e, true)}
                            disabled={action.status === 'implemented'}
                        >
                            {action.status === 'implemented' ? 'Implemented' : 'Implement'}
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
};