import { describe, expect, it } from 'vitest';
import { XmlParser } from './XmlParser.js';

describe('XmlParser', () => {
    const parser = new XmlParser();

    it('should parse a file create command', () => {
        const rawXml = '<qdrant-file path="src/main.ts" action="create">console.log("hello");</qdrant-file>';
        const result = parser.parseSingle(rawXml, 0);

        expect(result).toBeDefined();
        expect(result?.type).toBe('file');
        expect(result?.path).toBe('src/main.ts');
        expect(result?.action).toBe('create');
        expect(result?.content).toBe('console.log("hello");');
        expect(result?.rawXml).toBe(rawXml);
    });

    it('should parse a file replace command with search/replace blocks', () => {
        const rawXml = `
<qdrant-file path="src/utils.ts" action="replace">
<search>
function old() {
  return 1;
}
</search>
<replace>
function new() {
  return 2;
}
</replace>
</qdrant-file>`.trim();

        const result = parser.parseSingle(rawXml, 1);

        expect(result).toBeDefined();
        expect(result?.type).toBe('file');
        expect(result?.path).toBe('src/utils.ts');
        expect(result?.action).toBe('replace');
        expect(result?.searchBlock).toContain('function old()');
        expect(result?.replaceBlock).toContain('function new()');
        expect(result?.content).toBeUndefined(); // Should be undefined for search/replace
    });

    it('should parse a search command', () => {
        const rawXml = '<qdrant-search>find user logic</qdrant-search>';
        const result = parser.parseSingle(rawXml, 2);

        expect(result).toBeDefined();
        expect(result?.type).toBe('search');
        expect(result?.content).toBe('find user logic');
    });

    it('should parse a read command', () => {
        const rawXml = '<qdrant-read path="src/config.ts">read this file</qdrant-read>';
        const result = parser.parseSingle(rawXml, 3);

        expect(result).toBeDefined();
        expect(result?.type).toBe('read');
        expect(result?.path).toBe('src/config.ts');
        expect(result?.content).toBe('read this file');
    });

    it('should parse a self-closing read command with path attribute', () => {
        const rawXml = '<qdrant-read path="src/config.ts" />';
        const result = parser.parseSingle(rawXml, 4);

        expect(result).toBeDefined();
        expect(result?.type).toBe('read');
        expect(result?.path).toBe('src/config.ts');
        // Now expecting content to be undefined because it's empty
        expect(result?.content).toBeUndefined();
        expect(result?.rawXml).toBe(rawXml);
    });

    it('should handle markdown code blocks in content', () => {
        const rawXml = `<qdrant-file path="test.ts" action="create">
\`\`\`typescript
const x = 1;
\`\`\`
</qdrant-file>`;
        const result = parser.parseSingle(rawXml, 5);

        expect(result?.content).toBe('const x = 1;');
    });

    it('should parse boolean attributes correctly', () => {
        const rawXml = '<qdrant-file path="a.ts" multiLineApprove="true">content</qdrant-file>';
        const result = parser.parseSingle(rawXml, 6);
        expect(result?.multiLineApprove).toBe(true);
    });

    it('should return null for invalid xml', () => {
        const rawXml = 'just some text';
        const result = parser.parseSingle(rawXml, 7);
        expect(result).toBeNull();
    });
});
