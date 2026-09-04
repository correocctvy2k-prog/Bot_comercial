const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const { createCybersecurityApi } = require('../src/cybersecurity-api');
const { createSupabaseAdminAuthorizer } = require('../src/supabase-admin-auth');
const { openNetworkPolicyStore } = require('../src/network-policy-store');
const { createOperationsPointsCatalog } = require('../src/operations-points-catalog');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasArgument(name) {
  return process.argv.includes(`--${name}`);
}

const databasePath = path.resolve(argument('db', './data/cyber-inventory.db'));
const host = argument('host', '127.0.0.1');
const port = Number(argument('port', '3005'));
const immutable = hasArgument('immutable');
if (!fs.existsSync(databasePath)) throw new Error('DATABASE_NOT_FOUND');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
const databaseSource = immutable
  ? `${pathToFileURL(databasePath).href}?immutable=1`
  : databasePath;
const db = new DatabaseSync(databaseSource, { readOnly: true });
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA query_only = ON');
const authorizeAdmin = createSupabaseAdminAuthorizer({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_KEY,
});
const policyDb = process.env.CYBER_POLICY_DB ? openNetworkPolicyStore(process.env.CYBER_POLICY_DB) : null;
const getExpectedNetworks = createOperationsPointsCatalog({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY });
const server = createCybersecurityApi({ db, policyDb, authorizeAdmin, getExpectedNetworks });
server.listen(port, host, () => {
  process.stdout.write(`${JSON.stringify({
    status: 'READY', host, port, mode: immutable ? 'read-only-immutable' : 'read-only',
  })}\n`);
});
function shutdown() {
  server.close(() => { db.close(); policyDb?.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
