/**
 * Pestaña Resumen — composición de la maqueta.
 *
 * Estructura: barra de identidad y cotización, banda de nueve indicadores,
 * y tres columnas (score por factores · factores que impulsan · ventana,
 * noticias y niveles).
 *
 * Tres decisiones que se apartan de la maqueta, a propósito:
 *
 * 1. El score se muestra sobre 100 pero se dice de dónde sale (x/165). En la
 *    maqueta aparecía «63/100» cuando el motor puntúa sobre 165 — un 63 ahí
 *    es un 38 sobre 100, que cae en banda bajista, no alcista.
 *
 * 2. El veredicto viene del campo `accion` del backend. Antes la interfaz
 *    comparaba contra "COMPRAR"/"VENDER" mientras el servidor enviaba
 *    "buy"/"hold": nunca coincidían y el veredicto parecía atascado.
 *
 * 3. Lo que no existe se marca con un guion y tinta de «sin señal», no se
 *    rellena con un número plausible.
 */

import { useMemo } from "react";

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

const usd = (v, dec = 2) => {
  const n = num(v);
  return n == null ? "—" : `$${n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
};

const pct = (v, dec = 2) => {
  const n = num(v);
  return n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dec)} %`;
};

const corto = (v, prefijo = "") => {
  const n = num(v);
  if (n == null || n === 0) return "—";
  if (n >= 1e12) return `${prefijo}${(n / 1e12).toFixed(2)}B`;
  if (n >= 1e9) return `${prefijo}${(n / 1e9).toFixed(2)}MM`;
  if (n >= 1e6) return `${prefijo}${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${prefijo}${(n / 1e3).toFixed(0)}k`;
  return `${prefijo}${n.toFixed(0)}`;
};

/* ── piezas ──────────────────────────────────────────────────────────── */

function Bloque({ T, children, style }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "13px 15px", ...style,
    }}>{children}</div>
  );
}

function Rotulo({ T, children, style }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.09em",
      textTransform: "uppercase", marginBottom: 8, ...style,
    }}>{children}</div>
  );
}

