import type { NextConfig } from 'next';

/**
 * Origins allowed to embed /editor and document review in an iframe
 * (partner product UI). Space-separated list, e.g.
 * "https://app.totalctrl.example http://localhost:4200"
 * Default "*" so partner tester embeds work out of the box; tighten in prod.
 */
const frameAncestors =
  process.env.EDITOR_FRAME_ANCESTORS?.trim() || '*';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    // CSP frame-ancestors controls who may iframe the PDF/review UI.
    const csp = `frame-ancestors ${frameAncestors}`;
    return [
      {
        source: '/editor/:path*',
        headers: [{ key: 'Content-Security-Policy', value: csp }],
      },
      {
        source: '/documents/:path*',
        headers: [{ key: 'Content-Security-Policy', value: csp }],
      },
    ];
  },
};

export default nextConfig;
