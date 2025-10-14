# Redfin → Google Sheets Feed

Pull Redfin search results (via the same CSV used by the "Download All" button) and write a normalized feed into a Google Sheet, plus a simple changes log (price/status changes, additions, removals).

## Prerequisites
- Node.js 18+ (uses global `fetch`)
- A Google Cloud service account JSON key file (download as `key.json`)
- The target Google Sheet shared with the service account email (Editor)

## Install
```
npm install
```

## Configure
Create a `.env` file in the project root with:

```
# Path to your service account key file
GOOGLE_SERVICE_ACCOUNT_FILE=key.json

# Spreadsheet ID (the long ID in the Sheet URL)
GOOGLE_SHEETS_ID=your_spreadsheet_id_here

# One or more Redfin search URLs (comma-separated)
# Example: a Lubbock, TX Homes for Sale results page
SEARCH_URLS=https://www.redfin.com/city/11254/TX/Lubbock/filter/include=sold-3yr,viewport=...,min-price=...,max-price=...

# Optional: add a cookie (if blocked) and tune delays
# REDFIN_COOKIE=copy the Cookie header for redfin.com
# REDFIN_DELAY_MIN_MS=1500
# REDFIN_DELAY_MAX_MS=3500
```

Notes:
- You can also set `REDFIN_SEARCH_URL` (single URL). If `SEARCH_URLS` is not set, the app falls back to `REDFIN_SEARCH_URL`.
- Share the Google Sheet with the `client_email` from your `key.json`.

You can sanity-check your key file with:
```
node check-env.mjs
```

## Run
```
npm start
```

The script will:
- Fetch listings for each URL in `SEARCH_URLS` by finding Redfin's CSV export link.
- Normalize the data.
- Create tabs `live_feed` and `changes_log` (if missing).
- Overwrite `live_feed` with the current snapshot, and append change events to `changes_log`.

## Tabs & Columns
- `live_feed`: mls_id, listing_url, address, price, status, dom, beds, baths, sqft, lot_sqft, year_built, lat, lon, agent_name, brokerage, first_seen, last_seen, last_change_at, record_hash
- `changes_log`: ts, change_type, mls_id, listing_url, address, old_price, new_price, old_status, new_status

## Troubleshooting
- If no rows appear: ensure `SEARCH_URLS` is a Redfin results page that has a visible "Download All" CSV button for logged-out users. The scraper mimics that request.
- If Sheets writes fail: ensure `GOOGLE_SHEETS_ID` is correct and the Sheet is shared with the service account email (Editor).
- Network restrictions or rate limits can cause temporary failures; the script retries pages sequentially with small delays.
