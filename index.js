// index.js
import 'dotenv/config';
import { fetchListings } from './scrape.js';
import { normalize } from './normalize.js';
import { diffRecords } from './diff.js';
import { google } from 'googleapis';
import { urls as generatedUrls } from './urls.js';

// --- Sheets client (we already validated auth; re-implement here for a single-file run) ---
async function getSheetsClient() {
  const { default: fsSync } = await import('fs');
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!keyFile) throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE is not set');

  const raw = fsSync.readFileSync(keyFile, 'utf8');
  const creds = JSON.parse(raw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    keyId: creds.private_key_id,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

// --- Sheets helpers ---
async function ensureTabs(sheets, spreadsheetId) {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  const have = new Set(data.sheets.map(s => s.properties.title));
  const wanted = ['live_feed', 'changes_log', 'raw_feed'];
  const requests = [];
  for (const t of wanted) if (!have.has(t)) requests.push({ addSheet: { properties: { title: t } } });
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }
}

async function readLiveFeed(sheets, spreadsheetId) {
  try {
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'live_feed!A1:Z10000' });
    const rows = data.values || [];
    if (!rows.length) return [];
    const headers = rows[0];
    return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  } catch (e) {
    if (e?.code === 400) return []; // no data yet
    throw e;
  }
}

async function writeLiveFeed(sheets, spreadsheetId, rows) {
  const headers = [
    'mls_id','listing_url','address','price','status','dom','beds','baths','sqft',
    'lot_sqft','year_built','lat','lon','agent_name','brokerage','first_seen','last_seen','last_change_at','record_hash'
  ];
  const values = [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))];
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'live_feed' });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'live_feed!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

async function writeRawFeed(sheets, spreadsheetId, csvSlices) {
  if (!csvSlices.length) return;
  const values = [];
  csvSlices.forEach((slice, idx) => {
    const rows = slice.rows.slice(1); // skip header
    let added = false;
    rows.forEach(row => {
      const copy = row.slice();
      if (copy.length < 2) copy.length = 2;
      copy[1] = slice.term || '';
      values.push(copy);
      added = true;
    });
    if (added && idx !== csvSlices.length - 1) values.push([]);
  });
  if (!values.length) return;
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'raw_feed' });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'raw_feed!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

async function appendChanges(sheets, spreadsheetId, changes) {
  if (!changes.length) return;
  const headers = ['ts','change_type','mls_id','listing_url','address','old_price','new_price','old_status','new_status'];
  await ensureHeaderRow(headers, 'changes_log');
  const values = changes.map(c => [
    new Date().toISOString(), c.change_type, c.mls_id || '', c.listing_url || '', c.address || '',
    c.old?.price ?? '', c.new?.price ?? '', c.old?.status ?? '', c.new?.status ?? ''
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'changes_log!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });

  async function ensureHeaderRow(h, tab) {
    const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:Z1` });
    const have = data.values?.[0];
    if (!have) {
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${tab}!A1`, valueInputOption: 'RAW', requestBody: { values: [h] }
      });
    }
  }
}

// --- Main ---
async function main() {
  let spreadsheetId = (process.env.GOOGLE_SHEETS_ID || '').trim();
  // strip accidental surrounding quotes and trailing comma
  spreadsheetId = spreadsheetId.replace(/^['"]|['"]$/g, '').replace(/,+$/,'');
  // Prefer programmatic URLs from urls.js; fall back to env vars for legacy flows.
  let searchUrls = '';
  if (Array.isArray(generatedUrls) && generatedUrls.length) {
    searchUrls = generatedUrls.join(',');
    console.log(`Loaded ${generatedUrls.length} URLs from urls.js`);
  } else {
    searchUrls = (process.env.SEARCH_URLS || process.env.REDFIN_SEARCH_URL || '').trim();
  }
  if (!searchUrls) throw new Error('Set SEARCH_URLS (comma-separated) or REDFIN_SEARCH_URL in .env');
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_ID is not set in .env');

  // Ensure scrape.js sees SEARCH_URLS
  process.env.SEARCH_URLS = searchUrls;

  console.log('Fetching listings from Redfin CSV...');
  const { listings, csvSlices } = await fetchListings();
  console.log(`Fetched ${listings.length} listings`);

  const normalized = listings.map(normalize);

  const sheets = await getSheetsClient();
  await ensureTabs(sheets, spreadsheetId);
  const prev = await readLiveFeed(sheets, spreadsheetId);

  const { merged, changes } = diffRecords(prev, normalized);
  await writeRawFeed(sheets, spreadsheetId, csvSlices);
  await writeLiveFeed(sheets, spreadsheetId, merged);
  await appendChanges(sheets, spreadsheetId, changes);

  console.log(`Wrote live_feed (${merged.length} rows). Logged ${changes.length} changes.`);
}

main().catch(err => { console.error(err); process.exit(1); });
