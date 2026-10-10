import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import fs from 'fs';
import path from 'path';
import { SqliteStore } from '../src/storage/sqlite-store.js';

async function runVisualTour() {
  const tourDbPath = path.resolve('./screenshots/temp_tour_data.sqlite');
  process.env.SQLITE_DB_PATH = tourDbPath;
  console.log('[Tour] 1. Preparing sample matches in temporary SQLite...', tourDbPath);

  // Remove existing temp db to start completely fresh
  if (fs.existsSync(tourDbPath)) {
    try {
      fs.unlinkSync(tourDbPath);
    } catch {}
  }
  const walPath = `${tourDbPath}-wal`;
  const shmPath = `${tourDbPath}-shm`;
  if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch {} }
  if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch {} }

  const store = new SqliteStore(tourDbPath);
  store.upsertMatch({
    id: 'csrep-match-101',
    faceit_id: '1-a1b2c3d4-faceit-match-1',
    map: 'de_mirage',
    score: '13:9',
    is_win: 1,
    demo_size: 142589000,
    status: 'missing',
  });
  store.upsertMatch({
    id: 'csrep-match-102',
    faceit_id: '1-e5f6a7b8-faceit-match-2',
    map: 'de_inferno',
    score: '11:13',
    is_win: 0,
    demo_size: 128450000,
    status: 'missing',
  });
  store.upsertMatch({
    id: 'csrep-match-103',
    faceit_id: '1-c9d0e1f2-faceit-match-3',
    map: 'de_dust2',
    score: '13:5',
    is_win: 1,
    demo_size: 98200000,
    status: 'uploaded',
  });
  store.upsertMatch({
    id: 'csrep-match-104',
    faceit_id: '1-d4e5f6a7-faceit-match-4',
    map: 'de_ancient',
    score: '7:13',
    is_win: 0,
    demo_size: 135000000,
    status: 'missing',
  });
  store.close();
  const env = { ...process.env, SQLITE_DB_PATH: tourDbPath };
  delete env.ELECTRON_RUN_AS_NODE;

  console.log('[Tour] 2. Launching Electron App...');
  const app = await electron.launch({
    executablePath: electronPath,
    args: ['src/main/index.js'],
    env,
    timeout: 25000,
  });

  const win = await app.firstWindow();
  win.on('console', (msg) => console.log('[BrowserConsole]', msg.text()));
  win.on('pageerror', (err) => console.error('[BrowserPageError]', err.message));
  await win.setViewportSize({ width: 1280, height: 860 });
  await win.waitForLoadState('domcontentloaded');
  console.log('[Tour] Window loaded:', await win.title());
  // Wait for initial auth / SQLite load
  await win.waitForTimeout(1500);

  // 1. Dashboard / Sync Screen (screenshots/1-dashboard-feed.png)
  console.log('[Tour] 3. Capturing 1-dashboard-feed.png...');
  await win.screenshot({ path: 'screenshots/1-dashboard-feed.png' });

  // 2. Map Filtering (screenshots/2-map-filtering.png)
  console.log('[Tour] 4. Filtering by map and capturing 2-map-filtering.png...');
  const ancientFilter = win.locator('button:has-text("Ancient")').first();
  if (await ancientFilter.count() > 0) {
    await ancientFilter.click();
    await win.waitForTimeout(600);
    await win.screenshot({ path: 'screenshots/2-map-filtering.png' });
    console.log('[Tour] Successfully captured map filtering on Ancient');
  } else {
    const dustFilter = win.locator('button:has-text("Dust II")').first();
    if (await dustFilter.count() > 0) {
      await dustFilter.click();
      await win.waitForTimeout(600);
      await win.screenshot({ path: 'screenshots/2-map-filtering.png' });
    }
  }

  // Reset map filter back to all maps
  const allMapsFilter = win.locator('button:has-text("Все карты")').first();
  if (await allMapsFilter.count() > 0) {
    await allMapsFilter.click();
    await win.waitForTimeout(400);
  }

  // 3. Controlled Safety Upload Probe & screenshots/3-upload-paused.png
  console.log('[Tour] 5. Controlled Safety Upload Probe (start upload then immediately pause)...');
  const uploadButton = win.locator('article button:has-text("Загрузить")').first();
  if (await uploadButton.count() > 0) {
    console.log('[Tour] Triggering uploadMatch on missing match...');
    await uploadButton.click();

    // Verify UI reacts and switches to uploading state
    await win.waitForTimeout(400);
    const pauseButton = win.locator('article button:has-text("Пауза")').first();
    await pauseButton.waitFor({ state: 'visible', timeout: 4000 });
    console.log('[Tour] Reactive transition confirmed: UI is uploading with telemetry');

    // IMMEDIATELY trigger pauseUpload to prevent full demo upload to csrep.gg!
    console.log('[Tour] Triggering pauseUpload immediately...');
    await pauseButton.click();
    await win.waitForTimeout(500);

    // Verify UI reactive transition to paused state
    const continueBtn = win.locator('article button:has-text("Продолжить")').first();
    await continueBtn.waitFor({ state: 'visible', timeout: 4000 });
    console.log('[Tour] Paused state confirmed: Match card safely paused!');

    // Capture 3-upload-paused.png
    await win.screenshot({ path: 'screenshots/3-upload-paused.png' });
    console.log('[Tour] Captured 3-upload-paused.png');
  }

  // 4. Analytics Tab (screenshots/4-analytics-tab.png)
  console.log('[Tour] 6. Switching to Analytics tab and capturing 4-analytics-tab.png...');
  const analyticsBtn = win.locator('button[title*="Аналитика"]').first();
  if (await analyticsBtn.count() > 0) {
    await analyticsBtn.click();
    await win.waitForTimeout(700);
    await win.screenshot({ path: 'screenshots/4-analytics-tab.png' });
  }

  // 5. Settings Tab (screenshots/5-settings-tab.png)
  console.log('[Tour] 7. Switching to Settings tab and capturing 5-settings-tab.png...');
  const settingsBtn = win.locator('button[title*="Настройки"]').first();
  if (await settingsBtn.count() > 0) {
    await settingsBtn.click();
    await win.waitForTimeout(700);
    await win.screenshot({ path: 'screenshots/5-settings-tab.png' });
  }

  // 6. Auth Modal (screenshots/6-auth-modal.png)
  console.log('[Tour] 8. Opening Auth Modal and capturing 6-auth-modal.png...');
  const authTrigger = win.locator('aside button[title*="Профиль"]').last();
  if (await authTrigger.count() > 0) {
    await authTrigger.click();
    await win.waitForTimeout(700);
    await win.screenshot({ path: 'screenshots/6-auth-modal.png' });

    // Close Auth Modal
    await win.keyboard.press('Escape');
    await win.waitForTimeout(400);
  }

  console.log('[Tour] 9. Closing application cleanly...');
  await app.close();
  console.log('[Tour] All 6 screenshots and safety upload probe completed successfully!');
}

runVisualTour().catch((err) => {
  console.error('[Tour] Error running visual tour:', err);
  process.exit(1);
});
