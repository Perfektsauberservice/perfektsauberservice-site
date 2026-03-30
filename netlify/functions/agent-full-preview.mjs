
import { readFile } from "node:fs/promises";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function readJsonRelative(relPath) {
  try {
    const url = new URL(relPath, import.meta.url);
    const raw = await readFile(url, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function titleCase(text) {
  return String(text || "")
    .split("-")
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function buildCandidates(city, service) {
  const templates = Array.isArray(service.questionTemplates) ? service.questionTemplates : [];
  return templates.map((template, idx) => {
    const topic = template.replaceAll("{city}", city.name);
    return {
      priority: Math.max(10 - idx, 1),
      topic,
      primaryKeyword: `${service.name} ${city.name}`,
      secondaryKeywords: uniq([
        `${service.name} Kosten ${city.name}`,
        `${service.name} Ablauf ${city.name}`,
        `${service.name} Termin ${city.name}`
      ]),
      searchIntent: idx === 0 ? "informational/commercial" : "informational",
      format: idx === 0 ? "FAQ" : "Artikel",
      supportsPage: city.servicePage || `${service.slug}-${city.slug}.html`,
      duplicateDecision: "create new",
      cannibalizationRisk: "low",
      matchedExisting: null
    };
  });
}

function buildDuplicate(recommended, publicationState, contentIndex) {
  const stateItems = Array.isArray(publicationState?.items) ? publicationState.items : [];
  const indexItems = Array.isArray(contentIndex?.items) ? contentIndex.items : [];
  const allSlugs = uniq([
    ...stateItems.map(i => i.slug),
    ...indexItems.map(i => i.slug),
  ]);

  const recSlug = slugify(recommended.topic);
  const exact = allSlugs.find(s => s === recSlug);

  if (exact) {
    return {
      status: "update existing",
      reason: "Matching slug already exists.",
      risk: "high",
      affected: exact
    };
  }

  return {
    status: "create new",
    reason: "No matching slug found in lightweight preview mode.",
    risk: "low",
    affected: null
  };
}

function buildWriter(recommended, city, service) {
  const slug = slugify(recommended.topic);
  const title = recommended.topic;
  return {
    title,
    metaTitle: `${title} | Perfekt Sauber Service`,
    metaDescription: `Klarer Überblick zu ${normalizeText(title).replaceAll("-", " ")} - mit Ablauf, Kosten, FAQ und schneller Anfrage für ${city.name}.`,
    slug,
    h1: title,
    format: recommended.format,
    primaryKeyword: recommended.primaryKeyword,
    secondaryKeywords: recommended.secondaryKeywords,
    supportsPage: recommended.supportsPage,
    outline: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie läuft ${service.name} in ${city.name} ab?`,
      `Wovon hängen Preis und Aufwand ab?`,
      `Häufige Fragen zu ${service.name} in ${city.name}`
    ],
    faq: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie schnell bekommt man einen Termin in ${city.name}?`,
      `Was beeinflusst den Preis bei ${service.name}?`
    ]
  };
}

function buildGeo(recommended, city, service) {
  return {
    directAnswer: `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: [
      `${service.name} in ${city.name} wird meist nach Aufwand, Menge und Zugänglichkeit kalkuliert.`,
      `Für ${city.name} ist eine erste Einschätzung oft schon nach Fotos per WhatsApp möglich.`
    ],
    faqImprovements: [
      `Wie schnell ist ein Termin in ${city.name} möglich?`,
      `Was beeinflusst den Preis am stärksten?`,
      `Wann lohnt sich eine Vor-Ort-Besichtigung?`
    ],
    semanticSuggestions: [
      `${service.name} ${city.name}`,
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`
    ]
  };
}

function buildLocalAdaptation(city) {
  const neighbors = {
    rastatt: ["Baden-Baden", "Gaggenau", "Kuppenheim"],
    "baden-baden": ["Rastatt", "Sinzheim", "Bühl"],
    gaggenau: ["Rastatt", "Gernsbach", "Kuppenheim"],
    karlsruhe: ["Ettlingen", "Rastatt", "Malsch"]
  };
  const zones = neighbors[city.slug] || [];
  return {
    localizedIntro: `${city.name} und Umgebung: schnelle Rückmeldung, klare Kommunikation und saubere Übergabe.`,
    localElementsAdded: zones,
    faqTweaks: zones.map(z => `Sind auch Termine rund um ${z} möglich?`),
    ctaVariation: `Jetzt Fotos aus ${city.name} senden und Einschätzung erhalten`
  };
}

function buildInternalLinking(recommended) {
  return {
    linksOut: [
      recommended.supportsPage,
      "preisrechner.html",
      "blog.html"
    ],
    linksIn: [
      "index.html",
      recommended.supportsPage
    ],
    anchorTexts: [
      recommended.primaryKeyword,
      "Kosten einer Entrümpelung",
      "Preisrechner"
    ]
  };
}

function buildLeadConversion(city) {
  return {
    topCta: "Jetzt kostenlose Einschätzung per WhatsApp anfragen",
    middleCta: "Preisorientierung in 1 Minute berechnen",
    bottomCta: `Fotos aus ${city.name} senden und exaktes Angebot erhalten`,
    buttonTexts: ["WhatsApp Anfrage", "Preisrechner starten", "Kostenloses Angebot"],
    microConversion: `Senden Sie Fotos aus ${city.name} per WhatsApp und erhalten Sie schnell eine erste Einschätzung.`
  };
}

export default async function handler(request) {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "POST only" }, 405);
    }

    const body = await request.json().catch(() => ({}));
    const cityInput = normalizeText(body.city);
    const serviceInput = normalizeText(body.service);

    const citiesJson = await readJsonRelative("../../agent/config/cities.json");
    const servicesJson = await readJsonRelative("../../agent/config/services.json");
    const goalsJson = await readJsonRelative("../../agent/config/goals.json");
    const publicationState = await readJsonRelative("../../agent/state/publication-state.json");
    const contentIndex = await readJsonRelative("../../agent/state/content-index.json");

    const cities = Array.isArray(citiesJson?.cities) ? citiesJson.cities : [];
    const services = Array.isArray(servicesJson?.services) ? servicesJson.services : [];

    const city = cities.find(c =>
      normalizeText(c.slug) === cityInput || normalizeText(c.name) === cityInput
    );
    const service = services.find(s =>
      normalizeText(s.slug) === serviceInput || normalizeText(s.name) === serviceInput
    );

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
    const recommended = candidates[0] || null;
    const duplicate = recommended
      ? buildDuplicate(recommended, publicationState, contentIndex)
      : null;
    const writer = recommended ? buildWriter(recommended, city, service) : null;
    const geo = recommended ? buildGeo(recommended, city, service) : null;
    const localAdaptation = recommended ? buildLocalAdaptation(city) : null;
    const internalLinking = recommended ? buildInternalLinking(recommended) : null;
    const leadConversion = recommended ? buildLeadConversion(city) : null;

    return jsonResponse({
      ok: true,
      mode: "preview",
      city: { slug: city.slug, name: city.name },
      service: { slug: service.slug, name: service.name },
      goals: goalsJson || {},
      candidates,
      recommended,
      duplicate,
      writer,
      geo,
      localAdaptation,
      internalLinking,
      leadConversion
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      errorType: error?.name || "Error",
      errorMessage: error?.message || String(error)
    }, 500);
  }
}
