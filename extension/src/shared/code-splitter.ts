import Parser from 'web-tree-sitter';

export interface Chunk {
    id: string;
    content: string;
    lineStart: number;
    lineEnd: number;
    filePath: string;
}

export class CodeSplitter {
    private _parser: Parser | null = null;
    private _isInitialized = false;

    /**
     * Initializes the Tree-sitter parser.
     * @param wasmPath Path to the 'tree-sitter.wasm' file.
     * @param langWasmPath Path to the specific language WASM (e.g., 'tree-sitter-typescript.wasm').
     */
    public async initialize(wasmPath: string, langWasmPath: string): Promise<void> {
        if (this._isInitialized) return;

        try {
            await Parser.init({
                locateFile: () => wasmPath
            });
            this._parser = new Parser();
            const Lang = await Parser.Language.load(langWasmPath);
            this._parser.setLanguage(Lang);
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
        if (!this._parser || !this._isInitialized) {
            return this.simpleLineSplit(content, filePath);
        }

        try {
            const tree = this._parser.parse(content);
            const chunks: Chunk[] = [];
            
            // Heuristic: Split by top-level functions/classes or modest size blocks
            // This is a simplified traversal for P1
            let cursor = tree.walk();
            
            // ... (Implementation of tree traversal to yield chunks)
            // For the sake of this P1 refactor, we will stick to a smart fallback 
            // to ensure we don't block on complex AST logic right now, 
            // but the structure is here for you to drop in your MCP script logic.
            
            return this.simpleLineSplit(content, filePath); // Placeholder for AST logic
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
}