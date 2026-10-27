// Shared TidyCal helpers for the Pages Functions. Lives outside public/ so it is never served.

const API = "https://tidycal.com/api";
const DAYS_AHEAD = 60;
const SLOTS_TTL = 60; // seconds; a booking made on this site clears it immediately

export async function tidycal(env, path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.TIDYCAL_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// Cache key is a fake URL on our own origin; the Cache API needs a Request-like key.
function slotsKey(origin, env) {
  return new Request(`${origin}/__cache/slots/${env.BOOKING_TYPE_ID}`);
}

export async function getSlots(env, origin, { fresh = false } = {}) {
  const cache = caches.default;
  const key = slotsKey(origin, env);
  if (!fresh) {
    const hit = await cache.match(key);
    if (hit) return hit.json();
  }

  const now = new Date();
  const end = new Date(now.getTime() + DAYS_AHEAD * 864e5);
  const qs = new URLSearchParams({ starts_at: now.toISOString(), ends_at: end.toISOString() });
  const [slots, type] = await Promise.all([
    tidycal(env, `/booking-types/${env.BOOKING_TYPE_ID}/timeslots?${qs}`),
    tidycal(env, `/booking-types/${env.BOOKING_TYPE_ID}`),
  ]);
  if (!slots.ok) throw new Error(`TidyCal timeslots ${slots.status}`);

  // A booking question whose text mentions "phone" becomes the phone field on the page.
  const questions = (type.ok && (type.body.data || type.body).booking_type_questions) || [];
  const phoneQ = questions.find((q) => /phone/i.test(q.question || ""));

  const data = {
    slots: (slots.body.data || [])
      .filter((s) => (s.available_bookings ?? 1) > 0)
      .map((s) => s.starts_at.replace(/\.\d+Z$/, "Z")),
    phoneQuestionId: phoneQ ? phoneQ.id : null,
    phoneRequired: phoneQ ? Boolean(phoneQ.is_required ?? phoneQ.required) : false,
  };

  await cache.put(
    key,
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${SLOTS_TTL}` },
    })
  );
  return data;
}

export async function clearSlots(env, origin) {
  await caches.default.delete(slotsKey(origin, env));
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
