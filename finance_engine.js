const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'finance_db.json');

// Reglas de categorización adaptadas al mercado peruano
const CATEGORY_RULES = {
    "Comida & Restaurantes": ["restaurante", "comida", "cena", "almuerzo", "desayuno", "café", "starbucks", "uber eats", "rappi", "pedidosya", "supermercado", "plaza vea", "wong", "metro", "tottus", "vivanda", "tambo", "mass", "oxxo", "panaderia", "menú", "menu"],
    "Transporte & Viajes": ["uber", "indrive", "yango", "cabify", "gasolina", "combustible", "primax", "repsol", "pecsa", "peaje", "estacionamiento", "vuelo", "latam", "pasaje", "taxi"],
    "Software & Tecnología": ["aws", "google cloud", "github", "chatgpt", "openai", "cursor", "hosting", "dominio", "software", "apple", "microsoft", "adobe"],
    "Marketing & Publicidad": ["meta ads", "facebook ads", "google ads", "tiktok ads", "publicidad", "marketing", "imprenta", "volantes"],
    "Servicios & Bancos": ["luz", "luz del sur", "enel", "agua", "sedapal", "internet", "claro", "movistar", "entel", "bitel", "bcp", "interbank", "bbva", "scotiabank", "yape", "plin"],
    "Ventas e Ingresos": ["pago cliente", "ingreso", "ingresó", "ingrese", "venta", "cobro", "transferencia recibida", "factura cobrada", "honorarios", "yape recibido", "plin recibido", "sueldo", "salario"]
};

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = { transactions: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return { transactions: [] };
    }
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function categorizeDescription(description) {
    const descLower = description.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
        for (const kw of keywords) {
            if (descLower.includes(kw)) {
                return category;
            }
        }
    }
    return "Varios / Otros";
}

function parseWhatsAppMessage(text) {
    if (!text) return null;
    let textClean = text.trim();
    let textLower = textClean.toLowerCase();

    // Reemplazar expresiones comunes como "1 mil", "2 mil", "5 mil", "10 mil" por números reales
    textLower = textLower.replace(/(\d+)\s*mil\b/gi, (match, p1) => {
        return (parseFloat(p1) * 1000).toString();
    });

    // IGNORAR URLs / Enlaces Web
    if (textLower.startsWith("http://") || textLower.startsWith("https://") || textLower.startsWith("www.") || textLower.includes("localhost:")) {
        return null;
    }

    // IGNORAR COMANDOS DE BORRADO / ELIMINACIÓN
    if (["borrar", "eliminar", "deshacer", "undo", "quitar", "anular"].some(kw => textLower.includes(kw))) {
        return null;
    }

    // Ignorar respuestas formateadas del bot
    if (textLower.includes("balance actual") || textLower.includes("registrado exitosamente") || textLower.includes("resumen financiero") || textLower.includes("desglose de gastos") || textLower.includes("eliminado con éxito")) {
        return null;
    }

    const isIncome = ["ingresé", "ingrese", "ingreso", "ingresó", "cobré", "cobre", "cobro", "recibí", "recibi", "venta", "pago cliente", "yape recibido", "plin recibido", "sueldo", "salario"].some(w => textLower.includes(w));
    const transType = isIncome ? "ingreso" : "gasto";

    const amountMatch = textLower.match(/(?:s\/\.?|\$)?\s*(\d+(?:[.,]\d{1,2})?)/i);
    if (!amountMatch) return null;

    const amount = parseFloat(amountMatch[1].replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return null;

    let currency = "PEN";
    if (textLower.includes("usd") || textLower.includes("dólares") || textLower.includes("dolares")) {
        currency = "USD";
    }

    let category = categorizeDescription(textClean);
    if (isIncome && category === "Varios / Otros") category = "Ventas e Ingresos";

    const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    return {
        source: "whatsapp",
        type: transType,
        amount: amount,
        currency: currency,
        category: category,
        description: textClean,
        date: dateStr
    };
}

function addTransaction(source, type, amount, currency = 'PEN', category = null, description = '', dateStr = null, rawData = null) {
    const db = loadDB();
    const newTx = {
        id: db.transactions.length + 1,
        source: source || 'manual',
        type: type,
        amount: parseFloat(amount),
        currency: currency || 'PEN',
        category: category || categorizeDescription(description),
        description: description,
        date: dateStr || new Date().toISOString().replace('T', ' ').substring(0, 19),
        raw_data: rawData || null,
        created_at: new Date().toISOString()
    };
    db.transactions.push(newTx);
    saveDB(db);
    return newTx;
}

function deleteTransactionsSmart(criteria = {}) {
    const db = loadDB();
    if (db.transactions.length === 0) return [];

    let targetAmount = criteria.target_amount || criteria;
    const deleteAll = criteria.delete_all_matching || false;
    const deletedList = [];

    if (typeof targetAmount === 'number' && targetAmount > 0) {
        for (let i = db.transactions.length - 1; i >= 0; i--) {
            if (Math.abs(db.transactions[i].amount - targetAmount) < 0.01) {
                const deleted = db.transactions.splice(i, 1)[0];
                deletedList.push(deleted);
                if (!deleteAll) break;
            }
        }
    } else {
        const deleted = db.transactions.pop();
        if (deleted) deletedList.push(deleted);
    }

    if (deletedList.length > 0) saveDB(db);
    return deletedList;
}

function getSummary() {
    const db = loadDB();
    let totalIngresos = 0;
    let totalGastos = 0;
    const categoryBreakdown = {};
    const sourceCounts = {};

    for (const tx of db.transactions) {
        if (tx.type === 'ingreso') {
            totalIngresos += tx.amount;
        } else if (tx.type === 'gasto') {
            totalGastos += tx.amount;
            categoryBreakdown[tx.category] = (categoryBreakdown[tx.category] || 0) + tx.amount;
        }
        sourceCounts[tx.source] = (sourceCounts[tx.source] || 0) + 1;
    }

    return {
        total_ingresos: Math.round(totalIngresos * 100) / 100,
        total_gastos: Math.round(totalGastos * 100) / 100,
        balance: Math.round((totalIngresos - totalGastos) * 100) / 100,
        currency_symbol: "S/",
        category_breakdown: categoryBreakdown,
        source_counts: sourceCounts
    };
}

function getAllTransactions(limit = 100) {
    const db = loadDB();
    return db.transactions.slice().reverse().slice(0, limit);
}

module.exports = {
    parseWhatsAppMessage,
    addTransaction,
    deleteTransactionsSmart,
    getSummary,
    getAllTransactions,
    categorizeDescription
};
