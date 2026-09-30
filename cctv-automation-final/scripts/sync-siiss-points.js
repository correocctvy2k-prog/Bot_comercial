'use strict';

// spec 0014 — sincroniza siiss_active/siiss_last_sync en `puntos_venta` con datos en vivo de
// SIIS, sin pasar por Asamblea. Mismo patrón CLI que scripts/sync-crm-points.js (spec 0012).
//
//   node scripts/sync-siiss-points.js --dry-run   # calcula y reporta, no escribe nada
//   node scripts/sync-siiss-points.js             # además hace PATCH en Supabase

require('dotenv').config({ quiet: true });

const { syncSiissPoints } = require('../platform/siis-points-sync');

const DRY_RUN = process.argv.includes('--dry-run');

syncSiissPoints({ dryRun: DRY_RUN })
  .then((summary) => {
    console.log(JSON.stringify({ mode: DRY_RUN ? 'DRY_RUN' : 'APPLIED', ...summary }, null, 2));
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
