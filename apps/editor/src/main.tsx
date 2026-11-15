import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// A published app's link (/app/:slug) opens just the app, for its visitors.
// The editor and the published app are loaded separately, so visitors don't
// download the editor.
const published = /^\/app\/([\w-]+)\/?$/.exec(location.pathname)?.[1];

const App = lazy(() => import('./app/App').then((m) => ({ default: m.App })));
const PublishedApp = lazy(() => import('./app/PublishedApp').then((m) => ({ default: m.PublishedApp })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {published ? (
      <Suspense fallback={<div className="published" />}>
        <PublishedApp slug={published} />
      </Suspense>
    ) : (
      <Suspense
        fallback={
          <div className="app boot" role="status">
            Opening your project…
          </div>
        }
      >
        <App />
      </Suspense>
    )}
  </StrictMode>,
);
