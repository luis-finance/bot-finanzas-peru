# 📖 Guía de Uso e Instalación: FinanzasAuto MVP

¡Felicidades! Tu sistema completo de **Bot de WhatsApp + Lector de Gmail + Dashboard Financiero** está construido y listo para producción.

---

## ⚡ Inicio Rápido en 1-Clic

Para arrancar el sistema en tu computadora:

1. Abre tu terminal en la carpeta del proyecto:
   `cd C:\Users\Luis Di Natali\.gemini\antigravity\scratch\whatsapp-gmail-finance-bot`

2. Ejecuta el comando orquestador:
   ```bash
   python run_app.py
   ```

Este comando instalará automáticamente cualquier dependencia faltante, iniciará el servidor de WhatsApp, el servidor de finanzas y abrirá el **Dashboard Web** en tu navegador en `http://localhost:5000`.

---

## 📱 Paso 1: Vincula tu WhatsApp por Código QR

1. Al ejecutar `python run_app.py`, verás un **código QR en la terminal** y también aparecerá en la parte superior del **Dashboard Web**.
2. Abre la aplicación de **WhatsApp** en tu teléfono celular.
3. Ve a **Menú (tres puntos o Configuración)** > **Dispositivos vinculados** > **Vincular un dispositivo**.
4. Escanea el código QR en pantalla.
5. ¡Listo! Tu teléfono quedará vinculado al bot de finanzas.

---

## 💬 Paso 2: Prueba el Bot de WhatsApp

Envía cualquier mensaje de prueba a tu propio número o al número vinculado:

- **Registrar un Gasto**: *"Gasté $45.50 en supermercado"*
- **Registrar un Ingreso**: *"Ingresó $500 pago de cliente X"*
- **Consultar Balance**: *"Resumen"* o *"Balance"*
- **Escanear Gmail**: *"Gmail sync"*

El bot te responderá inmediatamente con la confirmación y la actualización de tu balance del mes.

---

## 📩 Paso 3: Conectar la API Oficial de Gmail (Opcional)

El sistema viene preconfigurado con un **Modo Demostración Inteligente** que detecta automáticamente facturas de ejemplo (Uber, Amazon, GitHub). 

Para conectar tu cuenta real de Gmail de 5TB:
1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto rápido y activa la **Gmail API**.
3. En la sección *OAuth 2.0 Credentials*, descarga el archivo `credentials.json`.
4. Coloca el archivo `credentials.json` dentro de esta carpeta:
   `C:\Users\Luis Di Natali\.gemini\antigravity\scratch\whatsapp-gmail-finance-bot\`
5. La próxima vez que presiones el botón **Sincronizar Gmail** en el Dashboard, se abrirá la ventana oficial de inicio de sesión con tu cuenta de Google.

---

## 🚀 Despliegue en la Nube (Producción 24/7 Gratis)

Si deseas que el bot funcione las 24 horas del día sin necesidad de tener tu computadora encendida:

1. Crea un repositorio en GitHub con estos archivos.
2. Sube la aplicación a **Render.com** o **Railway.app** (ambos ofrecen servidores gratuitos de Node.js y Python).
3. Configura el Webhook en tu panel.

---

### 💰 Costo Operativo Total
- **Motor de WhatsApp (Baileys/QR)**: **$0.00 USD / mes**
- **Gmail API**: **$0.00 USD / mes**
- **Servidor Local / Render Free**: **$0.00 USD / mes**
- **TOTAL MVP**: **$0.00 USD / mes**
