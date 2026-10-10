import path from 'path';
import { readJsonSafe, writeJsonAtomic } from './atomic-file.js';

export class HistoryStore {
  constructor(historyPath = './uploaded_history.json') {
    this.historyPath = path.resolve(historyPath);
    this.uploadedSet = new Set();
    this.load();
  }

  load() {
    const data = readJsonSafe(this.historyPath, []);
    if (Array.isArray(data)) {
      this.uploadedSet = new Set(data);
    }
    return this.uploadedSet;
  }

  has(matchId) {
    return this.uploadedSet.has(matchId);
  }

  add(matchId) {
    if (!matchId) return;
    this.uploadedSet.add(matchId);
    this.save();
  }

  save() {
    const list = Array.from(this.uploadedSet);
    return writeJsonAtomic(this.historyPath, list);
  }

  getAll() {
    return Array.from(this.uploadedSet);
  }

  size() {
    return this.uploadedSet.size;
  }
}
