import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Dexter | AI Experiment Plan Generator" },
      { name: "description", content: "Dexter turns hypotheses into runnable experiment plans." },
      { name: "author", content: "Dexter" },
      { property: "og:title", content: "Dexter | AI Experiment Plan Generator" },
      { property: "og:description", content: "Dexter turns hypotheses into runnable experiment plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Dexter" },
      { name: "twitter:title", content: "Dexter | AI Experiment Plan Generator" },
      { name: "twitter:description", content: "Dexter turns hypotheses into runnable experiment plans." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e2922c3d-3021-4234-8824-2217c0e2f330/id-preview-1a503d28--e642a5d1-5dad-4421-bae1-ed8eec222dd2.lovable.app-1777191287726.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e2922c3d-3021-4234-8824-2217c0e2f330/id-preview-1a503d28--e642a5d1-5dad-4421-bae1-ed8eec222dd2.lovable.app-1777191287726.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
