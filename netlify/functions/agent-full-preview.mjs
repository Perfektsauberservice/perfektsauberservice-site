import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function safeReadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function normalizeText(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(v) {
  return normalizeText(v)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadConfig() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const citiesJson =
    safeReadJson(path.join(repoRoot, "agent", "config", "cities.json")) || { cities: [] };
  const servicesJson =
    safeReadJson(path.join(repoRoot, "agent", "config", "services.json")) || { services: [] };
  const goalsJson =
    safeReadJson(path.join(repoRoot, "agent", "config", "goals.json")) || {
      goals: ["lead generation", "local SEO", "GEO support"]
    };
  const contentIndex =
    safeReadJson(path.join(repoRoot, "agent", "state", "content-index.json")) || { items: [] };
  const publicationState =
    safeReadJson(path.join(repoRoot, "agent", "state", "publication-state.json")) || { items: [] };

  return {
    cities: Array.isArray(citiesJson.cities) ? citiesJson.cities : [],
    services: Array.isArray(servicesJson.services) ? servicesJson.services : [],
    goals: goalsJson.goals || goalsJson,
    contentIndex: Array.isArray(contentIndex.items) ? contentIndex.items : [],
    publicationState: Array.isArray(publicationState.items) ? publicationState.items : []
  };
}

function findCity(cities, raw) {
  const n = normalizeText(raw);
  return cities.find(c => normalizeText(c.slug) === n || normalizeText(c.name) === n) || null;
}

function findService(services, raw) {
  const n = normalizeText(raw);
  return services.find(s => normalizeText(s.slug) === n || normalizeText(s.name) === n) || null;
}

function buildCandidates(city, service) {
  const templates = Array.isArray(service.questionTemplates) ? service.questionTemplates : [];
  return templates.map((tpl, idx) => {
    const topic = tpl.replaceAll("{city}", city.name);
    const primaryKeyword = `${service.name} ${city.name}`;
    const secondaryKeywords = uniq([
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`,
      `${service.name} Termin ${city.name}`
    ]);
    return {
      priority: Math.max(10 - idx, 7),
      topic,
      primaryKeyword,
      secondaryKeywords,
      searchIntent: idx === 0 ? "informational/commercial" : "commercial",
      format: idx === 0 ? "FAQ" : "article",
      supportsPage: city.servicePage || `${service.slug}-${city.slug}.html`
    };
  });
}

function duplicateCheck(candidate, existingItems) {
  const candSlug = slugify(candidate.topic);
  const matched = (existingItems || []).find(item => {
    const s = slugify(item.slug || item.title || "");
    return s === candSlug || s.includes(candSlug) || candSlug.includes(s);
  });
  if (!matched) {
    return { status: "create new", reason: "No matching slug found in lightweight preview mode.", risk: "low", affected: null };
  }
  return {
    status: "update existing",
    reason: "A very similar slug/topic already exists.",
    risk: "high",
    affected: matched.slug || matched.title || null
  };
}

function buildWriter(candidate, city, service) {
  const slug = slugify(candidate.topic);
  return {
    title: candidate.topic,
    metaTitle: `${candidate.topic} | Perfekt Sauber Service`,
    metaDescription: `Klarer Überblick zu ${normalizeText(candidate.topic).replaceAll("-", " ")} – mit Ablauf, Kosten, FAQ und schneller Anfrage für ${city.name}.`,
    slug,
    h1: candidate.topic,
    format: candidate.format,
    primaryKeyword: candidate.primaryKeyword,
    secondaryKeywords: candidate.secondaryKeywords,
    supportsPage: candidate.supportsPage,
    outline: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie läuft ${service.name} in ${city.name} ab?`,
      `Für wen eignet sich ${service.name} in ${city.name}?`,
      `Häufige Fragen zu ${service.name} in ${city.name}`
    ],
    faq: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie schnell bekommt man einen Termin in ${city.name}?`,
      `Was beeinflusst den Preis bei ${service.name}?`
    ],
    ctas: {
      top: "Jetzt kostenlose Einschätzung per WhatsApp anfragen",
      middle: "Preisorientierung in 1 Minute berechnen",
      bottom: "Fotos senden und exaktes Angebot erhalten"
    }
  };
}

function buildGeo(candidate, city, service) {
  return {
    directAnswer: `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: [
      `${service.name} in ${city.name} wird meist nach Umfang, Zugang und Entsorgungsaufwand kalkuliert.`,
      `Eine erste Preiseinschätzung ist oft schon mit Fotos per WhatsApp möglich.`
    ],
    faqImprovements: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie läuft ${service.name} in ${city.name} ab?`,
      `Wie schnell bekommt man einen Termin?`
    ],
    semanticSuggestions: [
      `${service.name} ${city.name}`,
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`
    ]
  };
}

function buildLocalAdaptation(candidate, city) {
  return {
    localizedTitle: candidate.topic,
    introVariant: `${candidate.topic} – lokal für ${city.name} und Umgebung formuliert.`,
    localAreas: [city.name],
    addedElements: [`Lokaler Bezug zu ${city.name}`, `CTA mit Bezug auf ${city.name}`]
  };
}

function buildInternalLinking(candidate, city, service) {
  return {
    linksOut: [
      city.servicePage || `${service.slug}-${city.slug}.html`,
      "preisrechner.html",
      "blog.html"
    ],
    linksIn: [
      `blog.html`,
      city.servicePage || `${service.slug}-${city.slug}.html`
    ],
    anchors: [
      `${service.name} in ${city.name}`,
      `Kosten ${service.name} ${city.name}`,
      `Preisrechner`
    ]
  };
}

function buildLeadConversion(candidate, city) {
  return {
    topCta: "Jetzt kostenlose Einschätzung per WhatsApp anfragen",
    middleCta: "Preisorientierung in 1 Minute berechnen",
    bottomCta: "Fotos senden und exaktes Angebot erhalten",
    microCopy: `Senden Sie Fotos aus ${city.name} direkt per WhatsApp für eine schnelle Ersteinschätzung.`
  };
}

export default async (request, context) => {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST only" }, 405);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { cities, services, goals, contentIndex, publicationState } = loadConfig();
  const city = findCity(cities, body.city);
  const service = findService(services, body.service);

  if (!city || !service) {
    return jsonResponse({
      ok: false,
      error: "Unknown city or service",
      city: body.city,
      service: body.service,
      acceptedCityExamples: cities.slice(0, 5).map(c => ({ slug: c.slug, name: c.name })),
      acceptedServiceExamples: services.slice(0, 5).map(s => ({ slug: s.slug, name: s.name }))
    }, 400);
  }

  const candidates = buildCandidates(city, service);
  const existing = [...(contentIndex || []), ...(publicationState || [])];
  const recommendedBase = candidates[0];
  const duplicate = duplicateCheck(recommendedBase, existing);
  const recommended = {
    ...recommendedBase,
    duplicateDecision: duplicate.status,
    cannibalizationRisk: duplicate.risk,
    matchedExisting: duplicate.affected
  };
  const writer = buildWriter(recommended, city, service);
  const geo = buildGeo(recommended, city, service);
  const localAdaptation = buildLocalAdaptation(recommended, city);
  const internalLinking = buildInternalLinking(recommended, city, service);
  const leadConversion = buildLeadConversion(recommended, city);

  return jsonResponse({
    ok: true,
    mode: "preview",
    city: { slug: city.slug, name: city.name },
    service: { slug: service.slug, name: service.name },
    goals,
    candidates,
    recommended,
    duplicate,
    writer,
    geo,
    localAdaptation,
    internalLinking,
    leadConversion
  });
};
