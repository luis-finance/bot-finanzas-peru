const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const qrcodeTerminal = require('qrcode-terminal');
const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason } = require('@whiskeysockets/baileys');
const { parseWhatsAppMessage, addTransaction, deleteTransactionsSmart, getSummary, getAllTransactions, categorizeDescription } = require('./finance_engine');
const { syncGmailEmails } = require('./gmail_parser');
const { parseWithGemini, parseAudioWithGemini } = require('./ai_engine');

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, 'dashboard')));

const PORT = 5000;
let sock = null;
let currentQR = null;
let connectionStatus = 'INITIALIZING';

const pendingTransactions = {};

const CONFIG_FILE = path.join(__dirname, 'config.json');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '192.168.18.5';
}

function getConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {}
    }
    return {};
}

function saveConfig(data) {
    const conf = { ...getConfig(), ...data };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(conf, null, 2));
    return conf;
}

function getApiKey() {
    const conf = getConfig();
    const key = conf.api_key || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || null;
    if (key && key !== 'gsk_free_default_voice_stt') return key;
    return null;
}

function getRealMessage(msg) {
    if (!msg || !msg.message) return null;
    let m = msg.message;
    if (m.ephemeralMessage) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
    if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
    return m;
}

function getRandomDelay(minSeconds = 3, maxSeconds = 7) {
    const minMs = minSeconds * 1000;
    const maxMs = maxSeconds * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function transcribeAudioGroq(audioBuffer, mimeType, apiKey) {
    return new Promise((resolve, reject) => {
        const isGroq = apiKey.startsWith('gsk_');
        const hostname = isGroq ? 'api.groq.com' : 'api.openai.com';
        const reqPath = isGroq ? '/openai/v1/audio/transcriptions' : '/v1/audio/transcriptions';
        const model = isGroq ? 'whisper-large-v3' : 'whisper-1';

        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const filename = 'audio.ogg';

        let body = [];
        body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`));
        body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nes\r\n`));
        body.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/ogg\r\n\r\n`));
        body.push(audioBuffer);
        body.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const payload = Buffer.concat(body);

        const req = https.request({
            hostname: hostname,
            path: reqPath,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': payload.length
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.text) resolve(parsed.text);
                    else reject(new Error(parsed.error?.message || data));
                } catch (e) {
                    reject(new Error(`Error STT: ${data}`));
                }
            });
        });

        req.on('error', err => reject(err));
        req.write(payload);
        req.end();
    });
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            connectionStatus = 'WAITING_QR_SCAN';
            console.log('\n================================================================');
            console.log('📱 ESCANEA ESTE CÓDIGO QR EN TU CELULAR (WHATSAPP > DISPOSITIVOS VINCULADOS):');
            console.log('================================================================\n');
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            connectionStatus = 'DISCONNECTED';
            console.log('⚠️ [WhatsApp Engine] Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            currentQR = null;
            connectionStatus = 'CONNECTED';
            console.log('\n===============================================================');
            console.log('✅ [WhatsApp Bot Baileys] ¡CONECTADO Y FUNCIONANDO EN RED LOCAL!');
            console.log('===============================================================\n');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            try {
                if (!msg || !msg.key) continue;

                const from = msg.key.remoteJid;
                if (!from || from.endsWith('@g.us') || from.endsWith('@newsletter') || from.includes('status')) {
                    continue;
                }

                const realMsg = getRealMessage(msg);
                if (!realMsg) continue;

                let text = realMsg.conversation || realMsg.extendedTextMessage?.text || '';
                const isAudio = !!(realMsg.audioMessage || realMsg.pttMessage);
                let directGeminiAudioResult = null;

                if (isAudio) {
                    console.log(`\n🎙️ [Nota de Voz Recibida de ${from}] Descargando audio...`);
                    try {
                        const audioBuffer = await downloadMediaMessage(
                            {
                                key: msg.key,
                                message: realMsg
                            },
                            'buffer',
                            {},
                            { logger: console }
                        );

                        if (audioBuffer && audioBuffer.length > 0) {
                            const apiKey = getApiKey();
                            if (!apiKey) {
                                await safeReply(from, "🎙️ *Nota de Voz Recibida*\n\nPara activar notas de voz gratuitas en 0.1s, obtén tu clave sin costo en https://console.groq.com/keys (empieza con gsk_) y pégala en el Dashboard: http://localhost:5000");
                                continue;
                            }

                            if (apiKey.startsWith('gsk_')) {
                                console.log(`🎙️ Transcribiendo voz (${audioBuffer.length} bytes) con Groq Whisper...`);
                                text = await transcribeAudioGroq(audioBuffer, 'audio/ogg', apiKey);
                                console.log(`💬 [Groq Audio Transcrito]: "${text}"`);
                            } else if (apiKey.startsWith('AIzaSy')) {
                                console.log(`🎙️ Procesando voz con Google Gemini...`);
                                directGeminiAudioResult = await parseAudioWithGemini(audioBuffer, 'audio/ogg', apiKey);
                            } else {
                                try {
                                    text = await transcribeAudioGroq(audioBuffer, 'audio/ogg', apiKey);
                                    console.log(`💬 [Audio Transcrito]: "${text}"`);
                                } catch (sttErr) {
                                    await safeReply(from, "🎙️ *Nota de Voz Recibida*\n\nGoogle AI Studio restringe audios en el nivel gratuito sin facturación. Para procesar notas de voz 100% gratis en 0.1s, crea tu clave gratuita en *https://console.groq.com/keys* (empieza con gsk_) y pégala en el Dashboard.");
                                    continue;
                                }
                            }
                        }
                    } catch (audioErr) {
                        console.error('[Error al procesar audio]:', audioErr.message);
                        await safeReply(from, "⚠️ Ocurrió un error al descargar el audio. Inténtalo de nuevo.");
                        continue;
                    }
                }

                if (!text && !directGeminiAudioResult) continue;

                const lower = text.toLowerCase().trim();

                if (msg.key.fromMe && (
                    lower.includes("balance actual") || 
                    lower.includes("registrado exitosamente") || 
                    lower.includes("resumen financiero") || 
                    lower.includes("nota de voz recibida") ||
                    lower.includes("confirmación de transacción") ||
                    lower.includes("transacción cancelada") ||
                    lower.includes("registro eliminado") ||
                    text.includes("📊") || 
                    text.includes("🤖") || 
                    text.includes("✅") || 
                    text.includes("🎉") ||
                    text.includes("🗑️") ||
                    text.includes("🔎") ||
                    text.includes("❌")
                )) {
                    continue;
                }

                console.log(`\n📩 [Mensaje Procesado - ${from}]: "${text || 'Audio Gemini Directo'}"`);

                if (pendingTransactions[from]) {
                    const pending = pendingTransactions[from];

                    if (["sí", "si", "confirmar", "ok", "aceptar", "guardar", "1"].includes(lower)) {
                        addTransaction(
                            pending.source,
                            pending.type,
                            pending.amount,
                            pending.currency,
                            pending.category,
                            pending.description,
                            pending.date
                        );
                        delete pendingTransactions[from];
                        const summary = getSummary();
                        const emoji = pending.type === 'gasto' ? '✅' : '🎉';
                        const typeStr = pending.type === 'gasto' ? 'Gasto' : 'Ingreso';

                        const reply = `${emoji} *${typeStr} Confirmado y Guardado Exitosamente*\n\n` +
                                      `• *Monto:* ${pending.currency === 'USD' ? '$' : 'S/'} ${pending.amount.toFixed(2)}\n` +
                                      `• *Categoría:* ${pending.category}\n` +
                                      `• *Detalle:* ${pending.description}\n\n` +
                                      `📊 *Balance Actual del Mes:* S/ ${summary.balance.toFixed(2)}`;

                        await safeReply(from, reply);
                        continue;
                    } else if (["no", "cancelar", "descartar", "rechazar", "0"].includes(lower)) {
                        delete pendingTransactions[from];
                        await safeReply(from, "❌ *Transacción Cancelada*\nNo se realizó ningún registro en tu estado de cuenta.");
                        continue;
                    }
                }

                const apiKey = getApiKey();
                let geminiResult = directGeminiAudioResult;
                if (!geminiResult && apiKey && text) {
                    geminiResult = await parseWithGemini(text, apiKey);
                }

                if (geminiResult) {
                    console.log('🤖 [Gemini AI Decision]:', JSON.stringify(geminiResult));

                    if (geminiResult.intent === 'DELETE_TRANSACTION') {
                        const deletedItems = deleteTransactionsSmart(geminiResult.delete_criteria || {});
                        if (deletedItems.length > 0) {
                            const summary = getSummary();
                            let reply = `🗑️ *${deletedItems.length} Registro(s) Eliminado(s) Con Éxito*\n\n`;
                            deletedItems.forEach(item => {
                                reply += `• S/ ${item.amount.toFixed(2)} (${item.description})\n`;
                            });
                            reply += `\n📊 *Nuevo Balance Actual:* S/ ${summary.balance.toFixed(2)}`;
                            await safeReply(from, reply);
                        } else {
                            await safeReply(from, "⚠️ No se encontraron registros que coincidan para eliminar.");
                        }
                        continue;
                    }

                    if (geminiResult.intent === 'GET_SUMMARY') {
                        const summary = getSummary();
                        let reply = `📊 *RESUMEN FINANCIERO DEL MES (PERÚ S/)*\n\n` +
                                    `💰 *Ingresos Totales:* S/ ${summary.total_ingresos.toFixed(2)}\n` +
                                    `💸 *Gastos Totales:* S/ ${summary.total_gastos.toFixed(2)}\n` +
                                    `📈 *Balance Neto:* S/ ${summary.balance.toFixed(2)}\n\n` +
                                    `📌 *Desglose de Gastos:*`;

                        for (const [cat, total] of Object.entries(summary.category_breakdown)) {
                            reply += `\n • ${cat}: S/ ${total.toFixed(2)}`;
                        }

                        await safeReply(from, reply);
                        continue;
                    }

                    if (geminiResult.intent === 'SYNC_GMAIL') {
                        const res = syncGmailEmails();
                        await safeReply(from, `📩 *Sincronización de Gmail*: ${res.message || '0 facturas procesadas.'}`);
                        continue;
                    }

                    if (geminiResult.intent === 'ADD_TRANSACTION' && geminiResult.transactions && geminiResult.transactions.length > 0) {
                        const firstTx = geminiResult.transactions[0];
                        pendingTransactions[from] = {
                            source: 'whatsapp',
                            type: firstTx.type || 'gasto',
                            amount: parseFloat(firstTx.amount),
                            currency: firstTx.currency || 'PEN',
                            category: firstTx.category || 'Varios / Otros',
                            description: firstTx.description || text,
                            date: new Date().toISOString().replace('T', ' ').substring(0, 19)
                        };

                        const emoji = firstTx.type === 'gasto' ? '💸' : '📈';
                        const typeStr = firstTx.type === 'gasto' ? 'Gasto' : 'Ingreso';

                        const confirmReply = `🔎 *Confirmación de Transacción (Gemini AI)*\n\n` +
                                             `• *Tipo:* ${typeStr} ${emoji}\n` +
                                             `• *Monto:* ${firstTx.currency === 'USD' ? '$' : 'S/'} ${parseFloat(firstTx.amount).toFixed(2)}\n` +
                                             `• *Categoría:* ${firstTx.category}\n` +
                                             `• *Detalle:* ${firstTx.description}\n\n` +
                                             `¿Deseas guardar este registro en tus finanzas?\n` +
                                             `Responde *Sí* para confirmar o *No* para cancelar.`;

                        await safeReply(from, confirmReply);
                        continue;
                    }
                }

                const isDeleteCommand = ["borrar", "eliminar", "deshacer", "undo", "quitar", "anular"].some(kw => lower.includes(kw));
                if (isDeleteCommand) {
                    const amountMatch = text.match(/(?:s\/\.?|\$)?\s*(\d+(?:[.,]\d{1,2})?)/i);
                    const targetAmount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;

                    const deleted = deleteTransactionsSmart({ target_amount: targetAmount });
                    if (deleted.length > 0) {
                        const summary = getSummary();
                        const reply = `🗑️ *Registro Eliminado Con Éxito*\n\n` +
                                      `• *Se eliminó:* S/ ${deleted[0].amount.toFixed(2)} (${deleted[0].description})\n\n` +
                                      `📊 *Nuevo Balance Actual:* S/ ${summary.balance.toFixed(2)}`;
                        await safeReply(from, reply);
                    } else {
                        await safeReply(from, "⚠️ No se encontró ninguna transacción previa para eliminar.");
                    }
                    continue;
                }

                if (["resumen", "balance", "estado", "reporte"].includes(lower)) {
                    const summary = getSummary();
                    let reply = `📊 *RESUMEN FINANCIERO DEL MES (PERÚ S/)*\n\n` +
                                `💰 *Ingresos Totales:* S/ ${summary.total_ingresos.toFixed(2)}\n` +
                                `💸 *Gastos Totales:* S/ ${summary.total_gastos.toFixed(2)}\n` +
                                `📈 *Balance Neto:* S/ ${summary.balance.toFixed(2)}\n\n` +
                                `📌 *Desglose de Gastos:*`;

                    for (const [cat, total] of Object.entries(summary.category_breakdown)) {
                        reply += `\n • ${cat}: S/ ${total.toFixed(2)}`;
                    }

                    await safeReply(from, reply);
                    continue;
                }

                if (["gmail sync", "sync gmail", "leer correos"].includes(lower)) {
                    const res = syncGmailEmails();
                    await safeReply(from, `📩 *Sincronización de Gmail*: ${res.message || '0 facturas procesadas.'}`);
                    continue;
                }

                const parsed = parseWhatsAppMessage(text);
                if (parsed) {
                    pendingTransactions[from] = parsed;

                    const emoji = parsed.type === 'gasto' ? '💸' : '📈';
                    const typeStr = parsed.type === 'gasto' ? 'Gasto' : 'Ingreso';

                    const confirmReply = `🔎 *Confirmación de Transacción*\n\n` +
                                         `• *Tipo:* ${typeStr} ${emoji}\n` +
                                         `• *Monto:* ${parsed.currency === 'USD' ? '$' : 'S/'} ${parsed.amount.toFixed(2)}\n` +
                                         `• *Categoría:* ${parsed.category}\n` +
                                         `• *Detalle:* ${parsed.description}\n\n` +
                                         `¿Deseas guardar este registro en tus finanzas?\n` +
                                         `Responde *Sí* para confirmar o *No* para cancelar.`;

                    await safeReply(from, confirmReply);
                    continue;
                }
            } catch (err) {
                console.error('[Error en procesador de mensajes Baileys]:', err.message);
            }
        }
    });
}

async function safeReply(to, text) {
    if (!sock || connectionStatus !== 'CONNECTED') return;

    try {
        const delayMs = getRandomDelay(3, 7);
        const delaySec = (delayMs / 1000).toFixed(1);
        console.log(`⏳ [Anti-Ban Guard] Simulando escritura humana... esperando ${delaySec}s...`);

        try {
            await sock.sendPresenceUpdate('composing', to);
        } catch (e) {}

        await sleep(delayMs);

        await sock.sendMessage(to, { text: text });
        console.log(`📤 [Respuesta enviada a WhatsApp tras ${delaySec}s]`);
    } catch (err) {
        console.error('[Error enviando respuesta Baileys]:', err.message);
    }
}

app.get('/api/summary', (req, res) => res.json(getSummary()));
app.get('/api/transactions', (req, res) => res.json(getAllTransactions()));
app.get('/api/whatsapp-status', (req, res) => res.json({ status: connectionStatus, qr: currentQR, has_voice_key: !!getApiKey(), local_ip: getLocalIP() }));

app.post('/api/add-transaction', (req, res) => {
    const { type, amount, category, description, source } = req.body;
    if (!type || !amount || !description) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    const tx = addTransaction(source || 'manual', type, amount, 'PEN', category, description);
    res.json({ status: 'success', transaction: tx });
});

app.post('/api/sync-gmail', (req, res) => {
    const result = syncGmailEmails();
    res.json(result);
});

app.post('/api/save-config', (req, res) => {
    const { api_key } = req.body || {};
    if (api_key) {
        saveConfig({ api_key: api_key.trim() });
        return res.json({ status: 'success', message: 'API Key de Inteligencia guardada exitosamente' });
    }
    res.status(400).json({ error: 'Clave requerida' });
});

app.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`\n=======================================================`);
    console.log(`🚀 FINANZASAUTO PERÚ MVP EN VIVO EN PUERTO ${PORT}`);
    console.log(`💻 ACCESO EN LAPTOP:  http://localhost:${PORT}`);
    console.log(`📱 ACCESO EN CELULAR: http://${localIP}:${PORT}`);
    console.log(`=======================================================\n`);
    connectToWhatsApp();
});
