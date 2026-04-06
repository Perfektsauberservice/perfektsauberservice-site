#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const cities = JSON.parse(await fs.readFile(path.join(root, 'agent/config/cities.json'), 'utf8')).cities;
const services = JSON.parse(await fs.readFile(path.join(root, 'agent/config/services.json'), 'utf8')).services;
const outDir = path.join(root, 'content/auto');
await fs.mkdir(outDir, { recursive: true });

function slugify(input) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildMarkdown(city, service, topic) {
  const title = topic;
  const slug = slugify(`${service.slug}-${city.slug}-${title}`);
  const body = `---
title: "${title}"
city: "${city.name}"
service: "${service.name}"
heroImage: "/${city.heroImage}"
servicePage: "/${city.servicePage}"
status: draft
---

# ${title}

${service.name} in ${city.name} wird je nach Aufwand, Objektgröße und Zugänglichkeit individuell eingeschätzt. Für eine schnelle erste Orientierung empfiehlt sich immer eine Anfrage mit Fotos.

## Wovon hängen Kosten und Aufwand ab?

In ${city.name} spielen vor allem Objektgröße, Füllstand, Etage, Laufwege und gewünschte Zusatzleistungen eine Rolle. Dadurch bleibt die Einschätzung transparent und nachvollziehbar.

## So läuft der Ablauf typischerweise ab

1. Anfrage senden
2. Fotos oder Kurzbeschreibung schicken
3. Erste Einschätzung erhalten
4. Termin abstimmen
5. Durchführung vor Ort

## Häufige Fragen

**Wie schnell ist ein Termin möglich?**
Nach Verfügbarkeit oft auch kurzfristig.

**Ist die Entsorgung inklusive?**
Je nach Auftrag und vorheriger Absprache.

## CTA

${service.cta}
`;
  return { slug, body };
}

const manifest = [];
for (const city of cities) {
  for (const service of services) {
    for (const topic of service.questionTemplates.map(t => t.replaceAll('{city}', city.name))) {
      const { slug, body } = buildMarkdown(city, service, topic);
      const file = path.join(outDir, `${slug}.md`);
      await fs.writeFile(file, body, 'utf8');
      manifest.push({ slug, city: city.name, service: service.name, topic, file: `content/auto/${slug}.md`, heroImage: city.heroImage });
    }
  }
}
await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`Generated ${manifest.length} draft articles in content/auto`);
