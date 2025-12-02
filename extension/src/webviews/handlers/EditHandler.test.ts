import { describe, expect, it, vi, /* Removed beforeEach as unused */ } from 'vitest';
import * as vscode from 'vscode';
import { IndexingService } from '../../services/IndexingService.js';
import { EditHandler } from './EditHandler.js';
import { ParsedAction } from '../protocol.js';

// Mock the IndexingService and its dependencies
const mockIndexingService = {
    initializeForSearch: vi.fn().mockResolvedValue(true),
    search: vi.fn().mockResolvedValue([]),
} as unknown as IndexingService;

// Mock the document methods used by the helper function
const MOCK_FILE_CONTENT = 
`1: function init() {
2:   const bar = 'bar';
3:   const foo = 'foo';
4:   return foo + bar;
5: }
6: 
7: function main() {
8:   const bar = 'bar'; // Match 2
9:   // ...
10: }`;

const mockDocument = {
    getText: vi.fn(() => MOCK_FILE_CONTENT),
    positionAt: vi.fn((offset: number) => {
        let line = 0;
        let char = 0;
        const lineBreaks = MOCK_FILE_CONTENT.split('\n');
        
        // Simple manual calculation for mocking
        let currentOffset = 0;
        for (let i = 0; i < lineBreaks.length; i++) {
            const lineLength = lineBreaks[i].length + 1; // +1 for '\n'
            if (offset < currentOffset + lineLength) {
                line = i;
                char = offset - currentOffset;
                break;
            }
            currentOffset += lineLength;
        }

        return { line, character: char };
    }),
    lineAt: vi.fn((line: number) => ({ text: MOCK_FILE_CONTENT.split('\n')[line] })),
} as unknown as vscode.TextDocument;


// Access the private helper functions for unit testing (requires type casting)
const { isMatchWithinLines } = new (EditHandler as any)(mockIndexingService).__proto__;


describe('EditHandler Line Ambiguity Resolution Logic', () => {

    // Removed unused beforeEach

    it('should correctly identify a match within a single line number', () => {
        // Match starts at line 2 (offset 16), Match Length = 16 (const bar = 'bar';)
        const offset = MOCK_FILE_CONTENT.indexOf('const bar = \'bar\';');
        
        // Line 2 (Match 1)
        expect(isMatchWithinLines(mockDocument, offset, 16, '2')).toBe(true);
        expect(isMatchWithinLines(mockDocument, offset, 16, '1')).toBe(false);
    });

    it('should correctly identify a match within a line range', () => {
        // Match starts at line 3, Match Length = 16
        const offset = MOCK_FILE_CONTENT.indexOf('const foo = \'foo\';');
        
        expect(isMatchWithinLines(mockDocument, offset, 16, '2-4')).toBe(true);
        expect(isMatchWithinLines(mockDocument, offset, 16, '1-2')).toBe(false);
    });

    it('should handle multiple discrete lines and ranges', () => {
        // Match starts at line 3, Match Length = 16
        const offset = MOCK_FILE_CONTENT.indexOf('const foo = \'foo\';');
        
        expect(isMatchWithinLines(mockDocument, offset, 16, '1, 5, 3')).toBe(true);
        expect(isMatchWithinLines(mockDocument, offset, 16, '9, 10-12')).toBe(false);
    });

    it('should correctly include multiline matches spanning a target line', () => {
        // Using a calculated multiline match spanning lines 1-5
        const fullFunction = MOCK_FILE_CONTENT.substring(0, MOCK_FILE_CONTENT.indexOf('function main()') - 2);
        const funcOffset = MOCK_FILE_CONTENT.indexOf('1: function init()');
        const funcLength = fullFunction.length - funcOffset;

        // Match starts line 1, ends line 5. 
        // Target line 3 should hit.
        expect(isMatchWithinLines(mockDocument, funcOffset, funcLength, '3')).toBe(true);
        // Target line 1 should hit (start line)
        expect(isMatchWithinLines(mockDocument, funcOffset, funcLength, '1')).toBe(true);
        // Target line 5 should hit (end line)
        expect(isMatchWithinLines(mockDocument, funcOffset, funcLength, '5')).toBe(true);
        // Target line 6 should not hit
        expect(isMatchWithinLines(mockDocument, funcOffset, funcLength, '6')).toBe(false);
    });

    it('should handle zero lines input gracefully', () => {
        const offset = MOCK_FILE_CONTENT.indexOf('const foo = \'foo\';');
        expect(isMatchWithinLines(mockDocument, offset, 16, '')).toBe(false);
    });
});

describe('EditHandler Ambiguity Flow (performSearchAndReplace)', () => {
    
    // Setup for full handler test
    const mockFileUri = vscode.Uri.file('/test/workspace/target.ts');
    
    // Mock the file system access
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(mockDocument);
    vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true);
    vi.spyOn(mockDocument, 'save').mockResolvedValue(true);

    it('should throw ambiguity error if multiple matches found without line input', async () => {
        // The text 'const bar = 'bar';' appears on line 2 and line 8.
        const ambiguousSearch = 'const bar = \'bar\';';
        
        const action: ParsedAction = {
            id: '1', type: 'file', action: 'replace', 
            path: 'target.ts', searchBlock: ambiguousSearch, replaceBlock: 'const bar = 42;',
            rawXml: '', status: 'ready', multiLineApprove: false
        };

        // Expect a failure due to 2 matches found
        await expect(
            (new EditHandler(mockIndexingService) as any).performSearchAndReplace(mockFileUri, action)
        ).rejects.toThrow(/Found 2 ambiguous occurrences.*Please set 'multiLineApprove="true"' to apply all edits/);
    });

    it('should successfully apply edit if match is ambiguous but lines are specified', async () => {
        const ambiguousSearch = 'const bar = \'bar\';';
        
        const action: ParsedAction = {
            id: '1', type: 'file', action: 'replace', 
            path: 'target.ts', searchBlock: ambiguousSearch, replaceBlock: 'const bar = 42;',
            rawXml: '', status: 'ready', multiLineApprove: false,
            lines: '8' // Only target the second occurrence (line 8)
        };

        await expect(
            (new EditHandler(mockIndexingService) as any).performSearchAndReplace(mockFileUri, action)
        ).resolves.toBeUndefined();
        
        // The fact that it resolved without error means a single match was applied.
        expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
    });

    it('should throw error if exact match fails and semantic search returns suggestions', async () => {
        // Text that does not exist in MOCK_FILE_CONTENT
        const nonExistentSearch = 'nonExistentCode(x);';
        
        const action: ParsedAction = {
            id: '1', type: 'file', action: 'replace', 
            path: 'target.ts', searchBlock: nonExistentSearch, replaceBlock: 'fix(y);',
            rawXml: '', status: 'ready', multiLineApprove: false
        };
        
        // Mock semantic search to return a similar file snippet
        mockIndexingService.search = vi.fn().mockResolvedValueOnce([
            { payload: { filePath: 'target.ts', lineStart: 1 }, score: 0.9, id: '1' }
        ]);

        await expect(
            (new EditHandler(mockIndexingService) as any).performSearchAndReplace(mockFileUri, action)
        ).rejects.toThrow(/Exact match failed.*Suggestions:/);
        
        expect(mockIndexingService.search).toHaveBeenCalledWith(
            nonExistentSearch,
            expect.any(Object)
        );
    });
});