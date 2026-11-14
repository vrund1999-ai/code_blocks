// Published apps: a copy of a project that anyone with its link can open
// and use, at /app/:slug. Publishing again replaces the copy and keeps the
// link; edits made afterwards reach visitors only when published again.

import type { Project } from '@code-blocks/engine/project';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface PublicationInfo {
  /** The random part of the link. */
  slug: string;
  projectId: string;
  /** When it was last published, as an ISO date. */
  publishedAt: string;
  /** Sent by the editor, so it can tell when the published copy is out of date. */
  fingerprint: string;
}

export interface Publication extends PublicationInfo {
  project: Project;
}

/** A link nobody can guess: 12 letters and digits (72 bits). */
const newSlug = () => randomBytes(9).toString('base64url');

type Row = { slug: string; project_id: string; data: string; fingerprint: string; published_at: string };

const info = (r: Row): PublicationInfo => ({ slug: r.slug, projectId: r.project_id, publishedAt: r.published_at, fingerprint: r.fingerprint });

export class SqlitePublications {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS publications (
        slug TEXT PRIMARY KEY,
        project_id TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        published_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  private row(where: 'slug' | 'project_id', value: string): Row | undefined {
    return this.db
      .prepare(`SELECT slug, project_id, data, fingerprint, published_at FROM publications WHERE ${where} = ?`)
      .get(value) as Row | undefined;
  }

  get(slug: string): Publication | undefined {
    const r = this.row('slug', slug);
    return r && { ...info(r), project: JSON.parse(r.data) as Project };
  }

  forProject(projectId: string): PublicationInfo | undefined {
    const r = this.row('project_id', projectId);
    return r && info(r);
  }

  /** Publishes the project, keeping its link if it was published before. */
  publish(project: Project, fingerprint: string, now = new Date()): PublicationInfo {
    const slug = this.forProject(project.id)?.slug ?? newSlug();
    const publishedAt = now.toISOString();
    this.db
      .prepare(
        `INSERT INTO publications (slug, project_id, data, fingerprint, published_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (project_id) DO UPDATE SET data = excluded.data, fingerprint = excluded.fingerprint, published_at = excluded.published_at`,
      )
      .run(slug, project.id, JSON.stringify(project), fingerprint, publishedAt);
    return { slug, projectId: project.id, publishedAt, fingerprint };
  }

  /** False when it wasn't published. */
  unpublish(projectId: string): boolean {
    return Number(this.db.prepare('DELETE FROM publications WHERE project_id = ?').run(projectId).changes) > 0;
  }
}
