/**
 * Pestaña de ondas de Weis — esfuerzo frente a resultado.
 *
 * Sustituye a `WeisWavePanel`, cuyas ondas estaban escritas a mano en un array
 * (`demoWaves`) con multiplicadores de volumen fijos. No calculaba nada.
 *
 * La idea que da sentido al método viene de Wyckoff: el **esfuerzo** es el
 * volumen y el **resultado** es el recorrido del precio. Mientras guarden
 * proporción, la tendencia está sana. Cuando hace falta cada vez más volumen
 * para mover menos precio, alguien absorbe al otro lado — y eso suele
 * anticipar el giro antes de que el precio lo muestre.
 *
 * Por eso el gráfico enfrenta las dos magnitudes en un mismo eje temporal:
 * arriba el precio con sus tramos, abajo el volumen de cada tramo. La lectura
 * está en comparar la altura de dos barras del mismo color, no en su valor.
 */

import { useCallback, useEffect, useState } from "react";

const API_BASE =
  typeof process !== "undefined" && process.env?.EXPO_PUBLIC_BACKEND_URL
    ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
    : "/api";

const MARCOS = [
  { k: "1h", n: "1 hora" },
  { k: "4h", n: "4 horas" },
  { k: "1d", n: "Diario" },
  { k: "1wk", n: "Semanal" },
];

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const usd = (v) => {
  const n = num(v);
  return n == null ? "—" : `$${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const corto = (v) => {
  const n = num(v);
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} MM`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`;
  return n.toFixed(0);
};
const pct = (v) => {
  const n = num(v);
  return n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)} %`;
};

function Bloque({ T, children, style }) {
  return <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                       padding: "13px 15px", ...style }}>{children}</div>;
}
function Rotulo({ T, children }) {
  return <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
                       textTransform: "uppercase", marginBottom: 9 }}>{children}</div>;
}

/**
 * Precio arriba, volumen de cada onda abajo, compartiendo el eje temporal.
 * Es la disposición que hace visible la divergencia: dos barras del mismo
 * color con alturas muy distintas mientras el precio sigue avanzando.
 */
function GraficoOndas({ T, ondas }) {
  if (!ondas?.length) return null;
  const W = 940, HP = 200, HV = 110, GAP = 16, pad = { l: 56, r: 14, t: 14 };
  const H = HP + HV + GAP + 26;

  const precios = ondas.flatMap((o) => [o.precio_desde, o.precio_hasta]);
  const minP = Math.min(...precios), maxP = Math.max(...precios);
  const rangoP = maxP - minP || 1;
  const maxV = Math.max(...ondas.map((o) => o.volumen)) || 1;

  const ancho = (W - pad.l - pad.r) / ondas.length;
  const yP = (p) => pad.t + (1 - (p - minP) / rangoP) * HP;
  const yV = (v) => HP + GAP + (1 - v / maxV) * HV;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + f * HP} y2={pad.t + f * HP}
                stroke={T.border} strokeWidth="1" strokeDasharray="2 4" />
          <text x={pad.l - 8} y={pad.t + f * HP + 3} textAnchor="end" fontSize="9"
                fill={T.muted} fontFamily="monospace">
            {(maxP - f * rangoP).toFixed(0)}
          </text>
        </g>
      ))}

      {ondas.map((o, i) => {
        const x0 = pad.l + i * ancho;
        const x1 = x0 + ancho;
        const c = o.direccion === "alcista" ? T.bull : T.bear;
        const hv = Math.max(2, HP + GAP + HV - yV(o.volumen));
        return (
          <g key={i} opacity={o.provisional ? 0.5 : 1}>
            {/* Tramo de precio */}
            <line x1={x0} y1={yP(o.precio_desde)} x2={x1} y2={yP(o.precio_hasta)}
                  stroke={c} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx={x1} cy={yP(o.precio_hasta)} r="3" fill={c} />
            {/* Volumen del tramo */}
            <rect x={x0 + ancho * 0.12} y={yV(o.volumen)}
                  width={ancho * 0.76} height={hv} fill={c} opacity="0.8" />
            {/* Comparación con la onda previa del mismo sentido */}
            {o.vol_vs_previa != null && Math.abs(o.vol_vs_previa) >= 20 ? (
              <text x={x0 + ancho / 2} y={yV(o.volumen) - 4} textAnchor="middle"
                    fontSize="9" fontWeight="800"
                    fill={o.vol_vs_previa < 0 ? T.warn : T.text}>
                {o.vol_vs_previa > 0 ? "+" : "−"}{Math.abs(o.vol_vs_previa).toFixed(0)}%
              </text>
            ) : null}
          </g>
        );
      })}

      <line x1={pad.l} x2={W - pad.r} y1={HP + GAP + HV} y2={HP + GAP + HV}
            stroke={T.borderH} strokeWidth="1" />
      <text x={pad.l - 8} y={HP + GAP + 10} textAnchor="end" fontSize="9" fill={T.muted}>vol</text>
      <text x={pad.l} y={H - 6} fontSize="9" fill={T.muted}>{ondas[0].desde}</text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="9" fill={T.muted}>
        {ondas[ondas.length - 1].hasta}
      </text>
    </svg>
  );
}

