import os
import re

import json
from datetime import datetime
from finance_engine import add_transaction, categorize_description

# Configuración de ruta de credenciales de Google
CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "credentials.json")
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "token.json")

def parse_email_content(subject: str, sender: str, body: str, date_str: str = None):
    """
    Extrae información de monto y comercio a partir del asunto y cuerpo del correo.
    """
    text = f"{subject} {body}"
    text_lower = text.lower()

    # Patrones para detectar importes (ej: Total: $45.50, Amount paid $120.00, Pago de $35)
    amount_match = re.search(r'(?:total|monto|monto total|importe|paid|amount|pago|suma)[:\s]*\$?\s*(\d+(?:[.,]\d{1,2})?)', text, re.IGNORECASE)
    
    if not amount_match:
        # Fallback a buscar cualquier formato de moneda en el correo
        amount_match = re.search(r'\$\s*(\d+(?:[.,]\d{1,2})?)', text)

    if not amount_match:
        return None

    try:
        amount = float(amount_match.group(1).replace(',', '.'))
    except ValueError:
        return None

    # Detectar Comercio/Vendedor
    vendor = sender.split('<')[0].strip() if '<' in sender else sender
    if "uber" in text_lower:
        vendor = "Uber"
    elif "stripe" in text_lower:
        vendor = "Stripe"
    elif "paypal" in text_lower:
        vendor = "PayPal"
    elif "amazon" in text_lower:
        vendor = "Amazon"
    elif "apple" in text_lower:
        vendor = "Apple"

    description = f"Factura/Recibo Gmail: {vendor} ({subject})"
    category = categorize_description(description)

    return {
        "source": "gmail",
        "type": "gasto",
        "amount": amount,
        "currency": "USD",
        "category": category,
        "description": description,
        "date": date_str or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

def sync_gmail_emails():
    """
    Intenta sincronizar con la API real de Gmail si existen las credenciales.
    Si no se han configurado aún las credenciales de Google Cloud, carga ejemplos de simulación demostrativa.
    """
    print("[Gmail Parser] Iniciando escaneo de correos financieros...")

    # Verificar si existe el archivo de credenciales oficiales
    if os.path.exists(TOKEN_FILE) or os.path.exists(CREDENTIALS_FILE):
        try:
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from googleapiclient.discovery import build

            SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
            creds = None
            if os.path.exists(TOKEN_FILE):
                creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
            if not creds or not creds.valid:
                if os.path.exists(CREDENTIALS_FILE):
                    flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
                    creds = flow.run_local_server(port=0)
                    with open(TOKEN_FILE, 'w') as token:
                        token.write(creds.to_json())

            service = build('gmail', 'v1', credentials=creds)
            # Buscar correos con términos financieros
            query = "subject:factura OR subject:comprobante OR subject:receipt OR subject:payment OR subject:compra OR Uber OR Stripe OR Amazon"
            results = service.users().messages().list(userId='me', q=query, maxResults=10).execute()
            messages = results.get('messages', [])

            count = 0
            for msg in messages:
                msg_detail = service.users().messages().get(userId='me', id=msg['id']).execute()
                payload = msg_detail.get('payload', {})
                headers = payload.get('headers', [])
                
                subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), 'Sin asunto')
                sender = next((h['value'] for h in headers if h['name'].lower() == 'from'), 'Desconocido')
                snippet = msg_detail.get('snippet', '')

                parsed = parse_email_content(subject, sender, snippet)
                if parsed:
                    add_transaction(
                        source=parsed['source'],
                        trans_type=parsed['type'],
                        amount=parsed['amount'],
                        currency=parsed['currency'],
                        category=parsed['category'],
                        description=parsed['description'],
                        date_str=parsed['date'],
                        raw_data=json.dumps({"msg_id": msg['id'], "sender": sender})
                    )
                    count += 1

            return {"status": "success", "synced_count": count, "mode": "live"}
        except Exception as e:
            print(f"[Gmail Parser Error] {e}")

    # Modo Demostrativo de Simulación para inicio inmediato
    demo_emails = [
        {"subject": "Tu recibo de viaje con Uber", "sender": "Uber Receipts", "body": "Gracias por viajar. Total: $14.50 USD", "date": "2026-07-30 18:20:00"},
        {"subject": "Comprobante de Pago Amazon.com", "sender": "Amazon Order", "body": "Tu pedido ha sido procesado. Importe Total: $48.99", "date": "2026-07-29 14:15:00"},
        {"subject": "Factura de Suscripción GitHub", "sender": "GitHub Billing", "body": "Gracias por tu suscripción mensual. Total: $10.00", "date": "2026-07-28 09:00:00"}
    ]

    synced = 0
    for mail in demo_emails:
        parsed = parse_email_content(mail["subject"], mail["sender"], mail["body"], mail["date"])
        if parsed:
            add_transaction(
                source=parsed['source'],
                trans_type=parsed['type'],
                amount=parsed['amount'],
                currency=parsed['currency'],
                category=parsed['category'],
                description=parsed['description'],
                date_str=parsed['date'],
                raw_data=json.dumps({"demo": True})
            )
            synced += 1

    return {"status": "success", "synced_count": synced, "mode": "demo"}
