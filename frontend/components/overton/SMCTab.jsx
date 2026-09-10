/**
 * Pestaña de señal — composición del panel de decisión.
 *
 * Sustituye a `SMCPanelLive` y `LiquidityHeatmap`, que generaban sus niveles
 * —bloques de orden, huecos de valor justo, zonas de liquidez— con un
 * pseudoaleatorio sembrado con el ticker. Eran dibujos, no lecturas.
 *
 * Todo lo que se ve aquí sale del backend: POC, ATR, ADX, régimen, objetivos,
 * stop, relación riesgo/beneficio, señales de entrada y salida, y el consenso
 * multi-marco de `/mtf`, que calcula cada marco por separado.
 *
 * Lo que la maqueta pedía y no existe —convicción como porcentaje, confluencia
 * por factor, catalizadores— no se inventa: se deriva de lo que hay cuando es
 * honesto hacerlo, y se omite cuando no.
 */

import { useEffect, useState } from "react";

const API_BASE =
  typeof process !== "undefined" && process.env?.EXPO_PUBLIC_BACKEND_URL
    ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
    : "/api";

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const usd = (v) => {
  const n = num(v);
  return n == null ? "—" : `$${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const pct = (v, d = 2) => {
  const n = num(v);
  return n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)} %`;
};

function Bloque({ T, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "13px 15px", ...style }}>{children}</div>
  );
}

function Rotulo({ T, children }) {
  return <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
                       textTransform: "uppercase", marginBottom: 9 }}>{children}</div>;
}

