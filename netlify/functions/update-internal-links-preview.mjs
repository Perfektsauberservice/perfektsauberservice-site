
import fs from "fs";
import path from "path";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
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

function loadJsonFromRepo(relPath) {
  const candidates = [
    path.resolve(process.cwd(), relPath),
    path.resolve(process.cwd(), ".", relPath),
    path.resolve(process.cwd(), "..", relPath),
  ];
  for (const p of candidates) {
    const data = safeReadJson(p);
    if (data) return data;
  }
  return null;
}

function loadConfig() {
  const citiesWrap = loadJsonFromRepo("agent/config/cities.json") || { cities: [] };
  const servicesWrap = loadJsonFromRepo("agent/config/services.json") || { services: [] };
  const goals = loadJsonFromRepo("agent/config/goals.json") || {
    businessGoals: ["lead generation","local SEO","GEO","support pages"]
  };
  const rules = loadJsonFromRepo("agent/config/workflow-rules.json") || {
    maxNewArticlesPerRun: 1,
    maxUpdatedFilesPerRun: 3,
    maxNewLinksPerFile: 2,
    updateScopes: ["blog"],
    imageApprovalRequired: true,
    preferredImageTypes: ["city-background","before-after","team","van","room"]
  };
  const state = loadJsonFromRepo("agent/state/content-index.json") || {
    articles: [],
    pages: []
  };
  const pubState = loadJsonFromRepo("agent/state/publication-state.json") || {
    date: "1970-01-01",
    count: 0,
    items: []
  };
  const pending = loadJsonFromRepo("agent/state/pending-approvals.json") || { items: [] };
  return {
    cities: citiesWrap.cities || [],
    services: servicesWrap.services || [],
    goals,
    rules,
    state,
    pubState,
    pending
  };
}

function resolveCityAndService(cfg, cityInput, serviceInput) {
  const cityNorm = normalizeText(cityInput);
  const serviceNorm = normalizeText(serviceInput);
  const city = cfg.cities.find(c => normalizeText(c.slug) === cityNorm || normalizeText(c.name) === cityNorm);
  const service = cfg.services.find(s => normalizeText(s.slug) === serviceNorm || normalizeText(s.name) === serviceNorm);
  return { city, service };
}

