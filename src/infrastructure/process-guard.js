export function registerProcessGuard(onShutdown) {
  let isShuttingDown = false;

  async function handleExit(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 Получен сигнал завершения (${signal}). Очистка ресурсов...`);
    try {
      if (typeof onShutdown === 'function') {
        await onShutdown();
      }
    } catch (e) {
      console.error('Ошибка при завершении работы:', e.message);
    }
    process.exit(0);
  }

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));

  process.on('uncaughtException', (err) => {
    console.error('❌ Неперехваченная ошибка:', err);
    handleExit('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('❌ Необработанный Promise:', reason);
  });

  return {
    trigger: (sig = 'MANUAL') => handleExit(sig),
  };
}
