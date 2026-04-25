const fs = require('fs');
const path = require('path');

/**
 * Recibe y guarda datos de monitoreo localmente
 */
exports.uploadMonitoringData = async (req, res) => {
    console.log(`[MONITORING] Intento de subida recibido para servicio: ${req.body?.service}`);
    try {
        const { service, data, html } = req.body;

        if (!service || !data) {
            return res.status(400).json({ error: 'Servicio y datos son requeridos' });
        }

        const mappedService = normalizeServiceId(service);
        const baseDir = path.join(__dirname, '../../data/monitoring', mappedService.toLowerCase());
        
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const historyFile = path.join(baseDir, `report_${timestamp}.json`);
        const latestFile = path.join(baseDir, 'latest.json');

        fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
        fs.writeFileSync(latestFile, JSON.stringify(data, null, 2));

        // Guardar HTML: si viene del script úsalo, si no, generarlo automáticamente del JSON
        const htmlContent = html || generateHtmlReport(service, data);
        fs.writeFileSync(path.join(baseDir, `report_${timestamp}.html`), htmlContent);
        fs.writeFileSync(path.join(baseDir, 'latest.html'), htmlContent);

        console.log(`[MONITORING] Reporte de ${service} guardado. HTML: ${html ? 'enviado por script' : 'generado automáticamente'}`);

        res.status(201).json({ 
            message: 'Datos guardados correctamente',
            file: `report_${timestamp}.json`,
            hasHtml: true
        });
    } catch (error) {
        console.error('[MONITORING ERROR]', error);
        res.status(500).json({ error: 'Error al procesar el monitoreo' });
    }
};

/**
 * Genera un reporte HTML básico a partir del JSON de monitoreo
 */
