function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function slugify(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export default async (request) => {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'POST only' }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const rec = body?.recommended || body || {};

    const city = rec.city?.name || rec.city || body.city || 'Rastatt';
    const service = rec.service?.name || rec.service || body.service || 'Entrümpelung';
    const topic = rec.topic || `Was kostet eine ${service} in ${city}?`;
    const primaryKeyword = rec.primaryKeyword || `${service} ${city}`;
    const secondaryKeywords = Array.isArray(rec.secondaryKeywords)
      ? rec.secondaryKeywords
      : [
          `${service} Kosten ${city}`,
          `${service} Ablauf ${city}`,
          `${service} Termin ${city}`
        ];
    const supportsPage = rec.supportsPage || `entruempelung-${slugify(city)}.html`;
    const format = rec.format || 'Artikel';

    const slug = rec.slug || slugify(topic);
    const title = topic;
    const metaTitle = `${topic} | Perfekt Sauber Service`;
    const metaDescription = `Erfahren Sie klar und direkt, ${topic.toLowerCase()} – mit Ablauf, Preisfaktoren, FAQ und schneller Anfrage für ${city}.`;
    const h1 = title;

    const outline = [
      {
        h2: `Was kostet ${service} in ${city}?`,
        bullets: [
          'Preis hängt von Menge, Etage, Zugänglichkeit und Entsorgungsaufwand ab.',
          'Fotos per WhatsApp beschleunigen eine realistische Einschätzung.',
          'Kurze Aufträge und vollgestellte Wohnungen unterscheiden sich deutlich im Aufwand.'
        ]
      },
      {
        h2: `Wie läuft ${service} in ${city} ab?`,
        bullets: [
          'Anfrage per WhatsApp, Telefon oder Formular.',
          'Kurze Einschätzung anhand von Fotos oder Besichtigung.',
          'Termin, Räumung, Abtransport und besenreine Übergabe.'
        ]
      },
      {
        h2: `Welche Vorteile hat ein lokaler Anbieter in ${city}?`,
        bullets: [
          'Schnellere Terminvergabe.',
          'Kurze Wege in Rastatt und Umgebung.',
          'Direkte Kommunikation ohne unnötige Umwege.'
        ]
      },
      {
        h2: `Häufige Fragen zu ${service} in ${city}`,
        bullets: [
          'Wie schnell ist ein Termin möglich?',
          'Was beeinflusst den Preis am stärksten?',
          'Muss jemand vor Ort sein?',
          'Ist eine besenreine Übergabe möglich?'
        ]
      }
    ];

    const faq = [
      {
        q: `Was kostet ${service} in ${city}?`,
        a: `Das hängt vor allem von Volumen, Zugänglichkeit und Entsorgungsmenge ab. Für eine schnelle Einschätzung helfen Fotos per WhatsApp.`
      },
      {
        q: `Wie schnell bekommt man einen Termin in ${city}?`,
        a: `Kurze Termine sind oft möglich, besonders wenn Fotos und Eckdaten direkt mitgeschickt werden.`
      },
      {
        q: `Ist eine besenreine Übergabe möglich?`,
        a: `Ja, je nach Auftrag kann die Räumung mit besenreiner Übergabe kombiniert werden.`
      },
      {
        q: `Für welche Objekte ist der Service geeignet?`,
        a: `Zum Beispiel für Wohnungen, Häuser, Keller, einzelne Räume oder Nachlasssituationen.`
      }
    ];

    const geoDirectAnswers = [
      `${service} in ${city} ist besonders dann schnell planbar, wenn Fotos und Eckdaten direkt mitgeschickt werden.`,
      `Die Kosten für ${service} in ${city} hängen vor allem von Menge, Zugang und Entsorgungsaufwand ab.`,
      `Ein lokaler Anbieter in ${city} spart oft Zeit bei Besichtigung, Termin und Rückmeldung.`
    ];

    const ctas = {
      top: 'Jetzt kostenlose Einschätzung per WhatsApp anfragen',
      middle: 'Preisorientierung in 1 Minute berechnen',
      bottom: 'Fotos senden und exaktes Angebot erhalten'
    };

    return json({
      ok: true,
      mode: 'preview',
      writer: {
        title,
        metaTitle,
        metaDescription,
        slug,
        h1,
        format,
        primaryKeyword,
        secondaryKeywords,
        supportsPage,
        outline,
        faq,
        geoDirectAnswers,
        ctas
      },
      input: {
        city,
        service,
        topic,
        primaryKeyword,
        secondaryKeywords,
        supportsPage,
        format
      }
    });
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, 500);
  }
};
