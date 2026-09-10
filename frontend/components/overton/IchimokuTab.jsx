/**
 * Pestaña Ichimoku — nube completa con proyección.
 *
 * Dos correcciones de cálculo respecto a la versión anterior, ambas
 * verificadas con números:
 *
 * 1. **La nube que enfrenta el precio hoy se leía 26 barras atrás.** Tras
 *    desplazar las Senkou +26, la última posición de la serie ya contiene el
 *    valor calculado hace 26 barras: ese es el techo y el suelo de hoy. El
 *    código previo tomaba `.iloc[-26]` y comparaba el precio actual contra la
 *    nube de hace un mes. En la prueba, 11 % de diferencia sobre el precio.
 *
 * 2. **Chikou usaba `close.iloc[-26]`.** Para comparar con el cierre de hace
 *    26 periodos hay que ir a `-27`: con índices desde el final, `-26` es el
 *    vigésimo quinto anterior. Un periodo de desfase.
 *
 * Y se dibuja lo que faltaba: **la nube futura**. Las 26 barras ya calculadas
 * que el precio todavía no ha alcanzado son la mitad útil del indicador —
 * Ichimoku anticipa, y sin esa parte solo describe.
 */

import { useCallback, useEffect, useState } from "react";

const API_BASE =
  typeof process !== "undefined" && process.env?.EXPO_PUBLIC_BACKEND_URL
    ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
    : "/api";

