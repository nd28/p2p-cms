// Background script for cross-browser compatibility
// Minimal - most logic lives in popup.js communicating with the local server

const api = typeof browser !== 'undefined' ? browser : chrome;
const DEFAULT_PORT = 41235;

// Store server URL for popup to use
api.storage.local.get('serverUrl').then((data) => {
  if (!data.serverUrl) {
    api.storage.local.set({ serverUrl: `http://127.0.0.1:${DEFAULT_PORT}` });
  }
});

// Listen for installation
api.runtime.onInstalled.addListener(() => {
  console.log('P2P CMS extension installed');
});
