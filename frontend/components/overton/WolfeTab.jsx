/**
 * Pestaña Wolfe — patrón de cinco puntos.
 *
 * Todo lo que se pinta viene de `/patterns/{ticker}`: los cinco pivotes salen
 * de un ZigZag sobre el histórico real y las tres rectas de la geometría del
 * patrón, no de valores fabricados.
 *
 * Diferencias frente a la maqueta, deliberadas:
 *
 * - En la maqueta el patrón era bajista y todos los objetivos quedaban por
 *   ENCIMA de la entrada, lo que es imposible: vender esperando que suba no
 *   es una operación. Aquí la dirección la fija el tipo del punto 5, así que
 *   los objetivos caen siempre del lado correcto por construcción.
 *
 * - La calidad no es un número puesto a mano: sale de la simetría de las
 *   ondas, de cuánto sobresale el punto 5 de la recta 1-3 y de la relación
 *   riesgo/beneficio. Los tres componentes se muestran.
 *
 * - No hay «precisión histórica». Sin un contraste contra patrones pasados,
 *   ese porcentaje sería inventado.
 */

import { useState } from "react";
import { usePatrones, MARCOS_PATRON } from "./PatternPanels";

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const usd = (v) => {
  const n = num(v);
  return n == null ? "—" : `$${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function Bloque({ T, children, style }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "13px 15px", ...style,
    }}>{children}</div>
  );
}

function Rotulo({ T, children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
      textTransform: "uppercase", marginBottom: 9,
    }}>{children}</div>
  );
}

/** Gráfico: los cinco pivotes, las dos rectas del patrón y el objetivo. */
function GraficoWolfe({ T, w }) {
  const pts = w.puntos;
  const W = 900, H = 300, P = { t: 30, r: 90, b: 34, l: 62 };

  const idxs = pts.map((p) => p.idx);
  const xMin = Math.min(...idxs);
  const xMax = Math.max(w.epa_idx, ...idxs);
  const precios = [...pts.map((p) => p.precio), w.epa];
  const yMin = Math.min(...precios), yMax = Math.max(...precios);
  const pad = (yMax - yMin) * 0.14 || 1;

  const X = (i) => P.l + ((i - xMin) / (xMax - xMin || 1)) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - (yMin - pad)) / ((yMax + pad) - (yMin - pad))) * (H - P.t - P.b);

  const recta = ({ pendiente, ordenada }) => {
    const x1 = xMin, x2 = w.epa_idx;
    return { x1: X(x1), y1: Y(pendiente * x1 + ordenada), x2: X(x2), y2: Y(pendiente * x2 + ordenada) };
  };
  const r13 = recta(w.rectas.linea_1_3);
  const r24 = recta(w.rectas.linea_2_4);
  const r14 = recta(w.rectas.linea_1_4);
  const bajista = w.direccion === "bajista";
  const colorDir = bajista ? T.bear : T.bull;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = P.t + f * (H - P.t - P.b);
        const v = (yMax + pad) - f * ((yMax + pad) - (yMin - pad));
        return (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke={T.border} strokeWidth="1" strokeDasharray="2 5" />
            <text x={P.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill={T.muted} fontFamily="monospace">
              {v.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Rectas del patrón */}
      <line {...r13} stroke={T.warn} strokeWidth="1.5" strokeDasharray="7 5" />
      <line {...r24} stroke={T.purple} strokeWidth="1.5" strokeDasharray="7 5" />
      <line {...r14} stroke={T.accent} strokeWidth="1.5" strokeDasharray="3 4" />

      {/* Recorrido del patrón */}
      <polyline points={pts.map((p) => `${X(p.idx)},${Y(p.precio)}`).join(" ")}
                fill="none" stroke={T.text} strokeWidth="2" strokeLinejoin="round" />

      {/* Proyección al objetivo */}
      <line x1={X(pts[4].idx)} y1={Y(pts[4].precio)} x2={X(w.epa_idx)} y2={Y(w.epa)}
            stroke={colorDir} strokeWidth="1.5" strokeDasharray="4 4" />

      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={X(p.idx)} cy={Y(p.precio)} r="5"
                  fill={i === 4 ? colorDir : T.card} stroke={i === 4 ? colorDir : T.text} strokeWidth="2" />
          <text x={X(p.idx)} y={Y(p.precio) - 14} textAnchor="middle"
                fontSize="12" fontWeight="800" fill={i === 4 ? colorDir : T.text}>
            {p.n}
          </text>
          <text x={X(p.idx)} y={Y(p.precio) + 20} textAnchor="middle"
                fontSize="9" fill={T.muted} fontFamily="monospace">
            {p.precio.toFixed(2)}
          </text>
        </g>
      ))}

      <circle cx={X(w.epa_idx)} cy={Y(w.epa)} r="5" fill="none" stroke={T.accent} strokeWidth="2" />
      <text x={X(w.epa_idx)} y={Y(w.epa) - 14} textAnchor="middle" fontSize="11" fontWeight="800" fill={T.accent}>
        EPA
      </text>
      <text x={X(w.epa_idx)} y={Y(w.epa) + 20} textAnchor="middle" fontSize="9" fill={T.accent} fontFamily="monospace">
        {w.epa.toFixed(2)}
      </text>
    </svg>
  );
}

/** Arco de calidad. */
function Calidad({ T, w }) {
  const v = Math.max(0, Math.min(100, w.calidad));
  const color = v >= 70 ? T.bull : v >= 50 ? T.warn : T.bear;
  const R = 46, C = Math.PI * R;
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 120 66" style={{ width: 148, height: 82 }}>
        <path d={`M 14 58 A ${R} ${R} 0 0 1 106 58`} fill="none" stroke={T.card2} strokeWidth="10" strokeLinecap="round" />
        <path d={`M 14 58 A ${R} ${R} 0 0 1 106 58`} fill="none" stroke={color} strokeWidth="10"
              strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} />
        <text x="60" y="52" textAnchor="middle" fontSize="21" fontWeight="800" fill={color} fontFamily="monospace">
          {v}
        </text>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginTop: -6 }}>{w.calidad_etiqueta}</div>
      <div style={{ fontSize: 10, color: T.muted }}>
        Patrón {w.direccion}
      </div>
    </div>
  );
}

export default function WolfeTab({ T, ticker }) {
  // Los patrones existen a cualquier escala: el mismo valor puede tener
  // un conteo claro en diario y ninguno en horario. Por eso el marco es
  // una elección del usuario y no una constante.
  const [marco, setMarco] = useState("1d");
  const { cargando, error, datos } = usePatrones(ticker, marco);
  // La cabecera va en TODOS los estados —cargando, error y sin patrón—
  // porque si el selector desapareciera al no encontrar nada, el usuario no
  // podría cambiar de marco justo cuando más falta le hace.
  const selector = (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {MARCOS_PATRON.map((m) => {
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
  );
  const cabecera = (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "12px 15px", display: "flex", alignItems: "center",
                  justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>WOLFE — PATRÓN DE 5 PUNTOS</div>
        {datos ? (
          <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", marginTop: 2 }}>
            {datos.barras} velas · marco {MARCOS_PATRON.find((m) => m.k === marco)?.n}
          </div>
        ) : null}
      </div>
      {selector}
    </div>
  );


  const w = datos?.wolfe;
  const bajista = w?.direccion === "bajista";
  const colorDir = bajista ? T.bear : T.bull;

  if (cargando) {
    return <Bloque T={T}><div style={{ fontSize: 12, color: T.muted, padding: 16, textAlign: "center" }}>
      Buscando el patrón sobre el histórico…
    </div></Bloque>;
  }
  if (error) {
    return <Bloque T={T}><div style={{ fontSize: 12, color: T.bear, padding: 14 }}>
      No se pudo analizar: {error}
    </div></Bloque>;
  }

  if (!w?.encontrado) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cabecera}
        <Bloque T={T}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 10 }}>
            WOLFE — PATRÓN DE 5 PUNTOS
          </div>
          <div style={{
            background: T.card2, borderLeft: `3px solid ${T.noSignal}`,
            borderRadius: 8, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              No hay patrón válido ahora mismo
            </div>
            <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.55 }}>{w?.motivo}</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>
              Es el resultado más frecuente. Un detector que siempre encuentra un patrón no está
              detectando nada. Analizadas {datos?.barras ?? "—"} velas.
            </div>
          </div>
          {w?.reglas?.length ? (
            <div style={{ marginTop: 12 }}>
              <Rotulo T={T}>Reglas comprobadas</Rotulo>
              {w.reglas.map((r, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "7px 0", borderBottom: `1px solid ${T.border}`,
                }}>
                  <div style={{ width: 3, height: 16, background: r.cumple ? T.bull : T.bear, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: T.text }}>{r.regla}</div>
                    {r.valor ? <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{r.valor}</div> : null}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: r.cumple ? T.bull : T.bear }}>
                    {r.cumple ? "CUMPLE" : "NO CUMPLE"}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Bloque>
      </div>
    );
  }

  const plan = w.plan;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cabecera}

      {/* Cabecera y señal */}
      <Bloque T={T}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>WOLFE — PATRÓN DE 5 PUNTOS</div>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <span style={{
              fontSize: 10, fontWeight: 800, color: colorDir,
              border: `1px solid ${colorDir}`, borderRadius: 4, padding: "2px 8px",
            }}>PATRÓN {w.direccion.toUpperCase()}</span>
            <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
              {datos?.interval || "1d"} · {datos?.barras} velas
            </span>
          </div>
        </div>

        <div style={{
          marginTop: 11, background: T.card2, borderLeft: `3px solid ${colorDir}`,
          borderRadius: 7, padding: "11px 13px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: colorDir }}>
            SEÑAL DE {plan.sentido.toUpperCase()} — punto 5 alcanzado
          </div>
          <div style={{ fontSize: 11, color: T.text, marginTop: 3 }}>
            El precio ha superado la recta 1-3. Objetivo EPA: <strong>{usd(w.epa)}</strong>.
          </div>
        </div>

        {w.aviso ? (
          <div style={{
            marginTop: 8, background: T.card2, borderLeft: `3px solid ${T.warn}`,
            borderRadius: 7, padding: "10px 12px", fontSize: 11, color: T.text, lineHeight: 1.5,
          }}>{w.aviso}</div>
        ) : null}

        {w.provisional ? (
          <div style={{ marginTop: 8, fontSize: 10, color: T.warn, lineHeight: 1.5 }}>
            El punto 5 todavía se está formando: el patrón puede invalidarse si el precio extiende
            el movimiento actual.
          </div>
        ) : null}
      </Bloque>

      {/* Gráfico */}
      <Bloque T={T}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
          {[["Recta 1-3", T.warn], ["Recta 2-4", T.purple], ["Recta 1-4 → EPA", T.accent]].map(([t, c]) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textSec }}>
              <span style={{ width: 16, height: 2, background: c, display: "inline-block" }} />{t}
            </span>
          ))}
        </div>
        <GraficoWolfe T={T} w={w} />
      </Bloque>

      {/* Puntos */}
      <Bloque T={T}>
        <Rotulo T={T}>Puntos del patrón</Rotulo>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {w.puntos.map((p, i) => (
            <div key={p.n} style={{
              flex: "1 1 120px", textAlign: "center", background: T.card2,
              border: `1px solid ${i === 4 ? colorDir : T.border}`, borderRadius: 7, padding: "9px 6px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: i === 4 ? colorDir : T.muted }}>
                {p.n}{i === 4 ? " — ENTRADA" : ""}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: T.text, marginTop: 3 }}>
                {usd(p.precio)}
              </div>
              <div style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>{p.fecha}</div>
            </div>
          ))}
          <div style={{
            flex: "1 1 120px", textAlign: "center", background: T.card2,
            border: `1px solid ${T.accent}`, borderRadius: 7, padding: "9px 6px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.accent }}>EPA — OBJETIVO</div>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: T.accent, marginTop: 3 }}>
              {usd(w.epa)}
            </div>
          </div>
        </div>
      </Bloque>

      {/* Métodos */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Bloque T={T} style={{ flex: "1 1 400px" }}>
          <Rotulo T={T}>Método 1 · extensiones Fibonacci desde P5</Rotulo>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {w.extensiones.map((e, i) => (
              <div key={e.nivel} style={{
                flex: "1 1 100px", textAlign: "center", borderRadius: 7, padding: "10px 6px",
                border: `1px solid ${T.border}`, borderTop: `3px solid ${i === 0 ? T.accent : colorDir}`,
                background: T.card2,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textSec }}>{e.nivel}</div>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: T.text, marginTop: 3 }}>
                  {usd(e.precio)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 9, lineHeight: 1.55 }}>
            Se miden desde el punto 5 hacia el EPA, así que en un patrón {w.direccion} caen todas
            {bajista ? " por debajo" : " por encima"} de la entrada.
          </div>
        </Bloque>

        <Bloque T={T} style={{ flex: "1 1 300px" }}>
          <Rotulo T={T}>Método 2 · simetría de onda</Rotulo>
          {[
            ["Amplitud P2–P3", usd(w.simetria.amplitud_2_3)],
            ["Amplitud P4–P5", usd(w.simetria.amplitud_4_5)],
            ["Semejanza entre tramos", `${(w.simetria.ratio * 100).toFixed(0)} %`],
          ].map(([k, v]) => (
            <div key={k} style={{
              display: "flex", justifyContent: "space-between",
              padding: "7px 0", borderBottom: `1px solid ${T.border}`,
            }}>
              <span style={{ fontSize: 11, color: T.textSec }}>{k}</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: T.text }}>{v}</span>
            </div>
          ))}
          <div style={{
            marginTop: 10, textAlign: "center", background: T.card2,
            border: `1px solid ${T.border}`, borderRadius: 7, padding: "10px",
          }}>
            <div style={{ fontSize: 10, color: T.muted }}>Estimación simétrica</div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
              {usd(w.simetria.estimacion)}
            </div>
          </div>
        </Bloque>
      </div>

      {/* Validación, calidad y plan */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Bloque T={T} style={{ flex: "1 1 340px" }}>
          <Rotulo T={T}>Validación del patrón</Rotulo>
          {w.reglas.map((r, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "7px 0", borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ width: 3, height: 18, background: r.cumple ? T.bull : T.bear, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T.text }}>{r.regla}</div>
                {r.valor ? <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{r.valor}</div> : null}
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: r.cumple ? T.bull : T.bear }}>
                {r.cumple ? "CUMPLE" : "NO"}
              </div>
            </div>
          ))}
        </Bloque>

        <Bloque T={T} style={{ flex: "0 1 220px" }}>
          <Rotulo T={T}>Calidad</Rotulo>
          <Calidad T={T} w={w} />
          <div style={{ marginTop: 8 }}>
            {[
              ["Simetría de ondas", `${w.calidad_detalle.simetria} %`],
              ["Ruptura de la recta 1-3", `${w.calidad_detalle.ruptura_linea_1_3} %`],
              ["Riesgo / beneficio", `${w.calidad_detalle.riesgo_beneficio}`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 10, color: T.textSec }}>{k}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: T.text }}>{v}</span>
              </div>
            ))}
          </div>
        </Bloque>

        <Bloque T={T} style={{ flex: "1 1 300px" }}>
          <Rotulo T={T}>Plan de operación</Rotulo>
          {[
            [`Entrada (${plan.sentido.toLowerCase()} en P5)`, usd(plan.entrada), T.text],
            ["Stop loss", usd(plan.stop_loss), T.bear],
            ["Objetivo 1 (EPA)", usd(plan.objetivo_1), T.bull],
            ["Objetivo 2 (161.8 %)", usd(plan.objetivo_2), T.bull],
          ].map(([k, v, c]) => (
            <div key={k} style={{
              display: "flex", justifyContent: "space-between",
              padding: "7px 0", borderBottom: `1px solid ${T.border}`,
            }}>
              <span style={{ fontSize: 11, color: T.textSec }}>{k}</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: c }}>{v}</span>
            </div>
          ))}
          <div style={{
            marginTop: 10, background: T.card2, borderRadius: 7, padding: "9px 11px",
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 11, color: T.textSec }}>Riesgo / beneficio</span>
            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
              1 : {plan.riesgo_beneficio}
            </span>
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>
            El stop se coloca más allá del punto 5, no en él: puesto justo en el extremo, el riesgo
            sobre el papel sería cero y saltaría con cualquier mecha.
          </div>
        </Bloque>
      </div>

      {/* Advertencias */}
      <Bloque T={T} style={{ borderLeft: `3px solid ${T.warn}` }}>
        <Rotulo T={T}>Consideraciones</Rotulo>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: T.textSec, lineHeight: 1.7 }}>
          <li><strong>Calidad {w.calidad} sobre 100.</strong> Sale de la simetría, de la ruptura de
              la recta 1-3 y del riesgo/beneficio. No es una probabilidad de acierto.</li>
          <li><strong>El EPA no es un techo.</strong> Es el primer punto de decisión; las
              extensiones dicen hasta dónde ha llegado el precio en casos análogos.</li>
          <li><strong>El patrón puede fallar.</strong> Si el precio supera el stop, el conteo queda
              invalidado y no hay segunda lectura.</li>
        </ol>
      </Bloque>
    </div>
  );
}
