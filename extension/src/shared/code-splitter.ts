import Parser from 'web-tree-sitter';

export interface Chunk {
    id: string;
    content: string;
    lineStart: number;
    lineEnd: number;
    filePath: string;
}

export class CodeSplitter {
    private _parsers: Map<string, Parser.Language> = new Map();
    private _isInitialized = false;

    /**
     * Initializes Tree-sitter parsers for multiple languages.
     * @param wasmPath Path to 'tree-sitter.wasm' file.
     * @param langWasmPaths A map of language names to their WASM file paths.
     */
    public async initialize(wasmPath: string, langWasmPaths: Record<string, string>): Promise<void> {
        if (this._isInitialized) return;

        try {
            await Parser.init({
                locateFile: () => wasmPath
            });

            for (const [lang, path] of Object.entries(langWasmPaths)) {
                const Lang = await Parser.Language.load(path);
                this._parsers.set(lang, Lang);
            }
            this._isInitialized = true;
        } catch (e) {
            console.error('Failed to initialize CodeSplitter:', e);
            throw e;
        }
    }

    /**
     * Splits content into semantic chunks.
     * Falls back to line-based splitting if parser fails or isn't init.
     */
    public split(content: string, filePath: string): Chunk[] {
        const language = this.getLanguageForFile(filePath);
        const parser = this._parsers.get(language);

        if (!parser || !this._isInitialized) {
            return this.simpleLineSplit(content, filePath);
        }

        try {
            const parserInstance = new Parser();
            parserInstance.setLanguage(parser);
            const tree = parserInstance.parse(content);
            const chunks: Chunk[] = [];
            
            // Heuristic: Split by top-level functions/classes or modest size blocks
            // Dart-specific queries for semantic chunking
            const query = language === 'dart' ?
                `(class_definition name: (identifier) @name) @class_body
                 (function_definition name: (identifier) @name) @parameters @return_type) @body)` :
                `(function_declaration name: (identifier) @name) @parameters @body)`;

            const matches = parser.query(query).matches(tree.rootNode);
            
            for (const match of matches) {
                const node = match.captures[0]?.node;
                if (node) {
                    const startPos = node.startPosition;
                    const endPos = node.endPosition;
                    const lines = content.split('\n');
                    const chunkLines = lines.slice(startPos.row, endPos.row + 1);
                    const chunkText = chunkLines.join('\n').trim();

                    if (chunkText.length > 0) {
                        chunks.push({
                            id: crypto.randomUUID(),
                            content: chunkText,
                            lineStart: startPos.row + 1,
                            lineEnd: endPos.row + 1,
                            filePath: filePath
                        });
                    }
                }
            }

            if (chunks.length === 0) {
                return this.simpleLineSplit(content, filePath); // Fallback if no semantic chunks found
            }
            
            return chunks;
        } catch (e) {
            console.warn('Tree-sitter parse failed, falling back to line split', e);
            return this.simpleLineSplit(content, filePath);
        }
    }

    private simpleLineSplit(content: string, filePath: string): Chunk[] {
        const lines = content.split('\n');
        const chunks: Chunk[] = [];
        const CHUNK_SIZE = 50; 
        const OVERLAP = 10;

        for (let i = 0; i < lines.length; i += (CHUNK_SIZE - OVERLAP)) {
            const end = Math.min(i + CHUNK_SIZE, lines.length);
            const chunkLines = lines.slice(i, end);
            const chunkText = chunkLines.join('\n').trim();

            if (chunkText.length > 0) {
                chunks.push({
                    id: crypto.randomUUID(),
                    content: chunkText,
                    lineStart: i + 1,
                    lineEnd: end,
                    filePath: filePath
                });
            }
        }
        return chunks;
    }

    private getLanguageForFile(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'ts':
            case 'tsx':
            case 'js':
            case 'jsx':
                return 'typescript';
            case 'py':
                return 'python';
            case 'java':
                return 'java';
            case 'rs':
                return 'rust';
            case 'go':
                return 'go';
            case 'kt':
            case 'kts':
                return 'kotlin';
            case 'dart':
                return 'dart'; // <-- ADDED DART
            default:
                return 'typescript'; // Fallback
        }
    }
}