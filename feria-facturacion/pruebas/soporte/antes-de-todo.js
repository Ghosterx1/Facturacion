// Se ejecuta UNA vez antes de todas las pruebas (globalSetup de Jest).
// Guarda una copia de la base de datos real para no perder las ventas que ya existan.
const fs = require('fs')
const path = require('path')

const BD = path.join(__dirname, '..', '..', 'database', 'feria.db')
const RESPALDO = BD + '.respaldo-pruebas'
const UPLOADS = path.join(__dirname, '..', '..', 'uploads')
const LISTA_UPLOADS = path.join(__dirname, '.uploads-antes.json')

module.exports = async () => {
  // 1. Respaldar la base de datos real (si existe) y empezar con una vacía
  if (fs.existsSync(BD)) fs.renameSync(BD, RESPALDO)

  // 2. Anotar qué imágenes había en uploads/ para borrar solo las que creen las pruebas
  const existentes = fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []
  fs.writeFileSync(LISTA_UPLOADS, JSON.stringify(existentes))
}
