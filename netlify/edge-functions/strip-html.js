// Edge Function: redirect .html URLs to pretty URLs (without .html)
// Runs at edge before any file lookup.
// Netlify netlify.toml redirects cannot strip a suffix from a splat capture,
// so we handle it programmatically here.

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!path.endsWith('.html')) return;

  // Keep 410.html reachable as error page target
  if (path === '/410.html') return;

  // Keep internal dashboard paths (specific rewrites in netlify.toml)
  if (path.startsWith('/dashboard/')) return;

  const newPath = path.slice(0, -5);
  const target = newPath + url.search + url.hash;

  return new Response(null, {
    status: 301,
    headers: {
      location: target,
      'cache-control': 'public, max-age=3600'
    }
  });
};

export const config = {
  path: '/*'
};
