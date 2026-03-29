export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { 'content-type': 'application/json' } });
  }

  const body = await req.json().catch(() => ({}));
  const required = ['city', 'service', 'topic'];
  const missing = required.filter((key) => !body[key]);
  if (missing.length) {
    return new Response(JSON.stringify({ ok: false, error: `Missing: ${missing.join(', ')}` }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const payload = {
    ok: true,
    mode: 'skeleton',
    message: 'Function is ready for full automation after OPENAI_API_KEY and Git credentials are added in Netlify env.',
    input: body,
    requiredEnv: ['OPENAI_API_KEY', 'GITHUB_OWNER', 'GITHUB_REPO', 'GITHUB_TOKEN']
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
};
