const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { analyzeSnapshot } = require('../src/inventory-analyzer');

const database = process.argv[2];
if (!database) {
  console.error('Usage: node scripts/analyze-inventory.js <database>');
  process.exitCode = 2;
} else {
  const dbPath = path.resolve(database);
  const db = openCyberDatabase(dbPath);
  try {
    const snapshot = db.prepare(`
      SELECT id FROM cyber_source_snapshots
      WHERE processing_status = 'SUCCESS'
      ORDER BY captured_at DESC LIMIT 1
    `).get();
    if (!snapshot) throw new Error('no successful snapshot found');

    const result = analyzeSnapshot({ db, snapshotId: snapshot.id });
    const reportDir = path.resolve(__dirname, '..', 'exports');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `inventory-quality-${snapshot.id}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify({
      status: result.status,
      analysisRunId: result.analysisRunId,
      summary: result.summary,
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });

    console.log(JSON.stringify({
      status: result.status,
      analysisRunId: result.analysisRunId,
      report: path.relative(process.cwd(), reportPath),
      summary: result.summary,
    }, null, 2));
  } finally {
    db.close();
  }
}