/** Escala de niveles: soportes, POC y objetivos sobre una recta de precio. */
function EscalaNiveles({ T, niveles, precio }) {
  const validos = niveles.filter((n) => num(n.precio) != null);
  if (validos.length < 2) return null;

  const precios = validos.map((n) => n.precio).concat(precio ? [precio] : []);
  const min = Math.min(...precios), max = Math.max(...precios);
  const rango = max - min || 1;
  const x = (p) => ((p - min) / rango) * 100;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ position: "relative", height: 44 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 15, height: 3,
                      background: T.border, borderRadius: 2 }} />
        {precio != null ? (
          <div style={{ position: "absolute", left: `${x(precio)}%`, top: 6, transform: "translateX(-50%)" }}>
            <div style={{ width: 2, height: 21, background: T.text }} />
            <div style={{ fontSize: 9, color: T.text, fontWeight: 800, marginTop: 2,
                          transform: "translateX(-50%)", marginLeft: 1, whiteSpace: "nowrap" }}>
              AHORA
            </div>
          </div>
        ) : null}
        {validos.map((n) => (
          <div key={n.etiqueta} style={{ position: "absolute", left: `${x(n.precio)}%`, top: 10,
                                         transform: "translateX(-50%)", textAlign: "center" }}>
            <div style={{ width: 9, height: 9, borderRadius: 5, background: n.color,
                          border: `2px solid ${T.card}`, margin: "0 auto" }} />
            <div style={{ fontSize: 9, fontWeight: 800, color: n.color, marginTop: 3, whiteSpace: "nowrap" }}>
              {n.etiqueta}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Consenso multi-marco, calculado marco a marco en el backend. */
function Consenso({ T, ticker }) {
  const [estado, setEstado] = useState({ cargando: true, datos: null });

  useEffect(() => {
    if (!ticker) return;
    let vivo = true;
    fetch(`${API_BASE}/mtf/${ticker.toUpperCase()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => vivo && setEstado({ cargando: false, datos: d }))
      .catch(() => vivo && setEstado({ cargando: false, datos: null }));
    return () => { vivo = false; };
  }, [ticker]);

  const marcos = estado.datos?.frames || [];
  const FILAS = [
    ["tendencia", "Tendencia"],
    ["adx_senal", "ADX"],
    ["rsi_senal", "RSI"],
    ["macd", "MACD"],
    ["volumen", "Volumen"],
  ];
  const marca = (v) =>
    v === "alcista" ? { t: "▲", c: T.bull } :
    v === "bajista" ? { t: "▼", c: T.bear } :
    v === "neutral" ? { t: "—", c: T.muted } : { t: "·", c: T.noSignal };

  if (estado.cargando) {
    return <div style={{ fontSize: 11, color: T.muted, padding: 14, textAlign: "center" }}>
      Calculando los siete marcos…</div>;
  }
  if (!marcos.length) {
    return <div style={{ fontSize: 11, color: T.muted, padding: 12 }}>
      No se pudo calcular el consenso multi-marco.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", fontSize: 9, fontWeight: 800, color: T.muted,
                         letterSpacing: "0.08em", padding: "0 8px 8px 0" }}>INDICADOR</th>
            {marcos.map((m) => (
              <th key={m.tf} style={{ fontSize: 10, fontWeight: 700, color: T.textSec, padding: "0 4px 8px" }}>
                {m.tf}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS.map(([clave, etiqueta]) => (
            <tr key={clave} style={{ borderTop: `1px solid ${T.border}` }}>
              <td style={{ padding: "8px 8px 8px 0", fontSize: 11, color: T.text }}>{etiqueta}</td>
              {marcos.map((m) => {
                const { t, c } = marca(m.disponible ? m[clave] : "sin_dato");
                return <td key={m.tf} style={{ textAlign: "center", padding: "8px 4px",
                                               fontSize: 13, fontWeight: 800, color: c }}>{t}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
        {estado.datos.detalle_consenso}. Cada columna sale de su propia serie descargada, así que
        la coincidencia entre marcos sí es confluencia y no un mismo número repetido.
      </div>
    </div>
  );
}

export default function SMCTab({ T, d, ticker }) {
  const precio = num(d?.current_price);
  const poc = num(d?.poc_price);
  const accion = d?.accion || "—";
  const s100 = num(d?.score_100);
  const colorAccion =
    accion === "COMPRAR" || accion === "ACUMULAR" ? T.bull :
    accion === "VENDER" || accion === "REDUCIR" ? T.bear : T.warn;

  // Mín/máx de 20 sesiones a partir del histórico que ya viaja.
  const hist = Array.isArray(d?.price_history) ? d.price_history.slice(-20).map(num).filter((x) => x != null) : [];
  const min20 = hist.length ? Math.min(...hist) : null;
  const max20 = hist.length ? Math.max(...hist) : null;

  const rel = (v) => (precio && v ? ((v - precio) / precio) * 100 : null);

  const niveles = [
    { etiqueta: "S2", precio: num(d?.stop_loss), color: T.bear },
    { etiqueta: "S1", precio: num(d?.entry_optimal), color: T.warn },
    { etiqueta: "POC", precio: poc, color: T.accent },
    { etiqueta: "T1", precio: num(d?.target1), color: T.bull },
    { etiqueta: "T2", precio: num(d?.target2), color: T.bull },
  ];

  const entradas = (d?.entry_signals || []).slice(0, 6);
  const salidas = (d?.exit_signals || []).slice(0, 6);
  const texto = (s) => (typeof s === "string" ? s : s?.label || s?.text || s?.signal || JSON.stringify(s));

  const regimen = d?.market_regime;
  const REGIMEN = {
    trending: "TENDENCIA", ranging: "LATERAL",
    volatile: "VOLÁTIL", breakout: "RUPTURA",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* La banda de contexto (precio, régimen, POC, VIX, bono) la pinta ya
          la cabecera global de la pantalla, común a todas las pestañas. Aquí
          duplicarla era enseñar dos veces lo mismo — y con el score en dos
          escalas distintas, que es peor que no enseñarlo. Solo se conserva el
          rango de 20 sesiones, que la cabecera no trae, y va abajo junto a los
          niveles, que es donde tiene contexto. */}

      {/* Consenso + señal */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
        <Bloque T={T} style={{ flex: "1 1 480px" }}>
          <Rotulo T={T}>Consenso multi-marco</Rotulo>
          <Consenso T={T} ticker={ticker} />
        </Bloque>

        <Bloque T={T} style={{ flex: "1 1 320px" }}>
          <Rotulo T={T}>Señal principal</Rotulo>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: colorAccion }}>
            {accion}
          </div>
          <div style={{ fontSize: 11, color: T.textSec, marginTop: 3 }}>{d?.bias || "—"}</div>

          <div style={{ marginTop: 12 }}>
            {[
              ["Score", s100 == null ? "—" : `${s100.toFixed(0)} / 100`],
              ["Régimen", regimen ? (REGIMEN[regimen] || regimen) : "—"],
              ["ATR", num(d?.atr) == null ? "—" : `${usd(d.atr)} (${pct(d?.atr_pct)})`],
              ["Riesgo/beneficio", num(d?.rr1) == null ? "—" : `1 : ${Number(d.rr1).toFixed(2)}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between",
                                    padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 11, color: T.textSec }}>{k}</span>
                <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: T.text }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>
            {d?.overton_description || "—"}
          </div>
        </Bloque>
      </div>

      {/* Niveles */}
      <Bloque T={T}>
        <Rotulo T={T}>Objetivos y niveles</Rotulo>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            ["Objetivo 2", d?.target2, T.bull],
            ["Objetivo 1", d?.target1, T.bull],
            ["POC (valor justo)", poc, T.accent],
            ["Entrada óptima", d?.entry_optimal, T.warn],
            ["Stop loss", d?.stop_loss, T.bear],
          ].map(([etiqueta, valor, color]) => (
            <div key={etiqueta} style={{ flex: "1 1 140px", textAlign: "center", background: T.card2,
                                         border: `1px solid ${T.border}`, borderTop: `3px solid ${color}`,
                                         borderRadius: 7, padding: "10px 8px" }}>
              <div style={{ fontSize: 10, color: T.textSec }}>{etiqueta}</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace",
                            color: num(valor) == null ? T.noSignal : T.text, marginTop: 3 }}>
                {usd(valor)}
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{pct(rel(num(valor)))}</div>
            </div>
          ))}
        </div>
        <EscalaNiveles T={T} niveles={niveles} precio={precio} />

        {min20 != null && max20 != null ? (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12,
                        paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 10, color: T.muted }}>Mínimo 20 sesiones</div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
                {usd(min20)} <span style={{ fontSize: 11, fontWeight: 400, color: T.muted }}>{pct(rel(min20))}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted }}>Máximo 20 sesiones</div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
                {usd(max20)} <span style={{ fontSize: 11, fontWeight: 400, color: T.muted }}>{pct(rel(max20))}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.muted }}>Posición en el rango</div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
                {max20 > min20 && precio != null
                  ? `${(((precio - min20) / (max20 - min20)) * 100).toFixed(0)} %`
                  : "—"}
              </div>
            </div>
          </div>
        ) : null}
      </Bloque>

      {/* Factores */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
        <Bloque T={T} style={{ flex: "1 1 340px" }}>
          <Rotulo T={T}>A favor de la entrada</Rotulo>
          {entradas.length === 0
            ? <div style={{ fontSize: 11, color: T.muted }}>Ninguna señal de entrada activa.</div>
            : entradas.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "7px 0",
                                      borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ width: 3, height: 16, background: T.bull, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 11, color: T.text, flex: 1 }}>{texto(s)}</div>
                </div>
              ))}
        </Bloque>

        <Bloque T={T} style={{ flex: "1 1 340px" }}>
          <Rotulo T={T}>En contra</Rotulo>
          {salidas.length === 0
            ? <div style={{ fontSize: 11, color: T.muted }}>Ninguna señal de salida activa.</div>
            : salidas.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "7px 0",
                                      borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ width: 3, height: 16, background: T.bear, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 11, color: T.text, flex: 1 }}>{texto(s)}</div>
                </div>
              ))}
        </Bloque>
      </div>

      {/* Plan */}
      <Bloque T={T} style={{ borderLeft: `3px solid ${colorAccion}` }}>
        <Rotulo T={T}>Plan sugerido</Rotulo>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          {[
            ["Entrada conservadora", usd(d?.entry_optimal)],
            ["Entrada agresiva", usd(d?.entry_aggressive)],
            ["Stop loss", usd(d?.stop_loss)],
            ["Objetivo 1", usd(d?.target1)],
            ["Objetivo 2", usd(d?.target2)],
            ["R/B objetivo 1", num(d?.rr1) == null ? "—" : `1 : ${Number(d.rr1).toFixed(2)}`],
          ].map(([k, v]) => (
            <div key={k} style={{ flex: "1 1 150px", minWidth: 0 }}>
              <div style={{ fontSize: 10, color: T.muted }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: T.text }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>
          Los niveles salen del ATR real y del POC de 52 semanas, no de porcentajes fijos. Ningún
          indicador aislado justifica la operación: esta pantalla resume la confluencia, no la
          sustituye.
        </div>
      </Bloque>

      <Bloque T={T} style={{ borderLeft: `3px solid ${T.noSignal}` }}>
        <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.6 }}>
          <strong>Retirado de esta pestaña:</strong> los bloques de orden, huecos de valor justo y
          zonas de liquidez que aparecían antes se generaban con un pseudoaleatorio sembrado con el
          ticker. Calcularlos de verdad exige libro de órdenes y flujo de operaciones, que esta
          fuente de datos no ofrece.
        </div>
      </Bloque>
    </div>
  );
}
