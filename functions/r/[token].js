// Serves the results-card page for /r/<token>; the page reads the token from the URL.
export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(new URL('/r/', request.url));
  return new Response(res.body, { status: res.status, headers: res.headers });
}
