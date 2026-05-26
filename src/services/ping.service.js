const ping = require('ping');
const { getIO } = require('./socket.service');

const nodesToMonitor = [
    { id: 'ANFIGANE', ip: '192.168.8.43', name: 'ANFIGANE (Host 1)' },
    { id: 'AD',       ip: '192.168.8.44', name: 'AD01 Master' },
    { id: 'AD-DC02',  ip: '192.168.8.45', name: 'AD02 Secundario' },
    { id: 'AD-DC03',  ip: '192.168.8.46', name: 'AD03 Secundario' },
    { id: 'ANFI-SEG', ip: '192.168.8.41', name: 'ANFI-SEG13798 (Host 2)' },
    { id: 'KSC',      ip: '192.168.8.42', name: 'Kaspersky Security Center' }
];

let pingInterval = null;

async function checkNodes() {
    try {
        const io = getIO();
        const results = {};

        for (const node of nodesToMonitor) {
            try {
                const res = await ping.promise.probe(node.ip, {
                    timeout: 2,
                    extra: ['-c', '1'] // En Windows se ignora extra o se mapea, pero probe es multi-os
                });

                results[node.id] = {
                    status: res.alive ? 'UP' : 'DOWN',
                    time: res.time, // Latencia en ms
                    ip: node.ip
                };
                // Marcar cuándo fue verificado en el servidor (timestamp ms)
                results[node.id].checkedAt = Date.now();
            } catch (err) {
                results[node.id] = { status: 'DOWN', time: null, ip: node.ip };
            }
        }

        // Agregar alias útiles para la UI
        if (results['AD-DC02']) {
            results['AD02'] = results['AD-DC02'];
            results['192.168.8.45'] = results['AD-DC02'];
        }
        if (results['AD-DC03']) {
            results['AD03'] = results['AD-DC03'];
            results['DA03'] = results['AD-DC03'];
            results['192.168.8.46'] = results['AD-DC03'];
        }

        // Emitir estado global a todos los clientes conectados
        // Incluimos un timestamp por nodo (`checkedAt`) para que el cliente pueda
        // confiar en la marca de tiempo del servidor al calcular frescura.
        io.emit('monitoring:heartbeat', results);

    } catch (e) {
        // Silenciar si socket.io aún no está listo
    }
}

function startPingService() {
    console.log("📡 [PING_SVC] Iniciando servicio de latidos (Heartbeat) cada 10s...");
    
    // Check inicial a los 2 segundos
    setTimeout(checkNodes, 2000);

    // Bucle continuo cada 10 segundos
    pingInterval = setInterval(checkNodes, 10000);
}

function stopPingService() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

module.exports = { startPingService, stopPingService };
