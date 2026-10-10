import { describe, it, expect } from 'vitest';
import { computeCsrepSecret, generateCsrepHeaders, buildCsrepAuthHeaders } from '../../src/domain/csrep-crypto.js';

describe('Domain: csrep-crypto', () => {
  it('should compute deterministic secret hash for a string', () => {
    const s1 = computeCsrepSecret('test-request-id-123451700000000');
    const s2 = computeCsrepSecret('test-request-id-123451700000000');
    expect(s1).toBe(s2);
    expect(typeof s1).toBe('string');
    expect(s1.length).toBeGreaterThan(0);
  });

  it('should generate complete headers with UUID, timestamp, and secret', () => {
    const headers = generateCsrepHeaders({ 'Custom-Header': 'val' });
    expect(headers['Accept']).toBe('application/json, text/plain, */*');
    expect(headers['X-Request-ID']).toBeDefined();
    expect(headers['X-Request-Timestamp']).toBeDefined();
    expect(headers['X-Request-Secret']).toBeDefined();
    expect(headers['Custom-Header']).toBe('val');
  });

  it('should build auth headers with sessionToken string or cookie array', () => {
    const h1 = buildCsrepAuthHeaders('jwt_session_token');
    expect(h1['csrep-access-token']).toBe('jwt_session_token');
    expect(h1['Cookie']).toBe('csrep-access-token=jwt_session_token');
    expect(h1['X-Request-Secret']).toBeDefined();

    const h2 = buildCsrepAuthHeaders([{ name: 'csrep-access-token', value: 'tok_from_array' }]);
    expect(h2['csrep-access-token']).toBe('tok_from_array');
    expect(h2['Cookie']).toBe('csrep-access-token=tok_from_array');
  });
});
