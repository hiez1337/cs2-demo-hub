export function parseMatchScore(score) {
  if (!score) {
    return { scoreStr: '—', isWin: false, team1: 0, team2: 0 };
  }

  let part1 = 0;
  let part2 = 0;
  let scoreStr = '';

  if (typeof score === 'string') {
    const clean = score.trim().replace('-', ':');
    const parts = clean.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      part1 = parts[0];
      part2 = parts[1];
      scoreStr = `${part1}:${part2}`;
    } else {
      scoreStr = score;
    }
  } else if (Array.isArray(score)) {
    part1 = Number(score[0]) || 0;
    part2 = Number(score[1]) || 0;
    scoreStr = `${part1}:${part2}`;
  } else if (typeof score === 'object') {
    const vals = Object.values(score).map(Number).filter(n => !isNaN(n));
    if (vals.length >= 2) {
      part1 = vals[0];
      part2 = vals[1];
      scoreStr = `${part1}:${part2}`;
    } else {
      scoreStr = JSON.stringify(score);
    }
  } else {
    scoreStr = String(score);
  }

  return {
    scoreStr: scoreStr || '—',
    isWin: part1 > part2,
    team1: part1,
    team2: part2,
  };
}

export function formatMatchDate(dateVal) {
  if (!dateVal) return '—';
  try {
    return new Date(dateVal).toLocaleString('ru-RU');
  } catch {
    return String(dateVal);
  }
}
