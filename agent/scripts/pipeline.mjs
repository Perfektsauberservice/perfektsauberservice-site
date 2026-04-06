/**
 * PSS Content Pipeline — 3-Agent System
 *
 * Agent 1 (Research):  Cerceteaza subiectul si genereaza date structurate
 * Agent 2 (Images):    Cauta imagini relevante, fara copyright (Unsplash + Pexels)
 * Agent 3 (Writing):   Scrie articolul HTML complet in germana
 *
 * Utilizare:
 *   node agent/scripts/pipeline.mjs
 *   node agent/scripts/pipeline.mjs --topic "titlu" --city "Rastatt" --service "Entrümpelung"
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── Config ───────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌  ANTHROPIC_API_KEY fehlt. Bitte .env oder Umgebungsvariablen setzen.');
  process.exit(1);
}

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const WHATSAPP = 'https://wa.me/491639087197';
const PHONE = 'tel:+491639087197';
const SITE = 'https://perfektsauberservice.com';

// ─── Anthropic API helper ─────────────────────────────────────────────────────

async function callClaude(systemPrompt, userPrompt, maxTokens = 3000) {
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API Fehler ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ─── Agent 1: Research ────────────────────────────────────────────────────────

async function researchAgent(topic, city, service) {
  console.log(`\n🔍  [Agent 1 – Research] ${service} · ${city} · "${topic}"`);

  const systemPrompt = `Du bist ein lokaler SEO-Experte und Marktkenner für Entrümpelung, Haushaltsauflösung und Reinigungsdienstleistungen in der Region ${city}, Baden-Württemberg, Deutschland.
Du kennst die lokalen Preise, Vorschriften, saisonalen Besonderheiten und die Bedürfnisse der Bewohner in dieser Region genau.
Antworte immer auf Deutsch. Antworte NUR mit validem JSON, kein anderer Text.`;

  const userPrompt = `Recherchiere das folgende Thema für einen Blogartikel:

Thema: "${topic}"
Stadt: ${city}
Dienstleistung: ${service}

Liefere ein JSON-Objekt mit EXAKT diesen Feldern:
{
  "titel": "SEO-optimierter Artikel-Titel (max 65 Zeichen)",
  "meta_description": "Überzeugende Meta-Description (max 155 Zeichen, mit Keyword und CTA)",
  "hauptpunkte": ["Punkt 1", "Punkt 2", "Punkt 3", "Punkt 4", "Punkt 5"],
  "abschnitte": [
    {
      "h2": "Abschnitts-Überschrift als Frage oder klare Aussage",
      "inhalt": "Mindestens 100 Wörter mit echten, nützlichen Informationen. Kein Marketing-Blabla."
    }
  ],
  "preishinweise": "Realistische Preisspanne und Faktoren für ${city} (2-3 Sätze)",
  "lokale_besonderheiten": "Was ist spezifisch für ${city}? Stadtteil, Infrastruktur, typische Gebäude (2-3 Sätze)",
  "haeufige_fragen": [
    { "frage": "Konkrete Frage der Zielgruppe?", "antwort": "Direkte, hilfreiche Antwort in 2-4 Sätzen." },
    { "frage": "...", "antwort": "..." },
    { "frage": "...", "antwort": "..." },
    { "frage": "...", "antwort": "..." }
  ],
  "seo_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "bild_suchbegriffe": ["englischer Suchbegriff für Unsplash/Pexels passend zum Thema", "Alternative 1", "Alternative 2"],
  "artikel_winkel": "Was macht diesen Artikel einzigartig und besonders nützlich?"
}

Mindestens 4 Abschnitte mit je min. 100 Wörtern. Echte, verwertbare Informationen.`;

  const raw = await callClaude(systemPrompt, userPrompt, 2500);

  // Extract JSON robustly
  let research;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Kein JSON-Block gefunden.');
    // Fix common JSON issues: unescaped newlines inside strings
    const cleaned = match[0]
      .replace(/[\r\n]+/g, ' ')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']');
    research = JSON.parse(cleaned);
  } catch (e) {
    // Retry with stricter prompt
    console.warn(`   ⚠️  JSON Parse Fehler, versuche erneut...`);
    const retry = await callClaude(
      'Antworte NUR mit validem JSON. Kein Markdown, keine Erklärungen, nur reines JSON.',
      `Erstelle ein JSON für: Thema="${topic}", Stadt="${city}", Service="${service}". Felder: titel, meta_description, hauptpunkte(array), abschnitte(array von {h2,inhalt}), preishinweise, lokale_besonderheiten, haeufige_fragen(array von {frage,antwort}), seo_keywords(array), bild_suchbegriffe(array englisch), artikel_winkel`,
      2000
    );
    const match2 = retry.match(/\{[\s\S]*\}/);
    if (!match2) throw new Error('Research Agent: JSON konnte nicht geparst werden.');
    research = JSON.parse(match2[0].replace(/[\r\n]+/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']'));
  }

  // Ensure required fields have defaults
  research.abschnitte = research.abschnitte || [];
  research.haeufige_fragen = research.haeufige_fragen || [];
  research.seo_keywords = research.seo_keywords || [];
  research.bild_suchbegriffe = research.bild_suchbegriffe || ['professional cleaning', 'home organization'];

  console.log(`   ✅  Keywords: ${research.seo_keywords?.join(', ')}`);
  console.log(`   ✅  Abschnitte: ${research.abschnitte?.length}`);
  return research;
}

// ─── Agent 2: Images ──────────────────────────────────────────────────────────

async function imageAgent(searchTerms, city, service) {
  console.log(`\n🖼️   [Agent 2 – Images] Suche: "${searchTerms[0]}"`);

  // Service → fallback keywords mapping
  const fallbackMap = {
    'Entrümpelung':       ['clutter removal', 'empty apartment', 'moving boxes', 'room clearance'],
    'Haushaltsauflösung': ['furniture removal', 'household items', 'estate sale', 'declutter home'],
    'Wohnungsauflösung':  ['apartment clearance', 'empty room interior', 'moving apartment'],
    'Gewerberäumung':     ['office clearance', 'empty office space', 'commercial cleaning'],
    'Endreinigung':       ['apartment cleaning', 'professional cleaning', 'clean bright room'],
    'Fensterreinigung':   ['window cleaning', 'clean windows sunlight', 'window washer'],
  };

  const queries = [
    ...searchTerms,
    ...(fallbackMap[service] || ['professional cleaning service', 'clean home']),
    'clean organized home'
  ];

  // Try Unsplash
  if (UNSPLASH_ACCESS_KEY) {
    for (const query of queries.slice(0, 3)) {
      try {
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&content_filter=high`,
          { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
        );
        const data = await res.json();
        if (data.results?.length > 0) {
          // Pick a random one from top 5 for variety
          const idx = Math.floor(Math.random() * Math.min(5, data.results.length));
          const photo = data.results[idx];
          console.log(`   ✅  Unsplash: "${query}" → ${photo.user.name}`);
          return {
            url: photo.urls.regular,
            urlSmall: photo.urls.small,
            alt: photo.alt_description || `${service} in ${city}`,
            credit: `Foto: <a href="${photo.user.links.html}?utm_source=perfektsauberservice&utm_medium=referral" target="_blank" rel="noopener">${photo.user.name}</a> auf <a href="https://unsplash.com?utm_source=perfektsauberservice&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a>`,
            source: 'unsplash'
          };
        }
      } catch (e) {
        console.warn(`   ⚠️  Unsplash Fehler für "${query}": ${e.message}`);
      }
    }
  }

  // Fallback: Pexels
  if (PEXELS_API_KEY) {
    for (const query of queries.slice(0, 3)) {
      try {
        const res = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        const data = await res.json();
        if (data.photos?.length > 0) {
          const idx = Math.floor(Math.random() * Math.min(5, data.photos.length));
          const photo = data.photos[idx];
          console.log(`   ✅  Pexels: "${query}" → ${photo.photographer}`);
          return {
            url: photo.src.large,
            urlSmall: photo.src.medium,
            alt: photo.alt || `${service} in ${city}`,
            credit: `Foto: <a href="${photo.photographer_url}" target="_blank" rel="noopener">${photo.photographer}</a> auf <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a>`,
            source: 'pexels'
          };
        }
      } catch (e) {
        console.warn(`   ⚠️  Pexels Fehler für "${query}": ${e.message}`);
      }
    }
  }

  // Last resort: use local city image
  const citySlug = toSlug(city);
  const localImg = `/images/city/${citySlug}-bg.png`;
  console.log(`   ⚠️  Kein externes Bild gefunden – verwende lokales: ${localImg}`);
  return {
    url: localImg,
    urlSmall: localImg,
    alt: `${service} in ${city}`,
    credit: null,
    source: 'local'
  };
}

// ─── Agent 3: Writing ─────────────────────────────────────────────────────────

async function writingAgent(topic, city, service, research, image, slug) {
  console.log(`\n✍️   [Agent 3 – Writing] Erstelle Artikel: ${slug}.html`);

  const canonicalUrl = `${SITE}/blog/${slug}.html`;
  const servicePageUrl = `/${toSlug(service)}-${toSlug(city)}.html`;

  // Build FAQ JSON-LD
  const faqJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: research.haeufige_fragen.map(f => ({
      '@type': 'Question',
      name: f.frage,
      acceptedAnswer: { '@type': 'Answer', text: f.antwort }
    }))
  }, null, 2);

  // Build FAQ HTML
  const faqHtml = research.haeufige_fragen.map(f =>
    `<div class="faq-item"><h3>${escHtml(f.frage)}</h3><p>${escHtml(f.antwort)}</p></div>`
  ).join('\n');

  // Build content sections HTML
  const sectionsHtml = research.abschnitte.map(s =>
    `<section class="content-section">
<h2>${escHtml(s.h2)}</h2>
<div class="content-copy">${paragraphs(s.inhalt)}</div>
</section>`
  ).join('\n');

  const today = new Date().toISOString().split('T')[0];
  const creditHtml = image.credit ? `<p class="img-credit">${image.credit}</p>` : '';

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(research.titel)}</title>
<meta name="description" content="${escAttr(research.meta_description)}" />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="${canonicalUrl}" />
<meta property="og:title" content="${escAttr(research.titel)}" />
<meta property="og:description" content="${escAttr(research.meta_description)}" />
<meta property="og:image" content="${image.source === 'local' ? SITE + image.url : image.url}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:locale" content="de_DE" />
<meta name="article:published_time" content="${today}" />
<script type="application/ld+json">
${faqJsonLd}
</script>
<style>
:root{--bg:#f5f8fc;--text:#122033;--muted:#5d697a;--line:#dde5ee;--blue:#21466f;--green:#76c043}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--text);background:#fff;line-height:1.7}
a{text-decoration:none;color:inherit}
.container{max-width:980px;margin:0 auto;padding:0 22px}
.hero{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(15,23,42,.84),rgba(15,23,42,.56)),url('${image.url}') center/cover no-repeat;color:#fff;padding:88px 0 60px}
.hero .container{position:relative;z-index:1}
.badge{display:inline-flex;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);font-weight:800;font-size:.85rem}
.hero h1{font-size:clamp(1.8rem,4.5vw,3.6rem);line-height:1.05;margin:18px 0 0}
.lead{font-size:1.1rem;max-width:820px;color:rgba(255,255,255,.94);margin-top:14px}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:13px 20px;border-radius:18px;font-weight:800;font-size:.95rem}
.btn-green{background:var(--green);color:#fff}
.btn-blue{background:rgba(15,23,42,.38);border:1px solid rgba(255,255,255,.42);color:#fff;backdrop-filter:blur(4px)}
.wrap{padding:38px 0 56px}
.content-card{background:#fff;border:1px solid var(--line);border-radius:24px;padding:26px;box-shadow:0 18px 40px rgba(15,23,42,.06)}
.content-section+.content-section{margin-top:28px}
.content-section h2{font-size:1.55rem;line-height:1.2;margin:0 0 10px}
.content-copy p{margin:0 0 12px}
.content-copy ul{margin:0 0 12px;padding-left:22px}
.content-copy li{margin-bottom:6px}
.faq-grid{display:grid;gap:14px;margin-top:16px}
.faq-item{border:1px solid var(--line);border-radius:16px;padding:16px 18px;background:#f8fbff}
.faq-item h3{margin:0 0 8px;font-size:1rem;color:var(--blue)}
.faq-item p{margin:0;color:var(--muted);font-size:.95rem}
.notice{margin-top:18px;padding:14px 16px;border-radius:16px;background:#fff7e8;border:1px solid #f6dca7;color:#8a5b00;font-size:.9rem}
.img-credit{font-size:.75rem;color:var(--muted);margin-top:6px}
.img-credit a{color:var(--muted);text-decoration:underline}
.footer{padding:28px 0 42px;color:#66778f;font-size:.875rem;border-top:1px solid var(--line);margin-top:12px}
.footer a{font-weight:700;color:var(--blue)}
@media(max-width:720px){.actions{flex-direction:column;align-items:stretch}.content-card{padding:18px}}
</style>
</head>
<body>
<section class="hero">
  <div class="container">
    <div class="badge">${escHtml(service)} · ${escHtml(city)}</div>
    <h1>${escHtml(research.titel)}</h1>
    <p class="lead">${escHtml(research.lokale_besonderheiten)}</p>
    <div class="actions">
      <a class="btn btn-green" href="${WHATSAPP}" target="_blank" rel="noopener">WhatsApp Anfrage</a>
      <a class="btn btn-blue" href="/preisrechner.html">Preisrechner starten</a>
      <a class="btn btn-blue" href="${servicePageUrl}">Zur Stadtseite</a>
      <a class="btn btn-blue" href="/blog.html">Zum Blog</a>
    </div>
  </div>
</section>

<section class="wrap">
  <div class="container">
    <div class="content-card">

      ${sectionsHtml}

      <section class="content-section">
        <h2>Was kostet das in ${escHtml(city)}?</h2>
        <div class="content-copy"><p>${escHtml(research.preishinweise)}</p></div>
        <div class="notice">💡 Nutzen Sie unseren <a href="/preisrechner.html" style="color:inherit;text-decoration:underline">kostenlosen Preisrechner</a> für eine erste Einschätzung – ohne Verpflichtung.</div>
      </section>

      <section class="content-section">
        <h2>Häufige Fragen</h2>
        <div class="faq-grid">
          ${faqHtml}
        </div>
      </section>

      <section class="content-section">
        <h2>Jetzt kostenlos anfragen</h2>
        <p>Für ein unverbindliches Angebot in ${escHtml(city)} einfach Kontakt aufnehmen – per WhatsApp, Telefon oder Preisrechner.</p>
        <div class="actions" style="margin-top:16px">
          <a class="btn btn-green" href="${WHATSAPP}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="btn btn-blue" href="${PHONE}">Jetzt anrufen</a>
          <a class="btn btn-blue" href="/preisrechner.html">Preisrechner</a>
        </div>
      </section>

    </div>
    ${creditHtml}
    <div class="footer">
      <a href="/index.html">Startseite</a> ·
      <a href="/blog.html">Blog</a> ·
      <a href="${servicePageUrl}">${escHtml(service)} ${escHtml(city)}</a> ·
      <a href="/preisrechner.html">Preisrechner</a>
    </div>
  </div>
</section>
</body>
</html>`;

  console.log(`   ✅  HTML generiert (${html.length} Zeichen)`);
  return html;
}

// ─── Sitemap updater ──────────────────────────────────────────────────────────

function updateSitemap(slug) {
  const sitemapPath = join(ROOT, 'sitemap.xml');
  let sitemap = readFileSync(sitemapPath, 'utf8');
  const url = `${SITE}/blog/${slug}.html`;

  if (sitemap.includes(url)) {
    console.log(`   ℹ️  Sitemap: URL bereits vorhanden.`);
    return;
  }

  const entry = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n  </url>`;
  sitemap = sitemap.replace('</urlset>', `${entry}\n</urlset>`);
  writeFileSync(sitemapPath, sitemap);
  console.log(`   ✅  Sitemap aktualisiert: ${url}`);
}

// ─── Topics queue manager ─────────────────────────────────────────────────────

function getNextTopic() {
  const topicsPath = join(ROOT, 'agent', 'config', 'article-topics.json');
  const data = JSON.parse(readFileSync(topicsPath, 'utf8'));

  if (data.queue.length === 0) {
    console.log('ℹ️  Queue ist leer – keine weiteren Themen.');
    return null;
  }

  // Pick first item
  const topic = data.queue[0];
  return { topic, data, topicsPath };
}

function markTopicDone(topic, data, topicsPath) {
  data.queue = data.queue.slice(1);
  data.completed.push({ ...topic, completedAt: new Date().toISOString() });
  writeFileSync(topicsPath, JSON.stringify(data, null, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(str) {
  return str.toLowerCase()
    .replace(/ü/g, 'ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function generateSlug(service, city, topic) {
  const t = topic.replace(/[?!]/g, '').trim().split(' ').slice(0, 6).join(' ');
  return `${toSlug(service)}-${toSlug(city)}-${toSlug(t)}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function paragraphs(text) {
  return text.split(/\n+/).filter(Boolean)
    .map(p => `<p>${escHtml(p.trim())}</p>`).join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀  PSS Content Pipeline gestartet\n');

  const args = process.argv.slice(2);
  let service, city, topic;
  let markDone = null;

  if (args.includes('--topic')) {
    topic   = args[args.indexOf('--topic') + 1];
    city    = args[args.indexOf('--city') + 1] || 'Rastatt';
    service = args[args.indexOf('--service') + 1] || 'Entrümpelung';
    console.log(`📌  Manueller Modus: ${service} · ${city} · "${topic}"`);
  } else {
    const next = getNextTopic();
    if (!next) {
      console.log('ℹ️  Queue ist leer.');
      process.exit(0);
    }
    const { topic: topicObj, data: queueData, topicsPath: queuePath } = next;
    topic   = topicObj.topic;
    city    = topicObj.city;
    service = topicObj.service;
    markDone = () => markTopicDone({ topic, city, service }, queueData, queuePath);
    console.log(`📋  Queue-Modus: ${service} · ${city} · "${topic}"`);
  }

  const slug = generateSlug(service, city, topic);
  const outputPath = join(ROOT, 'blog', `${slug}.html`);

  if (existsSync(outputPath)) {
    console.log(`⏭️  Artikel existiert bereits: ${outputPath}`);
    if (markDone) markDone();
    process.exit(0);
  }

  try {
    // Agent 1 (Research) — zuerst ausfuehren um Bildsuche-Begriffe zu erhalten
    const research = await researchAgent(topic, city, service);

    // Agent 2 (Images) — mit research-basierten Suchbegriffen
    const image = await imageAgent(research.bild_suchbegriffe || [], city, service);

    // Agent 3 (Writing)
    const html = await writingAgent(topic, city, service, research, image, slug);

    writeFileSync(outputPath, html, 'utf8');
    console.log(`\n💾  Gespeichert: blog/${slug}.html`);

    updateSitemap(slug);

    if (markDone) markDone();

    console.log('\n🎉  Pipeline erfolgreich abgeschlossen!');
    console.log(`   URL: ${SITE}/blog/${slug}.html\n`);

  } catch (err) {
    console.error('\n❌  Pipeline Fehler:', err.message);
    process.exit(1);
  }
}

main();
