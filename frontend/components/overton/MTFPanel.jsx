/**
 * Consenso multi-timeframe.
 *
 * El panel anterior aparentaba siete análisis independientes y en realidad
 * derivaba las siete filas de un único número (momento, RSI y OFI promediados)
 * al que sumaba ruido aleatorio creciente según se bajaba de marco: un 88 % en
 * la fila de un minuto. Eso destruía justo lo que hace útil esta tabla. Cuando
 * alguien ve «seis de siete marcos alcistas» cree estar viendo confluencia
 * —señales independientes que coinciden—, y ahí la coincidencia estaba
 * garantizada por construcción.
 *
 * Ahora cada fila viene de su propia serie descargada y de sus propios
 * indicadores. Un marco puede quedarse sin datos, y se dice.
 */

import { useEffect, useState } from "react";

const API_BASE =
  typeof process !== "undefined" && process.env?.EXPO_PUBLIC_BACKEND_URL
    ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
    : "/api";

const FILAS = [
  { clave: "tendencia", etiqueta: "Tendencia", ayuda: "Precio frente a su media de 20" },
  { clave: "rsi_senal", etiqueta: "RSI", ayuda: "Sobrecompra por encima de 60, sobreventa por debajo de 40" },
  { clave: "macd", etiqueta: "MACD", ayuda: "Signo del histograma" },
  { clave: "adx_senal", etiqueta: "ADX", ayuda: "Fuerza de la tendencia por encima de 25" },
  { clave: "volumen", etiqueta: "Volumen", ayuda: "Volumen frente a su media de 20" },
];

export default function MTFPanel({ T, ticker }) {
  const [estado, setEstado] = useState({ cargando: true, error: null, datos: null });

  useEffect(() => {
    if (!ticker) return;
    let vivo = true;
    setEstado({ cargando: true, error: null, datos: null });
    fetch(`${API_BASE}/mtf/${ticker.toUpperCase()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((datos) => vivo && setEstado({ cargando: false, error: null, datos }))
      .catch((e) => vivo && setEstado({ cargando: false, error: e.message, datos: null }));
    return () => { vivo = false; };
  }, [ticker]);

  const { cargando, error, datos } = estado;
  const marcos = datos?.frames || [];

  const marca = (v) => {
    if (v === "alcista") return { txt: "▲", color: T.bull };
    if (v === "bajista") return { txt: "▼", color: T.bear };
    if (v === "neutral") return { txt: "—", color: T.muted };
    return { txt: "·", color: T.noSignal };
  };

  const colorConsenso =
    datos?.consenso === "alcista" ? T.bull :
    datos?.consenso === "bajista" ? T.bear : T.muted;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>CONSENSO MULTI-TIMEFRAME</div>
        {datos ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>
              {datos.marcos_con_datos}/{datos.marcos_totales} marcos
            </span>
            <span style={{
              fontSize: 10, fontWeight: 800, color: colorConsenso,
              border: `1px solid ${colorConsenso}`, borderRadius: 4, padding: "1px 7px",
            }}>
              {String(datos.consenso).toUpperCase()}
            </span>
          </div>
        ) : null}
      </div>

      {cargando ? (
        <div style={{ fontSize: 11, color: T.muted, padding: 14, textAlign: "center" }}>
          Descargando las siete series…
        </div>
      ) : error ? (
        <div style={{ fontSize: 11, color: T.bear, padding: 12 }}>No se pudo calcular: {error}</div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 9, fontWeight: 800, color: T.muted,
                               letterSpacing: "0.08em", padding: "6px 8px 6px 0" }}>
                    INDICADOR
                  </th>
                  {marcos.map((m) => (
                    <th key={m.tf} style={{ fontSize: 10, fontWeight: 700, color: T.textSec, padding: "6px 4px" }}>
                      {m.tf}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FILAS.map((fila) => (
                  <tr key={fila.clave} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "8px 8px 8px 0" }}>
                      <div style={{ fontSize: 11, color: T.text }}>{fila.etiqueta}</div>
                      <div style={{ fontSize: 9, color: T.muted }}>{fila.ayuda}</div>
                    </td>
                    {marcos.map((m) => {
                      const v = m.disponible ? m[fila.clave] : "sin_dato";
                      const { txt, color } = marca(v);
                      return (
                        <td key={m.tf} style={{ textAlign: "center", padding: "8px 4px",
                                                fontSize: 13, fontWeight: 800, color }}>
                          {txt}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Marcos sin datos: se enumeran en vez de rellenarse con un valor
              plausible, que es lo que hacía el panel anterior. */}
          {marcos.some((m) => !m.disponible) ? (
            <div style={{ marginTop: 10, fontSize: 10, color: T.muted, lineHeight: 1.5 }}>
              Sin datos en {marcos.filter((m) => !m.disponible).map((m) => m.tf).join(", ")}
              {" — "}el proveedor no ofrece histórico suficiente en esos marcos.
            </div>
          ) : null}

          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`,
                        fontSize: 10, color: T.textSec, lineHeight: 1.5 }}>
            {datos?.detalle_consenso}. Cada columna se calcula sobre su propia serie descargada,
            así que la coincidencia entre marcos sí es confluencia.
          </div>
        </>
      )}
    </div>
  );
}
