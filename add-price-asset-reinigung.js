const fs = require('fs');
const https = require('https');
const ENV_PATH = 'c:/tmp/google-ads/.env';
const env = {};
for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
function req(host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const r = https.request({ host, path, method: 'POST', headers }, resp => { let d=''; resp.on('data', c=>d+=c); resp.on('end', ()=>resolve({status:resp.statusCode, body:d})); });
    r.on('error', reject); r.write(body); r.end();
  });
}
async function getToken() {
  const b = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' }).toString();
  const res = await req('oauth2.googleapis.com', '/token', { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(b) }, b);
  return JSON.parse(res.body).access_token;
}
(async () => {
  const token = await getToken(); const CID = env.GOOGLE_ADS_CUSTOMER_ID;
  const H = { 'Authorization': 'Bearer ' + token, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': env.GOOGLE_ADS_LOGIN_CUSTOMER_ID, 'Content-Type': 'application/json' };

  const priceAsset = {
    type: 'SERVICES',
    languageCode: 'de',
    priceQualifier: 'FROM',
    priceOfferings: [
      { header: 'Endreinigung', description: 'Auszug, Übergabe', price: { amountMicros: 199000000, currencyCode: 'EUR' }, finalUrl: 'https://perfektsauberservice.com/endreinigung-rastatt' },
      { header: 'Büroreinigung', description: 'Büro bis 50 m²', price: { amountMicros: 110000000, currencyCode: 'EUR' }, unit: 'PER_MONTH', finalUrl: 'https://perfektsauberservice.com/bueroreinigung-rastatt' },
      { header: 'Hausmeisterservice', description: 'Pro Stunde', price: { amountMicros: 35000000, currencyCode: 'EUR' }, unit: 'PER_HOUR', finalUrl: 'https://perfektsauberservice.com/hausmeisterservice-rastatt' }
    ]
  };
  const assetOp = { create: { priceAsset } };
  const assetBody = JSON.stringify({ operations: [assetOp] });
  const assetRes = await req('googleads.googleapis.com', `/v21/customers/${CID}/assets:mutate`, { ...H, 'Content-Length': Buffer.byteLength(assetBody) }, assetBody);
  console.log('Asset create HTTP ' + assetRes.status);
  console.log(assetRes.body.substring(0, 800));
  const assetJson = JSON.parse(assetRes.body);
  if (!assetJson.results) return;
  const assetResourceName = assetJson.results[0].resourceName;

  const q = JSON.stringify({ query: `SELECT campaign.resource_name FROM campaign WHERE campaign.name = 'PSS_Reinigung_Search'` });
  const qres = await req('googleads.googleapis.com', `/v21/customers/${CID}/googleAds:search`, { ...H, 'Content-Length': Buffer.byteLength(q) }, q);
  const campRN = JSON.parse(qres.body).results[0].campaign.resourceName;

  const linkOp = { create: { campaign: campRN, asset: assetResourceName, fieldType: 'PRICE' } };
  const linkBody = JSON.stringify({ operations: [linkOp] });
  const linkRes = await req('googleads.googleapis.com', `/v21/customers/${CID}/campaignAssets:mutate`, { ...H, 'Content-Length': Buffer.byteLength(linkBody) }, linkBody);
  console.log('\nLink to campaign HTTP ' + linkRes.status);
  console.log(linkRes.body.substring(0, 800));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