export default function WeisTab({ T, ticker }) {
  const [marco, setMarco] = useState("1d");
  const [estado, setEstado] = useState({ cargando: true, error: null, datos: null });

  const cargar = useCallback(() => {
    if (!ticker) return;
    setEstado({ cargando: true, error: null, datos: null });
    fetch(`${API_BASE}/weis/${ticker.toUpperCase()}?timeframe=${marco}`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.detail || "error"))))
      .then((datos) => setEstado({ cargando: false, error: null, datos }))
      .catch((e) => setEstado({ cargando: false, error: String(e), datos: null }));
  }, [ticker, marco]);

  useEffect(() => { cargar(); }, [cargar]);

  const { cargando, error, datos } = estado;
  const res = datos?.resumen;
  const sesgoColor = res?.sesgo === "alcista" ? T.bull
                   : res?.sesgo === "bajista" ? T.bear : T.muted;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Bloque T={T}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
            ONDAS DE WEIS — ESFUERZO Y RESULTADO
          </div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {MARCOS.map((m) => {
              const on = m.k === marco;
              return (
                <button key={m.k} onClick={() => setMarco(m.k)}
                        style={{ padding: "5px 11px", fontSize: 11, fontWeight: on ? 800 : 500,
                                 color: on ? T.accent : T.textSec,
                                 background: on ? `${T.accent}18` : "transparent",
                                 border: `1px solid ${on ? T.accent : T.border}`,
                                 borderRadius: 5, cursor: "pointer" }}>
                  {m.n}
                </button>
              );
            })}
          </div>
        </div>
      </Bloque>

      {cargando ? (
        <Bloque T={T}><div style={{ fontSize: 12, color: T.muted, padding: 16, textAlign: "center" }}>
          Acumulando volumen por tramos…</div></Bloque>
      ) : error ? (
        <Bloque T={T}><div style={{ fontSize: 12, color: T.bear, padding: 14 }}>{error}</div></Bloque>
      ) : !datos ? null : (
        <>
          {/* Diagnóstico */}
          {datos.avisos.map((a, i) => {
            const c = a.sesgo === "alcista" ? T.bull : a.sesgo === "bajista" ? T.bear : T.muted;
            return (
              <Bloque key={i} T={T} style={{ borderLeft: `3px solid ${c}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: c, marginBottom: 3 }}>
                  {a.tipo === "divergencia" ? "DIVERGENCIA DE ESFUERZO"
                    : a.tipo === "absorcion" ? "POSIBLE ABSORCIÓN"
                    : "PROPORCIÓN NORMAL"}
                </div>
                <div style={{ fontSize: 11, color: T.text, lineHeight: 1.55 }}>{a.texto}</div>
              </Bloque>
            );
          })}

          {/* Gráfico */}
          <Bloque T={T}>
            <Rotulo T={T}>Precio por tramos y volumen de cada onda</Rotulo>
            <GraficoOndas T={T} ondas={datos.ondas} />
            <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>
              La lectura no está en la altura de una barra, sino en comparar dos barras del mismo
              color. Si el precio sigue subiendo y las barras verdes menguan, el tramo avanza con
              menos participación de la que lo empujó antes. El porcentaje sobre la barra es la
              variación frente a la onda anterior del mismo sentido.
            </div>
          </Bloque>

          {/* Resumen */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Bloque T={T} style={{ flex: "1 1 260px" }}>
              <Rotulo T={T}>Reparto del volumen</Rotulo>
              <div style={{ fontSize: 24, fontWeight: 800, color: sesgoColor }}>
                {res.sesgo === "alcista" ? "DOMINAN LAS SUBIDAS"
                  : res.sesgo === "bajista" ? "DOMINAN LAS BAJADAS" : "EQUILIBRADO"}
              </div>
              {res.reparto_alcista != null ? (
                <>
                  <div style={{ display: "flex", height: 9, borderRadius: 5, overflow: "hidden",
                                background: T.card2, marginTop: 10 }}>
                    <div style={{ width: `${res.reparto_alcista}%`, background: T.bull }} />
                    <div style={{ width: `${100 - res.reparto_alcista}%`, background: T.bear }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: T.bull, fontWeight: 700 }}>
                      {res.reparto_alcista.toFixed(0)} % en subidas
                    </span>
                    <span style={{ fontSize: 10, color: T.bear, fontWeight: 700 }}>
                      {(100 - res.reparto_alcista).toFixed(0)} % en bajadas
                    </span>
                  </div>
                </>
              ) : null}
              <div style={{ fontSize: 10, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>
                {res.ondas_totales} ondas detectadas. La actual es {res.onda_actual}
                {res.onda_en_curso ? " y sigue en formación" : " y ya cerró"}.
              </div>
            </Bloque>

            <Bloque T={T} style={{ flex: "1 1 400px" }}>
              <Rotulo T={T}>Ondas recientes</Rotulo>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                  <thead>
                    <tr>
                      {["Tramo", "Recorrido", "Volumen", "Esf./Result.", "vs previa"].map((h, i) => (
                        <th key={h} style={{ textAlign: i === 0 ? "left" : "right", fontSize: 9,
                                             fontWeight: 800, color: T.muted, letterSpacing: "0.07em",
                                             padding: "0 8px 7px 0" }}>
                          {h.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...datos.ondas].reverse().slice(0, 8).map((o, i) => {
                      const c = o.direccion === "alcista" ? T.bull : T.bear;
                      const debil = o.vol_vs_previa != null && o.vol_vs_previa < -20;
                      return (
                        <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                          <td style={{ padding: "7px 8px 7px 0" }}>
                            <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>
                              {o.direccion === "alcista" ? "▲" : "▼"} {o.hasta}
                            </div>
                            <div style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>
                              {usd(o.precio_desde)} → {usd(o.precio_hasta)}
                            </div>
                          </td>
                          <td style={{ textAlign: "right", padding: "7px 8px", fontSize: 11,
                                       fontFamily: "monospace", color: c }}>
                            {pct(o.recorrido_pct)}
                          </td>
                          <td style={{ textAlign: "right", padding: "7px 8px", fontSize: 11,
                                       fontFamily: "monospace", color: T.text }}>
                            {corto(o.volumen)}
                          </td>
                          <td style={{ textAlign: "right", padding: "7px 8px", fontSize: 11,
                                       fontFamily: "monospace", color: T.textSec }}>
                            {o.esfuerzo_resultado == null ? "—" : corto(o.esfuerzo_resultado)}
                          </td>
                          <td style={{ textAlign: "right", padding: "7px 0", fontSize: 11,
                                       fontFamily: "monospace", fontWeight: 700,
                                       color: o.vol_vs_previa == null ? T.noSignal
                                            : debil ? T.warn : T.text }}>
                            {o.vol_vs_previa == null ? "—" : pct(o.vol_vs_previa)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 9, lineHeight: 1.55 }}>
                <strong>Esfuerzo/resultado</strong> es el volumen necesario para mover un punto de
                precio. Cuanto más alto, más cuesta avanzar: mucho esfuerzo con poco resultado es
                la firma de la absorción.
              </div>
            </Bloque>
          </div>

          <Bloque T={T} style={{ borderLeft: `3px solid ${T.noSignal}` }}>
            <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.6 }}>
              {datos.metodo} La última onda puede estar sin cerrar: su volumen todavía crece y
              compararla con las anteriores infravalora el esfuerzo, por eso se dibuja atenuada.
            </div>
          </Bloque>
        </>
      )}
    </div>
  );
}
