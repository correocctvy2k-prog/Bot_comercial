const fs = require('node:fs');
const { validateReadModel } = require('../src/greenbone-protected-exporter');

try {
  const text = fs.readFileSync(0, 'utf8');
  const model = JSON.parse(text);
  const validation = validateReadModel(model);
  if (!validation.valid) {
    process.stderr.write(`${JSON.stringify({ status: 'INVALID', errors: validation.errors })}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(`${JSON.stringify({
      status: 'VALID', reportStatus: model.ReportStatus,
      scanProfile: model.ScanProfile, results: model.Results.length,
      startedAt: model.ScanStartedAt, completedAt: model.ScanCompletedAt,
    })}\n`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode: 'INVALID_READ_MODEL_JSON' })}\n`);
  process.exitCode = 1;
}
