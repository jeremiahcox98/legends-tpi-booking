import { getSlots, json } from "../../src/tidycal.js";

export async function onRequestGet({ env, request }) {
  try {
    const data = await getSlots(env, new URL(request.url).origin);
    return json(data);
  } catch (err) {
    console.error(err);
    return json({ error: "unavailable" }, 502);
  }
}
