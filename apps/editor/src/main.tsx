import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { App } from './app/App';
import { PublishedApp } from './app/PublishedApp';

// A published app's link (/app/:slug) opens just the app, for its visitors.
const published = /^\/app\/([\w-]+)\/?$/.exec(location.pathname)?.[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {published ? <PublishedApp slug={published} /> : <App />}
  </StrictMode>,
);
