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

        const baseDir = path.join(__dirname, '../../data/monitoring', service.toLowerCase());
        
        // Asegurar que el directorio existe
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const historyFile = path.join(baseDir, `report_${timestamp}.json`);
        const latestFile = path.join(baseDir, 'latest.json');

        // Guardar en historial
        fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
        
        // Actualizar último estado
        fs.writeFileSync(latestFile, JSON.stringify(data, null, 2));

        // Guardar HTML si viene
        if (html) {
            fs.writeFileSync(path.join(baseDir, `report_${timestamp}.html`), html);
            fs.writeFileSync(path.join(baseDir, 'latest.html'), html);
        }

        console.log(`[MONITORING] Recibido reporte de ${service} y guardado localmente.`);

        res.status(201).json({ 
            message: 'Datos guardados correctamente',
            file: `report_${timestamp}.json`,
            hasHtml: !!html
        });
    } catch (error) {
        console.error('[MONITORING ERROR]', error);
        res.status(500).json({ error: 'Error al procesar el monitoreo' });
    }
};

/**
 * Obtiene el último estado de un servicio
 */
exports.getLatestStatus = (req, res) => {
    try {
        const { service } = req.params;
        const filePath = path.join(__dirname, '../../data/monitoring', service.toLowerCase(), 'latest.json');

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'No hay reportes para este servicio' });
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el reporte' });
    }
};

/**
 * Lista el historial de reportes
 */
exports.getHistory = (req, res) => {
    try {
        const { service } = req.params;
        const baseDir = path.join(__dirname, '../../data/monitoring', service.toLowerCase());

        if (!fs.existsSync(baseDir)) {
            return res.status(404).json({ error: 'No hay historial para este servicio' });
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
        const baseDir = path.join(__dirname, '../../data/monitoring', service.toLowerCase());
        
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
