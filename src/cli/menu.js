import { CliRenderer } from './renderer.js';

export async function showInteractiveMenu(rl, orchestrator, configManager) {
  while (true) {
    CliRenderer.renderHeader();
    const cfg = configManager.config;
    console.log(`👤 Steam ID: ${cfg.steamId} | 📄 Страниц: ${cfg.maxPages} | ⚡ Потоков: ${cfg.chunkConcurrency}`);
    console.log('─────────────────────────────────────────────────────────────────');
    console.log(' [1] 🔍 Проверить и загрузить недостающие демки (3 страницы)');
    console.log(' [2] 📦 Загрузить ВСЕ демки за всё время (All Pages)');
    console.log(' [3] ⏱️  Запустить фоновый режим слежения (Watch Mode)');
    console.log(' [4] 🔑 Войти в csrep.gg и faceit.com (Обновить сессию/куки)');
    console.log(' [5] 🌐 Запустить Web Studio (Графический дашборд)');
    console.log(' [6] ⚙️  Изменить Steam ID или параметры');
    console.log(' [0] 🚪 Выход');
    console.log('─────────────────────────────────────────────────────────────────');

    const choice = (await rl.question('👉 Выберите пункт меню [0-6]: ')).trim();

    if (choice === '1' || choice === '2') {
      const pages = choice === '1' ? cfg.maxPages : 100;
      console.log(`\n🔍 Сканирование ${pages} страниц csrep.gg для игрока ${cfg.steamId}...`);
      const unhandled = await orchestrator.scan(pages);

      if (unhandled && unhandled.length > 0) {
        console.log(`\n📦 Найдено ${unhandled.length} недостающих демок.`);
        const confirm = (await rl.question(`Загрузить найденные ${unhandled.length} демок? [Y/n]: `)).trim().toLowerCase();
        if (confirm === '' || confirm === 'y') {
          await orchestrator.uploadMatches(unhandled);
        }
      } else {
        console.log('\n✨ Не найдено недостающих демок для загрузки (все матчи уже загружены).');
      }
      await rl.question('\nНажмите Enter для возврата в меню...');
    } else if (choice === '3') {
      console.log(`\n⏱️  Watch Mode активирован. Проверка каждые ${cfg.watchIntervalMinutes} мин. Для остановки нажмите Ctrl+C.`);
      while (true) {
        const unhandled = await orchestrator.scan(cfg.maxPages);
        if (unhandled && unhandled.length > 0) {
          await orchestrator.uploadMatches(unhandled);
        }
        console.log(`💤 Ожидание ${cfg.watchIntervalMinutes} минут...`);
        await new Promise(r => setTimeout(r, cfg.watchIntervalMinutes * 60 * 1000));
      }
    } else if (choice === '4') {
      await orchestrator.interactiveLogin(rl);
      await rl.question('\nНажмите Enter для возврата в меню...');
    } else if (choice === '5') {
      console.log(`\n🌐 Запуск Web Studio на http://${cfg.webHost}:${cfg.webPort}...`);
      return 'RUN_UI';
    } else if (choice === '6') {
      const newSteam = (await rl.question('Введите новый SteamID64: ')).trim();
      if (/^\d{17}$/.test(newSteam)) {
        configManager.save({ steamId: newSteam });
        console.log('✅ Настройки сохранены!');
      } else {
        console.log('❌ Неверный формат SteamID64 (должно быть 17 цифр)');
      }
      await rl.question('\nНажмите Enter для возврата в меню...');
    } else if (choice === '0') {
      console.log('👋 До свидания!');
      process.exit(0);
    }
  }
}
