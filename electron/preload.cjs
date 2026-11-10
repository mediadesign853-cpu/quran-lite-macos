const { contextBridge, ipcRenderer } = require('electron');

// Tells the web app whether page images are installed (asked once, synchronously, before the app starts).
contextBridge.exposeInMainWorld('quranApp', {
  pages: ipcRenderer.sendSync('pages:available'),
  insertFootnote: (payload) => ipcRenderer.invoke('footnote:insert', payload),
});
