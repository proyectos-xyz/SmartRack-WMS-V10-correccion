import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Polyfills for browser compatibility with some Node-based libraries
if (typeof window !== 'undefined') {
  (window as any).global = window;
  (window as any).process = { env: { NODE_ENV: 'development' } };
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration failed: ', err);
    });
  });
}
