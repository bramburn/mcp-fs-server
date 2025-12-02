import { describe, expect, it, beforeEach } from 'vitest';
import { XmlParser } from './XmlParser.js';
// Removed: import { ParsedAction } from '../webviews/protocol.js';

describe('XmlParser', () => {
    let parser: XmlParser;

    beforeEach(() => {
        parser = new XmlParser();
    });

    it('should parse a basic search command', () => {
        const rawXml = '<qdrant-search>find all files related to context</qdrant-search>';
        const result = parser.parseSingle(rawXml, 0);

        expect(result).not.toBeNull();
        expect(result?.type).toBe('search');
        expect(result?.content).toBe('find all files related to context');
        expect(result?.path).toBeUndefined();
        expect(result?.status).toBe('pending');
    });

    it('should parse a self-closing read command with path attribute', () => {
        const rawXml = '<qdrant-read path="src/config.ts" />';
        const result = parser.parseSingle(rawXml, 0);

        expect(result).not.toBeNull();
        expect(result?.type).toBe('read');
        expect(result?.path).toBe('src/config.ts');
        expect(result?.content).toBeUndefined();
        expect(result?.rawXml).toBe(rawXml);
    });
    
    it('should parse a file creation command with code content', () => {
        const rawXml = `
<qdrant-file path="src/new_file.ts" action="create">
  // New function
  const helper = () => true;
</qdrant-file>`;
        const result = parser.parseSingle(rawXml, 0);
        
        expect(result).not.toBeNull();
        expect(result?.type).toBe('file');
        expect(result?.action).toBe('create');
        expect(result?.path).toBe('src/new_file.ts');
        expect(result?.content).toContain('const helper = () => true;');
    });
    
    it('should handle code content wrapped in triple backticks', () => {
        const rawXml = `
<qdrant-file path="src/new_file.ts" action="create">
\`\`\`typescript
  const helper = () => true;
\`\`\`
</qdrant-file>`;
        const result = parser.parseSingle(rawXml, 0);

        expect(result?.content).toBe('const helper = () => true;');
    });

    it('should parse a search & replace command with all attributes', () => {
        const rawXml = `
<qdrant-file path="src/api.ts" action="replace" multiLineApprove="true" lines="12-15">
  <search>
    oldFunction(foo, bar);
  </search>
  <replace>
    newFunction(foo, baz);
  </replace>
</qdrant-file>`;
        const result = parser.parseSingle(rawXml, 0);

        expect(result).not.toBeNull();
        expect(result?.type).toBe('file');
        expect(result?.action).toBe('replace');
        expect(result?.path).toBe('src/api.ts');
        expect(result?.lines).toBe('12-15');
        expect(result?.multiLineApprove).toBe(true);
        expect(result?.searchBlock?.trim()).toBe('oldFunction(foo, bar);');
        expect(result?.replaceBlock?.trim()).toBe('newFunction(foo, baz);');
        expect(result?.content).toBeUndefined();
    });
    
    it('should default multiLineApprove to false if missing or incorrect value', () => {
        const rawXml = `<qdrant-file path="a.ts" action="replace" multiLineApprove="false"><search>x</search><replace>y</replace></qdrant-file>`;
        const result = parser.parseSingle(rawXml, 0);
        expect(result?.multiLineApprove).toBe(false);

        const rawXml2 = `<qdrant-file path="a.ts" action="replace"><search>x</search><replace>y</replace></qdrant-file>`;
        const result2 = parser.parseSingle(rawXml2, 0);
        expect(result2?.multiLineApprove).toBe(false);
    });

    it('should mark file action as error if path is missing', () => {
        const rawXml = `<qdrant-file action="create">content</qdrant-file>`;
        const result = parser.parseSingle(rawXml, 0);

        expect(result?.type).toBe('file');
        expect(result?.status).toBe('error');
        expect(result?.errorDetails).toBe('Missing required "path" attribute for file action.');
    });

    it('should parse multiple XML blocks from an array', () => {
        const rawXmls = [
            '<qdrant-search>query</qdrant-search>',
            '<qdrant-file path="b.ts" action="create">content</qdrant-file>'
        ];
        const results = parser.parse(rawXmls);

        expect(results).toHaveLength(2);
        expect(results[0].type).toBe('search');
        expect(results[1].type).toBe('file');
    });
});