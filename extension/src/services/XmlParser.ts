import { ParsedAction, ActionAttributes } from "../webviews/protocol.js";

// Regex to capture key attributes from the opening XML tag
const ATTRIBUTE_REGEX = /(\w+)\s*=\s*['"]([^'"]*)['"]/g;

/**
 * Extracts attributes from a raw XML opening tag string.
 * e.g., <qdrant-file path="a.ts" action="create"> => { path: 'a.ts', action: 'create' }
 */
function extractAttributes(tagString: string): ActionAttributes {
    const attributes: Record<string, string | boolean> = {};
    let match;
    while ((match = ATTRIBUTE_REGEX.exec(tagString)) !== null) {
        const key = match[1];
        let value: string | boolean = match[2];
        
        // Special handling for boolean attributes
        if (key === 'multiLineApprove') {
            value = value.toLowerCase() === 'true';
        }
        
        attributes[key] = value;
    }
    return attributes as ActionAttributes;
}

/**
 * Strips surrounding backticks from content if present.
 */
function sanitizeContent(content: string): string {
    content = content.trim();
    if (content.startsWith('```') && content.endsWith('```')) {
        // Strip the language tag and the backticks
        const lines = content.split('\n');
        lines.shift(); // Remove starting ```lang
        lines.pop(); // Remove ending ```
        return lines.join('\n').trim();
    }
    return content;
}

/**
 * Core service to parse raw XML commands received from the Rust sidecar.
 * This parser only extracts data; validation (path existence, semantic checks) happens in the ClipboardManager.
 */
export class XmlParser {

    /**
     * Parses a single raw XML block into an actionable object.
     */
    parseSingle(rawXml: string, index: number): ParsedAction | null {
        // 1. Identify command type and extract attributes from the opening tag
        const match = rawXml.match(/<qdrant-(file|search|read)([^>]*?)>/i);
        if (!match) {
            console.error("XML Parser failed to identify command type or opening tag:", rawXml);
            return null;
        }

        const type = match[1].toLowerCase() as ParsedAction['type'];
        const attributes = extractAttributes(match[2]);
        const fullContent = rawXml.substring(rawXml.indexOf('>') + 1, rawXml.lastIndexOf('</'));

        const parsedAction: ParsedAction = {
            id: `${Date.now()}-${index}`,
            type,
            status: 'pending',
            rawXml,
            ...attributes,
        };

        // 2. Extract content based on command type
        switch (type) {
            case 'search':
            case 'read':
                // For search/read, the content is the inner text
                parsedAction.content = fullContent.trim();
                break;

            case 'file': {
                // For file, we look for nested <search> and <replace> tags
                const searchMatch = fullContent.match(new RegExp(`<search>([\\s\\S]*?)</search>`, 'i'));
                const replaceMatch = fullContent.match(new RegExp(`<replace>([\\s\\S]*?)</replace>`, 'i'));

                if (searchMatch && replaceMatch) {
                    // Search & Replace operation
                    parsedAction.searchBlock = sanitizeContent(searchMatch[1]);
                    parsedAction.replaceBlock = sanitizeContent(replaceMatch[1]);
                } else {
                    // Simple file creation/overwrite
                    parsedAction.content = sanitizeContent(fullContent);
                }
                break;
            }
        }

        // Final check: if it's an edit action, ensure path is present.
        if (parsedAction.type === 'file' && !parsedAction.path) {
            parsedAction.status = 'error';
            parsedAction.errorDetails = 'Missing required "path" attribute for file action.';
        }
        
        return parsedAction;
    }

    /**
     * Parses an array of raw XML strings (from the Rust sidecar) into a list of actionable objects.
     */
    parse(xmlPayloads: string[]): ParsedAction[] {
        return xmlPayloads
            .map((rawXml, index) => this.parseSingle(rawXml, index))
            .filter((action): action is ParsedAction => action !== null);
    }
}