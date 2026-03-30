import fs from "fs";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function safeReadJson(urlObj) {
  try {
    return JSON.parse(fs.readFileSync(urlObj, "utf8"));
  } catch {
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
  const citiesData = safeReadJson(new URL("../../agent/config/cities.json", import.meta.url)) || { cities: [] };
  const servicesData = safeReadJson(new URL("../../agent/config/services.json", import.meta.url)) || { services: [] };
  const goalsData = safeReadJson(new URL("../../agent/config/goals.json", import.meta.url)) || {};
  const rulesData = safeReadJson(new URL("../../agent/config/workflow-rules.json", import.meta.url)) || {};
  const contentIndex = safeReadJson(new URL("../../agent/state/content-index.json", import.meta.url)) || { items: [] };
  const publicationState = safeReadJson(new URL("../../agent/state/publication-state.json", import.meta.url)) || { items: [] };
  const pendingApprovals = safeReadJson(new URL("../../agent/state/pending-approvals.json", import.meta.url)) || { items: [] };

  return {
    cities: Array.isArray(citiesData.cities) ? citiesData.cities : [],
    services: Array.isArray(servicesData.services) ? servicesData.services : [],
    goals: goalsData,
    rules: rulesData,
    contentIndex,
    publicationState,
    pendingApprovals
  };
}

function resolveCity(cities, raw) {
  const q = normalizeText(raw);
  return cities.find(c =>
    normalizeText(c.slug) === q ||
    normalizeText(c.name) === q
  ) || null;
}

function resolveService(services, raw) {
  const q = normalizeText(raw);
  return services.find(s =>
    normalizeText(s.slug) === q ||
    normalizeText(s.name) === q
  ) || null;
}

function buildCandidates(city, service) {
  const templates = Array.isArray(service.questionTemplates) ? service.questionTemplates : [];
  return templates.map((tpl, idx) => {
    const topic = String(tpl).replace(/\{city\}/g, city.name);
    const format = /was kostet|preise|kosten/i.test(topic) ? "FAQ" : "Article";
    const primaryKeyword = `${service.name} ${city.name}`;
    const secondaryKeywords = uniq([
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`,
      `${service.name} Termin ${city.name}`
    ]);
    return {
      priority: Math.max(10 - idx, 1),
      topic,
      primaryKeyword,
      secondaryKeywords,
      searchIntent: /was kostet|preise|kosten/i.test(topic) ? "informational/commercial" : "commercial/informational",
      format,
      supportsPage: city.servicePage || `${service.slug}-${city.slug}.html`,
      duplicatedDecision: "create new",
      cannibalizationRisk: "low",
      matchedExisting: null
    };
  });
}

function buildExistingSlugs(contentIndex, publicationState) {
  const fromIndex = Array.isArray(contentIndex.items) ? contentIndex.items.map(x => x.slug || x.url || "") : [];
  const fromState = Array.isArray(publicationState.items) ? publicationState.items.map(x => x.slug || "") : [];
  return uniq([...fromIndex, ...fromState].map(slugify));
}

function duplicateCheck(candidate, existingSlugs) {
  const candidateSlug = slugify(candidate.topic);
  if (existingSlugs.includes(candidateSlug)) {
    return {
      status: "update existing",
      reason: "Matching slug already exists.",
      risk: "high",
      affected: candidateSlug
    };
  }
  const partial = existingSlugs.find(s =>
    s.includes(slugify(candidate.primaryKeyword)) || slugify(candidate.primaryKeyword).includes(s)
  );
  if (partial) {
    return {
      status: "merge with existing",
      reason: "A closely related slug already exists.",
      risk: "medium",
      affected: partial
    };
  }
  return {
    status: "create new",
    reason: "No matching slug found in preview mode.",
    risk: "low",
    affected: null
  };
}

function buildWriter(city, service, recommended) {
  const slug = slugify(recommended.topic);
  const h1 = recommended.topic;
  const title = recommended.topic;
  const metaTitle = `${recommended.topic} | Perfekt Sauber Service`;
  const metaDescription = `Klarer Überblick zu ${normalizeText(recommended.topic).replace(/-/g, " ")} – mit Ablauf, Kosten, FAQ und schneller Anfrage für ${city.name}.`;
  const outline = [
    { h2: `Was kostet ${service.name} in ${city.name}?`, h3: ["Preisfaktoren", "Typische Spannen", "Schnelle Einschätzung per WhatsApp"] },
    { h2: `Wie läuft ${service.name} in ${city.name} ab?`, h3: ["Besichtigung", "Angebot", "Durchführung"] },
    { h2: `Welche Vorteile hat ein professioneller Service?`, h3: ["Zeit sparen", "Besenreine Übergabe", "Klare Kommunikation"] },
    { h2: `Häufige Fragen zu ${service.name} in ${city.name}`, h3: ["Termin", "Dauer", "Zugang", "Entsorgung"] }
  ];
  const faq = [
    { q: `Was kostet ${service.name} in ${city.name}?`, a: `Die Kosten hängen vor allem von Aufwand, Menge, Zugang und Entsorgung ab.` },
    { q: `Wie schnell bekomme ich einen Termin?`, a: `Oft ist eine erste Einschätzung schnell per WhatsApp möglich.` },
    { q: `Wird besenrein übergeben?`, a: `Ja, auf Wunsch wird der Bereich ordentlich und besenrein übergeben.` }
  ];
  const ctas = {
    top: `Jetzt kostenlose Einschätzung für ${service.name} in ${city.name} anfragen`,
    middle: "Preisorientierung in 1 Minute berechnen",
    bottom: "Fotos senden und exaktes Angebot erhalten"
  };
  return {
    title,
    metaTitle,
    metaDescription,
    slug,
    h1,
    format: recommended.format,
    primaryKeyword: recommended.primaryKeyword,
    secondaryKeywords: recommended.secondaryKeywords,
    supportsPage: recommended.supportsPage,
    outline,
    faq,
    ctas
  };
}

function buildGeo(city, service, writer) {
  return {
    directAnswer: `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: [
      `${service.name} in ${city.name} wird meist nach Menge, Zugang und Aufwand kalkuliert.`,
      `Eine schnelle Ersteinschätzung ist oft schon per WhatsApp mit Fotos möglich.`
    ],
    faqImprovements: writer.faq.map(x => x.q),
    semanticSuggestions: [
      `${service.name} ${city.name} Kosten`,
      `${service.name} ${city.name} Ablauf`,
      `${service.name} ${city.name} Termin`
    ]
  };
}

function buildLocalAdaptation(city) {
  const nearby = {
    "rastatt": ["Baden-Baden", "Gaggenau", "Kuppenheim"],
    "baden-baden": ["Rastatt", "Sinzheim", "Bühl"],
    "gaggenau": ["Rastatt", "Gernsbach", "Kuppenheim"],
    "karlsruhe": ["Rastatt", "Ettlingen", "Malsch"]
  };
  const areas = nearby[city.slug] || [];
  return {
    localizedIntro: `${city.name} und Umgebung wird oft dann angefragt, wenn es schnell, klar und ohne unnötigen Aufwand gehen soll.`,
    localAreasMentioned: areas,
    localCta: `Jetzt ${city.name} per WhatsApp anfragen`,
    changedElements: ["intro", "faq", "cta", "areas", "examples"]
  };
}

function buildInternalLinking(city, service, writer) {
  return {
    linksOut: [
      { href: `/${writer.supportsPage}`, anchor: `${service.name} in ${city.name}` },
      { href: "/preisrechner.html", anchor: "Preisrechner" },
      { href: "/blog", anchor: "weitere lokale Artikel" }
    ],
    linksIn: [
      { source: "/blog.html", anchor: writer.title },
      { source: `/${writer.supportsPage}`, anchor: writer.primaryKeyword }
    ],
    anchorTexts: [
      `${service.name} in ${city.name}`,
      "besenreine Übergabe",
      `Kosten von ${service.name}`
    ]
  };
}

function buildLeadConversion(city, service) {
  return {
    ctaTop: `Jetzt kostenlose Einschätzung für ${service.name} in ${city.name} anfragen`,
    ctaMiddle: "Preisorientierung in 1 Minute berechnen",
    ctaBottom: "Fotos senden und exaktes Angebot erhalten",
    microConversion: "Fotos per WhatsApp senden und schnelle Rückmeldung erhalten",
    channels: ["WhatsApp", "Preisrechner", "Telefon"]
  };
}

function buildImageSuggestions(city, service) {
  const cityImage = city.articleImage || city.heroImage || "";
  const pool = uniq([
    cityImage,
    city.heroImage,
    `images/${city.slug}-${service.slug}-room-before-after.png`,
    `images/${city.slug}-${service.slug}-storage.png`,
    `images/${city.slug}-${service.slug}-team.png`
  ]).filter(Boolean);

  return pool.slice(0, 5).map((src, idx) => ({
    src,
    reason: idx === 0 ? "Best local fit" : idx === 1 ? "City hero alternative" : "Service-related visual variation",
    imageType: idx < 2 ? "city background" : "service visual",
    fitScore: Math.max(95 - idx * 7, 60)
  }));
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "POST only" }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const { cities, services, goals, rules, contentIndex, publicationState, pendingApprovals } = loadConfig();

  const city = resolveCity(cities, body.city);
  const service = resolveService(services, body.service);

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
  const existingSlugs = buildExistingSlugs(contentIndex, publicationState);
  const recommendedBase = candidates[0] || null;

  if (!recommendedBase) {
    return jsonResponse({ ok: false, error: "No candidates generated" }, 500);
  }

  const duplicate = duplicateCheck(recommendedBase, existingSlugs);
  const recommended = {
    ...recommendedBase,
    duplicatedDecision: duplicate.status,
    cannibalizationRisk: duplicate.risk,
    matchedExisting: duplicate.affected
  };

  const writer = buildWriter(city, service, recommended);
  const geo = buildGeo(city, service, writer);
  const localAdaptation = buildLocalAdaptation(city);
  const internalLinking = buildInternalLinking(city, service, writer);
  const leadConversion = buildLeadConversion(city, service);
  const imageSuggestions = buildImageSuggestions(city, service);

  return jsonResponse({
    ok: true,
    mode: "preview",
    city,
    service,
    goals,
    rules,
    pendingApprovals,
    candidates,
    recommended,
    duplicate,
    writer,
    geo,
    localAdaptation,
    internalLinking,
    leadConversion,
    imageSuggestions
  });
};