const MARCOS = [
  { k: "1h", n: "1 hora" }, { k: "4h", n: "4 horas" }, { k: "1d", n: "Diario" },
  { k: "1wk", n: "Semanal" }, { k: "1mo", n: "Mensual" },
];

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const usd = (v) => {
  const n = num(v);
  return n == null ? "—" : `$${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function Bloque({ T, children, style }) {
  return <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                       padding: "13px 15px", ...style }}>{children}</div>;
}
function Rotulo({ T, children }) {
  return <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
                       textTransform: "uppercase", marginBottom: 9 }}>{children}</div>;
}

/** Nube con las cinco líneas y la proyección futura sombreada. */
function GraficoNube({ T, historico, futuro }) {
  if (!historico?.length) return null;
  const total = historico.length + (futuro?.length || 0);
  const W = 960, H = 320, pad = { l: 56, r: 16, t: 14, b: 26 };

  const vals = [];
  historico.forEach((h) => {
    [h.cierre, h.tenkan, h.kijun, h.senkou_a, h.senkou_b, h.chikou].forEach((v) => {
      if (v != null) vals.push(v);
    });
  });
  (futuro || []).forEach((f) => [f.senkou_a, f.senkou_b].forEach((v) => { if (v != null) vals.push(v); }));
  if (!vals.length) return null;

  const min = Math.min(...vals), max = Math.max(...vals);
  const rango = max - min || 1;
  const x = (i) => pad.l + (i / (total - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / rango) * (H - pad.t - pad.b);

  const linea = (campo, fuente, desde = 0) =>
    fuente.map((p, i) => (p[campo] == null ? null : `${x(i + desde)},${y(p[campo])}`))
          .filter(Boolean).join(" ");

  // Relleno de la nube: polígono entre Senkou A y B.
  const nube = (fuente, desde) => {
    const arriba = [], abajo = [];
    fuente.forEach((p, i) => {
      if (p.senkou_a == null || p.senkou_b == null) return;
      arriba.push(`${x(i + desde)},${y(Math.max(p.senkou_a, p.senkou_b))}`);
      abajo.unshift(`${x(i + desde)},${y(Math.min(p.senkou_a, p.senkou_b))}`);
    });
    return arriba.length ? `M${arriba.join(" L")} L${abajo.join(" L")} Z` : null;
  };

  const nubeHist = nube(historico, 0);
  const nubeFut = futuro?.length ? nube(futuro, historico.length) : null;
  const ultimo = historico[historico.length - 1];
  const verde = ultimo && ultimo.senkou_a != null && ultimo.senkou_b != null
                && ultimo.senkou_a > ultimo.senkou_b;
  const xAhora = x(historico.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)}
                y2={pad.t + f * (H - pad.t - pad.b)} stroke={T.border} strokeWidth="1" strokeDasharray="2 4" />
          <text x={pad.l - 8} y={pad.t + f * (H - pad.t - pad.b) + 3} textAnchor="end"
                fontSize="9" fill={T.muted} fontFamily="monospace">
            {(max - f * rango).toFixed(0)}
          </text>
        </g>
      ))}

      {/* Zona futura: fondo distinto para que se vea que no hay precio ahí */}
      {futuro?.length ? (
        <rect x={xAhora} y={pad.t} width={W - pad.r - xAhora} height={H - pad.t - pad.b}
              fill={T.muted} opacity="0.05" />
      ) : null}

      {nubeHist ? <path d={nubeHist} fill={verde ? T.bull : T.bear} opacity="0.16" /> : null}
      {nubeFut ? <path d={nubeFut} fill={verde ? T.bull : T.bear} opacity="0.10" /> : null}

      <polyline points={linea("senkou_a", historico)} fill="none" stroke={T.bull} strokeWidth="1" opacity="0.6" />
      <polyline points={linea("senkou_b", historico)} fill="none" stroke={T.bear} strokeWidth="1" opacity="0.6" />
      {futuro?.length ? (
        <>
          <polyline points={linea("senkou_a", futuro, historico.length)} fill="none"
                    stroke={T.bull} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
          <polyline points={linea("senkou_b", futuro, historico.length)} fill="none"
                    stroke={T.bear} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
        </>
      ) : null}

      <polyline points={linea("chikou", historico)} fill="none" stroke={T.purple}
                strokeWidth="1.2" strokeDasharray="4 2" opacity="0.85" />
      <polyline points={linea("kijun", historico)} fill="none" stroke={T.warn} strokeWidth="1.6" />
      <polyline points={linea("tenkan", historico)} fill="none" stroke={T.accent} strokeWidth="1.6" />
      <polyline points={linea("cierre", historico)} fill="none" stroke={T.text} strokeWidth="2.2" />

      <line x1={xAhora} x2={xAhora} y1={pad.t} y2={H - pad.b} stroke={T.text}
            strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
      <text x={xAhora + 4} y={pad.t + 10} fontSize="9" fontWeight="800" fill={T.text}>AHORA</text>
      {futuro?.length ? (
        <text x={W - pad.r} y={H - 8} textAnchor="end" fontSize="9" fill={T.muted}>
          nube proyectada · 26 periodos
        </text>
      ) : null}
    </svg>
  );
}

export default function IchimokuTab({ T, ticker }) {
  const [marco, setMarco] = useState("1d");
  const [estado, setEstado] = useState({ cargando: true, error: null, datos: null });

  const cargar = useCallback(() => {
    if (!ticker) return;
    setEstado({ cargando: true, error: null, datos: null });
    fetch(`${API_BASE}/ichimoku/${ticker.toUpperCase()}?timeframe=${marco}`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.detail || "error"))))
      .then((datos) => setEstado({ cargando: false, error: null, datos }))
      .catch((e) => setEstado({ cargando: false, error: String(e), datos: null }));
  }, [ticker, marco]);

  useEffect(() => { cargar(); }, [cargar]);

  const { cargando, error, datos } = estado;
  const c = datos?.senal === "alcista" ? T.bull : datos?.senal === "bajista" ? T.bear : T.muted;
  const L = datos?.lineas;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Bloque T={T}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>ICHIMOKU KINKO HYO</div>
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
          Calculando las cinco líneas…</div></Bloque>
      ) : error ? (
        <Bloque T={T}><div style={{ fontSize: 12, color: T.bear, padding: 14 }}>{error}</div></Bloque>
      ) : !datos ? null : (
        <>
          <Bloque T={T} style={{ borderLeft: `3px solid ${c}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-start" }}>
              <div style={{ flex: "0 1 210px" }}>
                <Rotulo T={T}>Lectura del sistema</Rotulo>
                <div style={{ fontSize: 24, fontWeight: 800, color: c, lineHeight: 1.1 }}>
                  {datos.senal_texto}
                </div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 4, fontFamily: "monospace" }}>
                  {datos.score} / {datos.score_max} puntos
                </div>
                <div style={{ height: 7, background: T.card2, borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
                  <div style={{ width: `${(datos.score / datos.score_max) * 100}%`, height: "100%", background: c }} />
                </div>
              </div>

              <div style={{ flex: "1 1 380px", minWidth: 0 }}>
                <Rotulo T={T}>De dónde sale</Rotulo>
                {datos.componentes.map((k, i) => {
                  const cc = k.sesgo === "alcista" ? T.bull : k.sesgo === "bajista" ? T.bear : T.muted;
                  return (
                    <div key={i} style={{ padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 11, color: T.text }}>{k.nombre}</span>
                        <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: cc }}>{k.valor}</span>
                          <span style={{ fontSize: 11, fontFamily: "monospace", color: T.textSec,
                                         minWidth: 48, textAlign: "right" }}>
                            {k.puntos} / {k.max}
                          </span>
                        </span>
                      </div>
                      <div style={{ fontSize: 9, color: T.muted, marginTop: 1, lineHeight: 1.45 }}>
                        {k.explicacion}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Bloque>

          <Bloque T={T}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
              {[["Precio", T.text], ["Tenkan (9)", T.accent], ["Kijun (26)", T.warn],
                ["Senkou A", T.bull], ["Senkou B", T.bear], ["Chikou (−26)", T.purple]].map(([t, col]) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6,
                                       fontSize: 10, color: T.textSec }}>
                  <span style={{ width: 15, height: 2, background: col, display: "inline-block" }} />{t}
                </span>
              ))}
            </div>
            <GraficoNube T={T} historico={datos.historico} futuro={datos.futuro} />
            <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>
              La zona sombreada a la derecha de «AHORA» es la <strong>nube futura</strong>: ya está
              calculada y el precio todavía no ha llegado. Es la parte que anticipa, y la que el
              panel anterior no dibujaba. La Chikou va desplazada 26 periodos hacia atrás, que es
              su posición correcta.
            </div>
          </Bloque>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Bloque T={T} style={{ flex: "1 1 300px" }}>
              <Rotulo T={T}>Niveles</Rotulo>
              {[
                ["Precio", datos.precio, T.text],
                ["Tenkan (9)", L.tenkan, T.accent],
                ["Kijun (26)", L.kijun, T.warn],
                ["Techo de la nube", L.nube_techo, T.bull],
                ["Suelo de la nube", L.nube_suelo, T.bear],
                ["Cierre de hace 26", L.chikou_referencia, T.purple],
              ].map(([k, v, col]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between",
                                      padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 11, color: T.textSec }}>{k}</span>
                  <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: col }}>
                    {usd(v)}
                  </span>
                </div>
              ))}
            </Bloque>

            <Bloque T={T} style={{ flex: "1 1 300px" }}>
              <Rotulo T={T}>Grosor de la nube</Rotulo>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
                {L.grosor_pct} %
              </div>
              <div style={{ fontSize: 11, color: T.textSec, marginTop: 6, lineHeight: 1.55 }}>
                {datos.grosor_lectura}
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>
                El grosor mide cuánta distancia hay entre Senkou A y B. No indica dirección: indica
                cuánto va a costar atravesarla. Una señal de ruptura sobre nube fina vale menos que
                la misma sobre nube gruesa.
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 8, fontFamily: "monospace" }}>
                {datos.barras} barras · marco {MARCOS.find((m) => m.k === datos.timeframe)?.n}
              </div>
            </Bloque>
          </div>
        </>
      )}
    </div>
  );
}
