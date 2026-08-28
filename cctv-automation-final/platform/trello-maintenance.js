const crypto = require('node:crypto');

const MONTHS = {ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,SETIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12};
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

function parseWorkItems(cards, source, locationByCode, overrides = new Map(), year = 2026) {
  const rows = [];
  for (const card of cards) {
    let checklists = [];
    try { checklists = JSON.parse(card.checklists || '[]'); } catch {}
    const cardMonth = MONTHS[normalize(card.name)] || null;
    for (const checklist of checklists) for (const item of checklist.checkItems || []) {
      const rawName = String(item.name || '').trim();
      const code = rawName.match(/^(\d{3,5})(?=\D|$)/)?.[1] || null;
      const date = rawName.match(/(\d{1,2})\/(\d{1,2})\s*$/);
      const month = date ? Number(date[2]) : cardMonth;
      const day = date ? Number(date[1]) : null;
      const automatic = code ? locationByCode.get(code) : null;
      const override = overrides.get(String(item.id)) || (code ? overrides.get(`CODE:${code}`) : null);
      const location = override || automatic || null;
      rows.push({
        id: crypto.createHash('sha256').update(`TRELLO:${item.id}`).digest('hex').slice(0, 32),
        sourceItemId: String(item.id), sourceChecklistId: checklist.id || null, sourceCardId: card.id,
        sourceListId: source.listId, sourceBoardId: source.boardId, sourceBoardName: source.board,
        sourceListName: source.list, sourceCardName: card.name, sourceBoardUrl: source.boardUrl || null,
        rawName, sourceState: item.state || null, siisCode: code, locationId: location?.id || null,
        scheduledAt: month && day ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` : null,
        status: item.state === 'complete' ? 'COMPLETED' : 'PENDING',
        identityStatus: override ? 'LINKED_MANUAL' : automatic ? 'LINKED_SIIS' : code ? 'CODE_NOT_FOUND' : 'MISSING_CODE',
        payload: {position:item.pos ?? null, due:card.due || null},
      });
    }
  }
  return rows;
}

function fingerprint(items) {
  return crypto.createHash('sha256').update(JSON.stringify(items.map(x => [x.sourceItemId,x.rawName,x.sourceState,x.sourceCardId]))).digest('hex');
}

module.exports = {parseWorkItems, fingerprint};
