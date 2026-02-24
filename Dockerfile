# Usamos una base ligera de Node.js
FROM node:20-slim

# Instalamos Chromium y TODAS las librerías gráficas de Linux que faltan (libnss3, etc.)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Creamos la carpeta de la app
WORKDIR /usr/src/app

# Copiamos e instalamos dependencias
COPY package*.json ./
RUN npm install

# Copiamos el resto del código
COPY . .

# Le decimos a Puppeteer dónde está el Chromium que acabamos de instalar
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Cloud Run inyecta el puerto 8080 por defecto
ENV PORT=8080
EXPOSE 8080

CMD [ "npm", "start" ]