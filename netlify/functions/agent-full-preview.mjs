
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(value = "") {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readJson(relativePath, fallback = null) {
  const fullPath = path.join(repoRoot, relativePath);
  try {
    const raw = await fs.readFile(fullPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function findCity(cities, input) {
  const n = normalize(input);
  return cities.find(c => normalize(c.slug) === n || normalize(c.name) === n) || null;
}

function findService(services, input) {
  const n = normalize(input);
  return services.find(s => normalize(s.slug) === n || normalize(s.name) === n) || null;
}

function buildCandidates(city, service) {
  const templates = Array.isArray(service.questionTemplates) ? service.questionTemplates : [];
  return templates.map((tpl, i) => {
    const topic = tpl.replaceAll("{city}", city.name);
    const intent = /kostet|preise|kosten/i.test(topic) ? "informational/commercial" : "informational";
    const format = /was kostet|preise|kosten/i.test(topic) ? "FAQ" : "article";
    const primaryKeyword = `${service.name} ${city.name}`;
    const secondaryKeywords = [
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`,
      `${service.name} Termin ${city.name}`
    ];
    return {
      priority: Math.max(10 - i, 7),
      topic,
      primaryKeyword,
      secondaryKeywords,
      searchIntent: intent,
      format,
      supportsPage: city.servicePage || `${service.slug}-${city.slug}.html`
    };
  });
}

function duplicateCheck(candidates, contentIndex, publicationState) {
  const items = [
    ...((contentIndex && Array.isArray(contentIndex.items)) ? contentIndex.items : []),
    ...((publicationState && Array.isArray(publicationState.items)) ? publicationState.items : [])
  ];

  return candidates.map(candidate => {
    const candSlug = slugify(candidate.topic);
    const existing = items.find(item => {
      const s = normalize(item.slug || "");
      const t = normalize(item.title || item.topic || "");
      return s === candSlug || t === normalize(candidate.topic);
    });

    if (existing) {
      return {
        ...candidate,
        duplicateDecision: "update existing",
        cannibalizationRisk: "high",
        matchingExisting: existing.slug || existing.title || null
      };
    }

    return {
      ...candidate,
      duplicateDecision: "create new",
      cannibalizationRisk: "low",
      matchingExisting: null
    };
  });
}

function pickRecommended(candidates) {
  return [...candidates].sort((a,b) => b.priority - a.priority)[0] || null;
}

function buildWriter(recommended, city, service) {
  const slug = slugify(recommended.topic);
  const title = recommended.topic;
  return {
    title,
    metaTitle: `${title} | Perfekt Sauber Service`,
    metaDescription: `Klare Antwort zu ${normalize(service.name)} in ${city.name}: Ablauf, Kosten, FAQ und direkte Anfrage per WhatsApp.`,
    slug,
    h1: title,
    format: recommended.format,
    primaryKeyword: recommended.primaryKeyword,
    secondaryKeywords: recommended.secondaryKeywords,
    supportsPage: recommended.supportsPage,
    outline: [
      { h2: `Was kostet ${service.name} in ${city.name}?`, h3: ["Preisfaktoren", "Orientierungswerte"] },
      { h2: `Wie läuft ${service.name} in ${city.name} ab?`, h3: ["Anfrage", "Besichtigung", "Räumung", "Übergabe"] },
      { h2: `Für wen ist der Service sinnvoll?`, h3: ["Wohnungen", "Häuser", "Keller und Garagen"] },
      { h2: `Häufige Fragen`, h3: ["Termin", "Dauer", "Entsorgung", "Besenrein"] }
    ],
    faq: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie schnell bekommt man einen Termin in ${city.name}?`,
      `Was beeinflusst den Preis am stärksten?`,
      `Ist eine besenreine Übergabe möglich?`
    ],
    geoDirectAnswers: [
      `${service.name} in ${city.name} ist meist kurzfristig planbar, wenn Bilder oder eine kurze Beschreibung vorliegen.`,
      `Der Preis hängt vor allem von Volumen, Zugänglichkeit und Entsorgungsaufwand ab.`,
      `Für eine schnelle Einschätzung reichen oft Fotos per WhatsApp.`
    ]
  };
}

function buildGeo(writer, city, service) {
  return {
    directAnswer: `${service.name} in ${city.name} kann nach kurzer Prüfung schnell eingeschätzt und terminiert werden.`,
    missingSections: [],
    quoteReadyLines: writer.geoDirectAnswers,
    faqImprovements: writer.faq
  };
}

function buildLinking(writer, city) {
  return {
    linksOut: [
      city.servicePage || writer.supportsPage,
      "preisrechner.html",
      "blog.html"
    ],
    linksIn: [
      "blog.html"
    ],
    anchors: [
      `${writer.primaryKeyword}`,
      "Kosten einer Entrümpelung",
      "Preisrechner"
    ]
  };
}

function buildConversion(city, service) {
  return {
    top: "Jetzt kostenlose Einschätzung per WhatsApp anfragen",
    middle: "Preisorientierung in 1 Minute berechnen",
    bottom: "Fotos senden und exaktes Angebot erhalten",
    buttonTexts: {
      whatsapp: "WhatsApp Anfrage",
      calculator: "Preisrechner starten",
      final: "Jetzt Angebot anfragen"
    },
    microCopy: `${service.name} in ${city.name}: kurze Anfrage, schnelle Rückmeldung, klare Preisorientierung.`
  };
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST only" }, 405);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const citiesConfig = await readJson("agent/config/cities.json", { cities: [] });
  const servicesConfig = await readJson("agent/config/services.json", { services: [] });
  const goals = await readJson("agent/config/goals.json", {});
  const contentIndex = await readJson("agent/state/content-index.json", { items: [] });
  const publicationState = await readJson("agent/state/publication-state.json", { items: [] });

  const city = findCity(citiesConfig.cities || [], body.city || "");
  const service = findService(servicesConfig.services || [], body.service || "");

  if (!city || !service) {
    return jsonResponse({
      ok: false,
      error: "Unknown city or service",
      city: body.city ?? null,
      service: body.service ?? null,
      acceptedCityExamples: (citiesConfig.cities || []).slice(0,4).map(c => ({ slug: c.slug, name: c.name })),
      acceptedServiceExamples: (servicesConfig.services || []).slice(0,4).map(s => ({ slug: s.slug, name: s.name }))
    }, 400);
  }

  const candidates = duplicateCheck(buildCandidates(city, service), contentIndex, publicationState);
  const recommended = pickRecommended(candidates);
  const writer = recommended ? buildWriter(recommended, city, service) : null;
  const geo = writer ? buildGeo(writer, city, service) : null;
  const linking = writer ? buildLinking(writer, city) : null;
  const conversion = buildConversion(city, service);

  return jsonResponse({
    ok: true,
    mode: "preview",
    city,
    service,
    goals,
    candidates,
    recommended,
    duplicate: recommended ? {
      decision: recommended.duplicateDecision,
      risk: recommended.cannibalizationRisk,
      matchingExisting: recommended.matchingExisting
    } : null,
    writer,
    geo,
    linking,
    conversion
  });
}