function buildCandidates(city, service) {
  return (service.questionTemplates || []).map((tpl, idx) => {
    const topic = tpl.replaceAll("{city}", city.name);
    const primaryKeyword = `${service.name} ${city.name}`;
    const secondaryKeywords = uniq([
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`,
      `${service.name} Termin ${city.name}`
    ]);
    return {
      priority: Math.max(10 - idx, 6),
      topic,
      primaryKeyword,
      secondaryKeywords,
      searchIntent: idx === 0 ? "informational/commercial" : "commercial/informational",
      format: idx === 0 ? "FAQ" : "article",
      supportsPage: city.servicePage,
      duplicateDecision: "create new",
      cannibalizationRisk: "low",
      matchedExisting: null
    };
  });
}

function duplicateCheck(candidate, cfg) {
  const slug = slugify(candidate.topic);
  const allExisting = [
    ...(cfg.pubState.items || []).map(x => ({ slug: x.slug, title: x.title || x.topic || x.slug })),
    ...((cfg.state.articles || []).map(x => ({ slug: x.slug, title: x.title || x.slug })))
  ];
  const direct = allExisting.find(x => normalizeText(x.slug) === normalizeText(slug));
  if (direct) {
    return {
      status: "update existing",
      reason: "Matching slug found.",
      risk: "high",
      affected: direct.slug
    };
  }
  const similar = allExisting.find(x => {
    const a = normalizeText(x.title);
    const b = normalizeText(candidate.topic);
    return a && b && (a.includes(b.slice(0, 20)) || b.includes(a.slice(0, 20)));
  });
  if (similar) {
    return {
      status: "merge with existing",
      reason: "Similar topic already exists.",
      risk: "medium",
      affected: similar.slug
    };
  }
  return {
    status: "create new",
    reason: "No matching slug found in lightweight preview mode.",
    risk: "low",
    affected: null
  };
}

function buildWriter(candidate, city, service) {
  const slug = slugify(candidate.topic);
  return {
    title: candidate.topic,
    metaTitle: `${candidate.topic} | Perfekt Sauber Service`,
    metaDescription: `Klarer Überblick zu ${normalizeText(candidate.topic).replace(/-/g," ")} - mit Ablauf, Kosten, FAQ und schneller Anfrage für ${city.name}.`,
    slug,
    h1: candidate.topic,
    format: candidate.format,
    primaryKeyword: candidate.primaryKeyword,
    secondaryKeywords: candidate.secondaryKeywords,
    supportsPage: candidate.supportsPage,
    outline: [
      { h2: `Was kostet ${service.name} in ${city.name}?` },
      { h2: `Wie läuft ${service.name} in ${city.name} ab?` },
      { h2: `Welche Faktoren beeinflussen den Preis?` },
      { h2: `Häufige Fragen zu ${service.name} in ${city.name}` }
    ],
    faq: [
      `Was kostet ${service.name} in ${city.name}?`,
      `Wie schnell bekommt man einen Termin in ${city.name}?`,
      `Welche Angaben helfen für ein genaues Angebot?`
    ],
    geoDirectAnswers: [
      `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren.`,
      `Eine erste Einschätzung ist schnell per WhatsApp möglich.`
    ]
  };
}

function buildGeo(writer, city, service) {
  return {
    directAnswer: `${service.name} in ${city.name} lässt sich meist nach Aufwand, Menge und Zugang kalkulieren. Eine erste Einschätzung ist schnell per WhatsApp möglich.`,
    missingSections: [],
    quoteReadyLines: [
      `${service.name} in ${city.name} kann oft nach Fotos vorab eingeschätzt werden.`,
      `Ein fixer Termin ist meist kurzfristig möglich, wenn Zugang und Umfang klar sind.`
    ],
    faqImprovements: [
      `Wann lohnt sich eine Vor-Ort-Besichtigung in ${city.name}?`,
      `Was beeinflusst den Preis am stärksten?`,
      `Wie schnell ist eine besenreine Übergabe möglich?`
    ],
    semanticSuggestions: [
      `${service.name} ${city.name} Kosten`,
      `${service.name} ${city.name} Ablauf`,
      `${service.name} ${city.name} Termin`
    ]
  };
}

function buildLocal(writer, city) {
  const localAreas = {
    "Rastatt": ["Baden-Baden", "Gaggenau", "Kuppenheim"],
    "Baden-Baden": ["Rastatt", "Sinzheim", "Bühl"],
    "Gaggenau": ["Rastatt", "Gernsbach", "Kuppenheim"],
    "Karlsruhe": ["Ettlingen", "Rastatt", "Malsch"]
  }[city.name] || [];
  return {
    localizedIntro: `${writer.h1} und Umgebung wird oft dann angefragt, wenn es schnell, klar und ohne unnötigen Aufwand gehen soll.`,
    localAreasMentioned: localAreas,
    localCta: `Jetzt ${writer.primaryKeyword} per WhatsApp anfragen`,
    changedElements: ["intro","cta","faq","local examples","areas mentioned"]
  };
}

function buildLinking(candidate, city, service, cfg) {
  const out = uniq([
    city.servicePage,
    "preisrechner.html",
    "blog.html"
  ]);
  const ins = ((cfg.pubState.items || []).slice(0,2)).map(x => `${x.slug}.html`);
  return {
    linksOut: out,
    linksIn: ins,
    anchorTexts: [
      `${service.name} in ${city.name}`,
      "besenreine Übergabe",
      `Kosten ${service.name}`
    ]
  };
}

function buildConversion(candidate, city, service) {
  return {
    ctaTop: `Jetzt kostenlose Einschätzung für ${service.name} in ${city.name} anfragen`,
    ctaMiddle: "Preisorientierung in 1 Minute berechnen",
    ctaBottom: "Fotos senden und exaktes Angebot erhalten",
    microConversion: "Fotos per WhatsApp senden und schnelle Rückmeldung erhalten",
    channels: ["WhatsApp","Preisrechner","Telefon"]
  };
}

function imagePoolFor(city, service) {
  const slugCity = city.slug;
  const base = [
    { path: city.heroImage, type: "city-background", reason: "Lokaler Wiedererkennungswert", fitScore: 9 },
    { path: city.articleImage, type: "city-background", reason: "Passend für Artikelheader", fitScore: 8 },
    { path: `images/${slugCity}-storage-room.png`, type: "room", reason: "Zeigt realen Entrümpelungs-Kontext", fitScore: 8 },
    { path: `images/${slugCity}-wardrobe-before-after.png`, type: "before-after", reason: "Vorher/Nachher überzeugt stark", fitScore: 9 },
    { path: `images/${slugCity}-table-before-after.png`, type: "before-after", reason: "Guter visueller Beleg für Ergebnis", fitScore: 7 },
    { path: `images/${slugCity}-van.png`, type: "van", reason: "Transport/Service visuell klar", fitScore: 6 }
  ];
  return base;
}

export default async (request, context) => {
  if (request.method !== "POST") return jsonResponse({ ok:false, error:"POST only" }, 405);
  const body = await request.json().catch(() => ({}));
  const cfg = loadConfig();
  const slug = body.slug || (cfg.pubState.items || [])[0]?.slug || null;
  if (!slug) return jsonResponse({ ok:false, error:"No article slug available." }, 404);
  return jsonResponse({
    ok: true,
    mode: "preview",
    slug,
    maxNewLinksPerFile: cfg.rules.maxNewLinksPerFile,
    filesToUpdate: (cfg.pubState.items || []).slice(0, Math.min(3, cfg.rules.maxUpdatedFilesPerRun)).map(x => `${x.slug}.html`),
    linksToAdd: [
      { from: "blog.html", to: `blog/${slug}.html`, anchor: "Neuer lokaler Artikel" },
      { from: `${slug}.html`, to: "preisrechner.html", anchor: "Preisorientierung" }
    ]
  });
};
