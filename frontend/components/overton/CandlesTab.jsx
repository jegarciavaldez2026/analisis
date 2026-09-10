/**
 * Pestaña de velas — acción del precio de la última vela cerrada.
 *
 * Sustituye a `WeeklyCandleChart`, que además de generar datos con un
 * pseudoaleatorio agrupaba las semanas por posición en el array en bloques
 * fijos de cinco: con un festivo o un array que empieza a media semana, cada
 * «vela semanal» mezclaba días de dos semanas distintas.
 *
 * La idea central de esta pantalla: **el color de la vela no determina el
 * sesgo**. Una vela verde que abre en mínimos y cierra pegada a mínimos es
 * débil, no alcista. Por eso el veredicto sale de varios rasgos medidos —
 * cierre dentro del rango, tamaño del cuerpo, mechas, volumen y expansión — y
 * cada uno se muestra con su voto, para poder discutirlo.
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
  { k: "1mo", n: "Mensual" },
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

/** Anatomía de la vela dibujada a escala. */
function Anatomia({ T, vela, medidas }) {
  const { apertura: o, maximo: h, minimo: l, cierre: c } = vela;
  const rango = h - l;
  if (!(rango > 0)) return null;
  const H = 220, W = 90, pad = 16;
  const y = (p) => pad + (1 - (p - l) / rango) * (H - pad * 2);
  const alcista = c > o;
  const color = alcista ? T.bull : T.bear;
  const cuerpoTop = y(Math.max(o, c));
  const cuerpoAlto = Math.max(2, Math.abs(y(o) - y(c)));

  return (
    <svg viewBox={`0 0 ${W + 130} ${H}`} style={{ width: "100%", maxWidth: 260, height: "auto" }}>
      <line x1={W / 2} x2={W / 2} y1={y(h)} y2={y(l)} stroke={color} strokeWidth="2" />
      <rect x={W / 2 - 18} y={cuerpoTop} width="36" height={cuerpoAlto} fill={color} rx="1" />
      {[["Máx", h, y(h)], ["Cierre", c, y(c)], ["Apertura", o, y(o)], ["Mín", l, y(l)]].map(([n, p, yy]) => (
        <g key={n}>
          <line x1={W / 2 + 20} x2={W + 8} y1={yy} y2={yy} stroke={T.border} strokeWidth="1" strokeDasharray="2 3" />
          <text x={W + 12} y={yy + 3} fontSize="10" fill={T.textSec} fontFamily="monospace">
            {n} {Number(p).toFixed(2)}
          </text>
        </g>
      ))}
      {/* La posición del cierre dentro del rango, que es la medida que más
          dice y la que el color de la vela oculta. */}
      <line x1={4} x2={12} y1={y(c)} y2={y(c)} stroke={T.accent} strokeWidth="3" />
      <text x={4} y={y(c) - 6} fontSize="9" fill={T.accent} fontWeight="800">
        {medidas.clv.toFixed(0)}%
      </text>
    </svg>
  );
}

/** Últimas velas, para ver el contexto. */
function MiniVelas({ T, velas }) {
  if (!velas?.length) return null;
  const W = 900, H = 150, pad = 10;
  const altos = velas.map((v) => v.maximo), bajos = velas.map((v) => v.minimo);
  const max = Math.max(...altos), min = Math.min(...bajos);
  const rango = max - min || 1;
  const paso = W / velas.length;
  const y = (p) => pad + (1 - (p - min) / rango) * (H - pad * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {velas.map((v, i) => {
        const x = i * paso + paso / 2;
        const alcista = v.cierre > v.apertura;
        const c = alcista ? T.bull : T.bear;
        const ult = i === velas.length - 2;   // la última cerrada
        const top = y(Math.max(v.apertura, v.cierre));
        const alto = Math.max(1.5, Math.abs(y(v.apertura) - y(v.cierre)));
        return (
          <g key={i} opacity={i === velas.length - 1 ? 0.35 : 1}>
            <line x1={x} x2={x} y1={y(v.maximo)} y2={y(v.minimo)} stroke={c} strokeWidth="1" />
            <rect x={x - paso * 0.28} y={top} width={paso * 0.56} height={alto} fill={c} />
            {ult ? <rect x={x - paso * 0.45} y={pad - 6} width={paso * 0.9} height={H - pad * 2 + 12}
                         fill="none" stroke={T.accent} strokeWidth="1.5" strokeDasharray="3 2" /> : null}
          </g>
        );
      })}
    </svg>
  );
}

