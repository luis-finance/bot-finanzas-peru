import sqlite3
import re
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "finance.db")

# Diccionario de reglas para categorización automática
CATEGORY_RULES = {
    "Comida & Restaurantes": ["restaurante", "comida", "cena", "almuerzo", "desayuno", "café", "starbucks", "uber eats", "rappi", "supermercado", "mercado", "panaderia"],
    "Transporte & Viajes": ["uber", "didi", "cabify", "gasolina", "combustible", "peaje", "estacionamiento", "vuelo", "hotel", "pasaje", "taxi"],
    "Software & Tecnología": ["aws", "google cloud", "github", "chatgpt", "openai", "cursor", "hosting", "dominio", "software", "apple", "microsoft", "adobe"],
    "Marketing & Publicidad": ["meta ads", "facebook ads", "google ads", "tiktok ads", "publicidad", "marketing", "imprenta", "volantes"],
    "Servicios Básicos": ["luz", "agua", "internet", "gas", "teléfono", "claro", "movistar", "entel", "tigo"],
    "Ventas e Ingresos": ["pago cliente", "ingreso", "venta", "cobro", "transferencia recibida", "factura cobrada", "honorarios"],
    "Varios / Otros": []
}

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,          -- 'whatsapp', 'gmail', 'manual'
                type TEXT NOT NULL,            -- 'gasto', 'ingreso'
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'USD',
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                date TEXT NOT NULL,
                raw_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

def categorize_description(description: str) -> str:
    desc_lower = description.lower()
    for category, keywords in CATEGORY_RULES.items():
        for kw in keywords:
            if kw in desc_lower:
                return category
    return "Varios / Otros"

def parse_whatsapp_message(text: str):
    """
    Parsea mensajes de WhatsApp como:
    - 'Gasté 45 USD en supermercado'
    - 'Gasto 25 en taxi'
    - 'Ingresé 500 por venta de servicio'
    - 'Cobré 1200 dólares de cliente X'
    """
    text_clean = text.strip()
    text_lower = text_clean.lower()

    # Detectar Tipo: Gasto o Ingreso
    is_income = any(w in text_lower for w in ["ingresé", "ingreso", "ingresó", "cobré", "cobro", "recibí", "venta", "pago cliente"])
    trans_type = "ingreso" if is_income else "gasto"

    # Extraer Monto
    # Busca patrones de números como 45, 45.50, $45, 45.00
    amount_match = re.search(r'\$?(\d+([.,]\d{1,2})?)', text_clean)
    if not amount_match:
        return None

    amount_str = amount_match.group(1).replace(',', '.')
    try:
        amount = float(amount_str)
    except ValueError:
        return None

    # Extraer Moneda (por defecto USD)
    currency = "USD"
    if "pen" in text_lower or "soles" in text_lower or "s/" in text_lower:
        currency = "PEN"
    elif "eur" in text_lower or "euros" in text_lower:
        currency = "EUR"
    elif "mxn" in text_lower or "pesos" in text_lower:
        currency = "MXN"

    # Asignar Descripción limpia
    description = text_clean
    category = categorize_description(description)
    if is_income and category == "Varios / Otros":
        category = "Ventas e Ingresos"

    date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return {
        "source": "whatsapp",
        "type": trans_type,
        "amount": amount,
        "currency": currency,
        "category": category,
        "description": description,
        "date": date_str
    }

def add_transaction(source, trans_type, amount, currency, category, description, date_str=None, raw_data=None):
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO transactions (source, type, amount, currency, category, description, date, raw_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (source, trans_type, amount, currency, category, description, date_str, raw_data or ""))
        conn.commit()
        return cursor.lastrowid

def get_summary():
    with get_db() as conn:
        # Totales por tipo
        row_ingresos = conn.execute("SELECT SUM(amount) as total FROM transactions WHERE type='ingreso'").fetchone()
        row_gastos = conn.execute("SELECT SUM(amount) as total FROM transactions WHERE type='gasto'").fetchone()

        total_ingresos = row_ingresos['total'] or 0.0
        total_gastos = row_gastos['total'] or 0.0
        balance = total_ingresos - total_gastos

        # Gastos por categoría
        cat_rows = conn.execute("""
            SELECT category, SUM(amount) as total 
            FROM transactions 
            WHERE type='gasto' 
            GROUP BY category
            ORDER BY total DESC
        """).fetchall()

        category_breakdown = {row['category']: row['total'] for row in cat_rows}

        # Conteo de transacciones por fuente
        sources_rows = conn.execute("""
            SELECT source, COUNT(*) as count 
            FROM transactions 
            GROUP BY source
        """).fetchall()
        source_counts = {row['source']: row['count'] for row in sources_rows}

        return {
            "total_ingresos": round(total_ingresos, 2),
            "total_gastos": round(total_gastos, 2),
            "balance": round(balance, 2),
            "category_breakdown": category_breakdown,
            "source_counts": source_counts
        }

def get_all_transactions(limit=100):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, source, type, amount, currency, category, description, date 
            FROM transactions 
            ORDER BY id DESC 
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict(row) for row in rows]

# Inicializa la base de datos al importar el módulo
init_db()
