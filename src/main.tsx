import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import './index.css';
import { logToServer } from './lib/apiClient';

// Intercept console calls to log them to the backend
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = (...args) => {
  originalConsoleLog(...args);
  logToServer('info', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};
console.warn = (...args) => {
  originalConsoleWarn(...args);
  logToServer('warn', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};
console.error = (...args) => {
  originalConsoleError(...args);
  logToServer('error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
};

window.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const tag = target.tagName.toLowerCase();
  const text = target.innerText?.slice(0, 30).trim() || target.getAttribute('aria-label') || target.id;
  if (tag === 'button' || tag === 'a' || target.closest('button') || target.closest('a')) {
    logToServer('info', `User clicked ${tag}`, { text });
  }
}, { capture: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
