// Sends a PPI-session request to GoHighLevel when GHL_API_KEY (a Private
// Integration token) and GHL_LOCATION_ID are set. Without them, requests are
// still saved and can be downloaded from the staff Settings tab.
const BASE = 'https://services.leadconnectorhq.com';

export async function sendToGhl(env, lead, summary) {
  if (!env.GHL_API_KEY || !env.GHL_LOCATION_ID) return 'no (not set up)';
  const headers = {
    Authorization: `Bearer ${env.GHL_API_KEY}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  try {
    const res = await fetch(`${BASE}/contacts/upsert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        firstName: lead.first,
        lastName: lead.last || undefined,
        email: lead.email,
        phone: lead.phone || undefined,
        source: 'Cider Run Jump & Speed Contest',
        tags: ['cider run', 'ppi session request'],
      }),
    });
    if (!res.ok) return `error ${res.status}: ${(await res.text()).slice(0, 180)}`;
    const data = await res.json();
    const id = data?.contact?.id;
    if (id) {
      await fetch(`${BASE}/contacts/${id}/notes`, {
        method: 'POST', headers, body: JSON.stringify({ body: summary }),
      }).catch(() => {});
    }
    return 'yes';
  } catch (e) {
    return `error: ${String(e.message || e).slice(0, 180)}`;
  }
}
