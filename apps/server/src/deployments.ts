// Deployed projects: the copy of a project the server runs its workflows
// from. The editor sends it with *Deploy*; edits made afterwards don't reach
// the server until the project is deployed again.

import type { DatabaseSync } from 'node:sqlite';
import type { DeployRequest } from './validate';

export interface Deployment extends DeployRequest {
  projectId: string;
  /** When it was deployed, as an ISO date. */
  deployedAt: string;
}

export interface DeploymentStore {
  get(projectId: string): Deployment | undefined;
  /** Adds the deployment, or replaces the project's earlier one. */
  put(deployment: Deployment): void;
  /** False when the project wasn't deployed. */
  remove(projectId: string): boolean;
  all(): Deployment[];
}

export class SqliteDeployments implements DeploymentStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS deployments (
        project_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        deployed_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  get(projectId: string): Deployment | undefined {
    const row = this.db.prepare('SELECT data FROM deployments WHERE project_id = ?').get(projectId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }

  put(d: Deployment): void {
    this.db
      .prepare(
        `INSERT INTO deployments (project_id, data, deployed_at) VALUES (?, ?, ?)
         ON CONFLICT (project_id) DO UPDATE SET data = excluded.data, deployed_at = excluded.deployed_at`,
      )
      .run(d.projectId, JSON.stringify(d), d.deployedAt);
  }

  remove(projectId: string): boolean {
    return Number(this.db.prepare('DELETE FROM deployments WHERE project_id = ?').run(projectId).changes) > 0;
  }

  all(): Deployment[] {
    const rows = this.db.prepare('SELECT data FROM deployments ORDER BY project_id').all() as unknown as { data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }
}
