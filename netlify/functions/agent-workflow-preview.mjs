
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });

const DEFAULT_GOALS = {
  primaryGoal: "lead generation",
  secondaryGoals: ["local SEO", "GEO"],
  preferredFormats: ["FAQ", "Artikel", "Local landing support"]
};

const CITIES_FALLBACK = {
  cities: [
    { slug: "rastatt", name: "Rastatt", servicePage: "entruempelung-rastatt.html" },
    { slug: "baden-baden", name: "Baden-Baden", servicePage: "entruempelung-baden-baden.html" },
    { slug: "gaggenau", name: "Gaggenau", servicePage: "entruempelung-gaggenau.html" },
    { slug: "karlsruhe", name: "Karlsruhe", servicePage: "entruempelung-karlsruhe.html" }
  ]
};

const SERVICES_FALLBACK = {
  services: [
    {
      slug: "entruempelung",
      name: "Entrümpelung",
      questionTemplates: [
        "Was kostet eine Entrümpelung in {city}?",
        "Wie läuft eine Entrümpelung in {city} ab?",
        "Wie schnell bekommt man einen Termin für eine Entrümpelung in {city}?"
      ],
      cta: "Kostenlose Anfrage per WhatsApp oder Telefon"
    },
    {
      slug: "wohnungsaufloesung",
      name: "Wohnungsauflösung",
      questionTemplates: [
        "Wie läuft eine Wohnungsauflösung in {city} ab?",
        "Was kostet eine Wohnungsauflösung in {city}?"
      ],
      cta: "Jetzt unverbindlich Bilder senden und Einschätzung erhalten"
    },
    {
      slug: "endreinigung",
      name: "Endreinigung",
      questionTemplates: [
        "Was ist bei einer Endreinigung vor der Wohnungsübergabe in {city} wichtig?",
        "Was kostet eine Endreinigung in {city}?"
      ],
      cta: "Termin für Endreinigung jetzt anfragen"
    }
  ]
};

const INDEX_FALLBACK = { items: [] };

const normalize = (v = "") =>
  String(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const slugify = (v = "") =>
  normalize(v)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function fetchRepoJson(path, fallback) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) return fallback;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "PerfektSauberService-AgentWorkflow"
    }
  });
  if (!res.ok) return fallback;
  const data = await res.json();
  if (!data.content) return fallback;
  const decoded = Buffer.from(data.content, 'base64').toString('utf8');
  try { return JSON.parse(decoded); } catch { return fallback; }
}

function chooseTopic(city, service, items = []) {
  const templates = service.questionTemplates || [];
  const candidates = templates.map((tpl, index) => {
    const topic = tpl.replaceAll('{city}', city.name);
    const topicNorm = normalize(topic);
    const existing = items.find((item) => normalize(item.topic || item.title || item.slug) === topicNorm);
    const duplicateDecision = existing ? "update existing" : "create new";
    const supportPage = city.servicePage || `entruempelung-${city.slug}.html`;
    const format = /was kostet/i.test(topic) ? "FAQ" : /wie schnell/i.test(topic) ? "Artikel" : "Artikel";
    const primaryKeyword = `${service.name} ${city.name}`;
    const secondaryKeywords = [
      `${service.name} Kosten ${city.name}`,
      `${service.name} Ablauf ${city.name}`,
      `${service.name} Termin ${city.name}`
    ];
    const priority = /was kostet/i.test(topic) ? 10 : /wie schnell/i.test(topic) ? 9 : 8;
    return {
      priority,
      topic,
      primaryKeyword,
      secondaryKeywords,
      searchIntent: "informational/commercial",
      format,
      supportsPage: supportPage,
      duplicateDecision,
      cannibalizationRisk: existing ? "medium" : "low",
      matchedExisting: existing ? (existing.slug || existing.title || null) : null,
      templateIndex: index
    };
  });
  candidates.sort((a, b) => b.priority - a.priority);
  return { candidates, recommended: candidates[0] || null };
}

