'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { AuthProvider } from './auth-context';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ConfirmProvider>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </ConfirmProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
