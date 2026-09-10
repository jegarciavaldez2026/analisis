#!/usr/bin/env node
/**
 * ============================================================================
 * Grafo de importaciones: rutas relativas que no resuelven
 * ============================================================================
 * Caza el fallo que aparece al mover un archivo de sitio. `tsc` lo detecta en
 * los `.ts`, pero no en los `.jsx`, y el build completo no cabe en el sandbox
 * (excede el límite de tiempo), así que este atajo es el que queda.
 *
 * Uso:
 *   node scripts/verificar-imports.js
 *
 * Devuelve 1 si encuentra alguna rota.
 */

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const RAICES = ['app', 'components', 'lib', 'contexts', 'theme', 'utils', 'styles'];

/** Orden de resolución de Metro para una ruta sin extensión. */
const EXTENSIONES = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js'];

function ficheros(p, acc = []) {
  if (!fs.existsSync(p)) return acc;
  const st = fs.statSync(p);
  if (st.isFile()) {
    if (/\.(t|j)sx?$/.test(p)) acc.push(p);
    return acc;
  }
  for (const f of fs.readdirSync(p)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    ficheros(path.join(p, f), acc);
  }
  return acc;
}

let rotas = 0;
let total = 0;

for (const raiz of RAICES) {
  for (const f of ficheros(raiz)) {
    const src = fs.readFileSync(f, 'utf8');
    let ast;
    try {
      ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    } catch {
      continue; // lo reporta verificar-ambitos.js; aquí no se duplica el ruido
    }

    const comprobar = (valor, linea) => {
      // Sólo las relativas: los paquetes los resuelve node_modules y su
      // ausencia se nota al instalar, no aquí.
      if (!valor.startsWith('.')) return;
      total += 1;
      const base = path.resolve(path.dirname(f), valor);
      if (!EXTENSIONES.some((e) => fs.existsSync(base + e))) {
        console.log(`ROTA  ${f}:${linea}  ->  ${valor}`);
        rotas += 1;
      }
    };

    traverse(ast, {
      ImportDeclaration(p) {
        comprobar(p.node.source.value, p.node.loc.start.line);
      },
      ExportNamedDeclaration(p) {
        if (p.node.source) comprobar(p.node.source.value, p.node.loc.start.line);
      },
      ExportAllDeclaration(p) {
        if (p.node.source) comprobar(p.node.source.value, p.node.loc.start.line);
      },
    });
  }
}

console.log(`\n${total} importaciones relativas · ${rotas} rotas`);
process.exit(rotas ? 1 : 0);
