const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;


async function getBrowserOptions() {
  return {
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, 
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
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

    // 5. Preparar la página para una captura limpia
    await page.evaluate(async () => {
      // Forzar carga de imágenes lazy quitando el atributo nativo primero
      document.querySelectorAll('img[loading="lazy"]').forEach(img => img.removeAttribute('loading'));

      // 5a. Acelerar animaciones al máximo (NO desactivarlas)
      const style = document.createElement('style');
      style.innerHTML = `
        /* Si ponemos 'none', los elementos con opacity: 0 se quedan invisibles para siempre.
           Mejor hacemos que duren 0.01ms para que salten directo a su estado final. */
        *, *::before, *::after {
          transition-duration: 0.01ms !important;
          transition-delay: 0ms !important;
          animation-duration: 0.01ms !important;
          animation-delay: 0ms !important;
          scroll-behavior: auto !important;
        }

        /* Si usas AOS o librerías similares, forzamos su visibilidad por si acaso */
        [data-aos] {
          opacity: 1 !important;
          transform: none !important;
        }

        /* Ocultar barras de scroll */
        ::-webkit-scrollbar { display: none; }
      `;
      document.head.appendChild(style);

      // 5b. Hacer un scroll fluido y humano para activar librerías JS (GSAP, Framer Motion, IntersectionObservers)
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100; // Un salto más pequeño es menos probable que sea ignorado por GSAP
        const timer = setInterval(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            // IMPORTANTE: ¡NO devolvemos el scroll a (0,0)! 
            // Si volvemos arriba, librerías como GSAP ScrollTrigger o AOS detectan el scroll hacia arriba
            // y activan su animación "reverse", volviendo a poner la opacidad en 0 antes de la captura.
            resolve();
          }
        }, 50); // Múltiples saltos pequeños y rápidos
      });
    });

    // Esperar a que las animaciones por JavaScript terminen.
    // Como las de CSS las aceleramos a 0.01ms, ya están listas.
    // GSAP o React pueden requerir 1-2 segundos en estabilizarse en su estado final.
    await new Promise(r => setTimeout(r, 2500));

    // 6. Arreglo Universal para Headers "Sticky" y Elementos Fijos ("Fixed")
    // Al tomar la captura completa, los menús que te persiguen tapan el contenido. 
    // Los convertimos en absolutos/estáticos para que se queden arriba donde nacieron y no molesten al bajar.
    await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed') {
          // Se ancla al inicio de todo el documento (ej. un navbar) o al final (un chat)
          el.style.setProperty('position', 'absolute', 'important');
        } else if (style.position === 'sticky') {
          // Devuelve al flujo plano normal
          el.style.setProperty('position', 'static', 'important');
        }
      }
    });

    // 7. Tomar UNA SOLA captura de página completa
    const screenshotBuffer = await page.screenshot({ 
      fullPage: true, 
      type: 'jpeg', 
      quality: 80 
    });

    // 7. Devolver el archivo DIRECTAMENTE como imagen (Mejor para IAs)
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline; filename=analisis.jpg');
    res.status(200).send(screenshotBuffer);

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
