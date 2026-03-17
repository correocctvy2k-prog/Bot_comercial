const { supabase } = require('./src/config/supabase');
const Messaging = require('./src/services/messaging.service');
const path = require('path');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    const waId = "3008959393"; // Número del usuario
    const opts = { channelId: 'bot_asamblea' };

    const quizQuestions = [
        { 
            q: "1. ¿Qué debo hacer al momento de observar una operación inusual?", 
            o: ["A. Reportar a la policía", "B. Reportar a la Gerencia", "C. Al Oficial de cumplimiento"] 
        },
        { 
            q: "2. Esta es una señal de alerta:", 
            o: ["A. Retiros sin el cliente", "B. Salir de vacaciones", "C. Cliente con info completa"] 
        },
        { 
            q: "3. El cumplimiento del SARLAFT, es responsabilidad de:", 
            o: ["A. El gerente", "B. Oficial de cumplimiento", "C. De todos en Gane Palmira"] 
        }
    ];

    console.log(`🚀 Enviando Quiz TEST a ${waId}...`);

    for (const item of quizQuestions) {
        // Registramos la encuesta en DB para que los botones funcionen al presionar
        const { data: poll, error } = await supabase.from('asamblea_encuestas').insert({ 
            pregunta: item.q, 
            opciones: item.o 
        }).select().single();

        if (error) {
            console.error("❌ Error creando encuesta:", error.message);
            continue;
        }

        const pollButtons = [
            { id: `VOTE_${poll.id}_0`, title: "Opción A" },
            { id: `VOTE_${poll.id}_1`, title: "Opción B" },
            { id: `VOTE_${poll.id}_2`, title: "Opción C" }
        ];
        
        console.log(`📤 Enviando pregunta: ${item.q}`);

        const fullQuestionBody = `🎓 *Capacitación SARLAFT (TEST)*\n\n` +
                               `*Pregunta:* ${item.q}\n\n` +
                               `${item.o.map(opt => `🔹 ${opt}`).join('\n')}`;

        await Messaging.sendButtons(waId, fullQuestionBody, pollButtons, opts);
        
        await delay(3000); // Pausa breve entre preguntas
    }

    console.log("✅ Envío de test completado.");
    process.exit(0);
}

runTest().catch(err => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
});
