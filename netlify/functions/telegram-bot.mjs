/**
 * Agent 13 — Telegram Bot + Claude
 * Primeste mesaje Telegram → Claude Haiku interpreteaza comanda → executa actiuni via GitHub API
 *
 * Variabile Netlify (Settings → Environment Variables):
 *   TELEGRAM_BOT_TOKEN   — tokenul botului de la BotFather
 *   TELEGRAM_CHAT_ID     — chat_id-ul tau (securitate: ignora mesaje de la altii)
 *   ANTHROPIC_API_KEY    — pentru Claude Haiku
 *   GITHUB_PAT           — Personal Access Token (scopes: repo + workflow)
 *   GITHUB_REPO          — "Perfektsauberservice/perfektsauberservice-site"
 */

const GITHUB_REPO = process.env.GITHUB_REPO || 'Perfektsauberservice/perfektsauberservice-site';

// Workflows disponibile pe care botul le poate declansa
const WORKFLOWS = {
  'weekly-content': {
    file: 'weekly-content.yml',
    name: 'Genereaza si publica articole (5/zi)',
    branch: 'master',
  },
  'autopost': {
    file: 'pss-background-autopost.yml',
    name: 'Publica articole din coada',
    branch: 'master',
  },
  'schema-links': {
    file: 'pss-schema-and-links.yml',
    name: 'Update schema JSON-LD + linkuri interne + sitemap',
    branch: 'master',
  },
  'fb-poster': {
    file: 'pss-fb-poster.yml',
    name: 'Posteaza pe Facebook',
    branch: 'master',
  },
  'fix-city-pages': {
    file: 'pss-fix-city-pages.yml',
    name: 'Fix pagini oras (poze SEO + blog links)',
    branch: 'master',
  },
  'competitor-monitor': {
    file: 'pss-competitor-monitor.yml',
    name: 'Monitorizeaza competitori Google',
    branch: 'master',
  },
};

// --- Helpers ---

async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function triggerWorkflow(pat, workflowFile, branch = 'master') {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: branch }),
  });
  return res.status === 204; // 204 No Content = succes
}

async function getRecentRuns(pat, limit = 5) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=${limit}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.workflow_runs || [];
}

