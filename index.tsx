import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  console.error("Fatal error during mount:", e);
  rootElement.innerHTML = `<div style="padding: 20px; color: red;">Erro Fatal de Mount: ${e instanceof Error ? e.message : String(e)}</div>`;
}