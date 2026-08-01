# 🌐 Guía de Despliegue en la Nube 24/7 (Laptop Apagada)

Esta guía te permite subir tu **Asistente Financiero de WhatsApp + Dashboard** a la nube para que funcione las **24 horas del día, los 365 días del año**, incluso si tu laptop está completamente apagada o estás de viaje.

---

## 🚀 Opción Recomendada 1: Despliegue en Railway (2 Clics)

**[Railway.app](https://railway.app)** ofrece servidores 24/7 de alta velocidad ideales para bots de WhatsApp y Node.js.

### Pasos:
1. Crea una cuenta gratuita en **[Railway.app](https://railway.app)** (con tu cuenta de GitHub o correo).
2. Haz clic en **+ New Project** > **Deploy from GitHub repo** (o arrastra la carpeta del proyecto).
3. Railway detectará automáticamente el archivo `Dockerfile` que creamos y encenderá tu bot en menos de 2 minutos.
4. **¡Listo!** En la pestaña *Settings* de Railway activa un **Public Domain** (ej: `https://tu-finanzas.up.railway.app`).
5. Escanea el Código QR que aparecerá por única vez en los logs de Railway (o abre tu nuevo enlace del Dashboard) ¡y tu bot responderá siempre las 24 horas!

---

## 🚀 Opción Recomendada 2: Despliegue en Render (Gratuito 24/7)

**[Render.com](https://render.com)** te permite alojar servicios web completamente gratis.

### Pasos:
1. Crea una cuenta en **[Render.com](https://render.com)**.
2. Haz clic en **New +** > **Web Service**.
3. Selecciona **Docker** como entorno de ejecución.
4. Render construirá la aplicación y te dará una URL segura permanente (ej: `https://bot-finanzas-peru.onrender.com`).
5. Abre la URL en tu celular para ver tu Dashboard e ingresar tus claves de voz/Gemini.

---

## 🔒 Beneficios del Despliegue en la Nube
- **Laptop Apagada**: Tu computadora puede estar apagada toda la noche o durante viajes.
- **Acceso Global**: Abre el Dashboard en tu celular desde cualquier lugar con conexión a Internet.
- **Seguridad**: Conexión cifrada HTTPS integrada.
