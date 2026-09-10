/**
 * Pestaña CLV — cierre del valor dentro del rango.
 *
 * Antes se llamaba «Predictivo» y mezclaba Elliott, Wolfe, tablas de volumen y
 * la superficie de volatilidad: seis tarjetas de asuntos distintos repartidas
 * por la pantalla. Elliott y Wolfe tienen ahora pestaña propia, así que aquí
 * queda una sola idea, que es lo que permite compactarla.
 *
 * **Qué mide el CLV.** (cierre − mínimo) / (máximo − mínimo). Cero significa
 * que la vela cerró en su mínimo; cien, en su máximo. Es una medida de quién
 * ganó el pulso al final del periodo, y por eso dice más que la variación:
 * un valor puede subir un 2 % y cerrar en mínimos, y eso es debilidad.
 *
 * **Lo que NO es.** No es volumen de compra frente a volumen de venta. Para
 * separarlos hace falta clasificar cada operación contra el bid y el ask, y
 * esta fuente no da datos de tick. El indicador se llamaba «Volume Delta» y
 * se leía como flujo institucional; el nombre está corregido y la fórmula va
 * visible para que nadie lo confunda.
 */

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const corto = (v) => {
  const n = num(v);
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} MM`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k`;
  return n.toFixed(0);
};

/* Pesos declarados del modelo. No se comparan volúmenes entre marcos: la vela
   semanal contiene a la diaria, que contiene a la de 4H, así que sumarlos
   cuenta la misma acción varias veces y la capa macro sale siempre dominante
   por construcción, no por lo que haga el mercado. */
/* Orden de lectura de la tabla: de la vela más corta a la más larga. */
const ORDEN_MARCOS = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

const CAPAS = [
  { k: "macro", n: "Estructura", marcos: ["1D", "1W"], peso: 50,
    ayuda: "Hacia dónde va el fondo. Manda sobre las demás." },
  { k: "medio", n: "Intermedia", marcos: ["1H", "4H"], peso: 30,
    ayuda: "El impulso de las últimas sesiones." },
  { k: "corto", n: "Inmediata", marcos: ["1m", "5m", "15m"], peso: 20,
    ayuda: "Presión del momento. La más ruidosa." },
];

