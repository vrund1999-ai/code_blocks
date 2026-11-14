// A published app, as its visitors see it at /app/:slug: just the running
// app, without the editor. It reads its tables through the link and can't
// change them.

import { parseProject } from '@code-blocks/engine/project';
import { useEffect, useState } from 'react';
import { openPublished } from '../data/publishApi';
import { useProjectStore } from '../model/projectStore';
import { runAsPublished, startApp, stopApp } from '../runtime/controller';
import { AppView } from '../runtime/Renderer';
import { useRuntimeStore } from '../runtime/runtimeStore';

export function PublishedApp({ slug }: { slug: string }) {
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');
  const screenId = useRuntimeStore((s) => s.screenId);

  useEffect(() => {
    let cancelled = false;
    openPublished(slug)
      .then(({ project }) => {
        if (cancelled) return;
        const app = parseProject(project);
        useProjectStore.getState().loadProject(app);
        document.title = app.name || 'Code Blocks app';
        runAsPublished(slug);
        startApp();
        setState('ready');
      })
      .catch((err: Error) => !cancelled && setState(err.message));
    return () => {
      cancelled = true;
      stopApp();
      runAsPublished(null);
    };
  }, [slug]);

  return (
    <div className="published">
      {state === 'ready' && screenId ? (
        <main className="published-app">
          <AppView screenId={screenId} mode="run" />
        </main>
      ) : (
        <p className="published-message" role={state === 'loading' ? 'status' : 'alert'}>
          {state === 'loading' ? 'Opening the app…' : `⚠ ${state}`}
        </p>
      )}
      <footer className="published-footer">Made with ◆ Code Blocks</footer>
    </div>
  );
}
