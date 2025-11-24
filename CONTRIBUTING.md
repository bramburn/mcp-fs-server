# Contributing to MCP Semantic Watcher

Thank you for considering contributing to the MCP Semantic Watcher project! We welcome your contributions, whether it's reporting bugs, suggesting features, or submitting code.

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this Code of Conduct. Please read the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/0/CODE_OF_CONDUCT.html) for details.

## How to Contribute

### Reporting Bugs

If you find a bug, please report it by opening an issue on the GitHub repository.
When reporting a bug, please include:

*   A clear and concise title for the issue.
*   A detailed description of the bug, including the steps to reproduce it.
*   Information about your environment (OS, Node.js version, Qdrant/Ollama versions if relevant).
*   Any relevant error messages or logs.

### Suggesting Features or Improvements

We welcome feature requests and suggestions for improvement. Please open an issue on the GitHub repository to discuss your ideas.

### Submitting Pull Requests

We appreciate your code contributions! Here's the general workflow:

1.  **Fork the Repository:** Create your own fork of the `mcp-fs-server` repository.
2.  **Clone Your Fork:** Clone your forked repository to your local machine.
    ```bash
    git clone https://github.com/YOUR_USERNAME/mcp-fs-server.git
    cd mcp-fs-server
    ```
    (Replace `YOUR_USERNAME` with your GitHub username).
3.  **Create a New Branch:** Create a descriptive branch for your changes.
    ```bash
    git checkout -b feat/your-feature-name
    # or
    git checkout -b fix/your-bug-fix
    ```
4.  **Make Your Changes:** Implement your feature or fix your bug.
5.  **Test Your Changes:** Ensure that your changes do not break existing functionality and that any new code is adequately tested. If tests are missing for your changes, consider adding them.
6.  **Commit Your Changes:** Write clear, concise commit messages.
    ```bash
    git add .
    git commit -m "feat: Add new functionality for X"
    # or
    git commit -m "fix: Resolve issue with Y"
    ```
7.  **Push to Your Fork:**
    ```bash
    git push origin feat/your-feature-name
    ```
8.  **Open a Pull Request:** Go to the original `mcp-fs-server` repository on GitHub and open a new Pull Request from your fork and branch. Provide a clear description of your changes.

### Development Workflow

Follow these steps to set up the project for local development:

1.  **Prerequisites:**
    *   Node.js (v18+ recommended)
    *   npm or yarn
    *   Qdrant instance running
    *   Ollama running with a compatible embedding model

2.  **Clone and Install:**
    ```bash
    git clone <repository-url>
    cd mcp-fs-server
    npm install
    # or
    yarn install
    ```

3.  **Setup WASM:**
    Download necessary Tree-sitter WASM grammars.
    ```bash
    npm run setup
    # or
    yarn setup
    ```

4.  **Build and Run:**
    ```bash
    npm run build
    npm start
    ```
    For development, use watch mode:
    ```bash
    npm run watch
    ```

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.
