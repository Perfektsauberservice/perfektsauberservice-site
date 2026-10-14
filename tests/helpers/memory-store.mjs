// In-memory stand-in for a Netlify Blobs store (get / setJSON / list / delete).
export function memoryStore() {
  const m = new Map();
  return {
    m,
    async get(k, o) { if (!m.has(k)) return null; return o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k); },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
  };
}
