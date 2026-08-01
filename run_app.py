import os
import sys
import subprocess
import time
import webbrowser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WHATSAPP_DIR = os.path.join(BASE_DIR, "whatsapp_engine")

def check_and_install_dependencies():
    print("📦 [1/3] Verificando dependencias de Python...")
    try:
        import flask
        import flask_cors
        import requests
    except ImportError:
        print("📥 Instalando dependencias de Python...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", os.path.join(BASE_DIR, "requirements.txt")])

    node_modules_path = os.path.join(WHATSAPP_DIR, "node_modules")
    if not os.path.exists(node_modules_path):
        print("📦 [2/3] Instalando dependencias de Node.js en whatsapp_engine...")
        subprocess.check_call(["npm", "install"], cwd=WHATSAPP_DIR, shell=True)

def main():
    print("\n=======================================================")
    print("🚀 INICIANDO FINANZASAUTO MVP - BOT WHATSAPP + GMAIL")
    print("=======================================================\n")

    check_and_install_dependencies()

    print("\n⚡ [3/3] Arrancando Servidor Webhook Python & Motor WhatsApp Node.js...")
    
    # Arrancar Servidor Python Backend en segundo plano
    python_process = subprocess.Popen([sys.executable, os.path.join(BASE_DIR, "webhook_server.py")])

    # Esperar 2 segundos e iniciar el motor WhatsApp
    time.sleep(2)
    node_process = subprocess.Popen(["node", "server.js"], cwd=WHATSAPP_DIR, shell=True)

    print("\n🌐 Abriendo Dashboard Web en http://localhost:5000 ...")
    time.sleep(3)
    webbrowser.open("http://localhost:5000")

    try:
        python_process.wait()
        node_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Deteniendo los servidores...")
        python_process.terminate()
        node_process.terminate()
        sys.exit(0)

if __name__ == "__main__":
    main()
