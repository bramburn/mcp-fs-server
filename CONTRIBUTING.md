# Contributing to MCP Semantic Watcher

Thank you for your interest in contributing! This project combines Node.js, WebAssembly (Tree-sitter), and Vector Databases, so there are a few specific setup steps to be aware of.

## Development Setup

1. **Clone the repo**
    
2. **Install dependencies**:
    
    ```
    npm install
    ```
    
3. **Initialize WASM Binaries (CRITICAL)**: This project relies on binary `.wasm` files for parsing code. These are not committed to Git. You **must** run this command after cloning or whenever you clean your directory:
    
    ```
    npm run setup
    ```
    

## Running Tests

We use **Vitest**. Tests are located in `src/index.test.ts`.

- **Run Watch Mode**: `npm test`
    
- **Run Coverage**: `npm run coverage`
    

**Note:** Tests are mocked. You do not need a running Qdrant instance or Ollama model to run the unit test suite.

## Project Structure

- `src/index.ts`: Main server logic, file watcher, and vector logic.
    
- `scripts/setup-wasm.cjs`: Downloads required Tree-sitter grammars.
    
- `scripts/deploy.cjs`: Automated deployment script using Gemini AI.
    
- `wasm/`: Directory where binary grammar files are stored (Git ignored).
    

## Deployment

We use an automated script for releases. If you have write access:

1. Stage your changes: `git add .`
    
2. Run deploy: `npm run deploy`
    

This will:

1. Bump the patch version in `package.json`.
    
2. Run the build.
    
3. Use Gemini to generate a semantic commit message.
    
4. Push the commit and a new version tag to GitHub.
    

## Conventional Commits

We follow the Conventional Commits specification.

- `feat:` New features
    
- `fix:` Bug fixes
    
- `docs:` Documentation changes
    
- `chore:` Maintenance, dependency updates