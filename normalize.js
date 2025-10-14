// normalize.js
import crypto from 'node:crypto';

export function normalize(raw) {
  const norm = {
    mls_id: raw.mls_id || raw.id || '',
    listing_url: raw.url || '',
    address: raw.address || '',
    price: raw.price ?? '',
    status: raw.status || 'Active',
    dom: raw.dom ?? '',
    beds: raw.beds ?? '',
    baths: raw.baths ?? '',
    sqft: raw.sqft ?? '',
    lot_sqft: raw.lot_sqft ?? '',
    year_built: raw.year_built ?? '',
    lat: raw.lat ?? '',
    lon: raw.lon ?? '',
    agent_name: raw.agent_name || '',
    brokerage: raw.brokerage || ''
  };
  const hash = crypto
    .createHash('md5')
    .update([norm.price, norm.status, norm.beds, norm.baths, norm.sqft].join('|'))
    .digest('hex');
  return { ...norm, record_hash: hash };
}
