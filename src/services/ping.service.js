const ping = require('ping');
const { getIO } = require('./socket.service');

const nodesToMonitor = [
    { id: 'AD-HOST', ip: '192.168.8.43', name: 'Host Físico' },
    { id: 'AD-DC01', ip: '192.168.8.44', name: 'AD01 Master' },
    { id: 'AD-DC02', ip: '192.168.8.45', name: 'AD02 Secundario' }
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
            } catch (err) {
                results[node.id] = { status: 'DOWN', time: null, ip: node.ip };
            }
        }

        // Emitir estado global a todos los clientes conectados
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
