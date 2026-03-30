
import fs from "fs";
import path from "path";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function safeReadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
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

function fileSlug(v) {
  return normalizeText(v).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function loadLocalConfig() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "agent", "config", "cities.json"),
    path.join(cwd, "agent", "config", "services.json"),
    path.join(cwd, "agent", "state", "pending-approvals.json")
  ];
  // config files should exist in deploy bundle under cwd
  const citiesPath = path.join(cwd, "agent", "config", "cities.json");
  const servicesPath = path.join(cwd, "agent", "config", "services.json");
  const cities = safeReadJson(citiesPath);
  const services = safeReadJson(servicesPath);
  return {
    cities: cities?.cities || [],
    services: services?.services || []
  };
}

function matchCity(cities, input) {
  const q = normalizeText(input);
  return cities.find(c => normalizeText(c.slug) === q || normalizeText(c.name) === q) || null;
}

function matchService(services, input) {
  const q = normalizeText(input);
  return services.find(s => normalizeText(s.slug) === q || normalizeText(s.name) === q) || null;
}

async function githubGetJson({ owner, repo, token, filePath, branch = "main" }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "perfekt-sauber-service-agent"
    }
  });
  if (res.status === 404) return { exists: false, data: { items: [] }, sha: null };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub read failed (${res.status}): ${text}`);
  }
  const payload = await res.json();
  const content = Buffer.from(payload.content || "", "base64").toString("utf8");
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    data = { items: [] };
  }
  if (!Array.isArray(data.items)) data.items = [];
  return { exists: true, data, sha: payload.sha || null };
}

async function githubPutJson({ owner, repo, token, filePath, branch = "main", message, data, sha = null }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64"),
    branch
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "perfekt-sauber-service-agent"
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub write failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

export default async (request, context) => {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "POST only" }, 405);
    }

    const payload = await request.json().catch(() => ({}));
    const cityInput = payload?.city;
    const serviceInput = payload?.service;
    const selectedImage = payload?.selectedImage;

    if (!cityInput || !serviceInput || !selectedImage) {
      return jsonResponse({
        ok: false,
        error: "Missing required fields",
        required: ["city", "service", "selectedImage"]
      }, 400);
    }

    const { cities, services } = loadLocalConfig();
    const city = matchCity(cities, cityInput);
    const service = matchService(services, serviceInput);

    if (!city || !service) {
      return jsonResponse({
        ok: false,
        error: "Unknown city or service",
        city: cityInput,
        service: serviceInput,
        acceptedCityExamples: cities.slice(0, 10).map(c => ({ slug: c.slug, name: c.name })),
        acceptedServiceExamples: services.slice(0, 10).map(s => ({ slug: s.slug, name: s.name }))
      }, 400);
    }

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!owner || !repo || !token) {
      return jsonResponse({
        ok: false,
        error: "Missing GitHub environment variables",
        required: ["GITHUB_OWNER", "GITHUB_REPO", "GITHUB_TOKEN"]
      }, 500);
    }

    const filePath = "agent/state/pending-approvals.json";
    const current = await githubGetJson({ owner, repo, token, filePath, branch });
    const approvals = current.data || { items: [] };
    if (!Array.isArray(approvals.items)) approvals.items = [];

    const approval = {
      id: `approval-${Date.now()}-${fileSlug(city.slug)}-${fileSlug(service.slug)}`,
      city: city.slug,
      cityName: city.name,
      service: service.slug,
      serviceName: service.name,
      selectedImage,
      approvedAt: new Date().toISOString(),
      status: "approved"
    };

    approvals.items.push(approval);

    const writeResult = await githubPutJson({
      owner,
      repo,
      token,
      filePath,
      branch,
      sha: current.sha,
      message: `chore(approval): save image approval for ${service.slug} ${city.slug}`,
      data: approvals
    });

    return jsonResponse({
      ok: true,
      approval,
      pendingApprovals: approvals,
      githubCommit: writeResult?.commit?.sha || null,
      filePath
    }, 200);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err?.message || err)
    }, 500);
  }
};
