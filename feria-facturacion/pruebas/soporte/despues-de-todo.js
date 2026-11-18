// Se ejecuta UNA vez al terminar todas las pruebas (globalTeardown de Jest).
// Borra la base de datos de prueba y devuelve la base de datos real a su lugar.
const fs = require('fs')
const path = require('path')

const BD = path.join(__dirname, '..', '..', 'database', 'feria.db')
const RESPALDO = BD + '.respaldo-pruebas'
const UPLOADS = path.join(__dirname, '..', '..', 'uploads')
const LISTA_UPLOADS = path.join(__dirname, '.uploads-antes.json')

module.exports = async () => {
  // 1. Quitar la base de datos que usaron las pruebas y restaurar la real
  fs.rmSync(BD, { force: true })
  if (fs.existsSync(RESPALDO)) fs.renameSync(RESPALDO, BD)

  // 2. Borrar las imágenes que subieron las pruebas
  if (fs.existsSync(LISTA_UPLOADS)) {
    const antes = new Set(JSON.parse(fs.readFileSync(LISTA_UPLOADS, 'utf8')))
    for (const archivo of fs.readdirSync(UPLOADS)) {
      if (!antes.has(archivo)) fs.rmSync(path.join(UPLOADS, archivo), { force: true })
    }
    fs.rmSync(LISTA_UPLOADS, { force: true })
  }
}
