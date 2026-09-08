// Entsorgungskosten-Rechner — photo analysis Netlify Function.
//
// Per the approved design spec, the AI here ONLY identifies material
// categories + a rough quantity estimate from Besichtigung photos. It never
// computes a cost or a price — that stays entirely in
// assets/js/entsorgungskosten-calc.mjs, run client-side against the
// confirmed (human-reviewed) quantities. This function is a thin, isolated
// wrapper: it does not touch GA4/gclid/UTM/form_submit/phone/WhatsApp
// tracking, Ads, GBP, or the Vault, and is not linked from anywhere
// indexable.
//
// Env vars required:
//   ANTHROPIC_API_KEY — same var already used by netlify/functions/telegram-bot.mjs
//
// Request:  POST { images: [{ mediaType: "image/jpeg"|"image/png"|"image/webp", data: "<base64>" }, ...] }
// Response: 200 { items: [{ categoryId, label, quantityGuess, note }] }
//           4xx/5xx { error }

import { readFileSync } from "node:fs";
import path from "node:path";

const MAX_IMAGES = 5; // known Netlify Functions free-tier ~10s timeout risk, see design spec
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function loadFeeTable() {
  const jsonPath = path.join(process.cwd(), "data", "entsorgungsgebuehren-2026.json");
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}

export function buildSystemPrompt(feeTable) {
  const categoryList = feeTable.categories
    .map((c) => `- ${c.id}: ${c.label}`)
    .join("\n");

  return `Ești un asistent care ajută o firmă de Entrümpelung (PSS) să identifice tipurile de deșeuri/materiale dintr-o poză făcută la o vizită de Besichtigung.

Categoriile PERMISE (folosește DOAR aceste id-uri, niciodată altele):
${categoryList}

Pentru fiecare poză, identifică ce categorii de materiale sunt vizibile. Pentru fiecare categorie găsită, estimează o cantitate aproximativă (volum în m³ SAU greutate aproximativă în kg SAU număr de bucăți, orice e mai natural pentru acea categorie) — este DOAR o estimare vizuală de pornire, un om o va verifica și corecta manual înainte de orice calcul de cost.

NU calcula niciun preț sau cost. NU inventa categorii care nu sunt în lista de mai sus. Dacă nu ești sigur, marchează asta explicit în "note".

Răspunde DOAR cu JSON valid, fără text suplimentar, în acest format exact:
{"items": [{"categoryId": "<id din listă>", "quantityGuess": "<text scurt, ex: 'aprox. 1.5 m³' sau 'aprox 300kg' sau '3 bucăți'>", "note": "<opțional, orice incertitudine>"}]}

Dacă nu identifici nimic relevant: {"items": []}`;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("entsorgungskosten-analyze: lipsește ANTHROPIC_API_KEY");
    return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const images = Array.isArray(payload.images) ? payload.images : [];
  if (images.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "No images provided" }) };
  }
  if (images.length > MAX_IMAGES) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Max ${MAX_IMAGES} poze per cerere (limită Netlify Function timeout)` }),
    };
  }
  for (const img of images) {
    if (!img || !ALLOWED_MEDIA_TYPES.has(img.mediaType) || typeof img.data !== "string" || !img.data) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid image entry" }) };
    }
  }

  const feeTable = loadFeeTable();
  const systemPrompt = buildSystemPrompt(feeTable);
  const validIds = new Set(feeTable.categories.map((c) => c.id));

  const content = [
    { type: "text", text: "Analizează pozele următoare și identifică materialele conform instrucțiunilor." },
    ...images.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    })),
  ];

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });
  } catch (err) {
    console.error("entsorgungskosten-analyze: fetch failed", err);
    return { statusCode: 502, body: JSON.stringify({ error: "AI request failed" }) };
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error("entsorgungskosten-analyze: Anthropic API error", errText);
    return { statusCode: 502, body: JSON.stringify({ error: "AI request failed" }) };
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim() || "";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("entsorgungskosten-analyze: could not parse AI response", raw);
    return { statusCode: 502, body: JSON.stringify({ error: "AI response was not valid JSON" }) };
  }

  if (!Array.isArray(parsed.items)) {
    // parsed is valid JSON but not the {items:[...]} shape the prompt asks
    // for — treat as a failed analysis, not a silent "found nothing". A
    // genuine "AI found nothing" is items:[] with the correct shape, which
    // is allowed through below and still blocks the calculator's "Weiter"
    // button client-side until a human adds a category manually.
    console.error("entsorgungskosten-analyze: AI response missing items array", raw);
    return { statusCode: 502, body: JSON.stringify({ error: "AI response did not match expected format" }) };
  }

  const safeItems = parsed.items
    .filter((item) => item && validIds.has(item.categoryId))
    .map((item) => {
      const category = feeTable.categories.find((c) => c.id === item.categoryId);
      return {
        categoryId: item.categoryId,
        label: category.label,
        quantityGuess: typeof item.quantityGuess === "string" ? item.quantityGuess : "",
        note: typeof item.note === "string" ? item.note : "",
      };
    });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: safeItems }),
  };
}
