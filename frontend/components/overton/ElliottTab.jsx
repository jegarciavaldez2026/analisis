/**
 * Pestaña Elliott — impulso 1-2-3-4-5.
 *
 * Todo sale de `/patterns/{ticker}`: los seis pivotes vienen de un ZigZag
 * sobre el histórico real, y las proporciones de Fibonacci se **miden**, no se
 * imponen. Ahí está la diferencia con el panel anterior, que construía las
 * ondas aplicando 1.618 y 0.618 a números aleatorios y después «validaba» que
 * las relaciones se cumplían — cumplían porque estaban fabricadas para ello.
 *
 * Dos apartados de la maqueta que no reproduzco:
 *
 * - «Probabilidad 60 % / 30 % / 10 %» en las extensiones. Sin contraste contra
 *   impulsos pasados, esos números serían inventados.
 * - «Onda 5 confirma con divergencia RSI» como regla de invalidación. No es
 *   una regla del método: las tres inviolables son las que se listan.
 */

import { useState } from "react";
import { usePatrones, MARCOS_PATRON } from "./PatternPanels";

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const usd = (v) => {
  const n = num(v);
  return n == null ? "—" : `$${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function Bloque({ T, children, style }) {
  return <div style={{
    background: T.card, border: `1px solid ${T.border}`,
    borderRadius: 10, padding: "13px 15px", ...style,
  }}>{children}</div>;
}

function Rotulo({ T, children }) {
  return <div style={{
    fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
    textTransform: "uppercase", marginBottom: 9,
  }}>{children}</div>;
}

function Fila({ T, izq, der, color, ultima }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 10,
      padding: "7px 0", borderBottom: ultima ? "none" : `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: 11, color: T.textSec }}>{izq}</span>
      <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: color || T.text }}>
        {der}
      </span>
    </div>
  );
}

/** Estructura de ondas: la curva 0-5 más los niveles proyectados. */
function GraficoOndas({ T, e }) {
  const ondas = e.ondas;
  const W = 940, H = 320, P = { t: 34, r: 106, b: 34, l: 60 };
  const alcista = e.direccion === "alcista";
  const color = alcista ? T.bull : T.bear;

  const niveles = [
    ...e.proyecciones.map((x) => ({ ...x, tipo: "proy" })),
    ...e.retrocesos.map((x) => ({ ...x, tipo: "retro" })),
  ];

  const xs = ondas.map((o) => o.idx);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const precios = [...ondas.map((o) => o.precio), ...niveles.map((n) => n.precio)];
  const yMin = Math.min(...precios), yMax = Math.max(...precios);
  const pad = (yMax - yMin) * 0.10 || 1;
  const lo = yMin - pad, hi = yMax + pad;

  const X = (i) => P.l + ((i - xMin) / (xMax - xMin || 1)) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = P.t + f * (H - P.t - P.b);
        return (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke={T.border} strokeWidth="1" strokeDasharray="2 5" />
            <text x={P.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill={T.muted} fontFamily="monospace">
              {(hi - f * (hi - lo)).toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Niveles proyectados */}
      {niveles.map((n, i) => {
        const c = n.tipo === "proy" ? T.accent : T.warn;
        return (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={Y(n.precio)} y2={Y(n.precio)}
                  stroke={c} strokeWidth="1" strokeDasharray="6 5" opacity="0.75" />
            <text x={W - P.r + 6} y={Y(n.precio) + 3} fontSize="9" fill={c} fontFamily="monospace">
              {n.precio.toFixed(2)}
            </text>
          </g>
        );
      })}

      {/* Curva del impulso */}
      <polyline points={ondas.map((o) => `${X(o.idx)},${Y(o.precio)}`).join(" ")}
                fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />

      {ondas.map((o, i) => (
        <g key={i}>
          <circle cx={X(o.idx)} cy={Y(o.precio)} r="5"
                  fill={i === 0 ? T.card : color} stroke={color} strokeWidth="2" />
          <text x={X(o.idx)} y={Y(o.precio) - 14} textAnchor="middle"
                fontSize="12" fontWeight="800" fill={T.text}>{o.n}</text>
          <text x={X(o.idx)} y={Y(o.precio) + 20} textAnchor="middle"
                fontSize="9" fill={T.muted} fontFamily="monospace">{o.precio.toFixed(2)}</text>
        </g>
      ))}
    </svg>
  );
}

function Calidad({ T, e }) {
  const v = Math.max(0, Math.min(100, e.calidad));
  const c = v >= 70 ? T.bull : v >= 50 ? T.warn : T.bear;
  const R = 46, C = Math.PI * R;
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 120 66" style={{ width: 142, height: 78 }}>
        <path d={`M 14 58 A ${R} ${R} 0 0 1 106 58`} fill="none" stroke={T.card2} strokeWidth="10" strokeLinecap="round" />
        <path d={`M 14 58 A ${R} ${R} 0 0 1 106 58`} fill="none" stroke={c} strokeWidth="10"
              strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} />
        <text x="60" y="52" textAnchor="middle" fontSize="21" fontWeight="800" fill={c} fontFamily="monospace">{v}</text>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 700, color: c, marginTop: -6 }}>{e.calidad_etiqueta}</div>
    </div>
  );
}

