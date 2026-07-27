import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { Providers } from './app/providers';
import { router } from './app/router';
import { initializeBrowserSentry } from './shared/monitoring/sentry';

import './styles.css';

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('Thiếu #root trong index.html');
initializeBrowserSentry();

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