/** Celda de la banda superior. */
function Indicador({ T, rotulo, valor, sub, tono, ultimo }) {
  const hay = valor !== "—" && valor != null;
  return (
    <div style={{
      flex: "1 1 138px", minWidth: 0, padding: "0 14px",
      borderRight: ultimo ? "none" : `1px solid ${T.border}`,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, color: T.muted,
        letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5,
      }}>{rotulo}</div>
      <div style={{
        fontSize: 19, fontWeight: 800, fontFamily: "monospace", lineHeight: 1.15,
        color: hay ? (tono || T.text) : T.noSignal,
      }}>{valor}</div>
      {sub ? <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

function BarraFactor({ T, etiqueta, valor, max, color }) {
  const v = num(valor);
  const frac = v == null ? 0 : Math.max(0, Math.min(1, v / max));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <div style={{ width: 128, fontSize: 11, color: T.text, flexShrink: 0 }}>{etiqueta}</div>
      <div style={{ flex: 1, height: 8, background: T.card2, borderRadius: 4, overflow: "hidden", minWidth: 40 }}>
        <div style={{ width: `${frac * 100}%`, height: "100%", background: v == null ? T.noSignal : color }} />
      </div>
      <div style={{
        width: 58, textAlign: "right", fontSize: 12, fontWeight: 700,
        fontFamily: "monospace", flexShrink: 0, color: v == null ? T.noSignal : T.text,
      }}>
        {v == null ? "—" : v.toFixed(0)}
        <span style={{ color: T.muted, fontWeight: 400, fontSize: 10 }}>{v == null ? "" : `/${max}`}</span>
      </div>
    </div>
  );
}

function FilaImpacto({ T, texto, detalle, positivo }) {
  const color = positivo ? T.bull : T.bear;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 9,
      padding: "8px 0", borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ width: 3, height: 26, background: color, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{texto}</div>
        {detalle ? <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{detalle}</div> : null}
      </div>
    </div>
  );
}

/** Medidor de bandas con la aguja en el score normalizado. */
function Ventana({ T, s100, zona, descripcion }) {
  const BANDAS = [
    { hasta: 35, etiqueta: "Fuertemente bajista", color: T.bear },
    { hasta: 45, etiqueta: "Bajista", color: T.warn },
    { hasta: 56, etiqueta: "Neutral", color: T.muted },
    { hasta: 65, etiqueta: "Alcista", color: T.bull },
    { hasta: 100, etiqueta: "Fuertemente alcista", color: T.bull },
  ];
  const v = num(s100);
  const activa = v == null ? -1 : BANDAS.findIndex((b) => v < b.hasta);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {BANDAS.map((b, i) => {
          const on = i === activa || (activa === -1 && false) || (v != null && activa === -1 && i === BANDAS.length - 1);
          return (
            <div key={b.etiqueta} style={{
              flex: 1, textAlign: "center", padding: "6px 3px", borderRadius: 5,
              border: `1px solid ${on ? b.color : T.border}`,
              background: on ? `${b.color}1F` : "transparent",
            }}>
              <div style={{
                fontSize: 9, fontWeight: on ? 800 : 500, lineHeight: 1.25,
                color: on ? b.color : T.muted,
              }}>{b.etiqueta}</div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "relative", height: 28, marginBottom: 2 }}>
        <div style={{
          position: "absolute", left: 0, right: 0, top: 14, height: 4,
          background: T.card2, border: `1px solid ${T.border}`, borderRadius: 2,
        }} />
        {v != null ? (
          <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, v))}%`, top: 0, transform: "translateX(-50%)" }}>
            <div style={{
              border: `2px solid ${T.bull}`, background: T.card, color: T.text,
              fontSize: 11, fontWeight: 800, borderRadius: 12,
              padding: "2px 9px", fontFamily: "monospace",
            }}>{v.toFixed(0)}</div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        {[0, 25, 50, 75, 100].map((t) => (
          <span key={t} style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>{t}</span>
        ))}
      </div>

      <div style={{
        background: T.card2, border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${T.bull}`, borderRadius: 7, padding: "10px 12px",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 3 }}>
          {zona || "—"}
        </div>
        <div style={{ fontSize: 10, color: T.textSec, lineHeight: 1.55 }}>
          {descripcion || "—"}
        </div>
      </div>
    </div>
  );
}

/* ── pestaña ─────────────────────────────────────────────────────────── */

