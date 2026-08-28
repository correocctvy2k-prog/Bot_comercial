function normalizeName(value = '') {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value = '') {
  const stop = new Set(['LA', 'EL', 'LOS', 'LAS', 'DE', 'DEL', 'Y', 'OFICINA', 'OFI', 'NVR', 'DVR', 'CAM', 'IP']);
  return normalizeName(value).split(' ').filter((token) => token && !stop.has(token));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function similarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const lt = tokens(left);
  const rt = tokens(right);
  const overlap = rt.filter((token) => lt.some((candidate) => candidate === token || (Math.min(candidate.length, token.length) >= 5 && levenshtein(candidate, token) <= 1))).length;
  const tokenScore = Math.max(overlap / Math.max(1, lt.length), overlap / Math.max(1, rt.length));
  const editScore = 1 - levenshtein(left, right) / Math.max(left.length, right.length);
  return Math.max(tokenScore, editScore);
}

function asText(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value.text) return value.text;
  if (typeof value === 'object' && value.result != null) return String(value.result);
  return String(value).trim() || null;
}

module.exports = { normalizeName, similarity, asText };
