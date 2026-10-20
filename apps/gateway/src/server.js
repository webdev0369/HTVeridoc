/**
 * HTVeriDoc API gateway — same public URLs, fans out to microservice slices.
 * Web keeps NEXT_PUBLIC_API_URL → this process (default :3001).
 */
const http = require('http');
const httpProxy = require('http-proxy');

const PORT = Number(process.env.PORT || process.env.GATEWAY_PORT || 3001);

const targets = {
  identity: process.env.IDENTITY_URL || 'http://127.0.0.1:3011',
  documents: process.env.DOCUMENTS_URL || 'http://127.0.0.1:3012',
  processing: process.env.PROCESSING_URL || 'http://127.0.0.1:3013',
  review: process.env.REVIEW_URL || 'http://127.0.0.1:3014',
  integrations: process.env.INTEGRATIONS_URL || 'http://127.0.0.1:3015',
};

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  xfwd: true,
});

proxy.on('error', (err, _req, res) => {
  console.error('[gateway] proxy error:', err.message);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Bad gateway', detail: err.message }));
  }
});

function pickTarget(method, urlPath) {
  const path = urlPath.split('?')[0];

  if (path === '/health' || path === '/health/ready') return null; // local

  if (
    path.startsWith('/auth') ||
    path.startsWith('/users') ||
    path.startsWith('/organizations')
  ) {
    return targets.identity;
  }

  if (path.startsWith('/integrations')) {
    return targets.integrations;
  }

  if (path.startsWith('/ai') || path.startsWith('/queue')) {
    return targets.processing;
  }

  if (path.startsWith('/field-config') || path.startsWith('/document-queues')) {
    return targets.documents;
  }

  // /documents/:id/... — most specific first
  const docMatch = /^\/documents\/([^/]+)(?:\/(.*))?$/.exec(path);
  if (docMatch) {
    const rest = docMatch[2] || '';
    const m = method.toUpperCase();

    if (rest === 'export' || rest.startsWith('export/')) {
      return targets.integrations;
    }
    if (rest === 'process') {
      return targets.processing;
    }
    if (rest === 'events') {
      return targets.processing;
    }
    if (rest === 'extraction' && m === 'GET') {
      return targets.processing;
    }
    if (
      rest === 'review/start' ||
      rest === 'approve' ||
      rest === 'reject' ||
      rest === 'reopen' ||
      rest === 'validation' ||
      rest === 'validate' ||
      rest.startsWith('extraction/')
    ) {
      return targets.review;
    }
    // CRUD, file, queue assignment
    return targets.documents;
  }

  if (path === '/documents' || path.startsWith('/documents?')) {
    return targets.documents;
  }

  // Unknown → documents as safe default for list-ish paths
  return targets.documents;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || '/';
  const pathOnly = urlPath.split('?')[0];

  if (pathOnly === '/health' || pathOnly === '/health/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'gateway',
        targets,
      }),
    );
    return;
  }

  const target = pickTarget(req.method || 'GET', urlPath);
  if (!target) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not found' }));
    return;
  }

  proxy.web(req, res, { target });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[gateway] listening on http://0.0.0.0:${PORT}`);
  console.log('[gateway] targets:', targets);
});
