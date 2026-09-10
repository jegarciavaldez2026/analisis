/**
 * Pestaña de fase de mercado — régimen y ciclo de Wyckoff.
 *
 * Sustituye a la pestaña de Sesiones, cuyos «win rate históricos» salían de un
 * pseudoaleatorio sembrado con el ticker.
 *
 * Dos correcciones frente a la maqueta original:
 *
 * 1. **La fase declarada es siempre la de mayor probabilidad.** En la maqueta
 *    el titular decía «ACUMULACIÓN» (35 %) mientras las barras daban
 *    «Tendencia alcista» (47 %). Aquí el titular sale del mismo cálculo que
 *    las barras, así que no pueden contradecirse. Y si las dos primeras están
 *    a menos de diez puntos se declara transición en vez de elegir por un pelo.
 *
 * 2. **Las contribuciones del score suman el total.** En la maqueta un factor
 *    con puntuación 40 y peso 15 % aportaba −0.12 en vez de +6.0, y las
 *    contribuciones sumaban 60.6 mientras el medidor marcaba 76. Aquí la
 *    contribución es literalmente puntuación × peso y la suma se muestra.
 */

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

/** Barra de un indicador con su valor y su estado. */
function Indicador({ T, etiqueta, valor, texto, frac, color, estado, tonoEstado }) {
  const hay = valor != null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0" }}>
      <div style={{ width: 96, fontSize: 11, color: T.text, flexShrink: 0 }}>{etiqueta}</div>
      <div style={{ flex: 1, height: 8, background: T.card2, borderRadius: 4, overflow: "hidden", minWidth: 50 }}>
        <div style={{ width: `${Math.max(0, Math.min(1, frac || 0)) * 100}%`, height: "100%",
                      background: hay ? color : T.noSignal }} />
      </div>
      <div style={{ width: 78, textAlign: "right", fontSize: 12, fontWeight: 700,
                    fontFamily: "monospace", color: hay ? color : T.noSignal, flexShrink: 0 }}>
        {texto}
      </div>
      {estado ? (
        <div style={{ width: 66, textAlign: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: tonoEstado,
                         border: `1px solid ${tonoEstado}`, borderRadius: 4, padding: "1px 6px" }}>
            {estado}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Curva del ciclo con la posición actual marcada. */
function Ciclo({ T, probs, fase }) {
  const W = 900, H = 150;
  const FASES = [
    { k: "acumulacion", n: "ACUMULACIÓN", c: T.teal },
    { k: "alcista", n: "TENDENCIA ALCISTA", c: T.bull },
    { k: "distribucion", n: "DISTRIBUCIÓN", c: T.warn },
    { k: "bajista", n: "TENDENCIA BAJISTA", c: T.bear },
  ];
  // La posición en la curva se deriva del reparto de probabilidad: es el
  // centro de masa del ciclo, no una etapa elegida a mano.
  const total = FASES.reduce((s, f) => s + (probs?.[f.k] || 0), 0) || 1;
  const centro = FASES.reduce((s, f, i) => s + (probs?.[f.k] || 0) * (i + 0.5), 0) / total;
  const x = (centro / FASES.length) * W;

  const onda = Array.from({ length: 90 }, (_, i) => {
    const t = i / 89;
    // Un ciclo estilizado: base plana, subida, techo, caída.
    const y = 0.5 - 0.42 * Math.sin((t - 0.12) * Math.PI * 1.9) * Math.min(1, t * 3.2);
    return `${t * W},${18 + y * (H - 46)}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {FASES.map((f, i) => (
        <g key={f.k}>
          <rect x={(i / 4) * W} y={12} width={W / 4} height={H - 34} fill={f.c} opacity="0.05" />
          <text x={(i / 4) * W + W / 8} y={9} textAnchor="middle" fontSize="10" fontWeight="800" fill={f.c}>
            {f.n}
          </text>
        </g>
      ))}
      <polyline points={onda} fill="none" stroke={T.accent} strokeWidth="2" opacity="0.75" />
      <line x1={x} x2={x} y1={12} y2={H - 22} stroke={T.text} strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx={x} cy={H / 2 - 6} r="7" fill={T.bull} stroke={T.card} strokeWidth="3" />
      <text x={x} y={H - 6} textAnchor="middle" fontSize="10" fontWeight="800" fill={T.text}>AHORA</text>
    </svg>
  );
}

export default function WyckoffTab({ T, d }) {
  const w = d?.wyckoff;
  const disponible = w?.disponible;
  const probs = w?.probabilidades || {};
  const r = w?.rasgos || {};

  const adx = num(d?.adx);
  const bb = num(d?.bb_width);
  const atrp = num(d?.atr_pct);
  const mom = num(d?.momentum_12_1);

  const regimen = d?.market_regime;
  const REGIMEN = {
    trending: ["TENDENCIA", "ADX por encima de 25. Seguir dirección con stop dinámico.", T.bull],
    ranging: ["LATERAL", "ADX por debajo de 20. Operar reversiones en los extremos del rango.", T.accent],
    volatile: ["VOLÁTIL", "ATR elevado. Reducir tamaño de posición.", T.bear],
    breakout: ["RUPTURA", "Rango comprimido. Esperar confirmación con volumen.", T.purple],
  };
  const [regNombre, regDesc, regColor] = REGIMEN[regimen] || ["SIN DATOS", "Faltan ADX, anchura de Bollinger o ATR para clasificar el régimen.", T.noSignal];

  const FASES = [
    { k: "acumulacion", n: "Acumulación", c: T.teal },
    { k: "alcista", n: "Tendencia alcista", c: T.bull },
    { k: "distribucion", n: "Distribución", c: T.warn },
    { k: "bajista", n: "Tendencia bajista", c: T.bear },
  ];

  /* Score adaptativo: contribución = puntuación × peso, sin excepciones.
     La suma de las contribuciones ES el total; no hay un número aparte. */
  const s100 = num(d?.score_100);
  const b = d?.score_breakdown || {};
  const FACTORES = [
    { n: "Fundamental", v: num(b.fundamental), max: 30, c: T.bull },
    { n: "Momentum", v: num(b.momentum), max: 25, c: T.teal },
    { n: "Microestructura", v: num(b.microestruc), max: 25, c: T.cyan },
    { n: "Sentimiento", v: num(b.sentimiento), max: 20, c: T.purple },
    { n: "Ichimoku", v: num(b.ichimoku), max: 10, c: T.indigo },
    { n: "Wyckoff", v: num(b.wyckoff), max: 10, c: T.warn },
    { n: "Posición del cierre", v: num(b.volume_delta), max: 5, c: T.orange },
  ];
  const TOPE = FACTORES.reduce((s, f) => s + f.max, 0);
  const sumaPuntos = FACTORES.reduce((s, f) => s + (f.v || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Régimen */}
      <Bloque T={T}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>DETECTOR DE RÉGIMEN</div>
          <span style={{ fontSize: 10, fontWeight: 800, color: regColor,
                         border: `1px solid ${regColor}`, borderRadius: 4, padding: "2px 8px" }}>
            {regNombre}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: "0 1 220px" }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: regColor }}>{regNombre}</div>
            <div style={{ fontSize: 11, color: T.textSec, marginTop: 4, lineHeight: 1.5 }}>{regDesc}</div>
          </div>

          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Indicador T={T} etiqueta="ADX" valor={adx} texto={adx == null ? "—" : adx.toFixed(1)}
                       frac={adx == null ? 0 : adx / 50} color={T.indigo}
                       estado={adx == null ? null : adx > 25 ? "FUERTE" : adx < 20 ? "BAJO" : "MEDIO"}
                       tonoEstado={adx == null ? T.noSignal : adx > 25 ? T.bull : T.muted} />
            <Indicador T={T} etiqueta="Anchura BB" valor={bb} texto={bb == null ? "—" : `${(bb * 100).toFixed(2)} %`}
                       frac={bb == null ? 0 : bb / 0.15} color={T.purple}
                       estado={bb == null ? null : bb < 0.03 ? "COMPRIMIDO" : "NORMAL"}
                       tonoEstado={bb == null ? T.noSignal : bb < 0.03 ? T.purple : T.muted} />
            <Indicador T={T} etiqueta="ATR %" valor={atrp} texto={atrp == null ? "—" : `${atrp.toFixed(2)} %`}
                       frac={atrp == null ? 0 : atrp / 6} color={atrp > 3 ? T.bear : T.bull}
                       estado={atrp == null ? null : atrp > 3 ? "ALTO" : atrp < 1.5 ? "BAJO" : "MEDIO"}
                       tonoEstado={atrp == null ? T.noSignal : atrp > 3 ? T.bear : T.muted} />
            <Indicador T={T} etiqueta="Momentum" valor={mom} texto={mom == null ? "—" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)} %`}
                       frac={mom == null ? 0 : (mom + 40) / 80} color={mom > 0 ? T.bull : T.bear}
                       estado={mom == null ? null : Math.abs(mom) > 15 ? "FUERTE" : "MODERADO"}
                       tonoEstado={mom == null ? T.noSignal : mom > 0 ? T.bull : T.bear} />
          </div>
        </div>
      </Bloque>

      {/* Wyckoff */}
      <Bloque T={T}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>FASE DE MERCADO — CICLO DE WYCKOFF</div>
          {disponible ? (
            <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
              confianza {(w.confidence * 100).toFixed(0)} % · {r.sesiones} sesiones
            </span>
          ) : null}
        </div>

        {!disponible ? (
          <div style={{ background: T.card2, borderLeft: `3px solid ${T.noSignal}`, borderRadius: 8,
                        padding: "13px 15px", fontSize: 11, color: T.textSec, lineHeight: 1.55 }}>
            {w?.motivo || "No se pudo determinar la fase."}
          </div>
        ) : (
          <>
            <div style={{ background: T.card2,
                          borderLeft: `3px solid ${w.transicion ? T.warn : T.bull}`,
                          borderRadius: 8, padding: "11px 13px", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>
                FASE ACTUAL: {w.phase.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: T.textSec, marginTop: 3, lineHeight: 1.5 }}>
                {w.descripcion}
              </div>
            </div>

            <Ciclo T={T} probs={probs} fase={w.stage} />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12 }}>
              {FASES.map((f) => {
                const p = probs[f.k] ?? 0;
                const activa = f.k === w.stage;
                return (
                  <div key={f.k} style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: activa ? 800 : 400,
                                     color: activa ? f.c : T.textSec }}>{f.n}</span>
                      <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700,
                                     color: activa ? f.c : T.muted }}>{p.toFixed(1)} %</span>
                    </div>
                    <div style={{ height: 7, background: T.card2, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, height: "100%", background: f.c,
                                    opacity: activa ? 1 : 0.45 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rasgos medidos: sin esto la fase sería una etiqueta sin respaldo */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14,
                          paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
              {[
                ["Posición en el rango", `${r.posicion_en_rango} %`],
                ["Tendencia reciente", `${r.tendencia_anual > 0 ? "+" : ""}${r.tendencia_anual} % anual`],
                ["Tendencia previa", `${r.tendencia_previa > 0 ? "+" : ""}${r.tendencia_previa} % anual`],
                ["Rango 60 sesiones", `${usd(r.suelo_60)} – ${usd(r.techo_60)}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: T.muted }}>{k}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: T.text }}>{v}</div>
                </div>
              ))}
            </div>

            {w.estrategia?.length ? (
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                <Rotulo T={T}>Qué suele funcionar en esta fase</Rotulo>
                {w.estrategia.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0" }}>
                    <span style={{ color: T.bull, fontSize: 12 }}>·</span>
                    <span style={{ fontSize: 11, color: T.textSec }}>{e}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </Bloque>

      {/* Score por factores */}
      <Bloque T={T}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>APORTACIÓN DE CADA FACTOR</div>
          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
            régimen: {regNombre.toLowerCase()}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <div style={{ flex: "0 1 190px", textAlign: "center" }}>
            <div style={{ fontSize: 38, fontWeight: 800, fontFamily: "monospace",
                          color: s100 == null ? T.noSignal : T.accent }}>
              {s100 == null ? "—" : s100.toFixed(0)}
            </div>
            <div style={{ fontSize: 11, color: T.muted }}>sobre 100</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
              {num(d?.score) != null ? `${d.score} de ${d.score_max || 165} puntos` : ""}
            </div>
          </div>

          <div style={{ flex: "1 1 380px", minWidth: 0 }}>
            <div style={{ display: "flex", fontSize: 9, fontWeight: 800, color: T.muted,
                          letterSpacing: "0.07em", paddingBottom: 6 }}>
              <span style={{ flex: 1 }}>FACTOR</span>
              <span style={{ width: 54, textAlign: "right" }}>TOPE</span>
              <span style={{ width: 120 }} />
              <span style={{ width: 62, textAlign: "right" }}>APORTA</span>
            </div>
            {FACTORES.map((f) => (
              <div key={f.n} style={{ display: "flex", alignItems: "center", gap: 8,
                                      padding: "5px 0", borderTop: `1px solid ${T.border}` }}>
                <span style={{ flex: 1, fontSize: 11, color: T.text }}>{f.n}</span>
                <span style={{ width: 54, textAlign: "right", fontSize: 10, color: T.muted,
                               fontFamily: "monospace" }}>/{f.max}</span>
                <div style={{ width: 120, height: 7, background: T.card2, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(0, Math.min(1, (f.v || 0) / f.max)) * 100}%`,
                                height: "100%", background: f.v == null ? T.noSignal : f.c }} />
                </div>
                <span style={{ width: 62, textAlign: "right", fontSize: 12, fontWeight: 700,
                               fontFamily: "monospace", color: f.v == null ? T.noSignal : T.text }}>
                  {f.v == null ? "—" : f.v.toFixed(1)}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0",
                          borderTop: `2px solid ${T.borderH}` }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 800, color: T.text }}>Suma</span>
              <span style={{ width: 54, textAlign: "right", fontSize: 10, color: T.muted,
                             fontFamily: "monospace" }}>/{TOPE}</span>
              <div style={{ width: 120 }} />
              <span style={{ width: 62, textAlign: "right", fontSize: 13, fontWeight: 800,
                             fontFamily: "monospace", color: T.accent }}>
                {sumaPuntos.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10, color: T.muted, marginTop: 12, lineHeight: 1.55 }}>
          Cada factor va sobre su propio tope, no sobre 100, y la columna «aporta» son los puntos
          que suma al score. La suma de la columna es el score: no hay un total calculado aparte
          que pueda no cuadrar con sus partes.
        </div>
      </Bloque>
    </div>
  );
}
