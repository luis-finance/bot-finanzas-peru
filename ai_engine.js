const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_PROMPT = `
Eres la Inteligencia Artificial Financiera oficial para el mercado peruano (moneda Soles S/ PEN).
Tu trabajo es interpretar los mensajes de texto o notas de voz del usuario enviados por WhatsApp y clasificarlos estrictamente en un objeto JSON con uno de los siguientes intents:

1. "ADD_TRANSACTION": El usuario quiere registrar uno o más gastos o ingresos.
2. "DELETE_TRANSACTION": El usuario quiere BORRAR, ELIMINAR, DESHACER o CANCELAR transacciones existentes (ej: "Borra los 2 gastos de 5 mil", "elimina el taxi de 15 soles", "deshacer ultimo", "borrar").
3. "GET_SUMMARY": El usuario solicita un resumen, balance, estado de cuenta o reporte del mes.
4. "SYNC_GMAIL": El usuario solicita leer o sincronizar correos de Gmail.
5. "UNKNOWN": Mensaje casual o que no corresponde a ninguna acción financiera.

Formato de respuesta OBLIGATORIO en JSON puro (sin texto adicional ni markdown \`\`\`json):
{
  "intent": "ADD_TRANSACTION" | "DELETE_TRANSACTION" | "GET_SUMMARY" | "SYNC_GMAIL" | "UNKNOWN",
  "transactions": [
    {
      "type": "gasto" | "ingreso",
      "amount": 1000.0,
      "currency": "PEN" | "USD",
      "category": "Ventas e Ingresos" | "Comida & Restaurantes" | "Transporte & Viajes" | "Software & Tecnología" | "Marketing & Publicidad" | "Servicios & Bancos" | "Varios / Otros",
      "description": "Ingreso de 1000 soles de sueldo"
    }
  ],
  "delete_criteria": {
    "target_amount": 5000.0,
    "delete_all_matching": true,
    "target_description": "5 mil"
  },
  "explanation": "Breve explicación humana en español"
}
`;

async function parseWithGemini(userText, apiKey) {
    if (!apiKey || !apiKey.startsWith('AIzaSy')) return null;

    const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash-8b", "gemini-1.5-flash", "gemini-1.5-pro"];

    for (const modelName of modelsToTry) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });

            const prompt = `${SYSTEM_PROMPT}\n\nMensaje del usuario a interpretar: "${userText}"`;
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();

            const jsonClean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonClean);
        } catch (err) {
            console.error(`[Gemini AI Error - Modelo ${modelName}]:`, err.message);
        }
    }
    return null;
}

async function parseAudioWithGemini(audioBuffer, mimeType, apiKey) {
    if (!apiKey || !apiKey.startsWith('AIzaSy')) return null;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const audioPart = {
            inlineData: {
                data: audioBuffer.toString("base64"),
                mimeType: mimeType || "audio/ogg"
            }
        };

        const prompt = `${SYSTEM_PROMPT}\n\nEscucha atentamente el audio adjunto del usuario e interpreta su orden o gasto financiero:`;

        const result = await model.generateContent([prompt, audioPart]);
        const responseText = result.response.text().trim();

        const jsonClean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonClean);
    } catch (err) {
        console.error('[Gemini AI Audio Processing Error]:', err.message);
        return null;
    }
}

module.exports = {
    parseWithGemini,
    parseAudioWithGemini
};
