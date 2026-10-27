// Node >= 22.13: usa el SQLite integrado (node:sqlite).
// Node 18 / 20: usa better-sqlite3 (se instala con npm install).
const fs = require('fs');
const path = require('path');

const archivo = path.join(__dirname, 'feria.db');
let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(archivo);
} catch {
  const Database = require('better-sqlite3');
  db = new Database(archivo);
}

db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

module.exports = db;
