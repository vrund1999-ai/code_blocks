// Projects saved to accounts. Each save carries the version it was based
// on, so a copy edited in another tab or browser isn't overwritten by
// mistake. Which account a project belongs to is kept by SqliteUsers
// (project_owners); the routes check it before reaching this store.

import type { Project } from '@code-blocks/engine/project';
import type { DatabaseSync } from 'node:sqlite';

export interface SavedProjectMeta {
  id: string;
  name: string;
  /** Goes up by one with every save. */
  version: number;
  /** When it was last saved, in ms since 1970. */
  updatedAt: number;
}

export interface SavedProject extends SavedProjectMeta {
  project: Project;
}

/**
 * `base` is the version the editor's copy was based on: null for a project
 * that was never saved, or 'any' to replace whatever is saved.
 */
export type SaveResult = { ok: true; saved: SavedProjectMeta } | { ok: false; current: SavedProjectMeta };

export class SqliteProjects {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS projects_by_user ON projects (user_id, updated_at);
    `);
  }

  /** The account's projects, the latest saved first. */
  list(userId: string): SavedProjectMeta[] {
    return this.db
      .prepare('SELECT id, name, version, updated_at AS updatedAt FROM projects WHERE user_id = ? ORDER BY updated_at DESC, id')
      .all(userId) as unknown as SavedProjectMeta[];
  }

  get(id: string): SavedProject | undefined {
    const row = this.db.prepare('SELECT id, name, version, updated_at AS updatedAt, data FROM projects WHERE id = ?').get(id) as
      | (SavedProjectMeta & { data: string })
      | undefined;
    if (!row) return undefined;
    const { data, ...meta } = row;
    return { ...meta, project: JSON.parse(data) as Project };
  }

  private meta(id: string): SavedProjectMeta | undefined {
    return this.db.prepare('SELECT id, name, version, updated_at AS updatedAt FROM projects WHERE id = ?').get(id) as
      | SavedProjectMeta
      | undefined;
  }

  save(userId: string, project: Project, base: number | null | 'any', now = Date.now()): SaveResult {
    const current = this.meta(project.id);
    if (current && base !== 'any' && base !== current.version) return { ok: false, current };
    const version = (current?.version ?? 0) + 1;
    this.db
      .prepare(
        `INSERT INTO projects (id, user_id, name, data, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, data = excluded.data, version = excluded.version, updated_at = excluded.updated_at`,
      )
      .run(project.id, userId, project.name, JSON.stringify(project), version, now);
    return { ok: true, saved: { id: project.id, name: project.name, version, updatedAt: now } };
  }

  /** False when it wasn't saved. */
  remove(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes) > 0;
  }
}
