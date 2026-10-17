// Sends every visit to the event's own address, so links, QR codes and
// results cards always say cider.theplatformpt.com, never *.pages.dev.
// Set CANONICAL_HOST in Cloudflare to change the address; set it to "off" to disable.
const DEFAULT_HOST = 'cider.theplatformpt.com';

export async function onRequest({ request, env, next }) {
  const host = (env.CANONICAL_HOST || DEFAULT_HOST).trim();
  const url = new URL(request.url);
  if (host !== 'off' && url.hostname.endsWith('.pages.dev')) {
    url.hostname = host; url.protocol = 'https:'; url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
