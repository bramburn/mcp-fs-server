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

// Note: VS Code API initialization is now handled in App.tsx using the useVSCodeApi hook
// to prevent singleton errors during React hot reload

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