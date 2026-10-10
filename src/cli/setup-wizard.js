export async function ensureSteamIdSetup(configManager, rl) {
  const current = configManager.config.steamId;
  if (!current || current === '76561198434644264') {
    console.log('ℹ️  Текущий Steam ID:', current);
    const answer = await rl.question('Введите ваш SteamID64 (или нажмите Enter, чтобы оставить): ');
    if (answer.trim() && /^\d{17}$/.test(answer.trim())) {
      configManager.save({ steamId: answer.trim() });
      console.log('✅ Steam ID сохранен в config.json!');
    }
  }
}