function generateHtmlReport(service, data) {
    const ts = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });
    const json = JSON.stringify(data, null, 2);
    const title = `Reporte de Monitoreo — ${service.toUpperCase()}`;
    
    // Secciones específicas para AD
    let sections = '';
    if (data.DCs?.Status) {
        sections += `<h2>🖥️ Estado de Controladores de Dominio</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><tr style="background:#1e293b;color:#e2e8f0"><th>Nombre</th><th>Uptime</th><th>Ping</th><th>Sitio</th></tr>`;
        data.DCs.Status.forEach(dc => {
            const ok = dc.Ping === 'OK';
            sections += `<tr><td><b>${dc.Name}</b></td><td>${dc.Uptime||'N/A'}</td><td style="color:${ok?'#10b981':'#f43f5e'};font-weight:bold">${dc.Ping||'N/A'}</td><td>${dc.Site||'N/A'}</td></tr>`;
        });
        sections += '</table>';
    }
    if (data.Replication) {
        const ok = data.Replication.Status === 'OK';
        sections += `<h2>🔄 Replicación AD</h2><p style="color:${ok?'#10b981':'#f43f5e'};font-size:1.4em;font-weight:bold">${data.Replication.Status}</p>`;
    }
    if (data.Security) {
        sections += `<h2>🔒 Eventos de Seguridad (7 días)</h2><ul><li>Fallos de login (4625): <b style="color:#f43f5e">${data.Security.FailedLogins??0}</b></li><li>Bloqueos de cuenta: <b style="color:#f59e0b">${data.Security.AccountLockouts??0}</b></li><li>Cambios de política: <b>${data.Security.PolicyChanges??0}</b></li></ul>`;
    }
    if (data.Disk?.Disks) {
        sections += `<h2>💾 Almacenamiento</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"><tr style="background:#1e293b;color:#e2e8f0"><th>DC</th><th>Unidad</th><th>Libre</th><th>%</th></tr>`;
        data.Disk.Disks.forEach(d => {
            const color = d.PercentFree < 15 ? '#f43f5e' : d.PercentFree < 25 ? '#f59e0b' : '#10b981';
            sections += `<tr><td>${d.DC}</td><td>${d.Drive||'C:'}</td><td>${d.FreeGB}GB</td><td style="color:${color};font-weight:bold">${d.PercentFree}%</td></tr>`;
        });
        sections += '</table>';
    }
    if (data.Backups?.Status) {
        sections += `<h2>📦 Backups</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"><tr style="background:#1e293b;color:#e2e8f0"><th>DC</th><th>Último Backup</th></tr>`;
        Object.entries(data.Backups.Status).forEach(([dc, date]) => {
            sections += `<tr><td>${dc}</td><td>${date}</td></tr>`;
        });
        sections += '</table>';
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background:#0f172a; color:#e2e8f0; padding:2rem; }
    h1 { color:#38bdf8; border-bottom:2px solid #1e3a5f; padding-bottom:.5rem; }
    h2 { color:#94a3b8; margin-top:2rem; font-size:1rem; text-transform:uppercase; letter-spacing:.05em; }
    table { margin-top:.5rem; margin-bottom:1rem; }
    td, th { padding:6px 12px; border:1px solid #1e3a5f; }
    pre { background:#1e293b; padding:1rem; border-radius:8px; overflow:auto; font-size:.8rem; color:#94a3b8; }
    .meta { color:#64748b; font-size:.85rem; margin-bottom:1.5rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Generado: ${ts} | Equipo: ${data.Hostname || service}</p>
  ${sections}
  <h2>📋 Datos Raw (JSON)</h2>
  <pre>${json}</pre>
</body>
</html>`;
}

/**
 * Normaliza el nombre del servicio para coincidir con las carpetas
 */
function normalizeServiceId(service) {
    if (!service) return '';
    const s = service.toLowerCase();
    if (s === 'ksc' || s.includes('kaspersky')) return 'ksc';
    if (s === 'zk') return 'zk';
    if (s === 'ad' || s.includes('ad01')) return 'ad';
    if (s === 'ad-dc02' || s.includes('ad02')) return 'ad-dc02';
    if (s === 'anfigane' || s.includes('host1')) return 'ad-host';
    if (s === 'anfi-seg' || s.includes('host2')) return 'anfi-seg';
    return s;
}

/**
 * Obtiene el último estado de un servicio
 */
exports.getLatestStatus = (req, res) => {
    try {
        const rawService = req.params.service;
        const service = normalizeServiceId(rawService);
        const latestFile = path.join(__dirname, '../../data/monitoring', service, 'latest.json');

        if (!fs.existsSync(latestFile)) {
            // Devolver 200 con null en lugar de 404 para evitar errores en consola del frontend
            console.log(`[MONITORING] Sin datos para ${rawService} (mapped: ${service})`);
            return res.status(200).json(null);
        }

        const data = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
        res.json(data);
    } catch (error) {
        console.error('[MONITORING GET ERROR]', error);
        res.status(500).json({ error: 'Error al obtener el estado' });
    }
};

/**
 * Lista el historial de reportes
 */
exports.getHistory = (req, res) => {
    try {
        const service = normalizeServiceId(req.params.service);
        const baseDir = path.join(__dirname, '../../data/monitoring', service);

        if (!fs.existsSync(baseDir)) {
            // Devolver lista vacía en lugar de 404
            return res.status(200).json({ files: [] });
        }

        const files = fs.readdirSync(baseDir)
            .filter(f => f.startsWith('report_'))
            .sort()
            .reverse()
            .slice(0, 20); // Últimos 20

        res.json({ files });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el historial' });
    }
};

/**
 * Obtiene el HTML de un reporte específico o el último
 */
exports.getReportHtml = (req, res) => {
    try {
        const { service, filename } = req.params;
        const mappedService = normalizeServiceId(service);
        const baseDir = path.join(__dirname, '../../data/monitoring', mappedService.toLowerCase());
        
        let filePath;
        if (filename === 'latest') {
            filePath = path.join(baseDir, 'latest.html');
        } else {
            // Asegurar que el nombre de archivo es seguro y termina en .html
            const safeFile = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.html';
            filePath = path.join(baseDir, safeFile.replace('.html.html', '.html'));
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('<h1>No se encontró el reporte HTML</h1>');
        }

        const html = fs.readFileSync(filePath, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        res.status(500).send('Error al cargar el reporte');
    }
};
