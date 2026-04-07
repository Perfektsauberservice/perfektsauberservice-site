/**
 * Agent 9 — Review Requester
 *
 * Trimite un mesaj WhatsApp clientului dupa finalizarea lucrarii,
 * cu un link direct catre Google Review pentru PerfektSauberService.
 *
 * Utilizare:
 *   node agent/scripts/review-requester.mjs --name "Hans Müller" --phone "+49123456789"
 *
 * Sau fara argumente — afiseaza link-ul wa.me gata de folosit.
 */

import { parseArgs } from 'util';

// ─── Config ───────────────────────────────────────────────────────────────────

const BUSINESS_NAME = 'PerfektSauberService';
const GOOGLE_REVIEW_URL = 'https://g.page/r/perfektsauberservice/review';
// Daca ai Place ID exact de la Google Business Profile, inlocuieste cu:
// https://search.google.com/local/writereview?placeid=PLACE_ID_TAU

function buildWhatsAppMessage(customerName) {
  const name = customerName || 'Kunde';
  return `Hallo ${name},

vielen Dank für Ihren Auftrag bei ${BUSINESS_NAME}! 🙏

Wir hoffen, dass Sie mit unserer Arbeit zufrieden waren. Falls ja, würden wir uns sehr über eine kurze Google-Bewertung freuen – das hilft uns enorm weiter:

⭐ ${GOOGLE_REVIEW_URL}

Es dauert nur 1–2 Minuten und bedeutet uns sehr viel!

Mit freundlichen Grüßen,
Ihr ${BUSINESS_NAME}-Team
Tel: +49 163 9087197`;
}

function buildWaMeLink(phone, message) {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    name:  { type: 'string', default: '' },
    phone: { type: 'string', default: '' },
  },
  strict: false,
});

const message = buildWhatsAppMessage(values.name);

console.log('\n=== Agent 9 — Review Requester ===\n');
console.log('Mesaj WhatsApp:\n');
console.log(message);

if (values.phone) {
  const link = buildWaMeLink(values.phone, message);
  console.log('\n--- Link WhatsApp Web ---');
  console.log(link);
} else {
  console.log('\nAdauga --phone "+49XXXXXXXXX" pentru link-ul direct wa.me');
}
