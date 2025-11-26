import React from 'react';
import ReactDOM from 'react-dom/client';
import './app.css';
import App from './app/App';

const container = document.getElementById('app');

if (!container) {
  throw new Error('Root element #app not found');
}

const root = ReactDOM.createRoot(container);

function render() {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Initialize VS Code API for webview communication once on startup
if (typeof window !== 'undefined') {
  const vscode = window.acquireVsCodeApi?.();

  // Optional: notify host that the webview is ready
  try {
    vscode?.postMessage({
      command: 'ipc:ready-request',
      payload: undefined,
    });
  } catch (error) {
    console.error('Failed to send ipc:ready-request', error);
  }
}

// Initial render
render();

// Cleanup function for when the webview is disposed
export function cleanup() {
  try {
    root.unmount();
  } catch (error) {
    console.error('Failed to unmount React root', error);
  }
}

// Handle page unload for cleanup
window.addEventListener('unload', cleanup);