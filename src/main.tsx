import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { Toaster } from "./components/toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isTransient } from "./lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A dropped or timed-out request is tried again with growing gaps; a
      // refusal from the server isn't. Data already on screen stays while it
      // tries, so a bad patch of signal never blanks a page.
      retry: (failures, err) => isTransient(err) && failures < 3,
      retryDelay: n => Math.min(1_000 * 2 ** n, 15_000),
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      networkMode: "always",
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