function buildWriterPreview(city, service, rec) {
  const slug = slugify(rec.topic);
  const title = rec.topic;
  const metaTitle = `${rec.topic} | Perfekt Sauber Service`;
  const metaDescription = `Erfahren Sie klar und direkt, ${normalize(rec.topic).startsWith('was kostet') ? 'was kostet' : 'wie läuft'} eine ${normalize(service.name)} in ${city.name} – mit Ablauf, Preisfaktoren, FAQ und schneller Anfrage für ${city.name}.`;
  return {
    title,
    metaTitle,
    metaDescription,
    slug,
    h1: title,
    format: rec.format,
    primaryKeyword: rec.primaryKeyword,
    secondaryKeywords: rec.secondaryKeywords,
    supportsPage: rec.supportsPage,
    outline: [
      { h2: `Was kostet eine ${service.name} in ${city.name}?`, h3: ["Wovon hängen die Kosten ab?", "Wann lohnt sich eine Vor-Ort-Einschätzung?"] },
      { h2: `Wie läuft eine ${service.name} in ${city.name} ab?`, h3: ["Anfrage und Einschätzung", "Termin und Durchführung"] },
      { h2: `Warum Kunden in ${city.name} anfragen`, h3: ["Kurze Wege", "Klare Kommunikation", "Besenreine Übergabe"] },
      { h2: "Häufige Fragen", h3: ["Wie schnell bekommt man einen Termin?", "Kann ich Fotos per WhatsApp senden?"] }
    ],
    faq: [
      { q: `Was kostet eine ${service.name} in ${city.name}?`, a: `Die Kosten hängen vor allem von Umfang, Zugänglichkeit und gewünschter Zusatzleistung ab. Eine erste Einschätzung ist meist nach Fotos oder kurzer Beschreibung möglich.` },
      { q: `Wie schnell bekomme ich einen Termin in ${city.name}?`, a: `Freie Termine sind oft kurzfristig möglich. Für eine schnelle Einschätzung helfen Fotos per WhatsApp.` },
      { q: `Kann ich vorab Bilder senden?`, a: `Ja. Bilder per WhatsApp helfen, Aufwand und Preis schneller einzuschätzen.` },
      { q: `Unterstützt der Artikel die Serviceseite?`, a: `Ja. Dieser Inhalt stärkt die Zielseite ${rec.supportsPage}.` }
    ],
    geoDirectAnswers: [
      `${service.name} in ${city.name} ist oft kurzfristig planbar, wenn Sie Fotos und Eckdaten direkt senden.`,
      `Die Kosten für ${service.name} in ${city.name} hängen vor allem von Menge, Zugang und Zusatzleistungen ab.`,
      `Für ${city.name} ist eine schnelle Ersteinschätzung per WhatsApp oft der direkteste Weg zum Angebot.`
    ],
    ctas: {
      top: "Jetzt kostenlose Einschätzung per WhatsApp anfragen",
      middle: "Preisorientierung in 1 Minute berechnen",
      bottom: "Fotos senden und exaktes Angebot erhalten"
    }
  };
}

export default async (request, context) => {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const rawCity = body.city || "";
  const rawService = body.service || "";

  const citiesData = await fetchRepoJson('agent/config/cities.json', CITIES_FALLBACK);
  const servicesData = await fetchRepoJson('agent/config/services.json', SERVICES_FALLBACK);
  const goals = await fetchRepoJson('agent/config/goals.json', DEFAULT_GOALS);
  const contentIndex = await fetchRepoJson('agent/state/content-index.json', INDEX_FALLBACK);

  const city = (citiesData.cities || []).find(c =>
    normalize(c.slug) === normalize(rawCity) || normalize(c.name) === normalize(rawCity)
  );
  const service = (servicesData.services || []).find(s =>
    normalize(s.slug) === normalize(rawService) || normalize(s.name) === normalize(rawService)
  );

  if (!city || !service) {
    return json({
      ok: false,
      error: 'Unknown city or service',
      city: rawCity,
      service: rawService
    }, 400);
  }

  const { candidates, recommended } = chooseTopic(city, service, contentIndex.items || []);
  const writer = recommended ? buildWriterPreview(city, service, recommended) : null;

  return json({
    ok: true,
    mode: 'preview',
    city,
    service,
    goals,
    recommended,
    writer,
    candidates
  });
};
