import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function readJsonSafe(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.warn(`[Storage] Ошибка чтения ${filePath}: ${e.message}`);
    return defaultValue;
  }
}

export function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = `${filePath}.tmp.${crypto.randomBytes(6).toString('hex')}`;
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, jsonStr, 'utf8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (e) {
    console.error(`[Storage] Ошибка атомарной записи ${filePath}: ${e.message}`);
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    return false;
  }
}
