import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Bug, X } from "lucide-react";
import { queryClient } from "./queries/queries";

import type { Route } from "./+types/root";
import { Header } from "./components/header";
import { FiltersModal } from "./components/filter-bar";
import { Toaster } from "./components/ui/toaster";
import { useAuth } from "./hooks/useAuth";
import { useError, useErrorActions, useSuccess } from "./store/error_state";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,100..900;1,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/dist/cookieconsent.css"></link>
      </head>
      <body>
        <script type="module" src="./cookieconsent-config.js"></script>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const location = useLocation();
  const error = useError();
  const success = useSuccess();
  const { setError, setSuccess } = useErrorActions();

  useAuth();

  useEffect(() => {
    setError(null)
    setSuccess(null)
  }, [location.pathname, setError, setSuccess])

  return (
    <QueryClientProvider client={queryClient}>
      <Header onOpenFilters={() => setIsFiltersOpen(true)} />
      {error ? (
        <div className="border-b border-[#f1c3bd] bg-[#fff3f2] px-4 py-3 text-[#b42318]">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
            <p className="text-sm font-medium">{error}</p>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
              className="rounded-md p-1 text-[#b42318] transition-colors hover:bg-[#f9d7d3]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : success ? (
        <div className="border-b border-[#cde8d1] bg-[#effaf2] px-4 py-3 text-[#166534]">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
            <p className="text-sm font-medium">{success}</p>
            <button
              type="button"
              aria-label="Dismiss success"
              onClick={() => setSuccess(null)}
              className="rounded-md p-1 text-[#166534] transition-colors hover:bg-[#d8f1dd]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      <Outlet />
      {location.pathname !== "/contactus" ? (
        <Link
          to="/contactus"
          state={{ page: `${location.pathname}${location.search}${location.hash}` }}
          className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border border-[#d7d7d7] bg-[#ffffff] px-3 py-2 text-sm font-medium text-[#111111] shadow-[0_8px_24px_rgba(17,17,17,0.08)] transition-colors hover:bg-[#f5f5f5]"
        >
          <Bug className="h-4 w-4" />
          Bug report
        </Link>
      ) : null}
      <FiltersModal isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} />
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
