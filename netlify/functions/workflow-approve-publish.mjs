import fs from "fs";
import path from "path";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function normalizeText(v) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(v) {
  return normalizeText(v).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

function readConfig() {
  const cwd = process.cwd();

  const citiesPath = path.join(cwd, "agent", "config", "cities.json");
  const servicesPath = path.join(cwd, "agent", "config", "services.json");
  const pendingPath = path.join(cwd, "agent", "state", "pending-approvals.json");

  const citiesData = safeReadJson(citiesPath) || { cities: [] };
  const servicesData = safeReadJson(servicesPath) || { services: [] };
  const pendingData = safeReadJson(pendingPath) || { items: [] };

  return {
    cities: Array.isArray(citiesData.cities) ? citiesData.cities : [],
    services: Array.isArray(servicesData.services) ? servicesData.services : [],
    pendingPath,
    pendingData
  };
}

function findCity(cities, cityInput) {
  const n = normalizeText(cityInput);
  return cities.find(c => normalizeText(c.slug) === n || normalizeText(c.name) === n) || null;
}

function findService(services, serviceInput) {
  const n = normalizeText(serviceInput);
  return services.find(s => normalizeText(s.slug) === n || normalizeText(s.name) === n) || null;
}

export default async (request, context) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "POST only" }, 405);
    }

    const body = await request.json().catch(() => ({}));
    const { city, service, selectedImage, note } = body || {};

    const { cities, services, pendingPath, pendingData } = readConfig();
    const cityObj = findCity(cities, city);
    const serviceObj = findService(services, service);

    if (!cityObj || !serviceObj) {
      return jsonResponse({
        ok: false,
        error: "Unknown city or service",
        city,
        service,
        acceptedCityExamples: uniq(cities.flatMap(c => [c.slug, c.name])).slice(0, 12),
        acceptedServiceExamples: uniq(services.flatMap(s => [s.slug, s.name])).slice(0, 12)
      }, 400);
    }

    if (!selectedImage || typeof selectedImage !== "string") {
      return jsonResponse({
        ok: false,
        error: "selectedImage is required"
      }, 400);
    }

    const items = Array.isArray(pendingData.items) ? pendingData.items : [];
    const approval = {
      id: `${cityObj.slug}-${serviceObj.slug}-${Date.now()}`,
      city: cityObj.slug,
      cityName: cityObj.name,
      service: serviceObj.slug,
      serviceName: serviceObj.name,
      selectedImage,
      note: String(note || ""),
      status: "approved-for-publish",
      approvedAt: new Date().toISOString()
    };

    const next = {
      items: [approval, ...items].slice(0, 100)
    };

    fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
    fs.writeFileSync(pendingPath, JSON.stringify(next, null, 2), "utf8");

    return jsonResponse({
      ok: true,
      mode: "approval",
      approval,
      pendingApprovals: next
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err?.message || "Unknown server error"
    }, 500);
  }
};
