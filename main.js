const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// ── 원격 config.json (GitHub raw). 시트 매핑/디자인 토큰이 자주 바뀌는 부분.
//    여기를 통해 "재설치 없이" 시트 변동·디자인 변경을 반영한다.
const CONFIG_RAW_URL =
  'https://raw.githubusercontent.com/inucreativehrd21/completion_rate_dashboard/main/config.json';

const BUNDLED_CONFIG = path.join(__dirname, 'config.json');
let CACHED_CONFIG_PATH = null; // app.getPath('userData') 준비 후 설정

let mainWindow = null;

// ── semver 단순 비교 (a >= b 이면 true). pre-release 미지원, x.y.z 형태만.
function gte(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return true;
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

// ── config 로드: 원격 → (검증 통과 시 캐시 저장) → 캐시 → 번들 순으로 폴백.
//    minEngineVersion 이 현재 앱보다 높으면 원격을 무시하고 마지막 정상값 사용 →
//    config push 실수로 구버전 앱 화면이 깨지는 것을 방지.
async function loadConfig() {
  const appVersion = app.getVersion();

  // 1) 원격 시도
  try {
    const res = await net.fetch(CONFIG_RAW_URL + '?t=' + Date.now(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const remote = JSON.parse(await res.text());
      if (remote && remote.sheetId && remote.ranges) {
        const min = remote.minEngineVersion || '0.0.0';
        if (gte(appVersion, min)) {
          if (CACHED_CONFIG_PATH) {
            try { fs.writeFileSync(CACHED_CONFIG_PATH, JSON.stringify(remote), 'utf8'); } catch (_) {}
          }
          return { config: remote, source: 'remote' };
        }
      }
    }
  } catch (_) {
    // 오프라인/타임아웃 → 캐시·번들로 폴백
  }

  // 2) 마지막 정상 캐시
  if (CACHED_CONFIG_PATH) {
    const cached = readJsonSafe(CACHED_CONFIG_PATH);
    if (cached && cached.sheetId) return { config: cached, source: 'cache' };
  }

  // 3) 번들 기본값
  const bundled = readJsonSafe(BUNDLED_CONFIG);
  return { config: bundled, source: 'bundled' };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    backgroundColor: '#0b0f17',
    title: '수료율대시보드',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 외부 링크는 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── IPC: 렌더러가 요청한 gviz URL을 메인 프로세스에서 fetch → CORS 우회.
//    net.fetch(Chromium 네트워크 스택)를 사용 → 사내 프록시/TLS 검사 루트 인증서를 OS 저장소 기준으로 신뢰.
//    (Node 기본 fetch=undici는 사내 루트를 몰라 SELF_SIGNED_CERT_IN_CHAIN 으로 실패함)
ipcMain.handle('gviz-fetch', async (_e, url) => {
  const res = await net.fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('시트 응답 실패 (' + res.status + ')');
  return await res.text();
});

// ── IPC: config 제공
ipcMain.handle('get-config', async () => {
  const { config, source } = await loadConfig();
  return { config, source, appVersion: app.getVersion() };
});

// ── 자동 업데이트: "새 버전 있으면 물어보고, 동의 시 진행".
function setupAutoUpdate() {
  if (!app.isPackaged) return; // 개발 모드에선 비활성
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['지금 업데이트', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '업데이트 알림',
      message: '새 버전(v' + info.version + ')이 있습니다.',
      detail: '지금 다운로드하여 업데이트할까요?'
    });
    if (response === 0) autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '업데이트 준비 완료',
      message: 'v' + info.version + ' 다운로드가 끝났습니다.',
      detail: '지금 재시작하여 적용할까요? (나중에 선택 시 다음 종료 때 적용됩니다)'
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err);
  });

  autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(() => {
  CACHED_CONFIG_PATH = path.join(app.getPath('userData'), 'config.cache.json');
  createWindow();
  setupAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