export default function ElliottTab({ T, ticker }) {
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
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>ELLIOTT — CICLO 1-2-3-4-5</div>
        {datos ? (
          <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", marginTop: 2 }}>
            {datos.barras} velas · marco {MARCOS_PATRON.find((m) => m.k === marco)?.n}
          </div>
        ) : null}
      </div>
      {selector}
    </div>
  );


  const e = datos?.elliott;

  if (cargando) return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cabecera}
        <Bloque T={T}><div style={{ fontSize: 12, color: T.muted, padding: 16, textAlign: "center" }}>
          Buscando el conteo sobre el histórico…</div></Bloque>
      </div>
    );
  if (error) return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cabecera}
        <Bloque T={T}><div style={{ fontSize: 12, color: T.bear, padding: 14 }}>
          No se pudo analizar: {error}</div></Bloque>
      </div>
    );

  if (!e?.encontrado) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cabecera}
        <Bloque T={T}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 10 }}>
          ELLIOTT — CICLO 1-2-3-4-5
        </div>
        <div style={{ background: T.card2, borderLeft: `3px solid ${T.noSignal}`, borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>
            No hay un conteo válido ahora mismo
          </div>
          <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.55 }}>{e?.motivo}</div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>
            Analizadas {datos?.barras ?? "—"} velas. La mayoría de las series, la mayor parte del
            tiempo, no forman un impulso que cumpla las cuatro reglas.
          </div>
        </div>
        {e?.reglas?.length ? (
          <div style={{ marginTop: 12 }}>
            <Rotulo T={T}>Reglas comprobadas en el conteo más aproximado</Rotulo>
            {e.reglas.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: 3, height: 16, background: r.cumple ? T.bull : T.bear, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.text }}>{r.regla}</div>
                  <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{r.valor}</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: r.cumple ? T.bull : T.bear }}>
                  {r.cumple ? "CUMPLE" : "NO"}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        </Bloque>
      </div>
    );
  }

  const alcista = e.direccion === "alcista";
  const colorDir = alcista ? T.bull : T.bear;
  const plan = e.plan;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cabecera}

      {/* Cabecera */}
      <Bloque T={T}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>ELLIOTT — CICLO 1-2-3-4-5</div>
            <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", marginTop: 2 }}>
              Escala {e.escala_atr} ATR · {datos?.barras} velas · {e.ventanas_examinadas} ventanas examinadas
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: T.textSec,
                           border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 8px" }}>
              {e.tipo_patron.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: colorDir,
                           border: `1px solid ${colorDir}`, borderRadius: 4, padding: "2px 8px" }}>
              {e.direccion.toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{
          marginTop: 11, background: T.card2, borderLeft: `3px solid ${colorDir}`,
          borderRadius: 7, padding: "11px 13px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: colorDir }}>
            {plan.sentido.toUpperCase()} — onda actual: {e.onda_actual}
          </div>
          <div style={{ fontSize: 11, color: T.text, marginTop: 3, lineHeight: 1.5 }}>{plan.nota}</div>
        </div>

        {e.provisional ? (
          <div style={{ marginTop: 8, fontSize: 10, color: T.warn, lineHeight: 1.5 }}>
            El último pivote todavía se está formando: el conteo puede cambiar si el precio
            extiende el movimiento actual.
          </div>
        ) : null}
      </Bloque>

      {/* Gráfico */}
      <Bloque T={T}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
          {[["Impulso", colorDir], ["Proyecciones onda 5", T.accent], ["Retrocesos A-B-C", T.warn]].map(([t, c]) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: T.textSec }}>
              <span style={{ width: 16, height: 2, background: c, display: "inline-block" }} />{t}
            </span>
          ))}
        </div>
        <GraficoOndas T={T} e={e} />
      </Bloque>

      {/* Detalle de ondas */}
      <Bloque T={T}>
        <Rotulo T={T}>Detalle de ondas</Rotulo>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr>
                {["Onda", "Tipo", "Precio", "Referencia canónica", "Medido", "Lectura", "Estado"].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i >= 2 && i <= 4 ? "right" : "left",
                    fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.07em",
                    padding: "6px 8px 8px 0", borderBottom: `1px solid ${T.border}`,
                  }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {e.detalle.map((d) => (
                <tr key={d.onda}>
                  <td style={{ padding: "9px 8px 9px 0", borderBottom: `1px solid ${T.border}`,
                               fontSize: 12, fontWeight: 800, color: T.text }}>{d.onda}</td>
                  <td style={{ padding: "9px 8px 9px 0", borderBottom: `1px solid ${T.border}`,
                               fontSize: 11, color: T.textSec }}>{d.tipo}</td>
                  <td style={{ padding: "9px 8px", borderBottom: `1px solid ${T.border}`, textAlign: "right",
                               fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: T.text }}>
                    {usd(d.precio)}
                  </td>
                  <td style={{ padding: "9px 8px", borderBottom: `1px solid ${T.border}`, textAlign: "right",
                               fontSize: 10, color: T.muted }}>{d.referencia}</td>
                  <td style={{ padding: "9px 8px", borderBottom: `1px solid ${T.border}`, textAlign: "right",
                               fontSize: 11, fontFamily: "monospace", color: T.text }}>{d.medido}</td>
                  <td style={{ padding: "9px 8px 9px 0", borderBottom: `1px solid ${T.border}`,
                               fontSize: 10, color: T.textSec }}>{d.senal}</td>
                  <td style={{ padding: "9px 0", borderBottom: `1px solid ${T.border}`,
                               fontSize: 10, fontWeight: 800, color: d.cumple ? T.bull : T.warn }}>
                    {d.cumple ? "EN RANGO" : "FUERA"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 9, lineHeight: 1.55 }}>
          «Fuera de rango» no invalida el conteo: las proporciones de Fibonacci son tendencias
          habituales, no reglas. Las que sí invalidan son las cuatro de la derecha.
        </div>
      </Bloque>

      {/* Proyecciones y relaciones */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Bloque T={T} style={{ flex: "1 1 340px" }}>
          <Rotulo T={T}>Proyecciones de la onda 5</Rotulo>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {e.proyecciones.map((x) => (
              <div key={x.nivel} style={{
                flex: "1 1 100px", textAlign: "center", background: T.card2,
                border: `1px solid ${T.border}`, borderTop: `3px solid ${T.accent}`,
                borderRadius: 7, padding: "10px 6px",
              }}>
                <div style={{ fontSize: 10, color: T.textSec }}>{x.nivel}</div>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: T.text, marginTop: 3 }}>
                  {usd(x.precio)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 12 }} />
          <Rotulo T={T}>Retrocesos A-B-C esperados</Rotulo>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {e.retrocesos.map((x) => (
              <div key={x.nivel} style={{
                flex: "1 1 100px", textAlign: "center", background: T.card2,
                border: `1px solid ${T.border}`, borderTop: `3px solid ${T.warn}`,
                borderRadius: 7, padding: "10px 6px",
              }}>
                <div style={{ fontSize: 10, color: T.textSec }}>{x.nivel}</div>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: T.text, marginTop: 3 }}>
                  {usd(x.precio)}
                </div>
              </div>
            ))}
          </div>
        </Bloque>

        <Bloque T={T} style={{ flex: "1 1 300px" }}>
          <Rotulo T={T}>Relaciones Fibonacci medidas</Rotulo>
          {[
            ["Onda 2 frente a onda 1", e.proporciones.onda_2_vs_1, "0.618"],
            ["Onda 3 frente a onda 1", e.proporciones.onda_3_vs_1, "1.618"],
            ["Onda 4 frente a onda 3", e.proporciones.onda_4_vs_3, "0.382"],
            ["Onda 5 frente a onda 1", e.proporciones.onda_5_vs_1, "1.000"],
            ["Onda 5 frente a onda 3", e.proporciones.onda_5_vs_3, "0.618"],
          ].map(([k, v, canon], i, arr) => (
            <div key={k} style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
              padding: "7px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${T.border}`,
            }}>
              <span style={{ fontSize: 11, color: T.textSec }}>{k}</span>
              <span style={{ textAlign: "right" }}>
                <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: T.text }}>
                  {v == null ? "—" : v.toFixed(3)}
                </span>
                <span style={{ fontSize: 9, color: T.muted, marginLeft: 6 }}>canónico {canon}</span>
              </span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: T.muted, marginTop: 9, lineHeight: 1.55 }}>
            Estas cifras se miden sobre los pivotes reales. El panel anterior las imponía al
            construir las ondas y después comprobaba que se cumplían.
          </div>
        </Bloque>
      </div>

      {/* Reglas, calidad y plan */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Bloque T={T} style={{ flex: "1 1 340px" }}>
          <Rotulo T={T}>Reglas de invalidación del conteo</Rotulo>
          {e.reglas.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ width: 3, height: 18, background: r.cumple ? T.bull : T.bear, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T.text }}>{r.regla}</div>
                <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{r.valor}</div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: r.cumple ? T.bull : T.bear }}>
                {r.cumple ? "CUMPLE" : "NO"}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: T.muted, marginTop: 9, lineHeight: 1.55 }}>
            Si cualquiera de las cuatro deja de cumplirse, el conteo desaparece: no hay lectura
            alternativa que lo salve.
          </div>
        </Bloque>

        <Bloque T={T} style={{ flex: "0 1 210px" }}>
          <Rotulo T={T}>Calidad del conteo</Rotulo>
          <Calidad T={T} e={e} />
          <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>
            Mide cuánto se acercan las proporciones medidas a las canónicas y cuánto se extiende
            la onda 3. No es una probabilidad de acierto.
          </div>
        </Bloque>

        <Bloque T={T} style={{ flex: "1 1 280px" }}>
          <Rotulo T={T}>Plan de operación</Rotulo>
          <Fila T={T} izq="Sentido" der={plan.sentido} color={colorDir} />
          <Fila T={T} izq="Entrada" der={usd(plan.entrada)} />
          <Fila T={T} izq="Stop loss" der={usd(plan.stop_loss)} color={T.bear} />
          <Fila T={T} izq="Objetivo 1" der={usd(plan.objetivo_1)} color={T.bull} />
          <Fila T={T} izq="Objetivo 2" der={usd(plan.objetivo_2)} color={T.bull} ultima />
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
            El stop se sitúa en el nivel que invalida el conteo, no a una distancia arbitraria: si
            el precio lo cruza, el impulso deja de existir.
          </div>
        </Bloque>
      </div>

      <Bloque T={T} style={{ borderLeft: `3px solid ${T.noSignal}` }}>
        <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.6 }}>
          <strong>No incluido a propósito:</strong> la probabilidad de cada extensión (60 % / 30 %
          / 10 % en la maqueta) exigiría contrastar contra impulsos pasados, y sin ese contraste
          serían cifras inventadas. Tampoco figura «la onda 5 confirma con divergencia de RSI»
          entre las reglas de invalidación: no es una regla del método, sino una confirmación
          opcional.
        </div>
      </Bloque>
    </div>
  );
}
