const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database/db');

// Carga simple de variables desde .env (sin dependencias extra)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch {}

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS = path.join(__dirname, 'uploads');

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) =>
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname))
  }),
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Solo se permiten imágenes')),
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS));

// Validación: precio > 0, cantidad entera positiva, producto no vacío
function validarItems(items) {
  if (!Array.isArray(items) || items.length === 0) return 'Agrega al menos un producto';
  for (const [i, it] of items.entries()) {
    const n = i + 1;
    const nombre = String(it.producto || '').trim();
    const cant = Number(it.cantidad);
    const precio = Number(it.precio_unitario);
    if (!nombre) return `Fila ${n}: el nombre del producto es obligatorio`;
    if (!Number.isInteger(cant) || cant <= 0) return `Fila ${n}: la cantidad debe ser un entero positivo`;
    if (!Number.isFinite(precio) || precio <= 0) return `Fila ${n}: el precio debe ser mayor a cero`;
  }
  return null;
}

const borrarArchivos = (files = []) => files.forEach(f => fs.unlink(f.path, () => {}));

app.post('/api/ventas', upload.array('imagenes', 10), (req, res) => {
  let items;
  try { items = JSON.parse(req.body.items || '[]'); }
  catch { borrarArchivos(req.files); return res.status(400).json({ error: 'Datos inválidos' }); }

  const error = validarItems(items);
  if (error) { borrarArchivos(req.files); return res.status(400).json({ error }); }

  const guardar = () => {
    db.exec('BEGIN');
    try {
      const { lastInsertRowid: id } = db.prepare('INSERT INTO ventas DEFAULT VALUES').run();
      const insItem = db.prepare('INSERT INTO venta_items (venta_id, producto, cantidad, precio_unitario) VALUES (?,?,?,?)');
      const insImg = db.prepare('INSERT INTO venta_imagenes (venta_id, archivo) VALUES (?,?)');
      items.forEach(it => insItem.run(id, it.producto.trim(), Number(it.cantidad), Number(it.precio_unitario)));
      (req.files || []).forEach(f => insImg.run(id, f.filename));
      db.exec('COMMIT');
      return Number(id);
    } catch (e) {
      db.exec('ROLLBACK');
      borrarArchivos(req.files);
      throw e;
    }
  };
  try { res.status(201).json({ id: guardar() }); }
  catch { res.status(500).json({ error: 'No se pudo guardar la venta' }); }
});

app.get('/api/ventas', (req, res) => {
  const ventas = db.prepare('SELECT * FROM ventas ORDER BY id DESC').all();
  const items = db.prepare('SELECT * FROM venta_items WHERE venta_id = ?');
  const imgs = db.prepare('SELECT archivo FROM venta_imagenes WHERE venta_id = ?');
  res.json(ventas.map(v => {
    const its = items.all(v.id);
    return {
      ...v,
      items: its,
      imagenes: imgs.all(v.id).map(i => '/uploads/' + i.archivo),
      total: its.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
    };
  }));
});

app.delete('/api/ventas/:id', (req, res) => {
  const files = db.prepare('SELECT archivo FROM venta_imagenes WHERE venta_id = ?').all(req.params.id);
  db.prepare('DELETE FROM ventas WHERE id = ?').run(req.params.id);
  files.forEach(f => fs.unlink(path.join(UPLOADS, f.archivo), () => {}));
  res.json({ ok: true });
});

app.get('/api/resumen', (req, res) => {
  const { transacciones } = db.prepare('SELECT COUNT(*) AS transacciones FROM ventas').get();
  const { total } = db.prepare('SELECT COALESCE(SUM(cantidad*precio_unitario),0) AS total FROM venta_items').get();
  const top = db.prepare(`
    SELECT producto, SUM(cantidad) AS unidades, SUM(cantidad*precio_unitario) AS recaudado
    FROM venta_items GROUP BY LOWER(producto) ORDER BY unidades DESC, recaudado DESC LIMIT 5`).all();
  res.json({ transacciones, total, top });
});

// ---------- Lectura de imagen con IA (Claude) ----------
const memoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const TIPOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const PROMPT = `Eres un asistente de facturación. Analiza la imagen (producto, recibo o factura) y extrae los productos vendidos.
Responde SOLO con JSON válido, sin texto adicional ni markdown, con este formato:
{"items":[{"producto":"nombre","cantidad":1,"precio_unitario":0}]}
Reglas: cantidad es un entero positivo; precio_unitario es un número por unidad sin símbolos de moneda ni separadores de miles.
Si no hay datos legibles, responde {"items":[]}.`;

app.post('/api/leer-imagen', memoria.single('imagen'), async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'Falta ANTHROPIC_API_KEY en el archivo .env. Puedes ingresar los datos manualmente.' });
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  if (!TIPOS.includes(req.file.mimetype)) return res.status(400).json({ error: 'Formato no soportado (usa JPG, PNG, GIF o WEBP)' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: req.file.buffer.toString('base64') } },
          { type: 'text', text: PROMPT }
        ] }]
      })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'Error al consultar la IA' });

    const texto = j.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const datos = JSON.parse(texto.replace(/```json|```/g, '').trim());
    const items = (datos.items || []).map(i => ({
      producto: String(i.producto || '').trim(),
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario)
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo interpretar la imagen. Ingresa los datos manualmente.' });
  }
});

app.use((err, req, res, next) => res.status(400).json({ error: err.message }));

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
