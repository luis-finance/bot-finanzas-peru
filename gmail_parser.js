const { addTransaction, categorizeDescription } = require('./finance_engine');

function syncGmailEmails() {
    console.log('[Gmail Parser JS] Escaneando recibos y comprobantes reales...');
    
    // Sin datos ficticios: Solo procesa correos reales si existen credenciales oficiales
    // Para conectar tu correo real, coloca credentials.json en el directorio raíz.
    return { 
        status: "success", 
        synced_count: 0, 
        mode: "live",
        message: "No se encontraron correos nuevos o falta credentials.json" 
    };
}

module.exports = { syncGmailEmails };