export default function CandlesTab({ T, ticker }) {
  const [marco, setMarco] = useState("1d");
  const [estado, setEstado] = useState({ cargando: true, error: null, datos: null });

  const cargar = useCallback(() => {
    if (!ticker) return;
    setEstado({ cargando: true, error: null, datos: null });
    fetch(`${API_BASE}/candles/${ticker.toUpperCase()}?timeframe=${marco}`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.detail || "error"))))
      .then((datos) => setEstado({ cargando: false, error: null, datos }))
      .catch((e) => setEstado({ cargando: false, error: String(e), datos: null }));
  }, [ticker, marco]);

  useEffect(() => { cargar(); }, [cargar]);

  const { cargando, error, datos } = estado;
  const sesgoColor = datos?.sesgo === "alcista" ? T.bull
                   : datos?.sesgo === "bajista" ? T.bear : T.muted;

  const selector = (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {MARCOS.map((m) => {
        const on = m.k === marco;
        return (
          <button key={m.k} onClick={() => setMarco(m.k)}
                  style={{ padding: "5px 11px", fontSize: 11, fontWeight: on ? 800 : 500,
                           color: on ? T.accent : T.textSec, background: on ? `${T.accent}18` : "transparent",
                           border: `1px solid ${on ? T.accent : T.border}`, borderRadius: 5, cursor: "pointer" }}>
            {m.n}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Bloque T={T}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>ACCIÓN DEL PRECIO</div>
          {selector}
        </div>
      </Bloque>

      {cargando ? (
        <Bloque T={T}><div style={{ fontSize: 12, color: T.muted, padding: 16, textAlign: "center" }}>
          Descargando y reagrupando velas…</div></Bloque>
      ) : error ? (
        <Bloque T={T}><div style={{ fontSize: 12, color: T.bear, padding: 14 }}>{error}</div></Bloque>
      ) : !datos ? null : (
        <>
          {/* Veredicto */}
          <Bloque T={T} style={{ borderLeft: `3px solid ${sesgoColor}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
              <div style={{ flex: "0 1 230px" }}>
                <Rotulo T={T}>Última vela cerrada</Rotulo>
                <div style={{ fontSize: 26, fontWeight: 800, color: sesgoColor, lineHeight: 1.1 }}>
                  {datos.sesgo_texto}
                </div>
                <div style={{ fontSize: 11, color: T.muted, fontFamily: "monospace", marginTop: 3 }}>
                  {datos.fecha} · {MARCOS.find((m) => m.k === datos.timeframe)?.n}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>
                    Fuerza de la lectura {datos.fuerza} %
                  </div>
                  <div style={{ height: 7, background: T.card2, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${datos.fuerza}%`, height: "100%", background: sesgoColor }} />
                  </div>
                </div>
              </div>

              <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                <Rotulo T={T}>Por qué</Rotulo>
                {datos.motivos.map((m, i) => {
                  const c = m.signo > 0 ? T.bull : m.signo < 0 ? T.bear : T.muted;
                  return (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0" }}>
                      <span style={{ width: 3, height: 15, background: c, flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 11, color: T.text }}>{m.texto}</span>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>
                  El color de la vela es solo uno de los votos. Una vela verde que cierra pegada a
                  mínimos es débil, no alcista — por eso el veredicto no sale del color.
                </div>
              </div>
            </div>
          </Bloque>

          {/* Anatomía y medidas */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
            <Bloque T={T} style={{ flex: "0 1 300px" }}>
              <Rotulo T={T}>Anatomía</Rotulo>
              <Anatomia T={T} vela={datos.vela} medidas={datos.medidas} />
            </Bloque>

            <Bloque T={T} style={{ flex: "1 1 340px" }}>
              <Rotulo T={T}>Medidas</Rotulo>
              {[
                ["Variación en la vela", `${datos.medidas.variacion > 0 ? "+" : ""}${datos.medidas.variacion} %`,
                 "Cierre frente a apertura."],
                ["Cierre en el rango (CLV)", `${datos.medidas.clv} %`,
                 "0 % es cierre en mínimos, 100 % en máximos. Es la medida que más dice."],
                ["Cuerpo", `${datos.medidas.cuerpo_pct} %`,
                 "Porcentaje del rango. Por encima del 60 % hay convicción; por debajo del 25 %, duda."],
                ["Mecha superior", `${datos.medidas.mecha_superior_pct} %`, "Rechazo desde arriba."],
                ["Mecha inferior", `${datos.medidas.mecha_inferior_pct} %`, "Rechazo desde abajo."],
                ["Rango frente al habitual", `${datos.medidas.rango_relativo}×`,
                 "Comparado con las 20 velas anteriores."],
                ["Volumen frente al habitual",
                 datos.medidas.volumen_relativo == null ? "—" : `${datos.medidas.volumen_relativo}×`,
                 "Sin volumen que lo respalde, un movimiento pesa menos."],
                ["Hueco de apertura", `${datos.medidas.hueco_apertura > 0 ? "+" : ""}${datos.medidas.hueco_apertura} %`,
                 "Distancia entre esta apertura y el cierre anterior."],
              ].map(([k, v, ayuda]) => (
                <div key={k} style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 11, color: T.text }}>{k}</span>
                    <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: T.text }}>{v}</span>
                  </div>
                  <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>{ayuda}</div>
                </div>
              ))}
            </Bloque>
          </div>

          {/* Figura principal — es lo que define la vela */}
          {datos.patron_principal ? (
            <Bloque T={T} style={{
              borderLeft: `3px solid ${
                datos.patron_principal.sesgo === "alcista" ? T.bull
                : datos.patron_principal.sesgo === "bajista" ? T.bear : T.muted}`,
            }}>
              <Rotulo T={T}>Figura de la vela</Rotulo>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15,
                                color: datos.patron_principal.sesgo === "alcista" ? T.bull
                                     : datos.patron_principal.sesgo === "bajista" ? T.bear : T.text }}>
                    {datos.patron_principal.nombre}
                  </div>
                  <div style={{ fontSize: 11, color: T.textSec, marginTop: 5, lineHeight: 1.55 }}>
                    {datos.patron_principal.explicacion}
                  </div>
                </div>
                {datos.contexto ? (
                  <div style={{ flex: "0 1 210px", background: T.card2, borderRadius: 7,
                                padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: T.muted }}>Contexto previo</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 2 }}>
                      {datos.contexto.direccion === "caída" ? "Venía cayendo"
                        : datos.contexto.direccion === "subida" ? "Venía subiendo"
                        : "Sin tendencia clara"}
                    </div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 5, lineHeight: 1.5 }}>
                      La misma forma cambia de nombre según lo que venía antes: una mecha inferior
                      larga es <strong>martillo</strong> tras una caída y <strong>hombre
                      colgado</strong> tras una subida — y el sesgo se invierte.
                    </div>
                  </div>
                ) : null}
              </div>
            </Bloque>
          ) : null}

          {/* Patrones */}
          <Bloque T={T}>
            <Rotulo T={T}>Todas las figuras detectadas</Rotulo>
            {datos.patrones.map((p, i) => {
              const c = p.sesgo === "alcista" ? T.bull : p.sesgo === "bajista" ? T.bear : T.muted;
              return (
                <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start",
                                      padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ width: 3, height: 26, background: c, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.nombre}</div>
                    <div style={{ fontSize: 10, color: T.textSec, marginTop: 1, lineHeight: 1.5 }}>
                      {p.explicacion}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: c, border: `1px solid ${c}`,
                                 borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>
                    {p.sesgo.toUpperCase()}
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 10, color: T.muted, marginTop: 9, lineHeight: 1.55 }}>
              Ordenadas de más a menos específica: «marubozu» describe mejor la vela que «cuerpo
              grande», y una estrella del atardecer más que una envolvente. La primera es la que
              encabeza la tarjeta de arriba.
              {"\n\n"}
              No se publica un porcentaje de fiabilidad para cada figura: sin contrastar contra
              casos pasados de este valor, sería inventado. La figura es contexto, no probabilidad.
            </div>
          </Bloque>

          {/* Contexto */}
          <Bloque T={T}>
            <Rotulo T={T}>Últimas 30 velas · la enmarcada es la analizada</Rotulo>
            <MiniVelas T={T} velas={datos.velas} />
            <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>
              {datos.nota} La última, en gris, es la que sigue abierta.
            </div>
          </Bloque>
        </>
      )}
    </div>
  );
}
