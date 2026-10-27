import { tidycal, getSlots, clearSlots, json } from "../../src/tidycal.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ env, request }) {
  const origin = new URL(request.url).origin;
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  // Honeypot: real visitors never see or fill this field.
  if (input.company) return json({ ok: true });

  const name = String(input.name || "").trim().slice(0, 191);
  const email = String(input.email || "").trim().slice(0, 191);
  const phone = String(input.phone || "").trim().slice(0, 40);
  const startsAt = String(input.starts_at || "");
  const timezone = String(input.timezone || "America/Chicago").slice(0, 64);

  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!EMAIL.test(email)) return json({ error: "Please enter a valid email." }, 400);

  // Check against fresh availability, not the cache, so a just-taken slot is caught here.
  const { slots, phoneQuestionId, phoneRequired } = await getSlots(env, origin, { fresh: true });
  if (!slots.includes(startsAt)) {
    return json({ error: "That time was just taken. Please pick another.", slots }, 409);
  }
  if (phoneRequired && !phone) return json({ error: "Please enter your phone number." }, 400);

  const payload = { starts_at: startsAt, name, email, timezone };
  if (phoneQuestionId && phone) {
    payload.booking_questions = [{ booking_type_question_id: phoneQuestionId, answer: phone }];
  }

  const res = await tidycal(env, `/booking-types/${env.BOOKING_TYPE_ID}/bookings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await clearSlots(env, origin);

  if (!res.ok) {
    console.error("TidyCal booking failed", res.status, JSON.stringify(res.body));
    if (res.status === 422 || res.status === 409) {
      const fresh = await getSlots(env, origin, { fresh: true }).catch(() => null);
      return json({ error: "That time was just taken. Please pick another.", slots: fresh?.slots }, 409);
    }
    return json({ error: "Something went wrong booking that time. Please call 615-794-9155." }, 502);
  }

  const booking = res.body.data || res.body;
  return json({ ok: true, starts_at: booking.starts_at || startsAt });
}
