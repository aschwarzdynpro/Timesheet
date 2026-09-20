import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ConfirmProvider } from '@/components/ui/confirm'
import { ThemeProvider } from '@/features/account/theme'
import { router } from '@/router'
import { serviceWorkerAnmelden } from '@/lib/pwa'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Macht die App installierbar und startfaehig ohne Netz. Steht vor dem
// Anstrich, damit die Anmeldung nicht an einem spaeteren Fehler haengt.
serviceWorkerAnmelden()

const container = document.getElementById('root')
if (!container) throw new Error('Kein Wurzelelement gefunden')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
