// Se ejecuta al final de la suite, antes de que Playwright cierre el servidor.
// Pide el apagado ordenado y espera a que c8 termine de escribir el reporte de cobertura.
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const resumen = path.join(__dirname, '..', 'reportes', 'cobertura', 'coverage-summary.json');
  const antes = fs.existsSync(resumen) ? fs.statSync(resumen).mtimeMs : 0;
  try { await fetch('http://127.0.0.1:3199/__apagar'); } catch { return; }
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (fs.existsSync(resumen) && fs.statSync(resumen).mtimeMs > antes) {
      await new Promise(r => setTimeout(r, 500));  // margen para que termine el HTML
      return;
    }
  }
  console.warn('Aviso: no se detectó un reporte de cobertura nuevo.');
};
