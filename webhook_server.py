import os
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from finance_engine import (
    parse_whatsapp_message, 
    add_transaction, 
    get_summary, 
    get_all_transactions
)
from gmail_parser import sync_gmail_emails

app = Flask(__name__, static_folder="dashboard", static_url_path="")
CORS(app)

WHATSAPP_ENGINE_URL = "http://localhost:3001"

def send_whatsapp_reply(to: str, message_text: str):
    """Envía un mensaje de respuesta al usuario a través del motor de WhatsApp."""
    try:
        requests.post(f"{WHATSAPP_ENGINE_URL}/send-message", json={
            "to": to,
            "text": message_text
        }, timeout=5)
    except Exception as e:
        print(f"[Error enviando respuesta a WhatsApp]: {e}")

@app.route("/")
def index():
    return send_from_directory("dashboard", "index.html")

@app.route("/webhook/whatsapp", methods=["POST"])
def whatsapp_webhook():
    data = request.json or {}
    sender = data.get("from")
    text = data.get("text", "").strip()

    if not sender or not text:
        return jsonify({"status": "error", "message": "Datos incompletos"}), 400

    text_lower = text.lower()

    # Comando: Resumen / Balance
    if text_lower in ["resumen", "balance", "estado", "reporte"]:
        summary = get_summary()
        msg = (
            f"📊 *RESUMEN FINANCIERO DEL MES*\n\n"
            f"💰 *Ingresos Totales:* ${summary['total_ingresos']:,.2f} USD\n"
            f"💸 *Gastos Totales:* ${summary['total_gastos']:,.2f} USD\n"
            f"📈 *Balance Neto:* ${summary['balance']:,.2f} USD\n\n"
            f"📌 *Desglose de Gastos principales:*\n"
        )
        for cat, total in list(summary['category_breakdown'].items())[:5]:
            msg += f" • {cat}: ${total:,.2f}\n"

        send_whatsapp_reply(sender, msg)
        return jsonify({"status": "ok", "action": "summary_sent"})

    # Comando: Sincronizar Gmail
    if text_lower in ["gmail sync", "sync gmail", "leer correos"]:
        result = sync_gmail_emails()
        count = result.get("synced_count", 0)
        mode = result.get("mode", "live")
        msg = f"📩 *Sincronización de Gmail Completa*\n\nSe han detectado y registrado *{count} comprobantes/facturas* ({mode} mode)."
        send_whatsapp_reply(sender, msg)
        return jsonify({"status": "ok", "action": "gmail_synced"})

    # Procesar registro de Gasto/Ingreso por lenguaje natural
    parsed = parse_whatsapp_message(text)
    if parsed:
        add_transaction(
            source=parsed["source"],
            trans_type=parsed["type"],
            amount=parsed["amount"],
            currency=parsed["currency"],
            category=parsed["category"],
            description=parsed["description"],
            date_str=parsed["date"]
        )
        summary = get_summary()
        
        emoji = "✅" if parsed["type"] == "gasto" else "🎉"
        type_str = "Gasto" if parsed["type"] == "gasto" else "Ingreso"

        reply_msg = (
            f"{emoji} *{type_str} Registrado Exitosamente*\n\n"
            f"• *Monto:* ${parsed['amount']:,.2f} {parsed['currency']}\n"
            f"• *Categoría:* {parsed['category']}\n"
            f"• *Detalle:* {parsed['description']}\n\n"
            f"📊 *Balance Actual del Mes:* ${summary['balance']:,.2f} USD"
        )
        send_whatsapp_reply(sender, reply_msg)
        return jsonify({"status": "ok", "action": "transaction_added"})

    # Ayuda / Menú
    help_msg = (
        "🤖 *BOT DE AUTOMATIZACIÓN FINANCIERA*\n\n"
        "Puedo registrar tus ingresos y gastos automáticamente.\n\n"
        "💬 *Ejemplos de uso:*\n"
        "• _'Gasté $45.50 en supermercado'_\n"
        "• _'Ingresó $500 pago de cliente X'_\n"
        "• _'Resumen'_ (Ver tu balance del mes)\n"
        "• _'Gmail sync'_ (Escanear facturas en tu Gmail)"
    )
    send_whatsapp_reply(sender, help_msg)
    return jsonify({"status": "ok", "action": "help_sent"})

@app.route("/api/summary", methods=["GET"])
def api_summary():
    return jsonify(get_summary())

@app.route("/api/transactions", methods=["GET"])
def api_transactions():
    return jsonify(get_all_transactions())

@app.route("/api/add-transaction", methods=["POST"])
def api_add_transaction():
    data = request.json or {}
    required = ["type", "amount", "category", "description"]
    if not all(k in data for k in required):
        return jsonify({"error": "Faltan datos obligatorios"}), 400

    tx_id = add_transaction(
        source=data.get("source", "manual"),
        trans_type=data["type"],
        amount=float(data["amount"]),
        currency=data.get("currency", "USD"),
        category=data["category"],
        description=data["description"]
    )
    return jsonify({"status": "success", "id": tx_id})

@app.route("/api/sync-gmail", methods=["POST"])
def api_sync_gmail():
    res = sync_gmail_emails()
    return jsonify(res)

@app.route("/api/whatsapp-status", methods=["GET"])
def api_whatsapp_status():
    try:
        r = requests.get(f"{WHATSAPP_ENGINE_URL}/status", timeout=2)
        return jsonify(r.json())
    except Exception:
        return jsonify({"status": "DISCONNECTED", "qr": None})

if __name__ == "__main__":
    print("🚀 [Servidor Webhook Financiero] Iniciando en http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
