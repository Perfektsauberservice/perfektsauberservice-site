
import fs from "fs";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function safeReadJson(relPath) {
  try {
    const url = new URL(relPath, import.meta.url);
    const raw = fs.readFileSync(url, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
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

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function loadConfig() {
  const citiesDoc = safeReadJson("../../agent/config/cities.json") || { cities: [] };
  const servicesDoc = safeReadJson("../../agent/config/services.json") || { services: [] };
  const goalsDoc = safeReadJson("../../agent/config/goals.json") || {
    goals: ["lead generation", "local seo", "geo"]
  };
  const contentIndex =
    safeReadJson("../../agent/state/content-index.json") ||
    safeReadJson("../../content/auto/blog-index.json") ||
    { items: [] };
  const publicationState =
    safeReadJson("../../agent/state/publication-state.json") || { items: [] };

  return {
    cities: Array.isArray(citiesDoc.cities) ? citiesDoc.cities : [],
    services: Array.isArray(servicesDoc.services) ? servicesDoc.services : [],
    goals: Array.isArray(goalsDoc.goals) ? goalsDoc.goals : [],
    contentIndexItems: Array.isArray(contentIndex.items) ? contentIndex.items : [],
    publicationItems: Array.isArray(publicationState.items) ? publicationState.items : []
  };
}

function findCity(cities, input) {
  const n = normalizeText(input);
  return (
    cities.find(c => normalizeText(c.slug) === n) ||
    cities.find(c => normalizeText(c.name) === n) ||
    null
  );
}

function findService(services, input) {
  const n = normalizeText(input);
  return (
    services.find(s => normalizeText(s.slug) === n) ||
    services.find(s => normalizeText(s.name) === n) ||
    null
  );
}

function buildCandidates(city, service) {
  const templates = Array.isArray(service.questionTemplates) ? service.questionTemplates : [];
  const primaryKeyword = `${service.name} ${city.name}`;
  return templates.map((tpl, i) => {
    const topic = String(tpl).replace(/\{city\}/g, city.name);
    const slug = slugify(topic);
    return {
      priority: Math.max(10 - i, 1),
      topic,
      primaryKeyword,
      secondaryKeywords: uniq([
        `${service.name} Kosten ${city.name}`,
        `${service.name} Ablauf ${city.name}`,
        `${service.name} Termin ${city.name}`
      ]),
      searchIntent: i === 0 ? "informational/commercial" : "commercial/informational",
      format: /kostet|preise/i.test(topic) ? "FAQ" : "article",
      supportsPage: city.servicePage || `${service.slug}-${city.slug}.html`,
      duplicateDecision: "create new",
      cannibalizationRisk: "low",
      matchedExisting: null,
      slug
    };
  });
}

function detectDuplicate(candidate, items) {
  const slug = candidate.slug;
  const topicNorm = normalizeText(candidate.topic);
  const list = Array.isArray(items) ? items : [];

  const bySlug = list.find(item => normalizeText(item.slug || item.url || "") === slug);
  if (bySlug) {
    return {
      status: "update existing",
      reason: "Matching slug already exists.",
      risk: "high",
      affected: bySlug.slug || bySlug.url || null
    };
  }

  const byTopic = list.find(item => normalizeText(item.title || item.topic || "") === topicNorm);
  if (byTopic) {
    return {
      status: "merge with existing",
      reason: "Matching topic already exists.",
      risk: "medium",
      affected: byTopic.slug || byTopic.url || null
    };
  }

  return {
    status: "create new",
    reason: "No matching slug found in preview mode.",
    risk: "low",
    affected: null
  };
}

function buildWriter(city, service, candidate) {
  const title = candidate.topic;
  const slug = candidate.slug;
  const h1 = candidate.topic;
  const format = candidate.format;
  const supportPage = candidate.supportsPage;
  const secondaryKeywords = candidate.secondaryKeywords || [];
  const intro = `Wer eine ${service.name.toLowerCase()} in ${city.name} plant, will vor allem wissen, wie der Ablauf ist, welche Kosten entstehen und wie schnell ein Termin möglich ist. Perfekt Sauber Service beantwortet die wichtigsten Fragen klar, lokal und ohne unnötige Fülltexte.`;
  const outline = [
    { h2: `Was kostet eine ${service.name} in ${city.name}?`, h3: ["Welche Faktoren beeinflussen den Preis?", "Wann lohnt sich eine Vor-Ort-Einschätzung?"] },
    { h2: `Wie läuft eine ${service.name} ab?`, h3: ["Besichtigung", "Sortieren und Räumen", "Besenreine Übergabe"] },
    { h2: `Warum Kunden in ${city.name} anfragen`, h3: ["Schnelle Terminvergabe", "Klare Kommunikation", "Übergabe ohne Stress"] },
    { h2: "Häufige Fragen", h3: ["Wie kurzfristig sind Termine möglich?", "Was muss vorher vorbereitet werden?"] }
  ];
  const faq = [
    {
      q: `Was kostet eine ${service.name} in ${city.name}?`,
      a: `Die Kosten hängen in ${city.name} vor allem von Menge, Zugänglichkeit, Etage, Entsorgungsaufwand und gewünschter Zusatzleistung ab.`
    },
    {
      q: `Wie schnell bekommt man einen Termin?`,
      a: `Eine erste Einschätzung und Terminabstimmung ist meist kurzfristig per WhatsApp oder Telefon möglich.`
    },
    {
      q: `Ist auch eine besenreine Übergabe möglich?`,
      a: `Ja, auf Wunsch kann die Räumung mit besenreiner Übergabe und passenden Zusatzleistungen kombiniert werden.`
    }
  ];
  const geoDirectAnswers = [
    `${service.name} in ${city.name} lässt sich am besten nach Menge, Zugang und Entsorgungsaufwand einschätzen.`,
    `Für ${city.name} ist eine erste Rückmeldung per WhatsApp oft am schnellsten.`,
    `Die wichtigsten Preisfaktoren sind Volumen, Laufwege, Stockwerk und Zusatzleistungen.`
  ];
  const ctas = {
    top: "Jetzt kostenlose Einschätzung per WhatsApp anfragen",
    middle: "Preisorientierung in 1 Minute berechnen",
    bottom: "Fotos senden und exaktes Angebot erhalten"
  };

  return {
    title,
    metaTitle: `${title} | Perfekt Sauber Service`,
    metaDescription: `Klarer Überblick zu ${title.toLowerCase()} – mit Ablauf, Kosten, FAQ und schneller Anfrage für ${city.name}.`,
    slug,
    h1,
    format,
    primaryKeyword: candidate.primaryKeyword,
    secondaryKeywords,
    supportsPage: supportPage,
    intro,
    outline,
    faq,
    geoDirectAnswers,
    ctas
  };
}

function buildGeo(city, service, writer) {
  return {
    directAnswer: `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: [
      `In ${city.name} hängen die Kosten meist von Menge, Zugang und Entsorgungsaufwand ab.`,
      `Eine schnelle Ersteinschätzung ist oft per WhatsApp mit Fotos möglich.`
    ],
    faqImprovements: [
      `Was kostet eine ${service.name} in ${city.name}?`,
      `Wie schnell ist ein Termin möglich?`,
      `Welche Zusatzleistungen sind sinnvoll?`
    ],
    semanticSuggestions: uniq([
      `${service.name} ${city.name}`,
      `${service.name} Kosten ${city.name}`,
      `${service.name} Termin ${city.name}`
    ])
  };
}

function buildLocalAdaptation(city, service, writer) {
  const nearbyMap = {
    "rastatt": ["Baden-Baden", "Gaggenau", "Kuppenheim"],
    "baden-baden": ["Rastatt", "Sinzheim", "Bühl"],
    "gaggenau": ["Rastatt", "Gernsbach", "Kuppenheim"],
    "karlsruhe": ["Rastatt", "Ettlingen", "Malsch"]
  };
  const nearby = nearbyMap[city.slug] || [];
  return {
    localizedIntro: `${service.name} in ${city.name} und Umgebung bedeutet vor allem kurze Abstimmung, klare Preisfaktoren und eine saubere Übergabe. Auch Anfragen aus ${nearby.join(", ")} werden oft mitgedacht.`,
    localElementsAdded: nearby,
    ctaVariant: `Jetzt ${service.name} in ${city.name} per WhatsApp anfragen`,
    faqAdjustments: [
      `Ist ${service.name} auch in ${city.name} und Umgebung kurzfristig möglich?`,
      `Welche Anfahrt ist für ${city.name} relevant?`
    ]
  };
}

function buildInternalLinking(city, service, writer) {
  return {
    linksOut: [
      { target: writer.supportsPage, anchor: `${service.name} ${city.name}` },
      { target: "preisrechner.html", anchor: `${service.name} Kosten berechnen` },
      { target: "blog.html", anchor: "Weitere lokale Ratgeber im Blog" }
    ],
    linksIn: [
      { sourceHint: "blog.html", anchor: `${service.name} ${city.name}` },
      { sourceHint: writer.supportsPage, anchor: `Kosten einer ${service.name}` }
    ]
  };
}

function buildLeadConversion(city, service) {
  return {
    topCta: "Jetzt kostenlose Einschätzung per WhatsApp anfragen",
    middleCta: "Preisorientierung in 1 Minute berechnen",
    bottomCta: "Fotos senden und exaktes Angebot erhalten",
    buttonTexts: {
      whatsapp: `WhatsApp Anfrage ${city.name}`,
      calculator: "Preisrechner starten",
      phone: "Jetzt anrufen"
    },
    microConversions: [
      "2–3 Fotos senden",
      "Kurzmenge beschreiben",
      "Schnelle Ersteinschätzung erhalten"
    ]
  };
}

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "POST only" }, 405);
    }

    const body = await request.json().catch(() => ({}));
    const { cities, services, goals, contentIndexItems, publicationItems } = loadConfig();

    const city = findCity(cities, body.city);
    const service = findService(services, body.service);

    if (!city || !service) {
      return jsonResponse({
        ok: false,
        error: "Unknown city or service",
        city: body.city,
        service: body.service,
        acceptedCityExamples: cities.slice(0, 5).map(c => c.slug),
        acceptedServiceExamples: services.slice(0, 5).map(s => s.slug)
      }, 400);
    }

    const candidates = buildCandidates(city, service);
    const combinedExisting = [...contentIndexItems, ...publicationItems];
    const recommendedBase = candidates[0] || null;

    if (!recommendedBase) {
      return jsonResponse({ ok: false, error: "No candidates available" }, 500);
    }

    const duplicate = detectDuplicate(recommendedBase, combinedExisting);
    const recommended = {
      ...recommendedBase,
      duplicateDecision: duplicate.status,
      cannibalizationRisk: duplicate.risk,
      matchedExisting: duplicate.affected
    };
    const writer = buildWriter(city, service, recommended);
    const geo = buildGeo(city, service, writer);
    const localAdaptation = buildLocalAdaptation(city, service, writer);
    const internalLinking = buildInternalLinking(city, service, writer);
    const leadConversion = buildLeadConversion(city, service);

    return jsonResponse({
      ok: true,
      mode: "preview",
      city,
      service,
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
  } catch (err) {
    return jsonResponse({
      ok: false,
      errorType: err?.name || "Error",
      errorMessage: err?.message || String(err)
    }, 500);
  }
};
