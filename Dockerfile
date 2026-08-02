FROM node:20-alpine

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm install --production

# Copiar el código fuente completo
COPY . .

# Exponer el puerto del servidor y dashboard
EXPOSE 5000

# Variables de entorno por defecto
ENV PORT=5000
ENV NODE_ENV=production

# Comando de inicio del servidor 24/7
CMD ["node", "server.js"]
