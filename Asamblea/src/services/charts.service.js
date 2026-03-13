// src/services/charts.service.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Ejecuta el script de Python para generar un gráfico.
 * @param {string} type - 'quorum' o 'poll'
 * @param {string} question - (Opcional) La pregunta si type es 'poll'
 * @returns {Promise<{ok: boolean, image?: string, error?: string}>}
 */
async function generateChart(type, identifier = null) {
    return new Promise((resolve) => {
        const pythonBin = process.env.PYTHON_BIN || "python";
        const scriptPath = path.resolve(__dirname, "../../charts_asamblea.py");

        const args = [scriptPath, "--type", type, "--json"];
        if (identifier) {
            // Si parece un UUID, lo pasamos como poll_id, si no como question
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
            if (isUuid) {
                args.push("--poll_id", identifier);
            } else {
                args.push("--question", identifier);
            }
        }

        console.log(`[Charts] Ejecutando: ${pythonBin} ${args.join(" ")}`);

        const child = spawn(pythonBin, args, {
            windowsHide: true,
            cwd: path.dirname(scriptPath),
            env: { ...process.env, PYTHONIOENCODING: "utf-8" }
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (d) => stdout += d.toString());
        child.stderr.on("data", (d) => stderr += d.toString());

        child.on("close", (code) => {
            if (stderr) console.error("[Charts] Python Stderr:", stderr);

            try {
                const result = JSON.parse(stdout.trim());
                resolve(result);
            } catch (e) {
                console.error("[Charts] Error parseando JSON de Python:", stdout);
                resolve({ ok: false, error: "Error interno generando gráfico" });
            }
        });
    });
}

module.exports = { generateChart };
