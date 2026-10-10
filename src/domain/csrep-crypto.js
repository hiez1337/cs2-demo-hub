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
