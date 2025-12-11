# Roo Code Audit Orchestration Rules

You are operating in a **VS Code Extension Repository** (`qdrant-codesearch`). Your goal is to enforce the **Audit Algorithm** to ensure the extension is robust, secure, and matches its manifest.

## Project Context

- **Type:** VS Code Extension
    
- **Frontend:** Svelte 5 (Runes), Tailwind CSS, shadcn/ui
    
- **Backend:** TypeScript, Qdrant Vector DB, Ollama
    
- **IPC:** Custom Protocol defined in `extension/src/webviews/protocol.ts`
    

## The Audit Algorithm

You must follow this sequence for the audit. Do not skip steps.

### Phase 1: Initialization & Inventory (Mode: audit-orchestrator)

1. **Parse `extension/package.json`**:
    
    - Identify `activationEvents`, `contributes` (views, commands), and `main`.
        
    - Identify dependencies vs devDependencies.
        
2. **Map the Codebase**:
    
    - List all files in `extension/src/`.
        
    - Create `audit-report.md` to track progress.
        

### Phase 2: Per-File Loop (The Boomerang Flow)

For every critical file (prioritize `extension.ts`, `WebviewController.ts`, `IndexingService.ts`, and Svelte views):

1. **ANALYZE (Mode: audit-analyzer)**:
    
    - _Trigger:_ Switch to Analyzer.
        
    - _Task:_ specific check for:
        
        - Is the file referenced correctly in `package.json` (if applicable)?
            
        - Are IPC messages typed correctly according to `protocol.ts`?
            
        - Are Qdrant/Ollama connections handled with error boundaries?
            
    - _Output:_ A list of issues or "CLEAN".
        
2. **FIX (Mode: audit-fixer)**:
    
    - _Trigger:_ If Analyzer found issues, switch to Fixer.
        
    - _Task:_ Apply code changes. Update comments.
        
    - _Constraint:_ Do not break Svelte 5 Runes syntax.
        
3. **TEST (Mode: audit-tester)**:
    
    - _Trigger:_ Switch to Tester.
        
    - _Task:_ Run `npm run compile` to check for TS errors. Run `npm test` if unit tests exist for that module.
        

### Phase 3: Finalization (Mode: audit-orchestrator)

1. Update `audit-report.md` with the status of all files.
    
2. Generate a summary of "Fixed Issues" and "Remaining Risks".
    
3. Commit changes if the user approves.
    

## Critical Checkpoints for this Repo

- **Webviews:** Ensure `extension/src/webviews/main.ts` correctly initializes the Svelte app.
    
- **Services:** Ensure `Container.ts` handles dependency injection without circular deps.
    
- **Config:** Ensure `.qdrant/configuration.json` loading logic in `ConfigService.ts` handles missing files gracefully.
    
- **Git:** Ensure `WorkspaceManager.ts` correctly identifies multi-root workspaces.
    

## Memory Management

- Use MCP (if available) to store the state of `analyzed_files` so we do not repeat work if the session restarts.
    
- If MCP is unavailable, read/write to `audit-state.json` in the root (add this to .gitignore).