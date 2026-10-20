import { NextResponse } from 'next/server';

/** Liveness for Railway / Docker — must return 2xx (not a redirect). */
export function GET() {
  return NextResponse.json({ status: 'ok', service: 'htveridoc-web' });
}
