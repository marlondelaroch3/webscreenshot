const express = require('express');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths to look for a local browser on Windows
const LOCAL_BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function getLocalBrowserPath() {
  for (const p of LOCAL_BROWSER_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function getBrowserOptions() {
  const localPath = getLocalBrowserPath();

  // Locally: use system Chrome/Edge
  if (localPath) {
    return {
      executablePath: localPath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 },
    };
  }

  // Serverless (Lambda/Vercel): use @sparticuz/chromium
  return {
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  };
}

app.get('/pdf', async (req, res) => {
  // 1. Obtener la URL y el dispositivo del query param
  const { url, device = 'desktop' } = req.query;

  if (!url) return res.status(400).send('Falta la URL');

  let browser = null;

  try {
    // 2. Lanzar navegador headless (local o serverless)
    browser = await puppeteer.launch(await getBrowserOptions());

    const page = await browser.newPage();

    // 3. Configurar resolución según el dispositivo
    if (device === 'mobile') {
      // Emular un iPhone 13/14
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1');
    } else {
      // Escritorio estándar
      await page.setViewport({ width: 1920, height: 1080 });
    }
    
    await page.emulateMediaType('screen');

    // 4. Navegar a la página (con timeout más largo y waitUntil menos estricto)
    // 'domcontentloaded' es más rápido y seguro que 'networkidle2' para webs pesadas
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Esperar un poco a que carguen los recursos principales (imágenes, fuentes)
    await new Promise(r => setTimeout(r, 3000));

    // 5. Scroll lento y natural para activar animaciones y lazy-loading
    // Y tomar capturas de pantalla en cada paso
    const screenshots = [];
    
    const { totalHeight, viewportHeight } = await page.evaluate(() => {
      return {
        totalHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight
      };
    });

    let currentPosition = 0;
    while (currentPosition < totalHeight) {
      // Hacer scroll
      await page.evaluate((y) => window.scrollTo(0, y), currentPosition);
      
      // Esperar a que las animaciones terminen
      await new Promise(r => setTimeout(r, 3000));
      
      // Tomar captura de la vista actual
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 90 });
      screenshots.push(screenshot);
      
      currentPosition += viewportHeight;
    }

    // 6. Crear un PDF uniendo las imágenes
    const pdfDoc = await PDFDocument.create();
    
    for (const imgBuffer of screenshots) {
      const image = await pdfDoc.embedJpg(imgBuffer);
      const { width, height } = image.scale(1); // Mantener proporciones originales
      
      // Añadir una página del tamaño exacto de la captura
      const pdfPage = pdfDoc.addPage([width, height]);
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    // 7. Devolver el archivo
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=analisis.pdf');
    res.status(200).send(pdfBuffer);

  } catch (error) {
    res.status(500).send(error.message);
  } finally {
    if (browser) await browser.close();
  }
});

// Ruta raíz para comprobar que el servicio está vivo en Cloud Run
app.get('/', (req, res) => {
  res.send('API de PDF funcionando. Usa /api/pdf?url=...');
});

// Iniciar el servidor (Cloud Run inyecta el puerto en process.env.PORT)
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  console.log(`Uso: GET http://localhost:${PORT}/api/pdf?url=https://example.com`);
});
