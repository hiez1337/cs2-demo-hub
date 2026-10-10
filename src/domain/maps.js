export const MAP_EMOJIS = {
  de_mirage: '🏛️  DE_MIRAGE',
  de_dust2: '🏜️  DE_DUST2',
  de_ancient: '🌿  DE_ANCIENT',
  de_anubis: '🏺  DE_ANUBIS',
  de_inferno: '🔔  DE_INFERNO',
  de_nuke: '☢️  DE_NUKE',
  de_vertigo: '🏢  DE_VERTIGO',
  de_cache: '🏭  DE_CACHE',
  de_train: '🚂  DE_TRAIN',
  de_overpass: '🌉  DE_OVERPASS',
};

export function getMapTitle(mapName) {
  if (!mapName) return '🎯  UNKNOWN';
  const key = String(mapName).toLowerCase().trim();
  return MAP_EMOJIS[key] || `🎯  ${key.toUpperCase()}`;
}
