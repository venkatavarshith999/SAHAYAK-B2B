/**
 * SAHAYAK B2B — Client-Side Router
 * Hash-based routing with query-string support and duplicate-event protection.
 */

const routes = new Map();
let currentRoute = null;
let lastHandledRaw = null;

export function route(path, handler) {
  routes.set(path, handler);
}

export function navigate(path, replace = false) {
  const targetHash = '#' + path;
  if (replace) {
    history.replaceState(null, '', targetHash);
  } else {
    history.pushState(null, '', targetHash);
  }
  handleRoute(true);
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const qIndex = raw.indexOf('?');
  const pathname = qIndex >= 0 ? (raw.slice(0, qIndex) || '/') : raw;
  const queryString = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  const query = Object.fromEntries(new URLSearchParams(queryString).entries());
  return { pathname, query, raw };
}

function matchRoute(pathname) {
  if (routes.has(pathname)) return { handler: routes.get(pathname), params: {} };

  for (const [pattern, handler] of routes) {
    if (pattern === '*') continue;
    const patternParts = pattern.split('/');
    const pathParts = pathname.split('/');
    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let matched = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler, params };
  }

  return null;
}

async function handleRoute(force = false) {
  const { pathname, query, raw } = parseHash();
  // Prevent duplicate execution when browsers fire both popstate & hashchange on <a href="#/...">
  if (!force && raw === lastHandledRaw) return;
  lastHandledRaw = raw;

  const match = matchRoute(pathname);
  if (!match) {
    const fallback = routes.get('*') || routes.get('/');
    if (fallback) fallback({}, query, raw);
    return;
  }

  const app = document.getElementById('app');
  if (app) {
    app.style.opacity = '0';
    app.style.transition = 'opacity 0.15s ease';
  }

  currentRoute = pathname;
  await match.handler(match.params, query, raw);

  if (app) {
    requestAnimationFrame(() => {
      app.style.opacity = '1';
    });
  }
}

export function getCurrentRoute() {
  return currentRoute;
}

export function startRouter() {
  window.addEventListener('hashchange', () => handleRoute(false));
  window.addEventListener('popstate', () => handleRoute(false));
  handleRoute(true);
}