async function claudeInterpret(apiKey, userMessage) {
  const systemPrompt = `Esti un asistent pentru Laura, proprietara site-ului perfektsauberservice.com (serviciu curatenie/debarasare, Germania).
Laura iti trimite comenzi in romana sau germana prin Telegram. Trebuie sa intelegi ce vrea si sa raspunzi cu un JSON strict.

Actiunile disponibile:
- trigger_workflow: declanseaza un workflow GitHub Actions
- check_status: verifica statusul ultimelor rulari
- help: arata lista de comenzi disponibile
- unknown: mesaj neclar, cere clarificare

Workflow-uri disponibile (key-uri exacte):
- "weekly-content" = genereaza si publica articole noi
- "autopost" = publica articole deja generate din coada
- "schema-links" = actualizeaza schema JSON-LD, linkuri interne si sitemap
- "fb-poster" = posteaza pe Facebook Page
- "fix-city-pages" = actualizeaza paginile de oras (poze + blog links)
- "competitor-monitor" = verifica pozitii Google si competitori

Raspunde DOAR cu JSON valid, fara text suplimentar:
{"action": "trigger_workflow", "workflow": "weekly-content", "reason": "motiv scurt"}
{"action": "check_status"}
{"action": "help"}
{"action": "unknown", "clarification": "intrebare catre Laura"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Claude API error:', err);
    return null;
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim();

  try {
    return JSON.parse(raw);
  } catch {
    console.error('Claude raspuns non-JSON:', raw);
    return null;
  }
}

function statusEmoji(conclusion) {
  if (conclusion === 'success') return '✅';
  if (conclusion === 'failure') return '❌';
  if (conclusion === null) return '🔄'; // in curs
  return '⚠️';
}

function buildHelpMessage() {
  const lines = [
    `🤖 *Comenzi disponibile:*`,
    ``,
    `📝 *Articole:*`,
    `• _"genereaza articole"_ sau _"publica articole"_ → weekly-content`,
    `• _"publica din coada"_ → autopost`,
    ``,
    `🔧 *SEO:*`,
    `• _"actualizeaza schema"_ sau _"update linkuri"_ → schema-links`,
    `• _"fix pagini oras"_ → fix-city-pages`,
    ``,
    `📱 *Social media:*`,
    `• _"posteaza facebook"_ → fb-poster`,
    ``,
    `📊 *Monitorizare:*`,
    `• _"verifica competitori"_ → competitor-monitor`,
    `• _"status"_ sau _"ce mai ruleaza"_ → ultimele 5 rulari`,
  ];
  return lines.join('\n');
}

// --- Handler principal ---

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatId = process.env.TELEGRAM_CHAT_ID;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const githubPat = process.env.GITHUB_PAT;

  if (!botToken || !allowedChatId || !anthropicKey || !githubPat) {
    console.error('Lipsesc env vars: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / ANTHROPIC_API_KEY / GITHUB_PAT');
    return { statusCode: 200, body: 'OK' };
  }

  let update;
  try {
    update = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const message = update?.message;
  if (!message) return { statusCode: 200, body: 'OK' }; // ignora non-mesaje (callback queries etc.)

  const chatId = String(message.chat?.id);
  const text = message.text || '';

  // Securitate: accepta mesaje DOAR de la chat_id-ul autorizat
  if (chatId !== String(allowedChatId)) {
    console.warn(`Mesaj ignorat de la chat_id necunoscut: ${chatId}`);
    return { statusCode: 200, body: 'OK' };
  }

  console.log(`📨 Mesaj primit: "${text}"`);

  // Cazuri speciale fara Claude (economie de tokens)
  const lowerText = text.toLowerCase().trim();
  if (lowerText === '/start' || lowerText === '/help' || lowerText === 'ajutor' || lowerText === 'help') {
    await sendTelegram(botToken, chatId, buildHelpMessage());
    return { statusCode: 200, body: 'OK' };
  }

  // Interpreteaza cu Claude Haiku
  await sendTelegram(botToken, chatId, `⏳ Interpretez comanda...`);

  const intent = await claudeInterpret(anthropicKey, text);

  if (!intent) {
    await sendTelegram(botToken, chatId, `❌ Eroare la interpretarea comenzii. Incearca din nou.`);
    return { statusCode: 200, body: 'OK' };
  }

  console.log('Intent detectat:', JSON.stringify(intent));

  // Executa actiunea
  if (intent.action === 'trigger_workflow') {
    const wf = WORKFLOWS[intent.workflow];
    if (!wf) {
      await sendTelegram(botToken, chatId, `❓ Workflow necunoscut: \`${intent.workflow}\`. Scrie /help pentru lista.`);
      return { statusCode: 200, body: 'OK' };
    }

    const ok = await triggerWorkflow(githubPat, wf.file, wf.branch);
    if (ok) {
      await sendTelegram(botToken, chatId,
        `✅ *${wf.name}*\n\nWorkflow pornit cu succes! Verifica GitHub Actions pentru progres.\n\nMotiv detectat: _${intent.reason || '—'}_`
      );
    } else {
      await sendTelegram(botToken, chatId,
        `❌ Nu am putut porni \`${wf.file}\`. Verifica GITHUB_PAT sau daca workflow-ul exista.`
      );
    }

  } else if (intent.action === 'check_status') {
    const runs = await getRecentRuns(githubPat, 5);
    if (!runs) {
      await sendTelegram(botToken, chatId, `❌ Nu am putut obtine statusul. Verifica GITHUB_PAT.`);
      return { statusCode: 200, body: 'OK' };
    }
    if (runs.length === 0) {
      await sendTelegram(botToken, chatId, `ℹ️ Nu exista rulari recente.`);
      return { statusCode: 200, body: 'OK' };
    }

    const lines = [`📊 *Ultimele rulari GitHub Actions:*`, ``];
    for (const run of runs) {
      const emoji = statusEmoji(run.conclusion);
      const name = run.name || run.workflow_id || '—';
      const ts = new Date(run.created_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
      lines.push(`${emoji} *${name}*`);
      lines.push(`   Status: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}`);
      lines.push(`   Data: ${ts}`);
      lines.push(``);
    }
    await sendTelegram(botToken, chatId, lines.join('\n'));

  } else if (intent.action === 'help') {
    await sendTelegram(botToken, chatId, buildHelpMessage());

  } else {
    // unknown
    const clarification = intent.clarification || 'Nu am inteles comanda. Scrie /help pentru lista de comenzi.';
    await sendTelegram(botToken, chatId, `❓ ${clarification}`);
  }

  return { statusCode: 200, body: 'OK' };
};