export default function CLVTab({ T, d }) {
  const filas = Array.isArray(d?.volume_delta_mtf) ? d.volume_delta_mtf : [];

  const porMarco = Object.fromEntries(filas.map((f) => [f.tf, f]));
  const clvDe = (tf) => num(porMarco[tf]?.buy_pct);

  const capas = CAPAS.map((c) => {
    const vals = c.marcos.map(clvDe).filter((v) => v != null);
    const media = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return {
      ...c, media,
      sesgo: media == null ? "sin dato" : media > 60 ? "alcista" : media < 40 ? "bajista" : "neutral",
      disponibles: vals.length, total: c.marcos.length,
    };
  });

  // Lectura ponderada: solo las capas con dato entran, y se renormaliza.
  const conDato = capas.filter((c) => c.media != null);
  const pesoTotal = conDato.reduce((s, c) => s + c.peso, 0);
  const global = pesoTotal
    ? conDato.reduce((s, c) => s + c.media * c.peso, 0) / pesoTotal
    : null;

  const colorCLV = (v) => (v == null ? T.noSignal : v > 60 ? T.bull : v < 40 ? T.bear : T.muted);
  const etiqueta = (v) =>
    v == null ? "sin dato"
    : v >= 80 ? "cierre muy alto" : v > 60 ? "cierre alto"
    : v >= 40 ? "cierre medio" : v > 20 ? "cierre bajo" : "cierre muy bajo";

  const Bloque = ({ children, style }) => (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "12px 14px", ...style }}>{children}</div>
  );

  if (!filas.length) {
    return (
      <Bloque>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 6 }}>
          CLV — CIERRE DEL VALOR
        </div>
        <div style={{ fontSize: 11, color: T.muted }}>
          No hay datos de CLV para este valor.
        </div>
      </Bloque>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Veredicto de los cierres. Va primero porque es la respuesta a la
          pregunta que trae el usuario; el resto de la pantalla la sostiene. */}
      {(() => {
        const conValor = ORDEN_MARCOS.map(clvDe).filter((v) => v != null);
        if (!conValor.length) return null;

        const arriba = conValor.filter((v) => v > 60).length;
        const abajo = conValor.filter((v) => v < 40).length;
        const medios = conValor.length - arriba - abajo;

        // Tres señales que se suman: el nivel ponderado, cuántos marcos
        // coinciden y si las capas van en el mismo sentido. La última importa
        // porque estructura y corto plazo contradiciéndose no es tendencia.
        const est = capas[0].media, cor = capas[2].media;
        const coherentes = est != null && cor != null
          && ((est > 55 && cor > 55) || (est < 45 && cor < 45));

        let puntos = 0;
        if (global != null) puntos += global > 60 ? 2 : global < 40 ? -2 : 0;
        puntos += arriba > abajo ? 1 : abajo > arriba ? -1 : 0;
        if (coherentes) puntos += est > 55 ? 1 : -1;

        const fuerza = Math.min(100, Math.abs(puntos) * 25);
        const comprador = puntos >= 2;
        const vendedor = puntos <= -2;
        const col = comprador ? T.bull : vendedor ? T.bear : T.muted;

        const titulo = comprador ? "SESGO COMPRADOR EN LOS CIERRES"
                     : vendedor ? "SESGO VENDEDOR EN LOS CIERRES"
                     : "SIN SESGO CLARO";

        const explicacion = comprador
          ? "Los cierres se están produciendo en la parte alta de los rangos. Quien compra está ganando el pulso al final de cada periodo, que es cuando se fijan las posiciones."
          : vendedor
          ? "Los cierres caen en la parte baja de los rangos. La presión vendedora aparece al final de cada periodo, aunque el precio haya subido durante él."
          : "Los cierres se reparten sin un lado dominante. No hay lectura direccional que sostener.";

        const motivos = [
          { s: global > 60 ? 1 : global < 40 ? -1 : 0,
            t: `CLV ponderado en ${global?.toFixed(0)} sobre 100` },
          { s: arriba > abajo ? 1 : abajo > arriba ? -1 : 0,
            t: `${arriba} marcos cierran arriba, ${abajo} abajo, ${medios} en zona media` },
          { s: coherentes ? (est > 55 ? 1 : -1) : 0,
            t: coherentes
              ? "Estructura y corto plazo van en el mismo sentido"
              : "Estructura y corto plazo no coinciden: sin confluencia" },
        ];

        return (
          <Bloque style={{ borderLeft: `4px solid ${col}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.muted,
                              letterSpacing: "0.09em", marginBottom: 4 }}>
                  QUÉ DICEN LOS CIERRES
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: col, lineHeight: 1.2 }}>
                  {titulo}
                </div>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 6, lineHeight: 1.55 }}>
                  {explicacion}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
                    Fuerza de la lectura {fuerza} %
                  </div>
                  <div style={{ height: 8, background: T.card2, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${fuerza}%`, height: "100%", background: col }} />
                  </div>
                </div>
              </div>

              <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: T.muted,
                              letterSpacing: "0.09em", marginBottom: 7 }}>
                  DE DÓNDE SALE
                </div>
                {motivos.map((m, i) => {
                  const c = m.s > 0 ? T.bull : m.s < 0 ? T.bear : T.muted;
                  return (
                    <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start",
                                          padding: "6px 0" }}>
                      <span style={{ width: 3, height: 17, background: c, flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 11, color: T.text, lineHeight: 1.45 }}>{m.t}</span>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: T.muted, marginTop: 9, lineHeight: 1.5,
                              paddingTop: 9, borderTop: `1px solid ${T.border}` }}>
                  Esto es <strong>un indicador, no una orden</strong>. Dice quién gana el pulso al
                  cierre, no si conviene comprar: falta el precio, el volumen, el riesgo y el
                  contexto. Ningún indicador aislado justifica una operación.
                </div>
              </div>
            </div>
          </Bloque>
        );
      })()}

      {/* Cabecera + lectura global, en una sola tarjeta */}
      <Bloque>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
          <div style={{ flex: "0 1 170px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, letterSpacing: "0.09em" }}>
              CLV PONDERADO
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "monospace",
                          color: colorCLV(global), lineHeight: 1.1 }}>
              {global == null ? "—" : global.toFixed(0)}
            </div>
            <div style={{ fontSize: 13, color: colorCLV(global), fontWeight: 700, marginTop: 2 }}>
              {etiqueta(global)}
            </div>
          </div>

          {/* Escala: la posición del cierre es un punto en un recorrido */}
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ position: "relative", height: 30 }}>
              <div style={{ position: "absolute", inset: "12px 0 auto 0", height: 8, borderRadius: 4,
                            background: `linear-gradient(to right, ${T.bear}, ${T.muted} 50%, ${T.bull})`,
                            opacity: 0.35 }} />
              {global != null ? (
                <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, global))}%`,
                              top: 4, transform: "translateX(-50%)" }}>
                  <div style={{ width: 3, height: 24, background: T.text, borderRadius: 2 }} />
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.muted, marginTop: 2 }}>
              <span>0 · cierra en mínimos</span><span>50</span><span>100 · cierra en máximos</span>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>
              Media de las capas por sus pesos ({conDato.map((c) => `${c.n} ${c.peso}%`).join(" · ")}).
              Si falta alguna capa, los pesos se reparten entre las que sí tienen dato.
            </div>
          </div>
        </div>
      </Bloque>

      {/* Capas y marcos, juntos y en una rejilla */}
      <Bloque>
        <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
                      textTransform: "uppercase", marginBottom: 10 }}>
          Por capa y por marco
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {capas.map((c) => (
            <div key={c.k} style={{ background: T.card2, border: `1px solid ${T.border}`,
                                    borderLeft: `4px solid ${colorCLV(c.media)}`,
                                    borderRadius: 8, padding: "14px 16px" }}>
              {/* Cabecera de la capa */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                            gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{c.n}</span>
                <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace",
                               background: T.card, border: `1px solid ${T.border}`,
                               borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>
                  peso {c.peso} %
                </span>
              </div>

              {/* Valor de la capa */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 30, fontWeight: 800, fontFamily: "monospace",
                               lineHeight: 1, color: colorCLV(c.media) }}>
                  {c.media == null ? "—" : c.media.toFixed(0)}
                </span>
                <span style={{ fontSize: 12, color: colorCLV(c.media), fontWeight: 700 }}>
                  {etiqueta(c.media)}
                </span>
              </div>

              {/* Marcos que la componen, cada uno en su fila para que se lea */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {c.marcos.map((tf) => {
                  const v = clvDe(tf);
                  const f = porMarco[tf];
                  return (
                    <div key={tf} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ width: 34, fontSize: 11, fontWeight: 700, color: T.textSec,
                                     fontFamily: "monospace", flexShrink: 0 }}>{tf}</span>
                      <div style={{ flex: 1, height: 8, background: T.card, borderRadius: 4,
                                    overflow: "hidden", minWidth: 30,
                                    border: `1px solid ${T.border}` }}>
                        <div style={{ width: `${v == null ? 0 : v}%`, height: "100%",
                                      background: colorCLV(v) }} />
                      </div>
                      <span style={{ width: 30, textAlign: "right", fontSize: 12, fontWeight: 700,
                                     fontFamily: "monospace", flexShrink: 0,
                                     color: v == null ? T.noSignal : T.text }}>
                        {v == null ? "—" : v}
                      </span>
                      <span style={{ width: 50, textAlign: "right", fontSize: 10,
                                     fontFamily: "monospace", color: T.muted, flexShrink: 0 }}>
                        {f?.vol ? corto(f.vol) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 11, color: T.muted, marginTop: 11, lineHeight: 1.5,
                            paddingTop: 9, borderTop: `1px solid ${T.border}` }}>
                {c.ayuda}
                {c.disponibles < c.total ? ` ${c.total - c.disponibles} marco sin dato.` : ""}
              </div>
            </div>
          ))}
        </div>
      </Bloque>

      {/* Tabla completa por marco temporal, con su señal */}
      <Bloque style={{ padding: "12px 0 0" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
                      textTransform: "uppercase", padding: "0 14px 10px" }}>
          Todos los marcos · última vela cerrada
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ background: T.card2 }}>
                {[["Marco", "left", 66], ["Volumen", "right", 84], ["vs media", "right", 74],
                  ["CLV", "right", 58], ["Cierra arriba", "right", 92],
                  ["Cierra abajo", "right", 92], ["Señal", "left", 130]].map(([h, al, w]) => (
                  <th key={h} style={{ textAlign: al, width: w, fontSize: 10, fontWeight: 800,
                                       color: T.muted, letterSpacing: "0.07em",
                                       padding: "9px 12px", whiteSpace: "nowrap" }}>
                    {String(h).toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ORDEN_MARCOS.map((tf) => {
                const f = porMarco[tf];
                const v = num(f?.buy_pct);
                const abajo = num(f?.sell_pct);
                const z = num(f?.vol_z);
                const c = colorCLV(v);
                const senal =
                  v == null ? { t: "Sin dato", c: T.noSignal }
                  : v >= 80 ? { t: "Cierre muy alto", c: T.bull }
                  : v > 60 ? { t: "Cierre alto", c: T.bull }
                  : v >= 40 ? { t: "Cierre medio", c: T.muted }
                  : v > 20 ? { t: "Cierre bajo", c: T.bear }
                  : { t: "Cierre muy bajo", c: T.bear };
                return (
                  <tr key={tf} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700,
                                 color: T.text, fontFamily: "monospace" }}>{tf}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 11,
                                 fontFamily: "monospace", color: f?.vol ? T.text : T.noSignal }}>
                      {corto(f?.vol)}
                    </td>
                    {/* Volumen frente a SU PROPIA media, no frente a otros marcos:
                        es la única comparación que no cuenta dos veces lo mismo. */}
                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 11,
                                 fontFamily: "monospace",
                                 color: z == null ? T.noSignal : z > 1 ? T.text : T.muted }}>
                      {z == null ? "—" : `${z > 0 ? "+" : ""}${z.toFixed(1)}σ`}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13,
                                 fontWeight: 800, fontFamily: "monospace", color: c }}>
                      {v == null ? "—" : v}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      {v == null ? <span style={{ fontSize: 11, color: T.noSignal }}>—</span> : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          <div style={{ flex: 1, maxWidth: 48, height: 6, background: T.card2,
                                        borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${v}%`, height: "100%", background: T.bull }} />
                          </div>
                          <span style={{ fontSize: 11, fontFamily: "monospace", color: T.textSec,
                                         minWidth: 30, textAlign: "right" }}>{v} %</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      {abajo == null ? <span style={{ fontSize: 11, color: T.noSignal }}>—</span> : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          <div style={{ flex: 1, maxWidth: 48, height: 6, background: T.card2,
                                        borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${abajo}%`, height: "100%", background: T.bear }} />
                          </div>
                          <span style={{ fontSize: 11, fontFamily: "monospace", color: T.textSec,
                                         minWidth: 30, textAlign: "right" }}>{abajo} %</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: senal.c,
                                     border: `1px solid ${senal.c}`, borderRadius: 4,
                                     padding: "2px 7px", whiteSpace: "nowrap" }}>
                        {senal.t}
                      </span>
                      {f?.barra ? (
                        <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", marginTop: 3 }}>
                          {f.barra}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: T.muted, padding: "11px 14px 14px", lineHeight: 1.55 }}>
          «Cierra arriba» y «cierra abajo» son las dos caras del CLV y suman 100: no son volumen de
          compra y de venta. La columna <strong>vs media</strong> compara el volumen de cada marco
          con su propia media en desviaciones típicas — comparar volúmenes entre marcos contaría la
          misma acción varias veces.
        </div>
      </Bloque>

      {/* Interpretación: estructura frente a momento */}
      <Bloque style={{ borderLeft: `3px solid ${T.accent}` }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
                      textTransform: "uppercase", marginBottom: 7 }}>
          Cómo se leen juntas
        </div>
        {(() => {
          const est = capas[0].media, med = capas[1].media, cor = capas[2].media;
          if (est == null || cor == null) {
            return <div style={{ fontSize: 11, color: T.muted }}>
              Faltan capas para comparar estructura y momento.
            </div>;
          }
          const estAlc = est > 55, estBaj = est < 45;
          const corAlc = cor > 55, corBaj = cor < 45;
          let titulo, texto, color;
          if (estAlc && corAlc) {
            titulo = "Alineadas al alza"; color = T.bull;
            texto = "Estructura y momento cierran arriba del rango. Es la lectura más simple y la que menos matices necesita.";
          } else if (estBaj && corBaj) {
            titulo = "Alineadas a la baja"; color = T.bear;
            texto = "Estructura y momento cierran abajo. La presión es consistente en todas las escalas.";
          } else if (estBaj && corAlc) {
            titulo = "Rebote contra la estructura"; color = T.warn;
            texto = "El corto plazo cierra arriba pero el fondo sigue cerrando abajo. Es un rebote dentro de una estructura que no ha girado: reduce el tamaño en lugar de tratarlo como un cambio de tendencia.";
          } else if (estAlc && corBaj) {
            titulo = "Corrección dentro de la estructura"; color = T.warn;
            texto = "El fondo sigue firme y el corto plazo se toma un descanso. Suele ser oportunidad de entrada, no señal de salida.";
          } else {
            titulo = "Sin alineación clara"; color = T.muted;
            texto = "Las capas no coinciden lo bastante para una lectura direccional.";
          }
          return (
            <>
              <div style={{ fontSize: 14, fontWeight: 800, color, marginBottom: 3 }}>{titulo}</div>
              <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.55 }}>{texto}</div>
            </>
          );
        })()}
      </Bloque>

      {/* Qué es y qué no es */}
      <Bloque style={{ borderLeft: `3px solid ${T.noSignal}` }}>
        <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.6 }}>
          <strong>CLV = (cierre − mínimo) / (máximo − mínimo).</strong> Mide dónde quedó el cierre
          dentro del recorrido de la vela, que dice más que la variación: un valor puede subir un
          2 % y cerrar en mínimos, y eso es debilidad.
          {"\n\n"}
          <strong>No es volumen de compra frente a venta.</strong> Separarlos exige clasificar cada
          operación contra el bid y el ask, y esta fuente no da datos de tick. Se mide siempre la
          última vela cerrada; la que está en formación cambia con cada tick.
        </div>
      </Bloque>
    </div>
  );
}
