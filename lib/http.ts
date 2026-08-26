// Next.js 16's dev server normalizes a "127.0.0.1" request host to
// "localhost" when constructing `request.url` (vercel/next.js#79182), so
// redirect targets built from `request.url` silently switch origin and drop
// origin-scoped cookies (e.g. the Spotify session). Read the Host header
// directly instead, since it isn't run through that normalization.
export function resolveRequestOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    return new URL(request.url).origin;
  }

  const protocol =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(/:$/, "");

  return `${protocol}://${host}`;
}
