// The ☁ Server menu: deploy the project so its server workflows (web
// addresses, forms, schedules) run, see what the deployed copy answers to,
// look at its latest runs, and keep its secrets.

import { useEffect, useMemo, useRef, useState } from 'react';
import { deploy, describeSummary, refreshDeployment, refreshRuns, undeploy, useDeployStore } from '../data/deployStore';
import { openAccountMenu } from '../data/authStore';
import { fingerprint, hookUrl, SERVER_OFFLINE } from '../data/serverApi';
import { useProjectStore } from '../model/projectStore';
import { pushToast } from '../runtime/runtimeStore';
import { SecretsSection } from './SecretsSection';

function showBlock(nodeId: string) {
  const { project, setTab, select } = useProjectStore.getState();
  if (!project.graph.nodes.some((n) => n.id === nodeId)) {
    pushToast('That block isn’t in the project any more.', 'error');
    return;
  }
  setTab('logic');
  select({ kind: 'node', id: nodeId });
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast('Copied the web address.');
  } catch {
    pushToast('Couldn’t copy. Select the address and copy it yourself.', 'error');
  }
}

const time = (iso: string) => new Date(iso).toLocaleString();

export function ServerMenu() {
  const project = useProjectStore((s) => s.project);
  const { status, summary, runs, busy, projectId, problem } = useDeployStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { graph, variables, tables } = project;
  // Only the parts that are deployed matter, so renaming the project doesn't count as a change.
  const current = useMemo(() => fingerprint({ ...project, graph, variables, tables }), [graph, variables, tables]);

  useEffect(() => {
    void refreshDeployment(project.id);
  }, [project.id]);

  useEffect(() => {
    if (!open) return;
    void refreshDeployment(project.id);
    void refreshRuns(project.id);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, project.id]);

  const mine = projectId === project.id;
  const deployed = mine && status === 'deployed' && summary;
  const outdated = deployed && summary.fingerprint !== current;

  let badge = null;
  if (deployed) {
    badge = outdated ? (
      <span className="server-badge outdated">● Changes not deployed</span>
    ) : (
      <span className="server-badge live">● Live</span>
    );
  }

  let statusText: string;
  if (!mine || status === 'checking') statusText = 'Checking the server…';
  else if (status === 'offline') statusText = SERVER_OFFLINE;
  else if (!deployed) statusText = 'Not deployed. Server workflows only run once the project is deployed.';
  else if (outdated) statusText = `Deployed ${time(summary.deployedAt)}. You’ve changed the project since then; deploy again to update the server.`;
  else statusText = `Deployed ${time(summary.deployedAt)}. The server is up to date.`;

  return (
    <div className="menu-anchor" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        ☁ Server {badge}
      </button>
      {open && (
        <div className="menu server-menu" role="dialog" aria-label="Server">
          {mine && status === 'signed-out' ? (
            <div className="server-sign-in">
              <p className="server-status" role="status">
                Sign in to use the server: deploy server workflows, see their runs and keep secrets such as API keys.
              </p>
              <button
                className="btn run"
                onClick={() => {
                  setOpen(false);
                  openAccountMenu();
                }}
              >
                👤 Sign in
              </button>
            </div>
          ) : mine && status === 'refused' ? (
            <p className="server-status" role="status">
              ⚠ {problem}
            </p>
          ) : (
            <>
              <p className="server-status" role="status">
                {statusText}
              </p>
              <div className="server-actions">
                <button className="btn run" onClick={() => void deploy()} disabled={busy}>
                  {busy ? 'Deploying…' : deployed ? (outdated ? '☁ Deploy changes' : '☁ Deploy again') : '☁ Deploy'}
                </button>
                {deployed && (
                  <button className="btn" onClick={() => void undeploy()} disabled={busy}>
                    Stop workflows
                  </button>
                )}
              </div>

              {deployed ? (
                <>
                  <p className="hint">The deployed copy has {describeSummary(summary)}.</p>
                  {summary.problems.map((p) => (
                    <div key={p.nodeId} className="field-problem" role="alert">
                      ⚠ Left out: {p.message}{' '}
                      <button className="link-btn" onClick={() => showBlock(p.nodeId)}>
                        show me
                      </button>
                    </div>
                  ))}
                  {summary.addresses.length > 0 && (
                    <>
                      <div className="menu-title">Web addresses</div>
                      <ul className="server-list" aria-label="Web addresses">
                        {summary.addresses.map((a) => {
                          const url = hookUrl(project.id, a.path);
                          return (
                            <li key={`${a.method} ${a.path}`}>
                              <span className="server-method">{a.method === 'ANY' ? 'Any' : a.method}</span>
                              <code className="server-url">{url}</code>
                              <button className="icon-btn" title="Copy the web address" aria-label={`Copy ${url}`} onClick={() => void copy(url)}>
                                ⧉
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  {summary.forms.length > 0 && (
                    <>
                      <div className="menu-title">Forms</div>
                      <ul className="server-list" aria-label="Forms">
                        {summary.forms.map((f) => (
                          <li key={f}>“{f}”</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {summary.schedules.length > 0 && (
                    <>
                      <div className="menu-title">Schedules</div>
                      <ul className="server-list" aria-label="Schedules">
                        {summary.schedules.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                mine &&
                status === 'none' && (
                  <p className="hint">
                    Add blocks from “On the server” in the Logic tab (a web address, a form or a schedule), then deploy. They
                    keep running on the server after you close the editor.
                  </p>
                )
              )}

              <div className="menu-title server-runs-title">
                Recent runs
                <button className="icon-btn" title="Refresh" aria-label="Refresh runs" onClick={() => void refreshRuns(project.id)}>
                  ↻
                </button>
              </div>
              {mine && runs.length > 0 ? (
                <ul className="server-runs" aria-label="Recent runs">
                  {runs.map((r, i) => (
                    <li key={`${r.at}-${i}`} className={r.ok ? 'ok' : 'failed'}>
                      <div>
                        {r.ok ? '✓' : '⚠'} <b>{r.trigger}</b> <span className="hint">{time(r.at)}</span>
                      </div>
                      {r.error && (
                        <div className="server-run-error">
                          {r.error.message}{' '}
                          <button className="link-btn" onClick={() => showBlock(r.error!.nodeId)}>
                            show me
                          </button>
                        </div>
                      )}
                      {r.messages.map((m, j) => (
                        <div key={j} className="hint">
                          💬 {m}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">No runs yet.</p>
              )}
              {mine && status !== 'offline' && status !== 'checking' && <SecretsSection projectId={project.id} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
