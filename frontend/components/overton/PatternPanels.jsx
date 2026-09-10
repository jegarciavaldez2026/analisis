/**
 * Elliott y Wolfe sobre datos reales.
 *
 * Sustituyen a los paneles que fabricaban las ondas aplicando proporciones de
 * Fibonacci a un pseudoaleatorio sembrado con el ticker, y que después
 * validaban su propia fabricación —de ahí que salieran siempre «todas las
 * relaciones Fibonacci cumplen» y una fiabilidad del 75 %.
 *
 * El cambio de fondo es que ahora **el estado normal es no encontrar nada**.
 * La mayoría de las series, la mayor parte del tiempo, no forman un impulso
 * válido de cinco ondas. Cuando no lo forman se dice cuál es la regla que se
 * incumple, que para operar es más útil que un conteo inventado.
 */

import { useEffect, useState } from "react";

const API_BASE =
  typeof process !== "undefined" && process.env?.EXPO_PUBLIC_BACKEND_URL
    ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
    : "/api";

const usd = (v) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `$${Number(v).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ────────────────────────────────────────────────────────────────────────
 * Datos
 * ──────────────────────────────────────────────────────────────────── */

/** Marcos disponibles para Elliott y Wolfe. Se exporta para que las dos
 *  pestañas usen exactamente la misma lista y no se desincronicen. */
export const MARCOS_PATRON = [
  { k: "1h", n: "1 hora" },
  { k: "4h", n: "4 horas" },
  { k: "1d", n: "Diario" },
  { k: "1wk", n: "Semanal" },
];

export function usePatrones(ticker, marco = "1d") {
  const [estado, setEstado] = useState({ cargando: true, error: null, datos: null });

  useEffect(() => {
    if (!ticker) return;
    let vivo = true;
    setEstado({ cargando: true, error: null, datos: null });

    fetch(`${API_BASE}/patterns/${ticker.toUpperCase()}?timeframe=${marco}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((datos) => vivo && setEstado({ cargando: false, error: null, datos }))
      .catch((e) => vivo && setEstado({ cargando: false, error: e.message, datos: null }));

    return () => {
      vivo = false;
    };
  }, [ticker, marco]);

  return estado;
}

/* ────────────────────────────────────────────────────────────────────────
 * Piezas compartidas
 * ──────────────────────────────────────────────────────────────────── */

function Marco({ T, titulo, insignia, children }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: "0.02em" }}>{titulo}</div>
        {insignia}
      </div>
      {children}
    </div>
  );
}

