// scrape.js
// Strategy: fetch each search page -> find the exact "Download All" CSV link -> fetch CSV -> map rows.
// Works with env SEARCH_URLS (comma-separated). No Playwright required. Node 18+ (global fetch).

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36';


function htmlUnescape(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absolutize(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

/** Find the "Download All" CSV link inside the HTML (robust heuristics). */
function extractCsvUrlFromHtml(html, baseUrl) {
  // 1) direct stingray CSV link
  let m = html.match(/href="([^"]*?stingray\/api\/gis-csv[^"]+)"/i);
  if (m) return absolutize(htmlUnescape(m[1]), baseUrl);

  // 2) sometimes Redfin wraps a "download" endpoint that redirects to CSV
  m = html.match(/href="([^"]*?download[^"]+format=csv[^"]*)"/i);
  if (m) return absolutize(htmlUnescape(m[1]), baseUrl);

  // 3) sometimes data-href on a button
  m = html.match(/data-href="([^"]*?gis-csv[^"]+)"/i);
  if (m) return absolutize(htmlUnescape(m[1]), baseUrl);

  // 4) as a last resort, any link with "csv" in it
  m = html.match(/href="([^"]+\.csv[^"]*)"/i);
  if (m) return absolutize(htmlUnescape(m[1]), baseUrl);

  // extra fallbacks: single-quoted and JSON-escaped patterns
  let m2 = html.match(/href='([^']*?stingray\/api\/gis-csv[^']+)'/i);
  if (m2) return absolutize(htmlUnescape(m2[1]), baseUrl);

  m2 = html.match(/href='([^']+\.csv[^']*)'/i);
  if (m2) return absolutize(htmlUnescape(m2[1]), baseUrl);

  const m3 = html.match(/\\\/stingray\\\/api\\\/gis-csv[^"']+/i);
  if (m3) {
    const unescaped = m3[0].replace(/\\\//g, '/');
    return absolutize(unescaped, baseUrl);
  }

  return null;
}

function parseSearchUrls(raw) {
  // Split by http(s) boundaries so commas inside query params don't break URLs.
  const s = String(raw || '');
  const indices = [];
  const re = /https?:\/\//gi;
  let m;
  while ((m = re.exec(s)) !== null) indices.push(m.index);
  if (!indices.length) return [];
  const out = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : s.length;
    let piece = s.slice(start, end);
    // trim surrounding separators/whitespace
    piece = piece.replace(/^[\s,;]+/, '').replace(/[\s,;]+$/, '');
    if (piece) out.push(piece);
  }
  return out;
}

function parseCsv(str) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < str.length) {
    const c = str[i];
    if (inQuotes) {
      if (c === '"') {
        if (str[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { pushField(); i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { pushField(); pushRow(); i++; continue; }
      field += c; i++; continue;
    }
  }
  pushField(); pushRow();
  return rows.filter(r => r.length > 1);
}

function hIndex(headerRow = []) {
  const map = new Map();
  headerRow.forEach((h, i) => map.set((h || '').trim().toUpperCase(), i));
  const get = (name) => map.get((name || '').toUpperCase());
  get.any = (...cands) => {
    for (const cand of cands) {
      const idx = get(cand);
      if (idx != null) return idx;
    }
    for (const [k, v] of map) {
      if (cands.some(c => k.includes(c.toUpperCase()))) return v;
    }
    return undefined;
  };
  return get;
}

function toNumber(x) {
  if (x == null) return NaN;
  const n = String(x).replace(/[^0-9.]/g, '');
  return n ? Number(n) : NaN;
}

function mapCsvRows(rows) {
  const H = hIndex(rows[0]);
  const idxSqft = H.any('SQUARE FEET','SQFT');
  const idxLat  = H.any('LATITUDE','LAT');
  const idxLon  = H.any('LONGITUDE','LON','LONG');
  const idxUrl  = H.any('URL','URL (REDFIN)','URL (SEE LISTING)','LISTING URL','LINK','PROPERTY URL');

  return rows.slice(1).map(r => {
    const price = toNumber(r[H('PRICE')]);
    const beds  = toNumber(r[H('BEDS')]);
    const baths = toNumber(r[H('BATHS')]);
    const sqft  = toNumber(r[idxSqft]);
    return {
      id: r[H('MLS#')] || '',
      url: (idxUrl != null ? r[idxUrl] : r[H('URL')]) || '',
      address: [r[H('ADDRESS')], r[H('CITY')], r[H('STATE')], r[H('ZIP')]].filter(Boolean).join(', '),
      price: Number.isFinite(price) ? price : '',
      status: r[H('STATUS')] || 'Active',
      beds: Number.isFinite(beds) ? beds : '',
      baths: Number.isFinite(baths) ? baths : '',
      sqft: Number.isFinite(sqft) ? sqft : '',
      dom: r[H('DAYS ON MARKET')] || '',
      lot_sqft: r[H('LOT SIZE')] || '',
      year_built: r[H('YEAR BUILT')] || '',
      lat: r[idxLat] || '',
      lon: r[idxLon] || '',
      agent_name: r[H('LISTING AGENT')] || '',
      brokerage: r[H('BROKERAGE')] || '',
      property_type: r[H.any('PROPERTY TYPE','PROPERTY','TYPE')] || '',
      hoa_month: (()=>{
        const idxHOA = H.any('HOA/MONTH','HOA','HOA DUES','HOA FEE');
        const n = toNumber(r[idxHOA]);
        return Number.isFinite(n) ? n : '';
      })()
    };
  }).filter(x => x.url || x.address);
}

async function fetchCsvForSearchUrl(searchUrl) {
  // Direct CSV URL provided? Fetch it as-is.
  if (/stingray\/api\/gis-csv/i.test(searchUrl) || /\.csv(\b|[?])/i.test(searchUrl)) {
    const cookie = process.env.REDFIN_COOKIE || '';
    const csvRes = await fetch(searchUrl, {
      headers: {
        'user-agent': UA,
        'accept': 'text/csv,*/*;q=0.9',
        'referer': 'https://www.redfin.com/',
        ...(cookie ? { cookie } : {})
      }
    });
    if (!csvRes.ok) throw new Error(`csv ${csvRes.status}`);
    const csvText = await csvRes.text();
    const rows = parseCsv(csvText);
    return rows.length ? mapCsvRows(rows) : [];
  }

  // 1) load the search page
  const cookie = process.env.REDFIN_COOKIE || '';
  const res = await fetch(searchUrl, {
    headers: {
      'user-agent': UA,
      'accept': 'text/html,application/xhtml+xml',
      'referer': 'https://www.redfin.com/',
      ...(cookie ? { cookie } : {})
    }
  });
  if (!res.ok) throw new Error(`page ${res.status}`);
  const html = await res.text();

  // 2) find the CSV link exactly like the "Download All" button uses
  const csvUrl = extractCsvUrlFromHtml(html, searchUrl);
  if (!csvUrl) throw new Error('csv link not found in page');

  // 3) fetch CSV
  const csvRes = await fetch(csvUrl, {
    headers: {
      'user-agent': UA,
      'accept': 'text/csv,*/*;q=0.9',
      'referer': searchUrl,
      ...(cookie ? { cookie } : {})
    }
  });
  if (!csvRes.ok) throw new Error(`csv ${csvRes.status}`);
  const csvText = await csvRes.text();
  const rows = parseCsv(csvText);
  if (!rows.length) return [];

  return mapCsvRows(rows);
}

/** Public API used by index.js */
export async function fetchListings() {
  const raw = (process.env.SEARCH_URLS || '').trim();
  if (!raw) {
    console.warn('SEARCH_URLS is empty - nothing to fetch.');
    return [];
  }
  // Extract URLs robustly by http-boundaries (handles commas within filters)
  const urls = parseSearchUrls(raw);

  const all = [];
  for (const u of urls) {
    try {
      const rows = await fetchCsvForSearchUrl(u);
      rows.forEach(r => (r.source_search = u));
      all.push(...rows);
      console.log(`OK: ${u} -> +${rows.length} rows`);
    } catch (e) {
      console.warn(`FAIL: ${u} -> ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  // de-dupe by URL (fallback address)
  const dedup = new Map();
  for (const r of all) {
    const key = r.url || r.address;
    if (!dedup.has(key)) dedup.set(key, r);
  }
  return Array.from(dedup.values());
}

