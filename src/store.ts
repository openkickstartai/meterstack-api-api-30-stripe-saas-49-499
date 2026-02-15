export interface UsageStore {
  increment(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
  reset(key: string): Promise<void>;
}

export class InMemoryStore implements UsageStore {
  private data = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const entry = this.data.get(key);
    if (entry && entry.expiresAt > now) {
      entry.count += 1;
      return entry.count;
    }
    this.data.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
    return 1;
  }

  async get(key: string): Promise<number> {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.count;
    return 0;
  }

  async reset(key: string): Promise<void> {
    this.data.delete(key);
  }
}