function SinPatron({ T, motivo, barras }) {
  return (
    <div
      style={{
        background: T.card2,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${T.noSignal}`,
        borderRadius: 8,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>
        No hay un patrón válido ahora mismo
      </div>
      <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.5 }}>{motivo}</div>
      <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
        Es el resultado más frecuente y no indica un fallo: la mayoría de las series, la mayor
        parte del tiempo, no forman un patrón que cumpla las reglas.
        {barras ? ` Analizadas ${barras} velas.` : ""}
      </div>
    </div>
  );
}

function Regla({ T, texto, cumple, valor }) {
  const color = cumple ? T.bull : T.bear;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0" }}>
      <div style={{ width: 3, height: 16, background: color, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: T.text }}>{texto}</div>
        {valor ? (
          <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", marginTop: 1 }}>{valor}</div>
        ) : null}
      </div>
      <div style={{ fontSize: 10, fontWeight: 800, color, flexShrink: 0 }}>
        {cumple ? "CUMPLE" : "NO CUMPLE"}
      </div>
    </div>
  );
}

/** Curva de los pivotes detectados, con las etiquetas de cada onda. */
function GraficoOndas({ T, puntos, etiquetas, alcista }) {
  if (!puntos || puntos.length < 2) return null;
  const W = 720;
  const H = 220;
  const P = { t: 26, r: 60, b: 26, l: 56 };
  const precios = puntos.map((p) => p.precio);
  const min = Math.min(...precios);
  const max = Math.max(...precios);
  const rango = max - min || 1;
  const x = (i) => P.l + (i / (puntos.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - min) / rango) * (H - P.t - P.b);
  const color = alcista ? T.bull : T.bear;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line
            x1={P.l} x2={W - P.r}
            y1={P.t + f * (H - P.t - P.b)} y2={P.t + f * (H - P.t - P.b)}
            stroke={T.border} strokeWidth="1" strokeDasharray="2 4"
          />
          <text x={P.l - 8} y={P.t + f * (H - P.t - P.b) + 3} textAnchor="end"
                fontSize="9" fill={T.muted} fontFamily="monospace">
            {usd(max - f * rango).replace("$", "")}
          </text>
        </g>
      ))}
      <polyline
        points={puntos.map((p, i) => `${x(i)},${y(p.precio)}`).join(" ")}
        fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"
      />
      {puntos.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.precio)} r="4" fill={T.card} stroke={color} strokeWidth="2" />
          <text x={x(i)} y={y(p.precio) - 12} textAnchor="middle" fontSize="11" fontWeight="800" fill={T.text}>
            {etiquetas[i]}
          </text>
          <text x={x(i)} y={y(p.precio) + 18} textAnchor="middle" fontSize="9" fill={T.muted} fontFamily="monospace">
            {usd(p.precio).replace("$", "")}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Elliott
 * ──────────────────────────────────────────────────────────────────── */

export function ElliottWavePanel({ T, ticker }) {
  const { cargando, error, datos } = usePatrones(ticker);
  const e = datos?.elliott;

  const insignia = (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>
        {datos?.interval || "1d"} · {datos?.barras ?? "—"} velas
      </span>
      {e?.encontrado ? (
        <span style={{
          fontSize: 9, fontWeight: 800, color: e.direccion === "alcista" ? T.bull : T.bear,
          border: `1px solid ${e.direccion === "alcista" ? T.bull : T.bear}`,
          borderRadius: 4, padding: "1px 6px",
        }}>
          IMPULSO {e.direccion.toUpperCase()}
        </span>
      ) : (
        <span style={{
          fontSize: 9, fontWeight: 800, color: T.muted,
          border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 6px",
        }}>
          SIN PATRÓN
        </span>
      )}
    </div>
  );

  return (
    <Marco T={T} titulo="ELLIOTT — IMPULSO 1-2-3-4-5" insignia={insignia}>
      {cargando ? (
        <div style={{ fontSize: 11, color: T.muted, padding: 12, textAlign: "center" }}>
          Buscando pivotes significativos…
        </div>
      ) : error ? (
        <div style={{ fontSize: 11, color: T.bear, padding: 12 }}>No se pudo analizar: {error}</div>
      ) : !e?.encontrado ? (
        <>
          <SinPatron T={T} motivo={e?.motivo || "Sin datos"} barras={datos?.barras} />
          {e?.reglas?.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.08em", marginBottom: 4 }}>
                REGLAS COMPROBADAS
              </div>
              {e.reglas.map((r, i) => (
                <Regla key={i} T={T} texto={r.regla} cumple={r.cumple} valor={r.valor} />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <GraficoOndas
            T={T}
            puntos={e.ondas.map((o) => ({ precio: o.precio }))}
            etiquetas={["0", "1", "2", "3", "4", "5"]}
            alcista={e.direccion === "alcista"}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.08em", marginBottom: 4 }}>
                REGLAS DE INVALIDACIÓN
              </div>
              {e.reglas.map((r, i) => (
                <Regla key={i} T={T} texto={r.regla} cumple={r.cumple} valor={r.valor} />
              ))}
            </div>

            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.08em", marginBottom: 4 }}>
                PROPORCIONES MEDIDAS
              </div>
              {Object.entries(e.proporciones || {}).map(([k, v]) => (
                <div key={k} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "5px 0", borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: 11, color: T.textSec }}>{k.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 11, color: T.text, fontFamily: "monospace" }}>
                    {v == null ? "—" : `${(v * 100).toFixed(1)} %`}
                  </span>
                </div>
              ))}

              <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.08em", margin: "12px 0 4px" }}>
                PROYECCIONES
              </div>
              {Object.entries(e.objetivos || {}).map(([k, v]) => (
                <div key={k} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "5px 0", borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: 11, color: T.textSec }}>{k.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 11, color: T.text, fontFamily: "monospace", fontWeight: 700 }}>
                    {usd(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {e.provisional ? (
            <div style={{ marginTop: 12, fontSize: 10, color: T.warn, lineHeight: 1.5 }}>
              El último pivote todavía se está formando: el conteo puede cambiar si el precio
              extiende el movimiento actual.
            </div>
          ) : null}
        </>
      )}
    </Marco>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Wolfe
 * ──────────────────────────────────────────────────────────────────── */

export function WolfeWavesPanel({ T, ticker }) {
  const { cargando, error, datos } = usePatrones(ticker);
  const w = datos?.wolfe;

  const insignia = w?.encontrado ? (
    <span style={{
      fontSize: 9, fontWeight: 800, color: w.direccion === "alcista" ? T.bull : T.bear,
      border: `1px solid ${w.direccion === "alcista" ? T.bull : T.bear}`,
      borderRadius: 4, padding: "1px 6px",
    }}>
      PATRÓN {w.direccion.toUpperCase()}
    </span>
  ) : (
    <span style={{
      fontSize: 9, fontWeight: 800, color: T.muted,
      border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 6px",
    }}>
      SIN PATRÓN
    </span>
  );

  return (
    <Marco T={T} titulo="WOLFE — PATRÓN DE 5 PUNTOS" insignia={insignia}>
      {cargando ? (
        <div style={{ fontSize: 11, color: T.muted, padding: 12, textAlign: "center" }}>
          Buscando el patrón…
        </div>
      ) : error ? (
        <div style={{ fontSize: 11, color: T.bear, padding: 12 }}>No se pudo analizar: {error}</div>
      ) : !w?.encontrado ? (
        <>
          <SinPatron T={T} motivo={w?.motivo || "Sin datos"} barras={datos?.barras} />
          {w?.reglas?.length ? (
            <div style={{ marginTop: 12 }}>
              {w.reglas.map((r, i) => (
                <Regla key={i} T={T} texto={r.regla} cumple={r.cumple} />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <GraficoOndas
            T={T}
            puntos={w.puntos.map((p) => ({ precio: p.precio }))}
            etiquetas={["P1", "P2", "P3", "P4", "P5"]}
            alcista={w.direccion === "alcista"}
          />

          {/* El aviso va arriba y en tono de alerta: un objetivo al otro lado
              de la entrada invalida la operación, no es un matiz. */}
          {w.aviso ? (
            <div style={{
              marginTop: 12, background: T.card2, borderLeft: `3px solid ${T.warn}`,
              borderRadius: 6, padding: "10px 12px", fontSize: 11, color: T.text, lineHeight: 1.5,
            }}>
              {w.aviso}
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.08em", marginBottom: 4 }}>
                VALIDACIÓN
              </div>
              {w.reglas.map((r, i) => (
                <Regla key={i} T={T} texto={r.regla} cumple={r.cumple} />
              ))}
            </div>

            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.08em", marginBottom: 4 }}>
                NIVELES
              </div>
              {[
                ["Entrada (punto 5)", w.entrada],
                ["EPA (objetivo)", w.epa],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: 11, color: T.textSec }}>{etiqueta}</span>
                  <span style={{ fontSize: 12, color: T.text, fontFamily: "monospace", fontWeight: 700 }}>
                    {usd(valor)}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
                El EPA es la recta 1-4 proyectada hasta la vertical del punto 5, que es la
                definición del método — no una extensión de Fibonacci.
              </div>
            </div>
          </div>
        </>
      )}
    </Marco>
  );
}
