export class CliRenderer {
  static formatProgress(percent, speed) {
    const width = 25;
    const filled = Math.round((percent / 100) * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    return `[${bar}] ${String(percent).padStart(3)}% (${speed})`;
  }

  static renderHeader() {
    console.clear();
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║       CSREP & FACEIT — Demo Uploader Pro (CLI Engine)         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  }

  static log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('ru-RU');
    console.log(`[${time}] ${msg}`);
  }
}
