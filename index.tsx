import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  // Clear any existing HTML (like the loading spinner)
  rootElement.innerHTML = '';
  
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("App mounted successfully");
} catch (e) {
  console.error("Fatal error during mount:", e);
  rootElement.innerHTML = `<div style="padding: 20px; color: red; font-family: sans-serif;">
    <h2>Erro Fatal</h2>
    <pre>${e instanceof Error ? e.message : String(e)}</pre>
  </div>`;
}