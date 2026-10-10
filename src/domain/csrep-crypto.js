import crypto from 'crypto';

export function computeCsrepSecret(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function generateCsrepHeaders(additionalHeaders = {}) {
  const reqId = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const secret = computeCsrepSecret(`${reqId}${timestamp}`);

  return {
    'Accept': 'application/json, text/plain, */*',
    'X-Request-ID': reqId,
    'X-Request-Timestamp': timestamp,
    'X-Request-Secret': secret,
    ...additionalHeaders,
  };
}

export function buildCsrepAuthHeaders(sessionToken, additionalHeaders = {}) {
  const extra = { ...additionalHeaders };
  if (sessionToken) {
    if (typeof sessionToken === 'string') {
      const cleanToken = sessionToken.startsWith('csrep-access-token=')
        ? sessionToken.replace('csrep-access-token=', '').split(';')[0].trim()
        : sessionToken.trim();
      extra['csrep-access-token'] = cleanToken;
      extra['Cookie'] = sessionToken.startsWith('csrep-access-token=')
        ? sessionToken
        : `csrep-access-token=${cleanToken}`;
    } else if (Array.isArray(sessionToken)) {
      const tokenCookie = sessionToken.find(c => c && c.name === 'csrep-access-token');
      if (tokenCookie && tokenCookie.value) {
        extra['csrep-access-token'] = tokenCookie.value;
      }
      extra['Cookie'] = sessionToken
        .filter(c => c && c.name && typeof c.value !== 'undefined')
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
    } else if (typeof sessionToken === 'object') {
      if (sessionToken['csrep-access-token']) {
        const val = sessionToken['csrep-access-token'];
        extra['csrep-access-token'] = val;
        extra['Cookie'] = `csrep-access-token=${val}`;
      }
    }
  }
  return generateCsrepHeaders(extra);
}
