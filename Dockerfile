# Usamos la imagen OFICIAL de Puppeteer.
# Ya trae Chrome instalado, las fuentes y todas las librerías.
# Es a prueba de balas.
FROM ghcr.io/puppeteer/puppeteer:21.9.0

# Configuramos variables de entorno para que Puppeteer sepa qué hacer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

# Copiamos los archivos (como usuario root para evitar problemas de permisos al instalar)
USER root
COPY package*.json ./
RUN npm ci
COPY . .

# Volvemos al usuario seguro que trae la imagen
USER pptruser

# Comando de arranque
CMD ["node", "api/pdf.js"]