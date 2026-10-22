export function flatten(value, prefix = '', out = {}) {
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix) out[prefix] = Array.isArray(value) ? '[]' : '{}';
    for (const [key, child] of entries) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out[prefix || '(value)'] = value;
  }
  return out;
}

export function diff(prev, next) {
  const changes = [];
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (!(key in next)) changes.push({ path: key, from: prev[key], to: undefined });
    else if (!(key in prev)) changes.push({ path: key, from: undefined, to: next[key] });
    else if (prev[key] !== next[key]) changes.push({ path: key, from: prev[key], to: next[key] });
  }
  return changes;
}

export function formatValue(value) {
  if (value === undefined) return '(none)';
  return typeof value === 'string' ? `"${value}"` : String(value);
}
