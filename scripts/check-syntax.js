#!/usr/bin/env node
// Valida que public/app.js sea JSX/JS sintácticamente válido, usando el mismo
// parser (Babel) que lo transpila en el navegador. Corre antes de cada deploy
// para no mandar a producción un error de sintaxis que rompa toda la app.
const fs = require("fs");
const path = require("path");
const Babel = require("@babel/standalone");

const target = path.join(__dirname, "..", "public", "app.js");
const code = fs.readFileSync(target, "utf8");
const rel = path.relative(process.cwd(), target);

try {
  Babel.transform(code, { presets: ["react"], filename: "app.js" });
  console.log(`OK  ${rel} — sintaxis válida (${code.split("\n").length} líneas).`);
} catch (err) {
  console.error(`ERROR de sintaxis en ${rel}:\n`);
  console.error(err.message);
  process.exit(1);
}