export default function ResumenTab({ T, d }) {
  const score = num(d?.score);
  const scoreMax = num(d?.score_max) || 165;
  const s100 = num(d?.score_100) ?? (score == null ? null : (score / scoreMax) * 100);

  // El backend manda ahora la etiqueta ya resuelta.
  const accion = d?.accion || "—";
  const colorAccion =
    accion === "COMPRAR" || accion === "ACUMULAR" ? T.bull
    : accion === "VENDER" || accion === "REDUCIR" ? T.bear
    : T.warn;

  const cambio = num(d?.pct_change);
  const tonoCambio = cambio == null ? T.muted : cambio > 0 ? T.bull : cambio < 0 ? T.bear : T.muted;

  const factores = useMemo(() => {
    const b = d?.score_breakdown || {};
    return [
      { k: "fundamental", n: "Fundamental", max: 30, c: T.bull },
      { k: "momentum", n: "Momentum", max: 25, c: T.teal },
      { k: "microestruc", n: "Microestructura", max: 25, c: T.cyan },
      { k: "sentimiento", n: "Sentimiento", max: 20, c: T.purple },
      { k: "ichimoku", n: "Ichimoku", max: 10, c: T.indigo },
      { k: "wyckoff", n: "Wyckoff", max: 10, c: T.warn },
      { k: "elliott_wave", n: "Elliott", max: 10, c: T.pink },
      { k: "wolfe_waves", n: "Wolfe", max: 10, c: T.gold },
      { k: "weis_waves", n: "Weis", max: 10, c: T.accent },
      { k: "candle_pattern", n: "Patrón de vela", max: 10, c: T.muted },
      { k: "volume_delta", n: "Posición del cierre", max: 5, c: T.orange },
    ].map((f) => ({ ...f, v: b[f.k] }));
  }, [d, T]);

  const entradas = (d?.entry_signals || []).slice(0, 6);
  const salidas = (d?.exit_signals || []).slice(0, 6);
  const noticias = (d?.news || []).slice(0, 4);

  const lo52 = num(d?.week52_low), hi52 = num(d?.week52_high), px = num(d?.current_price);
  const pos52 = lo52 != null && hi52 != null && px != null && hi52 > lo52
    ? ((px - lo52) / (hi52 - lo52)) * 100 : null;
  const volRel = num(d?.volume) && num(d?.avg_volume) ? d.volume / d.avg_volume : null;

  const textoSenal = (s) =>
    typeof s === "string" ? s : s?.label || s?.text || s?.signal || JSON.stringify(s);

  const esc = d?.escenarios_30d;
  const pc = d?.percentil_score;
  const eventos = d?.proximos_eventos;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Identidad y cotización ── */}
      <Bloque T={T} style={{ padding: "12px 15px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
          <div style={{ minWidth: 190 }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: T.text, lineHeight: 1.15 }}>
              {d?.ticker || "—"}
            </div>
            <div style={{ fontSize: 12, color: T.textSec }}>{d?.company_name || ""}</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
              {[d?.exchange, d?.sector, d?.industry].filter(Boolean).join("  ·  ") || "—"}
            </div>
          </div>

          <div style={{ minWidth: 130 }}>
            <div style={{ fontSize: 25, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
              {usd(px)}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: tonoCambio }}>
              {pct(cambio)}
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 0, flex: 1, minWidth: 260 }}>
            <Indicador T={T} rotulo="Volumen" valor={corto(d?.volume)}
                       sub={volRel ? `${volRel.toFixed(2)}× media` : null} />
            <Indicador T={T} rotulo="Vol. medio" valor={corto(d?.avg_volume)} />
            <Indicador T={T} rotulo="Rango 52 semanas"
                       valor={lo52 != null && hi52 != null ? `${usd(lo52)} – ${usd(hi52)}` : "—"}
                       sub={pos52 == null ? null : `${pos52.toFixed(0)} % del recorrido`} ultimo />
          </div>
        </div>
      </Bloque>

      {/* ── Banda de indicadores ── */}
      <Bloque T={T} style={{ padding: "13px 4px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", rowGap: 14 }}>
          <Indicador T={T} rotulo="Score Overton"
                     valor={s100 == null ? "—" : `${s100.toFixed(0)} /100`}
                     sub={score == null ? null : `${score} de ${scoreMax} puntos`}
                     tono={T.accent} />
          <Indicador T={T} rotulo="Señal principal" valor={accion}
                     sub={d?.bias || null} tono={colorAccion} />
          <Indicador T={T} rotulo="Probabilidad 30d"
                     valor={esc?.disponible ? `${esc.probabilidad_alcista} %` : "—"}
                     sub={esc?.disponible ? `alcista · ${esc.probabilidad_bajista} % bajista` : null}
                     tono={esc?.disponible && esc.probabilidad_alcista >= 50 ? T.bull : T.bear} />
          <Indicador T={T} rotulo="Percentil score"
                     valor={pc?.disponible ? `${pc.percentil.toFixed(0)} /100` : "—"}
                     sub={pc?.disponible ? `sobre ${pc.muestra} lecturas` : `${pc?.muestra ?? 0} lecturas`} />
          <Indicador T={T} rotulo="Beta" valor={num(d?.beta) == null ? "—" : Number(d.beta).toFixed(2)}
                     sub={num(d?.beta) == null ? null : (d.beta > 1.2 ? "Alta" : d.beta < 0.8 ? "Baja" : "Moderada")} />
          <Indicador T={T} rotulo="Capitalización" valor={corto(d?.market_cap, "$")} />
          <Indicador T={T} rotulo="Objetivo 1" valor={usd(d?.target1)}
                     sub={num(d?.rr1) ? `R/B ${Number(d.rr1).toFixed(2)}` : null} />
          <Indicador T={T} rotulo="Stop loss" valor={usd(d?.stop_loss)} tono={T.bear} />
          <Indicador T={T} rotulo="Dividendo"
                     valor={num(d?.dividend_yield) ? `${Number(d.dividend_yield).toFixed(2)} %` : "—"}
                     sub={num(d?.dividend_rate) ? `${usd(d.dividend_rate)} anual` : null} />
          <Indicador T={T} rotulo="RSI (14)" valor={num(d?.rsi) == null ? "—" : Number(d.rsi).toFixed(1)}
                     sub={num(d?.rsi) == null ? null : (d.rsi > 70 ? "Sobrecompra" : d.rsi < 30 ? "Sobreventa" : "Neutral")} />
          <Indicador T={T} rotulo="VIX" valor={num(d?.vix) == null ? "—" : Number(d.vix).toFixed(1)}
                     sub={num(d?.vix) == null ? null : (d.vix > 25 ? "Tensión" : d.vix < 15 ? "Calma" : "Normal")} ultimo />
        </div>
      </Bloque>

      {/* ── Tres columnas ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>

        {/* Score por factores */}
        <Bloque T={T} style={{ flex: "1 1 330px" }}>
          <Rotulo T={T}>Score por factores</Rotulo>
          {factores.map((f) => (
            <BarraFactor key={f.k} T={T} etiqueta={f.n} valor={f.v} max={f.max} color={f.c} />
          ))}
          <div style={{ fontSize: 10, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>
            Cada barra va sobre su propio tope dentro del score, no sobre 100. Por eso los
            denominadores cambian: un 10/10 en Ichimoku pesa la mitad que un 20/30 en Fundamental.
          </div>
        </Bloque>

        {/* Factores que impulsan */}
        <Bloque T={T} style={{ flex: "1 1 330px" }}>
          <Rotulo T={T}>Factores que impulsan la señal</Rotulo>
          {entradas.length === 0
            ? <div style={{ fontSize: 11, color: T.muted, paddingBottom: 8 }}>Ninguno activo ahora mismo.</div>
            : entradas.map((s, i) => <FilaImpacto key={i} T={T} texto={textoSenal(s)} positivo />)}

          <div style={{ height: 14 }} />
          <Rotulo T={T}>Factores que la limitan</Rotulo>
          {salidas.length === 0
            ? <div style={{ fontSize: 11, color: T.muted }}>Ninguno activo ahora mismo.</div>
            : salidas.map((s, i) => <FilaImpacto key={i} T={T} texto={textoSenal(s)} positivo={false} />)}
        </Bloque>

        {/* Ventana + noticias + niveles */}
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Bloque T={T}>
            <Rotulo T={T}>Ventana de Overton</Rotulo>
            <Ventana T={T} s100={s100} zona={d?.overton_zone} descripcion={d?.overton_description} />
          </Bloque>

          <Bloque T={T}>
            <Rotulo T={T}>Impacto de noticias</Rotulo>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{
                fontSize: 25, fontWeight: 800, fontFamily: "monospace",
                color: (num(d?.news_impact_total) || 0) > 0 ? T.bull
                     : (num(d?.news_impact_total) || 0) < 0 ? T.bear : T.muted,
              }}>
                {pct(d?.news_impact_total)}
              </span>
              <span style={{ fontSize: 11, color: T.textSec }}>{d?.news_sentiment || "sin señal"}</span>
            </div>
            {noticias.length === 0
              ? <div style={{ fontSize: 11, color: T.muted }}>Sin noticias recientes.</div>
              : noticias.map((n, i) => (
                  <div key={i} style={{ padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, color: T.text, lineHeight: 1.45 }}>
                      {n?.headline || n?.title || "—"}
                    </div>
                    <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>
                      {[n?.source, n?.published].filter(Boolean).join(" · ")}
                      {n?.impact != null ? ` · impacto ${n.impact}` : ""}
                    </div>
                  </div>
                ))}
          </Bloque>

          <Bloque T={T}>
            <Rotulo T={T}>Niveles operativos</Rotulo>
            {[
              ["Entrada óptima", d?.entry_optimal, T.text],
              ["Entrada agresiva", d?.entry_aggressive, T.text],
              ["Stop loss", d?.stop_loss, T.bear],
              ["Objetivo 1", d?.target1, T.bull],
              ["Objetivo 2", d?.target2, T.bull],
              ["Objetivo 3", d?.target3, T.bull],
            ].map(([etiqueta, valor, color]) => (
              <div key={etiqueta} style={{
                display: "flex", justifyContent: "space-between",
                padding: "6px 0", borderBottom: `1px solid ${T.border}`,
              }}>
                <span style={{ fontSize: 11, color: T.textSec }}>{etiqueta}</span>
                <span style={{
                  fontSize: 12, fontFamily: "monospace", fontWeight: 700,
                  color: num(valor) == null ? T.noSignal : color,
                }}>{usd(valor)}</span>
              </div>
            ))}
          </Bloque>
        </div>
      </div>

      {/* ── Escenarios y eventos ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
        <Bloque T={T} style={{ flex: "1 1 460px" }}>
          <Rotulo T={T}>Escenarios de precio · próximos 30 días</Rotulo>
          {!esc?.disponible ? (
            <div style={{ fontSize: 11, color: T.muted }}>{esc?.motivo || "No disponible."}</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {esc.escenarios.map((e) => {
                  const c = e.nombre === "Bajista" ? T.bear : e.nombre === "Alcista" ? T.bull : T.accent;
                  return (
                    <div key={e.nombre} style={{
                      flex: "1 1 130px", minWidth: 0, textAlign: "center",
                      border: `1px solid ${T.border}`, borderTop: `3px solid ${c}`,
                      borderRadius: 7, padding: "10px 8px", background: T.card2,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: c, marginBottom: 4 }}>
                        Escenario {e.nombre}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
                        {usd(e.precio)}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: "monospace", color: c, marginTop: 2 }}>
                        {pct(e.variacion)}
                      </div>
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                        Probabilidad {e.probabilidad} %
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reparto direccional, medido y no supuesto */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: T.bull, fontWeight: 700 }}>
                    Alcista {esc.probabilidad_alcista} %
                  </span>
                  <span style={{ fontSize: 11, color: T.bear, fontWeight: 700 }}>
                    {esc.probabilidad_bajista} % Bajista
                  </span>
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: T.card2 }}>
                  <div style={{ width: `${esc.probabilidad_alcista}%`, background: T.bull }} />
                  <div style={{ width: `${esc.probabilidad_bajista}%`, background: T.bear }} />
                </div>
              </div>

              <div style={{ fontSize: 10, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>
                {esc.metodo} No son predicciones: describen el rango en el que este valor se ha
                movido en periodos de esa duración.
              </div>
            </>
          )}
        </Bloque>

        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Bloque T={T}>
            <Rotulo T={T}>Percentil histórico del score</Rotulo>
            {!pc?.disponible ? (
              <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55 }}>
                {pc?.motivo || "No disponible."}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>
                    {pc.percentil.toFixed(0)}
                  </span>
                  <span style={{ fontSize: 11, color: T.textSec }}>
                    de 100 lecturas anteriores
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.textSec, marginTop: 6, lineHeight: 1.55 }}>
                  El score actual supera al {pc.percentil.toFixed(0)} % de las {pc.muestra} lecturas
                  guardadas de este valor. Rango observado: {pc.minimo}–{pc.maximo}, mediana {pc.mediana}.
                </div>
              </>
            )}
          </Bloque>

          <Bloque T={T}>
            <Rotulo T={T}>Próximos eventos clave</Rotulo>
            {!eventos || eventos.length === 0 ? (
              <div style={{ fontSize: 11, color: T.muted }}>
                Sin eventos confirmados por el proveedor.
              </div>
            ) : eventos.map((e, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 9,
                padding: "8px 0", borderBottom: `1px solid ${T.border}`,
              }}>
                <div style={{
                  minWidth: 44, textAlign: "center", background: T.card2,
                  border: `1px solid ${T.border}`, borderRadius: 5, padding: "3px 4px",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: T.text }}>
                    {e.dias}
                  </div>
                  <div style={{ fontSize: 8, color: T.muted }}>{e.dias === 1 ? "DÍA" : "DÍAS"}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{e.evento}</div>
                  <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{e.fecha}</div>
                  <div style={{ fontSize: 10, color: T.textSec, marginTop: 2, lineHeight: 1.4 }}>
                    {e.detalle}
                  </div>
                </div>
              </div>
            ))}
          </Bloque>
        </div>
      </div>
    </div>
  );
}
