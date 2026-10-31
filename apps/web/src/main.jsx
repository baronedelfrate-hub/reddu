import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';

console.log('[Main] Application entry point executing');

if ('serviceWorker' in navigator) {
  console.log('[Main] Service Worker is supported in this browser.');
  navigator.serviceWorker.getRegistrations().then(registrations => {
    console.log(`[Main] Found ${registrations.length} Service Worker registrations.`);
    for (let registration of registrations) {
      console.log('[Main] Unregistering Service Worker:', registration);
      registration.unregister();
    }
  }).catch(err => {
    console.error('[Main] Service Worker registration check failed:', err);
  });
} else {
  console.log('[Main] Service Worker is NOT supported in this browser.');
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
);