# 수료율대시보드 (Electron)

2026 HRD아카이브 실시간 수료율 대시보드를 **데스크톱 앱**으로 패키징한 프로젝트입니다.
Google Apps Script 배포 없이, Google Sheet를 시트 ID로 직접 읽어(gviz) 렌더링하며,
GitHub Release를 통해 **자동 업데이트(동의 팝업)** 를 지원합니다.

## 3단 구조 (각 층이 다른 속도로 갱신)

| 층 | 내용 | 갱신 방법 | 빈도 |
|----|------|-----------|------|
| **데이터** | 수료율 수치 | 앱 실행/주기 갱신 시 라이브 시트 자동 조회 | 실시간 |
| **config** (`config.json`) | 시트 ID, 셀 범위·**컬럼 매핑**, 제목, 새로고침 주기 | GitHub에 push → **재설치 없이 즉시 반영** | 잦음 |
| **코어** (Electron 셸) | 셸, 자동 업데이트, CORS 브리지, 차트 디자인 | 버전 태그 push → 빌드 → Release → **업데이트 팝업** | 드묾 |

> 데이터는 항상 최신이라, 구버전 앱을 써도 **수치는 정확**합니다. 업데이트가 필요한 건 앱 코드/디자인을 바꿨을 때뿐입니다.

## 전제 조건
- 대상 Google Sheet 공유 설정이 **"링크가 있는 모든 사용자 — 보기"** 여야 합니다(gviz 접근 조건).
- Windows 11은 WebView가 아니라 Electron(Chromium) 내장이라 별도 런타임 불필요.

## 개발 실행
```bash
npm install
npm start
```

## 시트가 바뀌었을 때 (재설치 불필요)
시트 레이아웃(열 위치)이 바뀌면 코드가 아니라 [`config.json`](config.json)만 수정합니다.
```jsonc
"weekly": {
  "range": "B5:M42",           // 주간 영역
  "columns": { "totalRate": 6, "eduRate": 10, ... }  // 열 위치(0 = 범위 첫 열 B)
}
```
수정 후 `main` 브랜치에 push하면, 다음 앱 실행 시 자동 반영됩니다.
(검증: `minEngineVersion`보다 낮은 구버전 앱은 해당 config를 무시하고 마지막 정상값을 사용합니다.)

## 새 버전 배포 (자동 업데이트 발행)
앱 코드/디자인을 바꿨을 때만 필요합니다.
1. `package.json`의 `version`을 올립니다(예: `1.0.0` → `1.0.1`).
2. 같은 버전으로 태그를 push합니다.
   ```bash
   git commit -am "vX.Y.Z: 변경 내용"
   git tag v1.0.1
   git push origin main --tags
   ```
3. [GitHub Actions](.github/workflows/release.yml)가 자동으로 빌드 → Release 발행.
4. 사용자 앱이 실행 시 새 버전을 감지하고 **"지금 업데이트?"** 팝업을 띄웁니다.

> ⚠️ 일반 커밋 push로는 배포되지 않습니다. **`v*` 태그**를 밀 때만 동작합니다.

## 최초 배포 (사용자에게 설치)
1. 위 절차로 첫 Release(`v1.0.0`)를 만들면 `수료율대시보드 Setup x.y.z.exe`가 생성됩니다.
2. 그 설치 파일을 **공유폴더에 한 번** 올리고, 사용자들이 1회 설치합니다.
3. 이후 업데이트는 앱이 자동으로 처리하므로 공유폴더를 다시 만질 필요가 없습니다.

## 로컬에서 설치본 직접 빌드
```bash
npm run dist     # dist\수료율대시보드 Setup x.y.z.exe 생성 (Release 발행 없이)
```

## 구성 파일
- [`main.js`](main.js) — Electron 메인. 창 생성, gviz IPC(CORS 우회), config 로드/캐시, 자동 업데이트.
- [`preload.js`](preload.js) — 렌더러용 안전 브리지(`window.dashboardAPI`).
- [`renderer/index.html`](renderer/index.html) — 대시보드 UI/차트. config 주입·컬럼 매핑 기반.
- [`config.json`](config.json) — 시트 ID·범위·매핑·디자인 토큰.
