// src/utils/asambleaReport.js
// Genera un reporte PDF de la Asamblea 2026 con jsPDF + autoTable

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * @param {object} params
 * @param {Array}  params.registros       - Todos los registros de asistencia
 * @param {Array}  params.encuestas       - Lista de encuestas con sus opciones
 * @param {Array}  params.votos           - Lista de votos (encuesta_id, opcion_texto, user_phone)
 * @param {number} params.totalCenso      - Total del censo (para quorum %)
 * @param {string} params.quorumPct       - Porcentaje de quórum (ya calculado)
 */
export function generarReporteAsamblea({ registros = [], encuestas = [], votos = [], totalCenso = 0, quorumPct = '0' }) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date();
    const fechaStr = now.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const horaStr  = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

    // ── Encabezado ──────────────────────────────────────────────────────────
    doc.setFillColor(15, 23, 42);          // slate-900
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('ASAMBLEA GENERAL DE ACCIONISTAS 2026', pageW / 2, 11, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Reporte generado el ${fechaStr} a las ${horaStr}`, pageW / 2, 18, { align: 'center' });
    doc.text('GANE Palmira — Confidencial', pageW / 2, 23, { align: 'center' });

    doc.setTextColor(0, 0, 0);

    // ── Resumen KPI ──────────────────────────────────────────────────────────
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen de Asistencia', 14, 36);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 38, pageW - 14, 38);

    const accionistas  = registros.filter(r => r.categoria_oficial === 'ACCIONISTA' || r.rol === 'Accionista');
    const representantes = registros.filter(r => r.rol === 'REPRESENTANTE' || r.rol === 'Representante Legal' || r.categoria_oficial === 'APODERADO' || r.categoria_oficial === 'REPRESENTANTE_LEGAL');
    const invitados    = registros.filter(r => r.categoria_oficial === 'INVITADO' || r.rol === 'Invitado');
    const quorumTotal  = accionistas.length + representantes.length;

    const kpis = [
        ['Total Registrados', registros.length],
        ['Accionistas',       accionistas.length],
        ['Representantes',    representantes.length],
        ['Invitados',         invitados.length],
        ['Quórum / Censo',    `${quorumTotal} / ${totalCenso}`],
        ['% Quórum',          `${quorumPct}%`],
    ];

    const colW = (pageW - 28) / 3;
    kpis.forEach(([label, value], i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 14 + col * colW;
        const y = 44 + row * 14;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, y, colW - 4, 12, 2, 2, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(String(label).toUpperCase(), x + 4, y + 4.5);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(String(value), x + 4, y + 9.5);
    });

    // ── Tabla de Participantes ───────────────────────────────────────────────
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Listado de Participantes', 14, 78);

    autoTable(doc, {
        startY: 81,
        head: [['#', 'Nombre', 'Documento', 'Calidad', 'Estado SIISS']],
        body: registros.map((r, i) => [
            i + 1,
            r.nombre || '-',
            r.documento || '-',
            r.rol || r.categoria_oficial || '-',
            r.status === 'SYNC_OK' ? '✓ OK' : r.status === 'SYNC_FAILED' ? '✗ Error' : '-'
        ]),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 65 },
            2: { cellWidth: 28, halign: 'center' },
            3: { cellWidth: 32, halign: 'center' },
            4: { cellWidth: 22, halign: 'center' }
        },
        margin: { left: 14, right: 14 }
    });

    // ── Resultados de Encuestas ──────────────────────────────────────────────
    if (encuestas.length > 0) {
        encuestas.forEach((encuesta) => {
            doc.addPage();

            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageW, 16, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('RESULTADOS DE ENCUESTA / VOTACIÓN', pageW / 2, 10, { align: 'center' });
            doc.setTextColor(0, 0, 0);

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');

            const preguntaLines = doc.splitTextToSize(encuesta.pregunta, pageW - 28);
            doc.text(preguntaLines, 14, 24);
            const afterQ = 24 + preguntaLines.length * 5;

            // Votos de esta encuesta
            const votosEncuesta = votos.filter(v => v.encuesta_id === encuesta.id);
            const totalVotos = votosEncuesta.length;

            // Agrupar por opción
            const conteo = {};
            (encuesta.opciones || []).forEach(op => { conteo[op] = 0; });
            votosEncuesta.forEach(v => {
                const key = v.opcion_texto || 'Sin respuesta';
                conteo[key] = (conteo[key] || 0) + 1;
            });

            autoTable(doc, {
                startY: afterQ + 4,
                head: [['Opción de Respuesta', 'Votos', '% del Total']],
                body: Object.entries(conteo).map(([opcion, count]) => [
                    opcion,
                    count,
                    totalVotos > 0 ? `${((count / totalVotos) * 100).toFixed(1)}%` : '0%'
                ]),
                foot: [['TOTAL', totalVotos, '100%']],
                styles: { fontSize: 9, cellPadding: 3 },
                headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
                footStyles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [15, 23, 42] },
                alternateRowStyles: { fillColor: [239, 246, 255] },
                margin: { left: 14, right: 14 }
            });

            // Lista de quién votó qué
            if (votosEncuesta.length > 0) {
                const yAfterTable = doc.lastAutoTable.finalY + 8;
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text('Detalle de votos individuales', 14, yAfterTable);

                autoTable(doc, {
                    startY: yAfterTable + 3,
                    head: [['Teléfono Votante', 'Respuesta Seleccionada']],
                    body: votosEncuesta.map(v => [v.user_phone || '-', v.opcion_texto || '-']),
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8 },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                    margin: { left: 14, right: 14 }
                });
            }
        });
    }

    // ── Pie de página en todas las páginas ──────────────────────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Asamblea General 2026 — GANE Palmira`, 14, doc.internal.pageSize.getHeight() - 8);
        doc.text(`Página ${i} de ${totalPages}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    }

    // ── Guardar ──────────────────────────────────────────────────────────────
    const fileName = `Reporte_Asamblea_2026_${now.toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
}
