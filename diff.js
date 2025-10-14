// diff.js
export function diffRecords(prev, next) {
  const keyOf = (r) => r.mls_id || r.listing_url || r.address;
  const A = Object.fromEntries(prev.map(r => [keyOf(r), r]));
  const B = Object.fromEntries(next.map(r => [keyOf(r), r]));

  const nowIso = new Date().toISOString();
  const changes = [];
  const merged = [];

  // updates & additions
  for (const [k, n] of Object.entries(B)) {
    const p = A[k];
    if (!p) {
      merged.push({ ...n, first_seen: nowIso, last_seen: nowIso, last_change_at: nowIso });
      changes.push({ change_type: 'added', old: null, new: n, ...pickKey(n) });
    } else {
      const changed = p.record_hash !== n.record_hash || p.status !== n.status || p.price !== n.price;
      merged.push({
        ...n,
        first_seen: p.first_seen || nowIso,
        last_seen: nowIso,
        last_change_at: changed ? nowIso : (p.last_change_at || p.first_seen || nowIso)
      });
      if (p.price !== n.price) changes.push({ change_type: 'price_change', old: p, new: n, ...pickKey(n) });
      if (p.status !== n.status) changes.push({ change_type: 'status_change', old: p, new: n, ...pickKey(n) });
    }
  }

  // removals
  for (const [k, p] of Object.entries(A)) {
    if (!B[k] && (p.status || 'Active') === 'Active') {
      changes.push({ change_type: 'removed_from_market', old: p, new: null, ...pickKey(p) });
    }
  }

  return { merged, changes };
}

function pickKey(r) {
  return { mls_id: r.mls_id, listing_url: r.listing_url, address: r.address };
}
