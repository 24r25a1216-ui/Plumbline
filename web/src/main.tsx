import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './lib/api';
import { SessionProvider, ThemeProvider } from './lib/session';
import { LiveProvider } from './lib/live';
import { ToastProvider } from './components/Toast';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/motion.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      retry: (n, e) => !(e instanceof ApiError && [401, 403, 404, 422].includes(e.status)) && n < 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>
              <LiveProvider>
                <App />
              </LiveProvider>
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
