const { contextBridge, ipcRenderer } = require('electron');

// 렌더러(index.html)에서 쓸 안전한 브리지.
// - gvizFetch: 메인 프로세스 경유 fetch (CORS 우회)
// - getConfig: 원격/캐시/번들 config 로드 결과
contextBridge.exposeInMainWorld('dashboardAPI', {
  isElectron: true,
  gvizFetch: (url) => ipcRenderer.invoke('gviz-fetch', url),
  getConfig: () => ipcRenderer.invoke('get-config')
});
