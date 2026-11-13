// Where *Save to device* and *Load from device* blocks keep their values on the server.
// Values are kept per project, as JSON, like the browser's local storage.
// BE-3 (data tables) will choose a database; until then they live in memory
// and are gone when the server restarts.

export interface KeyValueStore {
  get(projectId: string, key: string): unknown;
  set(projectId: string, key: string, value: unknown): void;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();

  get(projectId: string, key: string): unknown {
    const raw = this.data.get(`${projectId}\u0000${key}`);
    return raw === undefined ? undefined : JSON.parse(raw);
  }

  set(projectId: string, key: string, value: unknown): void {
    this.data.set(`${projectId}\u0000${key}`, JSON.stringify(value ?? null));
  }
}
