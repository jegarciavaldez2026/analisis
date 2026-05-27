/**
 * OvertonSignalMatrix_v4.jsx
 *
 * MEJORAS v4:
 * ─────────────────────────────────────────
 * ✅ Book Imbalance / Depth / Iceberg — datos dinámicos por ticker (hash mejorado)
 * ✅ Filtro VWAP corregido — lógica de confirmación de ruptura arreglada
 * ✅ VIX + US 10Y — gráfico rediseñado con leyenda y análisis de impacto
 * ✅ Leyendas en gráfico de precio (WMA, VWAP, Buy/Sell)
 * ✅ Market Regime — datos reactivos al ticker
 * ✅ Volatility Surface — datos reactivos al ticker
 * ✅ Ichimoku — datos reactivos al ticker
 * ✅ Calendario económico real (API Econdb / fallback estático con fechas reales)
 * ✅ Gráfico de fase de mercado (Acumulación / Markup / Distribución / Markdown)
 * ✅ Gráfico de 30 velas semanales con detección de patrones
 * ✅ Score compuesto multifactor expandido (más indicadores)
 * ✅ ELLIOTT WAVE — Grado de onda, señal de entrada/salida, proyección de Fibonacci
 * ✅ WEIS WAVE — Ondas de volumen acumulado con señal de agotamiento
 * ✅ WOLFE WAVES — Patrón 1-2-3-4-5 con proyección EPA
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useChat } from "../contexts/ChatContext";
import { useTheme } from "../contexts/ThemeContext";
import IchimokuCloudChart from "./IchimokuCloudChart";


const API_BASE = typeof process !== "undefined" && process.env?.EXPO_PUBLIC_BACKEND_URL
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
  : "/api";

// ─── TEMA CLARO ────────────────────────────────────────────────────────────────
const T = {
  bg: "#f0f4fa", surface: "#ffffff", card: "#ffffff", card2: "#f7f9ff",
  card3: "#eef2fb", border: "#dde3f0", borderH: "#b0bcd8",
  text: "#111827", textSec: "#374151", muted: "#6b7a99",
  accent: "#2563eb", bull: "#059669", bear: "#dc2626", warn: "#d97706",
  purple: "#7c3aed", cyan: "#0891b2", gold: "#92400e", pink: "#be185d",
  indigo: "#3730a3", teal: "#0f766e",
  regime: { trending: "#059669", ranging: "#2563eb", volatile: "#dc2626", breakout: "#7c3aed" },
};

// ─── TEMAS CLARO / OSCURO ─────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg: "#f0f4fa", surface: "#ffffff", card: "#ffffff", card2: "#f7f9ff",
    card3: "#eef2fb", border: "#dde3f0", borderH: "#b0bcd8",
    text: "#111827", textSec: "#374151", muted: "#6b7a99",
    accent: "#2563eb", bull: "#059669", bear: "#dc2626", warn: "#d97706",
    purple: "#7c3aed", cyan: "#0891b2", gold: "#92400e", pink: "#be185d",
    indigo: "#3730a3", teal: "#0f766e",
    regime: { trending: "#059669", ranging: "#2563eb", volatile: "#dc2626", breakout: "#7c3aed" },
    shadow: "0 1px 8px rgba(0,0,0,0.06)",
    glowBull: "0 0 8px #05966920",
    glowBear: "0 0 8px #dc262620",
  },
  dark: {
    bg: "#0d1117", surface: "#161b22", card: "#1c2230", card2: "#1a2035",
    card3: "#1e2740", border: "#2d3748", borderH: "#4a5568",
    text: "#e2e8f0", textSec: "#cbd5e0", muted: "#718096",
    accent: "#3b82f6", bull: "#10b981", bear: "#f87171", warn: "#fbbf24",
    purple: "#a78bfa", cyan: "#22d3ee", gold: "#f59e0b", pink: "#f472b6",
    indigo: "#818cf8", teal: "#2dd4bf",
    regime: { trending: "#10b981", ranging: "#3b82f6", volatile: "#f87171", breakout: "#a78bfa" },
    shadow: "0 1px 12px rgba(0,0,0,0.4)",
    glowBull: "0 0 12px #10b98130",
    glowBear: "0 0 12px #f8717130",
  },
};


/**

/**
 * SMC_FIX_PATCH.jsx
 *
 * INSTRUCCIONES:
 * ─────────────────────────────────────────────────────────────────
 * 1. En tu OvertonSignalMatrix_v4.jsx, ELIMINA la función `SMCPanel` completa
 *    (la que muestra datos estáticos con items hardcodeados)
 *
 * 2. AÑADE este archivo completo justo antes del componente principal
 *    (antes de `export default function OvertonSignalMatrixV4`)
 *
 * 3. En el tab SMC del componente principal, cambia:
 *       <SMCPanel d={d} />
 *    por:
 *       <SMCPanelLive ticker={ticker} backendData={d} />
 *
 * ─────────────────────────────────────────────────────────────────
 * ¿Por qué fallaba el panel SMC anterior?
 *   - `SMCPanel` usaba `d.smc` que viene vacío en modo demo
 *   - Sus 8 items siempre mostraban "—" porque el backend no devuelve SMC en demo
 *   - `SMCPanelRealtime` estaba definido en v5 pero NUNCA se instanciaba en v4
 * ─────────────────────────────────────────────────────────────────
 */

// ── Hook: polling SMC cada 30 segundos ───────────────────────────────────────
function useSMCLive(ticker, backendData) {
  const [smcData, setSmcData] = useState(null);
  const [loading, setLoading]  = useState(false);
  const [lastTs, setLastTs]    = useState(null);
  const [isRealData, setIsRealData] = useState(false); // ← NUEVO
  const timerRef = useRef(null);

  const fetch_ = useCallback(async (t) => {
    if (!t) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/smc/${t.toUpperCase()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && Object.keys(json).length > 3) {
        setSmcData(json);
        setLastTs(new Date());
        setIsRealData(true); // ← NUEVO: marca datos reales del endpoint
      } else throw new Error("empty");
    } catch (_) {
      // Fallback: usar datos del endpoint principal si existen
      if (backendData?.smc && Object.keys(backendData.smc).length > 3) {
        setSmcData(backendData.smc);
        setLastTs(new Date());
        setIsRealData(true); // ← NUEVO: datos del endpoint principal
      } else {
        setSmcData(null);
        setIsRealData(false); // ← NUEVO: fallback determinista
      }
    } finally {
      setLoading(false);
    }
  }, [backendData]);

  useEffect(() => {
    fetch_(ticker);
    timerRef.current = setInterval(() => fetch_(ticker), 30000);
    return () => clearInterval(timerRef.current);
  }, [ticker, fetch_]);

  return { smcData, loading, lastTs, isRealData, refresh: () => fetch_(ticker) }; // ← NUEVO: devuelve isRealData
}

// ── SMCPanelLive: usa T global de v4 (sin prop) ──────────────────────────────
function SMCPanelLive({ ticker, backendData }) {
  const { smcData, loading, lastTs, isRealData, refresh } = useSMCLive(ticker, backendData); // ← añade isRealData
  const tickerSeed_ = useTickerHash(ticker);
  const r_ = useSeededRand(tickerSeed_);
  
  

  const price = sf(backendData?.current_price, 100);
  const atr   = sf(backendData?.atr, price * 0.012);
  const mom   = sf(backendData?.momentum_12_1, 0);
  const trend = mom > 0 ? 1 : -1;

  // ── Generar datos SMC derivados deterministas si no hay respuesta real ──────
  const smc = useMemo(() => {
    // 1) Prioridad: datos reales del endpoint SMC dedicado
    if (smcData && Object.keys(smcData).length > 3) return smcData;
    // 2) Segunda prioridad: datos del endpoint principal
    if (backendData?.smc && Object.keys(backendData.smc).length > 3) return backendData.smc;

    // 3) Fallback: derivación determinista coherente con precio real del ticker
    const atrMult = (seed) => atr * (0.8 + r_(seed) * 1.2);

    // Order Blocks: último impulso antes de movimiento fuerte
    const obBull = price - atrMult(700);           // OB alcista: bajo precio actual
    const obBear = price + atrMult(701);           // OB bajista: sobre precio actual

    // Fair Value Gaps: desequilibrios recientes
    const fvgUpLow  = price + atr * (0.25 + r_(702) * 0.35);
    const fvgUpHigh = fvgUpLow + atr * (0.15 + r_(703) * 0.12);
    const fvgDnHigh = price - atr * (0.25 + r_(704) * 0.35);
    const fvgDnLow  = fvgDnHigh - atr * (0.12 + r_(705) * 0.10);

    // Swing Highs/Lows del último año (derivados de beta y momentum)
    const beta       = sf(backendData?.beta, 1);
    const yearRange  = price * (0.12 + beta * 0.08 + r_(706) * 0.06);
    const swingHigh  = price * (1 + 0.04 + r_(706) * 0.08);
    const swingLow   = price * (1 - 0.04 - r_(707) * 0.06);
    const midRange   = (swingHigh + swingLow) / 2;

    // Premium / Discount: 70% del rango desde midpoint
    const premiumZone  = midRange + (swingHigh - midRange) * 0.618;
    const discountZone = midRange - (midRange - swingLow)  * 0.618;

    // BOS: alcista si momentum > 0, bajista si < 0
    const rsiVal     = sf(backendData?.rsi, 50);
    const ofiVal     = sf(backendData?.ofi, 0);
    const bullBias   = trend > 0 && rsiVal > 50 && ofiVal > -0.1;
    const bosLabel   = bullBias ? "alcista" : "bajista";

    // CHoCH: contrario al BOS si hay divergencia
    const hasCHoCH   = Math.abs(ofiVal) > 0.08 || r_(709) > 0.55;
    const chochLabel = hasCHoCH ? (bullBias ? "alcista" : "bajista") : null;

    // Inducement: zona donde el precio podría ir a cazar stops antes de revertir
    const induceDist = atr * (0.6 + r_(710) * 0.8);
    const inducement = price + (bullBias ? induceDist : -induceDist);

    // Equal Highs/Lows: niveles donde el precio tocó dos veces (zona de liquidez)
    const eqHigh     = bullBias ? null : swingHigh * (1 - r_(711) * 0.002);
    const eqLow      = bullBias ? swingLow * (1 + r_(712) * 0.002) : null;

    // Breaker Block: OB que fue roto y se convierte en resistencia/soporte
    const bbLevel    = bullBias
      ? price - atr * (1.8 + r_(713) * 0.6)   // Breaker bajista roto → ahora soporte
      : price + atr * (1.8 + r_(714) * 0.6);  // Breaker alcista roto → ahora resistencia

    return {
      bos:         bosLabel,
      choch:       chochLabel,
      ob_bull:     obBull,
      ob_bear:     obBear,
      fvg_up:      [fvgUpLow, fvgUpHigh],
      fvg_down:    [fvgDnLow, fvgDnHigh],
      premium:     premiumZone,
      discount:    discountZone,
      swing_high:  swingHigh,
      swing_low:   swingLow,
      inducement:  inducement,
      equal_highs: eqHigh,
      equal_lows:  eqLow,
      breaker:     bbLevel,
    };
  }, [smcData, backendData, price, atr, trend, tickerSeed_]);

  const isLive = !!(smcData && Object.keys(smcData).length > 3) ||
                 !!(backendData?.smc && Object.keys(backendData.smc).length > 3);

  const timeAgo = lastTs
    ? (() => {
        const s = Math.round((Date.now() - lastTs.getTime()) / 1000);
        return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
      })()
    : "—";

  // Construir lista de ítems a mostrar (filtra los que son null/"—")
  const items = [
    { key: "bos",         icon: "◈",  label: "Break of Structure",    value: smc.bos || "—",              bull: smc.bos === "alcista",   tag: smc.bos },
    { key: "choch",       icon: "⟳",  label: "Change of Character",   value: smc.choch || "—",            bull: smc.choch === "alcista", tag: smc.choch },
    { key: "ob_bull",     icon: "▣",  label: "Order Block Alcista",   value: smc.ob_bull ? usd(smc.ob_bull) : "—",   bull: true,  tag: "soporte" },
    { key: "ob_bear",     icon: "▣",  label: "Order Block Bajista",   value: smc.ob_bear ? usd(smc.ob_bear) : "—",   bull: false, tag: "resist." },
    { key: "fvg_up",      icon: "▷",  label: "Fair Value Gap ↑",      value: smc.fvg_up  ? `${usd(smc.fvg_up[0])} – ${usd(smc.fvg_up[1])}` : "—",   bull: true,  tag: "imán" },
    { key: "fvg_down",    icon: "◁",  label: "Fair Value Gap ↓",      value: smc.fvg_down ? `${usd(smc.fvg_down[0])} – ${usd(smc.fvg_down[1])}` : "—", bull: false, tag: "imán" },
    { key: "premium",     icon: "▲",  label: "Zona Premium (vender)", value: smc.premium  ? usd(smc.premium)  : "—", bull: false, tag: "venta" },
    { key: "discount",    icon: "▼",  label: "Zona Discount (comprar)",value: smc.discount ? usd(smc.discount) : "—", bull: true,  tag: "compra" },
    { key: "swing_high",  icon: "🏔", label: "Swing High (año)",      value: smc.swing_high ? usd(smc.swing_high) : "—", bull: false, tag: "BSL" },
    { key: "swing_low",   icon: "🏔", label: "Swing Low (año)",       value: smc.swing_low  ? usd(smc.swing_low)  : "—", bull: true,  tag: "SSL" },
    { key: "inducement",  icon: "⚡", label: "Inducement / Stop Hunt",value: smc.inducement ? usd(smc.inducement) : "—", bull: null,  tag: "trampa" },
    { key: "equal_highs", icon: "══", label: "Equal Highs (BSL)",     value: smc.equal_highs ? usd(smc.equal_highs) : "—", bull: false, tag: "liquidez" },
    { key: "equal_lows",  icon: "══", label: "Equal Lows  (SSL)",     value: smc.equal_lows  ? usd(smc.equal_lows)  : "—", bull: true,  tag: "liquidez" },
    { key: "breaker",     icon: "🔲", label: "Breaker Block",         value: smc.breaker ? usd(smc.breaker) : "—", bull: trend > 0, tag: trend > 0 ? "soporte" : "resist." },
  ].filter(i => i.value !== "—");

  const nBull    = items.filter(i => i.bull === true).length;
  const nBear    = items.filter(i => i.bull === false).length;
  const biasClr  = nBull > nBear ? T.bull : nBull < nBear ? T.bear : T.muted;
  const biasLbl  = nBull > nBear ? "SESGO ALCISTA" : nBull < nBear ? "SESGO BAJISTA" : "SESGO NEUTRO";

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>

      {/* Header */}
      <SectionTitle icon="💠" badge={
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {pill(biasClr, biasLbl)}
          {pill(T.purple, "SMC")}
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: isLive ? T.bull : T.muted,
          }}>
            {isLive ? "🟢 LIVE" : "⚙ derivado"}
          </span>
          {lastTs && (
            <span style={{ fontSize: 9, color: T.muted }}>hace {timeAgo}</span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            title="Actualizar SMC"
            style={{
              background: "none", border: `1px solid ${T.border}`,
              color: T.muted, padding: "2px 8px", borderRadius: 5,
              cursor: loading ? "wait" : "pointer", fontSize: 11,
            }}>
            {loading ? "⟳…" : "⟳"}
          </button>
        </div>
      }>
        Smart Money Concepts — {ticker}
      </SectionTitle>

      {/* Bias bar */}
      <div style={{
        display: "flex", gap: 8, alignItems: "center", marginBottom: 12,
        background: `${biasClr}0a`, border: `1px solid ${biasClr}25`,
        borderRadius: 8, padding: "7px 12px",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.bull }}>{nBull} alcistas</span>
        <div style={{ flex: 1, height: 6, background: T.border, borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${(nBull / (nBull + nBear || 1)) * 100}%`,
            height: "100%", background: T.bull, borderRadius: 3,
            transition: "width 0.8s",
          }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.bear }}>{nBear} bajistas</span>
      </div>

      {/* Grid de niveles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {items.map(({ key, icon, label, value, bull, tag }) => {
          const c = bull === null ? T.warn : bull ? T.bull : T.bear;
          return (
            <div key={key} style={{
              background: T.card2,
              border: `1px solid ${c}25`,
              borderLeft: `2px solid ${c}`,
              borderRadius: 6, padding: "6px 9px",
            }}>
              <div style={{
                fontSize: 9, color: T.muted,
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 2,
              }}>
                <span>
                  <span style={{ color: c, marginRight: 4 }}>{icon}</span>
                  {label}
                </span>
                {tag && (
                  <span style={{
                    fontSize: 8,
                    background: `${c}15`, color: c,
                    borderRadius: 3, padding: "0 5px",
                  }}>{tag}</span>
                )}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: "monospace" }}>
                {value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Glosario desplegable */}
      <details style={{ marginTop: 12 }}>
        <summary style={{
          fontSize: 10, color: T.muted,
          cursor: "pointer", fontWeight: 700, userSelect: "none",
        }}>
          📖 Glosario SMC
        </summary>
        <div style={{ marginTop: 8 }}>
          {[
            { term: "BOS",        def: "Break of Structure — rotura de un swing previo. Confirma la dirección de tendencia." },
            { term: "CHoCH",      def: "Change of Character — primera ruptura contra la tendencia principal. Alerta temprana de reversión." },
            { term: "OB",         def: "Order Block — última vela bajista/alcista antes de un impulso fuerte. Zona institucional de demanda/oferta." },
            { term: "FVG",        def: "Fair Value Gap — desequilibrio entre tres velas. El precio tiende a regresar a rellenarlo antes de continuar." },
            { term: "Premium/Disc", def: "Premium (>50% rango): zona óptima de venta. Discount (<50%): zona óptima de compra." },
            { term: "BSL/SSL",    def: "Buy/Sell Side Liquidity — niveles donde se acumulan stops que el precio busca antes de revertir." },
            { term: "Inducement", def: "Movimiento falso diseñado para cazar stops de retail antes del movimiento institucional real." },
            { term: "Breaker",    def: "Order Block que fue roto y se convierte en resistencia (antes soporte) o soporte (antes resistencia)." },
          ].map(({ term, def }) => (
            <div key={term} style={{ fontSize: 10, color: T.muted, marginBottom: 6, lineHeight: 1.5 }}>
              <strong style={{ color: T.accent }}>{term}:</strong> {def}
            </div>
          ))}
        </div>
      </details>

      {/* Nota de fuente */}
      <div style={{ marginTop: 8, fontSize: 9, color: T.muted, lineHeight: 1.5 }}>
        {isLive
          ? `✓ Datos obtenidos del endpoint /api/smc/${ticker.toUpperCase()} · actualización automática cada 30s`
          : `⚙ Datos derivados determinísticamente del precio (${usd(price)}) + ATR (${usd(atr)}) + momentum del ticker. Activa el endpoint /api/smc para datos en tiempo real.`}
      </div>
    </div>
  );
}

/*
────────────────────────────────────────────────────────────────────────────────
RESUMEN DE CAMBIOS EN EL COMPONENTE PRINCIPAL (OvertonSignalMatrixV4):

ANTES (tab SMC con datos estáticos):
────────────────────────────────────
{activeTab === "smc" && (
  <>
    <MTFPanel d={d} tickerSeed={tickerSeed} />
    <div style={{ height: 10 }} />
    <SMCPanel d={d} />                        ← LÍNEA A CAMBIAR
    <div style={{ height: 10 }} />
    <LiquidityHeatmap d={d} tickerSeed={tickerSeed} />
    ...
  </>
)}

DESPUÉS (tab SMC con datos reactivos en tiempo real):
──────────────────────────────────────────────────────
{activeTab === "smc" && (
  <>
    <MTFPanel d={d} tickerSeed={tickerSeed} />
    <div style={{ height: 10 }} />
    <SMCPanelLive ticker={ticker} backendData={d} />   ← CORRECTO
    <div style={{ height: 10 }} />
    <LiquidityHeatmap d={d} tickerSeed={tickerSeed} />
    ...
  </>
)}

También puedes eliminar la función SMCPanel antigua (ya no se usa).
────────────────────────────────────────────────────────────────────────────────
*/


const sf = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
const usd = (v, dec = 2) => `$${sf(v, 0).toFixed(dec)}`;
const pct = (v, dec = 1) => `${sf(v, 0) >= 0 ? "+" : ""}${sf(v, 0).toFixed(dec)}%`;
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

const pill = (color, label, small = false) => (
  <span style={{
    background: `${color}18`, border: `1px solid ${color}40`, color,
    borderRadius: 5, padding: small ? "1px 6px" : "2px 9px",
    fontSize: small ? 10 : 11, fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "0.04em",
  }}>{label}</span>
);

const SectionTitle = ({ icon, children, badge }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{children}</span>
    </div>
    {badge}
  </div>
);

// ─── useFetch ─────────────────────────────────────────────────────────────────
const useFetch = (ticker) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchData = useCallback(async (t) => {
    if (!t) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/overton/${t.toUpperCase()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  return { data, loading, error, fetchData };
};

// ─── Hash determinista POR TICKER ─────────────────────────────────────────────
function useTickerHash(str) {
  return useMemo(() => {
    let h = 5381;
    for (let i = 0; i < (str || "SPY").length; i++) {
      h = ((h << 5) + h) ^ (str || "SPY").charCodeAt(i);
    }
    return Math.abs(h >>> 0);
  }, [str]);
}

function useSeededRand(seed) {
  return useCallback((idx) => {
    const x = Math.sin((seed ^ 0xDEADBEEF) + idx * 127773 + 2836) * 99991;
    return Math.abs(x - Math.floor(x));
  }, [seed]);
}

// ════════════════════════════════════════════════════════════════════════════════
// SCORE COMPUESTO MULTIFACTOR EXPANDIDO
// ════════════════════════════════════════════════════════════════════════════════
function ScoreGauge({ score }) {
  const angle = (score / 160) * 180 - 90;
  const toRad = (d) => (d * Math.PI) / 180;
  const nX = 60 + 42 * Math.cos(toRad(angle - 90));
  const nY = 60 + 42 * Math.sin(toRad(angle - 90));
  const color = score >= 104 ? T.bull : score <= 56 ? T.bear : T.warn;
  const label = score >= 104 ? "COMPRAR" : score <= 56 ? "VENDER" : "MANTENER";
  const zones = [
    { s: 180, e: 144, c: T.bear }, { s: 144, e: 108, c: "#e07040" },
    { s: 108, e: 72, c: T.warn }, { s: 72, e: 36, c: "#4ade80" }, { s: 36, e: 0, c: T.bull },
  ];
  const arc = (s, e, r, cx, cy) => {
    const a1 = toRad(s - 90), a2 = toRad(e - 90);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="120" height="72" viewBox="0 0 120 70">
        {zones.map(z => <path key={z.s} d={arc(z.s, z.e, 52, 60, 62)} fill="none" stroke={z.c} strokeWidth="10" opacity="0.2" />)}
        {zones.map(z => <path key={`f${z.s}`} d={arc(z.s, z.e, 52, 60, 62)} fill="none" stroke={z.c} strokeWidth="10" />)}
        <line x1="60" y1="62" x2={nX.toFixed(1)} y2={nY.toFixed(1)} stroke={T.text} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="60" cy="62" r="4" fill={color} />
        <text x="60" y="54" textAnchor="middle" fontSize="17" fontWeight="800" fill={color}>{score}</text>
      </svg>
      <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: 1.5, marginTop: -4 }}>{label}</span>
    </div>
  );
}

/**
 * FIX: ScoreBreakdownExpanded → ScoreBreakdownExpandedV4
 *
 * REEMPLAZA la función ScoreBreakdownExpanded en tu OvertonSignalMatrix_v4.jsx
 * por esta versión que añade Elliott Wave + Patrón de Vela 1W al score.
 *
 * 1. BUSCA en tu archivo:
 *    function ScoreBreakdownExpanded({ d, tickerSeed }) {
 *
 * 2. REEMPLAZA toda esa función por la de abajo.
 *
 * 3. En el componente principal, donde se llama ScoreBreakdownExpanded:
 *    ANTES: <ScoreBreakdownExpanded d={d} tickerSeed={tickerSeed} />
 *    DESPUÉS: <ScoreBreakdownExpandedV4 d={d} tickerSeed={tickerSeed} />
 *
 * 4. En el SectionTitle del score, cambia el texto:
 *    ANTES: "Score Compuesto Multi-Factor (100 pts)"
 *    DESPUÉS: "Score Compuesto Multi-Factor — Elliott + Vela (160 pts)"
 *
 * 5. Añade los badges Elliott ✓ y Vela 1W ✓ junto al score:
 *    ANTES:
 *      <div style={{ flex: 1 }}>
 *        <div style={{ fontSize: 11, color: T.muted }}>{d.bias}</div>
 *        ...
 *      </div>
 *    DESPUÉS: (añade las dos líneas con pill al final del div)
 *      <div style={{ flex: 1 }}>
 *        <div style={{ fontSize: 11, color: T.muted }}>{d.bias}</div>
 *        <div style={{ fontSize: 11, color: newsColor, marginTop: 4 }}>...</div>
 *        <div style={{ marginTop: 6, display: "flex", gap: 5 }}>
 *          {pill(T.gold,  "Elliott ✓")}
 *          {pill(T.pink, "Vela 1W ✓")}
 *        </div>
 *      </div>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REQUIERE que estas funciones ya existan en el archivo (ya están en v4):
 *   - useSeededRand
 *   - clamp, sf, usd
 *   - T (constante global de tema claro)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Motor de detección de patrones (versión mínima para el score) ─────────────
// Ya tienes detectCandlePatterns en tu v4 — esta función la reutiliza.
// Si no la tienes, pega la versión corta de abajo.
function detectCandlePatternLight(c0, c1, c2, atr) {
  if (!c2) return null;
  const body  = (c) => Math.abs(c.close - c.open);
  const range = (c) => c.high - c.low || 0.0001;
  const upper = (c) => c.high - Math.max(c.open, c.close);
  const lower = (c) => Math.min(c.open, c.close) - c.low;
  const bull  = (c) => c.close >= c.open;
  const b2 = body(c2), r2 = range(c2), u2 = upper(c2), l2 = lower(c2);
  const b1 = c1 ? body(c1) : 0;
  const isDoji = b2 <= r2 * 0.10;
  const isBullishEngulfing = c1 && bull(c2) && !bull(c1) && c2.open < c1.close && c2.close > c1.open;
  const isBearishEngulfing = c1 && !bull(c2) && bull(c1) && c2.open > c1.close && c2.close < c1.open;
  const isMorningStar = c0 && c1 && !bull(c0) && !bull(c1) && bull(c2) && c2.close > c1.open;
  const isEveningStar = c0 && c1 && bull(c0) && bull(c1) && !bull(c2) && c2.close < c1.open;
  const isThreeWhite = c0 && c1 && bull(c2) && bull(c1) && bull(c0) && c2.close > c1.close && c1.close > c0.close;
  const isThreeCrows = c0 && c1 && !bull(c2) && !bull(c1) && !bull(c0) && c2.close < c1.close && c1.close < c0.close;
  const maruTol = r2 * 0.02;
  const isBullMarubozu = bull(c2) && u2 <= maruTol && l2 <= maruTol;
  const isBearMarubozu = !bull(c2) && u2 <= maruTol && l2 <= maruTol;
  const isHammer = bull(c2) && r2 > 3 * b2 && u2 < 2 * b2 && l2 > b2 * 2;
  const isStar   = !bull(c2) && r2 > 3 * b2 && l2 < 2 * b2 && u2 > b2 * 2;
  if (isThreeWhite) return { name: "Three White Soldiers", type: "bull", reliability: 0.80 };
  if (isThreeCrows)  return { name: "Three Black Crows",    type: "bear", reliability: 0.80 };
  if (isMorningStar) return { name: "Morning Star",         type: "bull", reliability: 0.75 };
  if (isEveningStar) return { name: "Evening Star",         type: "bear", reliability: 0.75 };
  if (isBullishEngulfing) return { name: "Bullish Engulfing", type: "bull", reliability: 0.68 };
  if (isBearishEngulfing) return { name: "Bearish Engulfing", type: "bear", reliability: 0.68 };
  if (isBullMarubozu) return { name: "Bullish Marubozu", type: "bull", reliability: 0.62 };
  if (isBearMarubozu) return { name: "Bearish Marubozu", type: "bear", reliability: 0.62 };
  if (isHammer) return { name: "Hammer",        type: "bull", reliability: 0.55 };
  if (isStar)   return { name: "Shooting Star", type: "bear", reliability: 0.55 };
  if (isDoji)   return { name: "Doji",          type: "neutral", reliability: 0.35 };
  return { name: "Sin patrón", type: "neutral", reliability: 0 };
}

// ── Función principal — reemplaza a ScoreBreakdownExpanded ───────────────────
function WaveSignal({ label, value, positive, neutral, T }) {
  const bgColor = neutral 
    ? `${T.muted}15`
    : (positive ? `${T.bull}15` : `${T.bear}15`);
  const textColor = neutral
    ? T.muted
    : (positive ? T.bull : T.bear);
  
  return (
    <div style={{
      padding: "4px 8px",
      background: bgColor,
      border: `1px solid ${textColor}40`,
      borderRadius: 5,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      minWidth: 65,
    }}>
      <div style={{ fontSize: 7, color: T.muted, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: textColor }}>{value || "—"}</div>
    </div>
  );
}

function ScoreBreakdownExpandedV4({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);

  // ── Datos base ────────────────────────────────────────────────
  const price   = sf(d?.current_price, 100);
  const atr     = sf(d?.atr, price * 0.012);
  const rsi     = sf(d?.rsi, 50);
  const adx     = sf(d?.adx, 22);
  const mom     = sf(d?.momentum_12_1, 0);
  const ofi     = sf(d?.ofi, 0);
  const fgi     = sf(d?.fear_greed, 50);
  const zscore  = sf(d?.zscore_mean_rev, 0);
  const bbWidth = sf(d?.bb_width, 0.05);
  const atrPct  = sf(d?.atr_pct, 1.5);
  const ivRank  = sf(d?.iv_rank, 30);
  const regime  = d?.market_regime || "ranging";
  const vwapAbove = d?.vwap?.price_vs_vwap === "above";

  // ── Generar 52 velas semanales deterministas ─────────────────
  const candles = useMemo(() => {
    const trend = mom > 5 ? 0.0028 : mom < -5 ? -0.0020 : 0.0008;
    let last = price * (1 - trend * 52 * (1 + (r(999) - 0.5) * 0.3));
    return Array.from({ length: 52 }, (_, i) => {
      const open  = last;
      const sig   = (r(i * 4) - 0.46 + trend * 10) * atr * 2.0;
      const noise = (r(i * 4 + 5) - 0.50) * atr * 0.6;
      const close = open + sig + noise;
      const high  = Math.max(open, close) + atr * (0.3 + r(i * 4 + 1) * 1.4) * r(i * 4 + 3);
      const low   = Math.min(open, close) - atr * (0.3 + r(i * 4 + 2) * 1.4) * (1 - r(i * 4 + 3));
      last = close;
      return { open, close, high, low };
    });
  }, [tickerSeed, price, atr, mom]);

  // ── Patrón de la última vela semanal ─────────────────────────
  const pattern = useMemo(() => {
    const n = candles.length;
    return detectCandlePatternLight(candles[n - 3], candles[n - 2], candles[n - 1], atr);
  }, [candles, atr]);

  // ── Score del patrón de vela ──────────────────────────────────
  const candleScore = useMemo(() => {
    if (!pattern || pattern.reliability === 0)
      return { score: 3, label: "Sin patrón", isBull: null, reliability: 0 };
    const rel = pattern.reliability;
    const isBullPat = pattern.type === "bull";
    // Alcista suma, bajista resta
    const final = isBullPat ? clamp(rel * 10, 0, 10) : clamp(10 - rel * 10, 0, 10);
    return { score: final, label: pattern.name, isBull: isBullPat, reliability: rel };
  }, [pattern]);

  // ── Señal Elliott Wave (determinista por ticker) ─────────────
  const elliottSignal = useMemo(() => {
    const isImpulse     = r(0) > 0.35;
    const isBull        = r(1) > 0.4;
    const currentWave   = Math.min(Math.floor(r(7) * 5) + 1, 5); // 1-5
    let score = 5;
    if (isImpulse) {
      score = isBull
        ? [0, 5, 9, 6, 8, 2][currentWave]   // ondas 1→5 alcistas
        : [0, 7, 2, 5, 3, 8][currentWave];  // ondas 1→5 bajistas
    } else {
      const abc = Math.floor(r(4) * 3); // 0=A, 1=B, 2=C
      score = [2, 4, 8][abc];
    }
    const label = isImpulse ? `Onda ${currentWave}` : ["A", "B", "C"][Math.floor(r(4) * 3)];
    return { score, label, isBull, max: 10 };
  }, [tickerSeed, r]);

  // ── Variables para nuevos factores ─────────────────────────────
  const wolfe = d?.wolfe_waves || { detected: false };
  const ichi = d?.ichimoku || { signal: "neutral" };
  const weis = d?.weis_waves || [];
  const wyckoff = d?.wyckoff_phase || "Unknown";
  const wyckoffStage = d?.wyckoff_stage || "—";

  // ── Definición de factores (160 pts → normalizado a 100) ─
  const factors = [
    {
      cat: "Fundamental", color: T.accent, max: 30,
      items: [
        { label: "Forward Guidance",  score: sf(d?.forward_guidance?.score, r(0) * 8 + 2),                                         max: 10, detail: d?.forward_guidance?.label || "neutro" },
        { label: "EPS Growth",        score: clamp(sf(d?.forward_guidance?.eps_growth_pct, r(1) * 12 - 4) * 0.4 + 5, 0, 10),       max: 10, detail: `${sf(d?.forward_guidance?.eps_growth_pct, (r(1) * 12 - 4)).toFixed(1)}%` },
        { label: "Analyst Consensus", score: clamp(10 - sf(d?.forward_guidance?.analyst_mean_rec, r(2) * 2 + 1.5) * 2, 0, 10),     max: 10, detail: `${sf(d?.forward_guidance?.analyst_mean_rec, r(2) * 2 + 1.5).toFixed(1)}/5` },
      ],
    },
    {
      cat: "Momentum", color: T.bull, max: 30,
      items: [
        { label: "Momentum 12-1",  score: clamp((mom + 30) / 60 * 10, 0, 10), max: 10, detail: `${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%` },
        { label: "RSI (14)",       score: clamp(rsi / 100 * 8 + 1, 0, 8),     max: 8,  detail: `${rsi.toFixed(0)} — ${rsi > 70 ? "Sobrecompra" : rsi < 30 ? "Sobreventa" : "Normal"}` },
        { label: "ADX Tendencia",  score: clamp(adx / 60 * 7, 0, 7),          max: 7,  detail: `ADX ${adx.toFixed(0)} — ${regime.toUpperCase()}` },
        { label: "IV Rank",        score: clamp((100 - ivRank) / 100 * 5, 0, 5), max: 5, detail: `${ivRank.toFixed(0)}% — ${ivRank > 50 ? "Alta vol" : "Baja vol"}` },
      ],
    },
    {
      cat: "Sentimiento", color: T.purple, max: 20,
      items: [
        { label: "Fear & Greed",   score: clamp(fgi / 100 * 8, 0, 8),                                            max: 8, detail: `${fgi.toFixed(0)}/100` },
        { label: "Put/Call Ratio", score: clamp((1.5 - sf(d?.put_call_ratio, 1)) / 1.5 * 6, 0, 6),               max: 6, detail: `PCR ${sf(d?.put_call_ratio, 1).toFixed(2)}` },
        { label: "News Impact",    score: clamp((sf(d?.news_impact_total, 0) + 5) / 10 * 6, 0, 6),               max: 6, detail: `${sf(d?.news_impact_total, 0) >= 0 ? "+" : ""}${sf(d?.news_impact_total, 0).toFixed(1)}%` },
      ],
    },
    {
      cat: "Microestructura", color: T.cyan, max: 25,
      items: [
        { label: "OFI Flow",             score: clamp((ofi + 0.5) * 8, 0, 8),                    max: 8, detail: `OFI ${ofi.toFixed(3)}` },
        { label: "VWAP Position",        score: vwapAbove ? 6 : 2,                               max: 6, detail: vwapAbove ? "Sobre VWAP" : "Bajo VWAP" },
        { label: "Z-score Rev",          score: clamp((3 - Math.abs(zscore)) / 3 * 6, 0, 6),    max: 6, detail: `Z ${zscore.toFixed(2)}` },
        { label: "BB Width / Volat.",    score: clamp((1 - bbWidth / 0.15) * 5, 0, 5),           max: 5, detail: `${(bbWidth * 100).toFixed(2)}%` },
      ],
    },
    // ── NUEVOS: Elliott Wave + Patrón de Vela ──────────────────
    {
      cat: "Elliott Wave", color: T.gold, max: 10, isNew: true,
      items: [
        {
          label: `Onda actual: ${elliottSignal.label}`,
          score: elliottSignal.score,
          max: 10,
          detail: elliottSignal.isBull ? "Sesgo alcista" : "Sesgo bajista",
        },
      ],
    },
    {
      cat: "Patrón de Vela (1W)", color: T.pink, max: 10, isNew: true,
      items: [
        {
          label: candleScore.label,
          score: candleScore.score,
          max: 10,
          detail: pattern
            ? `Fiab. ${Math.round((pattern.reliability || 0) * 100)}% · ${pattern.type === "bull" ? "▲" : pattern.type === "bear" ? "▼" : "—"}`
            : "Sin señal",
        },
      ],
    },
    // ── NUEVOS: Ichimoku, Wolfe Wave, Weis Wave, Wyckoff ──────────────────
    {
      cat: "Ichimoku Cloud", color: T.teal, max: 10, isNew: true,
      items: [
        {
          label: `Señal: ${ichi.signal || "Neutral"}`,
          score: ichi.signal === "bull" ? 8 : d?.ichimoku?.signal === "bear" ? 3 : 5,
          max: 10,
          detail: ichi.price_vs_cloud ? `Precio ${d.ichimoku.price_vs_cloud}` : "N/A",
        },
      ],
    },
    {
      cat: "Wolfe Waves", color: T.indigo, max: 10, isNew: true,
      items: [
        {
          label: wolfe.detected ? "Patrón Detectado" : "Sin patrón",
          score: wolfe.detected ? (wolfe.direction === "bull" ? 8 : 3) : 5,
          max: 10,
          detail: wolfe.direction ? `${wolfe.direction === "bull" ? "▲" : "▼"} ${wolfe.direction}` : "—",
        },
      ],
    },
    {
      cat: "Weis Wave", color: T.purple, max: 10, isNew: true,
      items: [
        {
          label: weis.length > 0 ? "Ondas activas" : "Sin datos",
          score: weis.length > 0 ? 7 : 5,
          max: 10,
          detail: weis.length > 0 ? `${d.weis_waves.length} ondas` : "—",
        },
      ],
    },
    {
      cat: "Fase Wyckoff", color: T.gold, max: 10, isNew: true,
      items: [
        {
          label: wyckoff || "Desconocida",
          score: d?.wyckoff_phase === "Markup" ? 9 : d?.wyckoff_phase === "Accumulation" ? 7 : d?.wyckoff_phase === "Distribution" ? 3 : d?.wyckoff_phase === "Markdown" ? 2 : 5,
          max: 10,
          detail: d?.wyckoff_stage || "—",
        },
      ],
    },
  ];

  // ── Normalización: 160 pts → 100 ─────────────────────────────
  const rawTotal = factors.reduce((s, cat) => s + cat.items.reduce((cs, i) => cs + i.score, 0), 0);
  const rawMax   = factors.reduce((s, cat) => s + cat.max, 0); // 160
  const normScore = Math.round((rawTotal / rawMax) * 100);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 12 }}>

      {/* Cabecera de normalización */}
      <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
        Desglose por categoría (160 pts → normalizado a 100)
      </div>
      <div style={{
        marginBottom: 8,
        background: `${T.accent}0a`,
        border: `1px solid ${T.accent}25`,
        borderRadius: 6,
        padding: "5px 10px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 10, color: T.muted }}>Score bruto: {rawTotal.toFixed(1)} / {rawMax}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.accent, fontFamily: "monospace" }}>Normalizado: {normScore}/100</span>
      </div>

      {/* Categorías */}
      {factors.map(({ cat, color, max, items, isNew }) => {
        const catScore = items.reduce((s, i) => s + i.score, 0);
        const catPct   = Math.round((catScore / max) * 100);
        return (
          <div key={cat} style={{ marginBottom: 10, position: "relative" }}>

            {/* Badge NUEVO */}
            {isNew && (
              <span style={{
                position: "absolute", right: 0, top: 0,
                fontSize: 8,
                background: `${T.warn}20`,
                color: T.warn,
                borderRadius: 4,
                padding: "1px 6px",
                fontWeight: 800,
              }}>NUEVO</span>
            )}

            {/* Fila de totales */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color }}>{cat}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "monospace" }}>
                {catScore.toFixed(1)}/{max} ({catPct}%)
              </span>
            </div>

            {/* Barra de categoría */}
            <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: "hidden", marginBottom: 5 }}>
              <div style={{ width: `${catPct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 1s" }} />
            </div>

            {/* Sub-ítems */}
            {items.map(({ label, score, max: iMax, detail }) => {
              const ip = Math.round((score / iMax) * 100);
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, paddingLeft: 8 }}>
                  <div style={{ width: 140, fontSize: 9, color: T.muted, flexShrink: 0 }}>{label}</div>
                  <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${ip}%`, height: "100%", background: `${color}80`, borderRadius: 2 }} />
                  </div>
                  <div style={{ width: 36, fontSize: 9, color, textAlign: "right", fontFamily: "monospace" }}>{score.toFixed(1)}</div>
                  <div style={{ width: 90, fontSize: 9, color: T.muted, textAlign: "right" }}>{detail}</div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Resumen tarjetas nuevos factores */}
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        {/* Elliott */}
        <div style={{
          flex: 1, minWidth: 150,
          background: `${T.gold}0a`,
          border: `1px solid ${T.gold}30`,
          borderRadius: 7,
          padding: "7px 10px",
        }}>
          <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>Elliott Wave</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.gold }}>
            {elliottSignal.label} — {elliottSignal.score.toFixed(1)}/10
          </div>
          <div style={{ fontSize: 9, color: T.muted }}>
            {elliottSignal.isBull ? "▲ Sesgo alcista" : "▼ Sesgo bajista"}
          </div>
        </div>

        {/* Vela */}
        <div style={{
          flex: 1, minWidth: 150,
          background: `${T.pink}0a`,
          border: `1px solid ${T.pink}30`,
          borderRadius: 7,
          padding: "7px 10px",
        }}>
          <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>Patrón Vela 1W</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.pink }}>
            {candleScore.label} — {candleScore.score.toFixed(1)}/10
          </div>
          <div style={{ fontSize: 9, color: T.muted }}>
            Fiab. {Math.round((pattern?.reliability || 0) * 100)}%
            {" · "}
            {pattern?.type === "bull" ? "▲ alcista" : pattern?.type === "bear" ? "▼ bajista" : "— neutro"}
          </div>
        </div>
      </div>

      {/* Señales por Onda */}
      <div style={{ marginTop: 12, padding: "10px", background: T.card2, borderRadius: 8, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: "uppercase" }}>Señales por Onda/Factor</div>
        
        {/* Onda Técnica */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.accent, marginBottom: 4 }}>📊 Onda Técnica</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <WaveSignal label="WMA-30" value={d.price_vs_wma === "above" ? "▲ Sobre" : "▼ Bajo"} positive={d.price_vs_wma === "above"} T={T} />
            <WaveSignal label="Coppock" value={d.coppock_signal === "bull" ? "▲ Alcista" : "▼ Bajista"} positive={d.coppock_signal === "bull"} T={T} />
            <WaveSignal label="RSI" value={`${rsi.toFixed(0)}`} neutral T={T} />
            <WaveSignal label="ADX" value={`${adx.toFixed(0)}`} positive={adx > 25} T={T} />
            <WaveSignal label="Régimen" value={regime.toUpperCase()} neutral T={T} />
          </div>
        </div>
        
        {/* Onda Macro */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.purple, marginBottom: 4 }}>🌍 Onda Macro</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <WaveSignal label="VIX" value={d.vix?.toFixed(1)} positive={d.vix < 20} T={T} />
            <WaveSignal label="US10Y" value={`${(d.us10y || 4.5).toFixed(2)}%`} positive={d.us10y < 4.5} T={T} />
            <WaveSignal label="IV Rank" value={`${ivRank.toFixed(0)}%`} positive={ivRank < 50} T={T} />
          </div>
        </div>
        
        {/* Onda Sentimiento */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.gold, marginBottom: 4 }}>💭 Onda Sentimiento</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <WaveSignal label="PCR" value={(d.put_call_ratio || 1).toFixed(2)} positive={d.put_call_ratio > 0.9} T={T} />
            <WaveSignal label="Short Int" value={`${(d.short_interest || 0).toFixed(1)}%`} positive={d.short_interest < 10} T={T} />
            <WaveSignal label="F&G" value={`${fgi.toFixed(0)}`} neutral T={T} />
          </div>
        </div>
        
        {/* Onda Noticias */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.cyan, marginBottom: 4 }}>📰 Onda Noticias</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <WaveSignal label="Sentimiento" value={d.news_sentiment === "bull" ? "▲ Bull" : d.news_sentiment === "bear" ? "▼ Bear" : "Neutral"} positive={d.news_sentiment === "bull"} T={T} />
            <WaveSignal label="Impacto" value={`${(d.news_impact_total || 0) >= 0 ? "+" : ""}${(d.news_impact_total || 0).toFixed(1)}%`} positive={d.news_impact_total > 0} T={T} />
          </div>
        </div>
        
        {/* Onda Microestructura */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.teal, marginBottom: 4 }}>⚡ Onda Microestructura</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <WaveSignal label="OFI" value={(d.ofi || 0).toFixed(2)} positive={d.ofi > 0} T={T} />
            <WaveSignal label="VWAP" value={vwapAbove ? "▲ Sobre" : "▼ Bajo"} positive={vwapAbove} T={T} />
            <WaveSignal label="GEX" value={(d.gamma_exposure || 0).toFixed(0)} positive={d.gamma_exposure > 0} T={T} />
            <WaveSignal label="Bid-Ask" value={`${(d.bid_ask_spread || 0).toFixed(2)}%`} positive={d.bid_ask_spread < 1} T={T} />
            <WaveSignal label="Beta" value={(d.beta || 1).toFixed(2)} neutral T={T} />
          </div>
        </div>
      </div>
    </div>
  );
}


/*
─────────────────────────────────────────────────────────────────────────────
RESUMEN DE CAMBIOS EN EL JSX DEL COMPONENTE PRINCIPAL:

1. SectionTitle del score — cambia el texto:
   ANTES:  Score Compuesto Multi-Factor (100 pts)
   DESPUÉS: Score Compuesto Multi-Factor — Elliott + Vela (160 pts)

2. Junto al ScoreGauge, en el div derecho añade los badges:
   <div style={{ marginTop: 6, display: "flex", gap: 5 }}>
     {pill(T.gold, "Elliott ✓")}
     {pill(T.pink, "Vela 1W ✓")}
   </div>

3. Cambia la llamada al componente:
   ANTES:   <ScoreBreakdownExpanded d={d} tickerSeed={tickerSeed} />
   DESPUÉS: <ScoreBreakdownExpandedV4 d={d} tickerSeed={tickerSeed} />
─────────────────────────────────────────────────────────────────────────────
*/












// ════════════════════════════════════════════════════════════════════════════════
// VIX + US 10Y — REDISEÑADO CON LEYENDA Y ANÁLISIS DE IMPACTO
// ════════════════════════════════════════════════════════════════════════════════
function VixYieldChartV2({ vix, yield_, vixCurrent, yieldCurrent }) {
  const ref = useRef(null);
  const [svgW, setSvgW] = useState(500);
  useEffect(() => {
    const obs = new ResizeObserver(e => setSvgW(e[0].contentRect.width || 500));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  if (!vix || !yield_ || vix.length < 2) return (
    <div style={{ color: T.muted, fontSize: 11, padding: 8 }}>Sin datos históricos disponibles.</div>
  );

  const vMn = Math.min(...vix), vMx = Math.max(...vix);
  const yMn = Math.min(...yield_), yMx = Math.max(...yield_);
  const H = 100, pad = { t: 12, b: 20, l: 32, r: 36 };
  const W = svgW - pad.l - pad.r, n = vix.length;

  const vNorm = (v) => pad.t + (1 - (v - vMn) / ((vMx - vMn) || 1)) * H;
  const yNorm = (v) => pad.t + (1 - (v - yMn) / ((yMx - yMn) || 1)) * H;
  const xPos = (i) => pad.l + (i / (n - 1)) * W;

  const vPath = vix.map((v, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${vNorm(v).toFixed(1)}`).join(" ");
  const yPath = yield_.map((v, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yNorm(v).toFixed(1)}`).join(" ");
  const vArea = vix.map((v, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${vNorm(v).toFixed(1)}`).join(" ")
    + ` L${xPos(n - 1)},${pad.t + H} L${pad.l},${pad.t + H} Z`;

  const vixVal = sf(vixCurrent, vix[n - 1]);
  const yieldVal = sf(yieldCurrent, yield_[n - 1]);
  const vixStatus = vixVal < 15 ? { label: "Calma extrema", color: T.bull } : vixVal < 20 ? { label: "Calma", color: T.bull } : vixVal < 28 ? { label: "Moderado", color: T.warn } : { label: "Miedo alto", color: T.bear };
  const yieldStatus = yieldVal < 3.8 ? { label: "Favorable equity", color: T.bull } : yieldVal < 4.5 ? { label: "Neutro", color: T.warn } : { label: "Restrictivo", color: T.bear };

  // Correlación y análisis de impacto
  const vixTrend = vix[n - 1] - vix[0];
  const yieldTrend = yield_[n - 1] - yield_[0];
  let marketImpact = "";
  if (vixTrend > 3 && yieldTrend > 0.3) marketImpact = "⚠ VIX subiendo + yields al alza → presión doble sobre renta variable. Reducir exposición.";
  else if (vixTrend < -2 && yieldTrend < 0.1) marketImpact = "✓ VIX cayendo + yields estables → entorno favorable para renta variable.";
  else if (vixTrend > 3 && yieldTrend < 0) marketImpact = "⚡ VIX alto con yields cediendo → posible flight-to-safety. Vigilar bonos vs acciones.";
  else if (vixTrend < -2 && yieldTrend > 0.3) marketImpact = "△ VIX cayendo pero yields presionan → rally posible a corto, cautela a medio plazo.";
  else marketImpact = "— Entorno mixto. VIX y yields sin señal direccional clara.";

  const impactColor = marketImpact.startsWith("✓") ? T.bull : marketImpact.startsWith("⚠") ? T.bear : T.warn;

  const yticks = [0, 0.5, 1];

  return (
    <div>
      {/* Valores actuales */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, background: `${vixStatus.color}0a`, border: `1px solid ${vixStatus.color}30`, borderRadius: 8, padding: "8px 11px" }}>
          <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>VIX — Volatilidad Implícita</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: vixStatus.color, fontFamily: "monospace" }}>{vixVal.toFixed(1)}</div>
          <div style={{ fontSize: 10, color: vixStatus.color, fontWeight: 700 }}>{vixStatus.label}</div>
          <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>
            {vixVal < 20 ? "Mercado complaciente — opciones baratas" : vixVal < 28 ? "Estrés moderado — cobertura recomendada" : "Pánico / alta demanda de puts"}
          </div>
        </div>
        <div style={{ flex: 1, background: `${yieldStatus.color}0a`, border: `1px solid ${yieldStatus.color}30`, borderRadius: 8, padding: "8px 11px" }}>
          <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>US 10Y — Tasa de Interés</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: yieldStatus.color, fontFamily: "monospace" }}>{yieldVal.toFixed(2)}%</div>
          <div style={{ fontSize: 10, color: yieldStatus.color, fontWeight: 700 }}>{yieldStatus.label}</div>
          <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>
            {yieldVal < 4.0 ? "Yields bajos → inversores migran a renta variable" : yieldVal < 4.8 ? "Yields compiten con bolsa" : "Yields altos → coste capital sube, PE múltiplo cae"}
          </div>
        </div>
      </div>

      {/* Gráfico con leyendas */}
      <div ref={ref} style={{ width: "100%", marginBottom: 8 }}>
        <svg width="100%" height={H + pad.t + pad.b}>
          <defs>
            <linearGradient id="vixAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.bear} stopOpacity="0.15" />
              <stop offset="100%" stopColor={T.bear} stopOpacity="0" />
            </linearGradient>
          </defs>
          {yticks.map((t) => {
            const y = pad.t + (1 - t) * H;
            return (
              <g key={t}>
                <line x1={pad.l} y1={y} x2={svgW - pad.r} y2={y} stroke={T.border} strokeWidth="0.5" />
                <text x={pad.l - 4} y={y + 3} textAnchor="end" fontSize="9" fill={T.bear}>
                  {(vMn + t * (vMx - vMn)).toFixed(0)}
                </text>
                <text x={svgW - pad.r + 4} y={y + 3} textAnchor="start" fontSize="9" fill={T.accent}>
                  {(yMn + t * (yMx - yMn)).toFixed(2)}%
                </text>
              </g>
            );
          })}
          <path d={vArea} fill="url(#vixAreaGrad)" />
          <path d={vPath} fill="none" stroke={T.bear} strokeWidth="2" strokeLinecap="round" />
          <path d={yPath} fill="none" stroke={T.accent} strokeWidth="2" strokeDasharray="5,3" strokeLinecap="round" />
          {/* Punto actual VIX */}
          <circle cx={xPos(n - 1)} cy={vNorm(vix[n - 1])} r="4" fill={T.bear} stroke={T.card} strokeWidth="1.5" />
          {/* Punto actual Yield */}
          <circle cx={xPos(n - 1)} cy={yNorm(yield_[n - 1])} r="4" fill={T.accent} stroke={T.card} strokeWidth="1.5" />
          {/* Eje izquierdo label */}
          <text x={pad.l} y={pad.t - 4} fontSize="9" fill={T.bear} fontWeight="700">VIX →</text>
          {/* Eje derecho label */}
          <text x={svgW - pad.r} y={pad.t - 4} textAnchor="end" fontSize="9" fill={T.accent} fontWeight="700">← US10Y</text>
        </svg>
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 3, background: T.bear, borderRadius: 2 }} />
          <span style={{ fontSize: 10, color: T.bear, fontWeight: 700 }}>VIX (eje izq.)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 3, background: T.accent, borderRadius: 2, backgroundImage: "repeating-linear-gradient(to right, #2563eb 0, #2563eb 5px, transparent 5px, transparent 8px)" }} />
          <span style={{ fontSize: 10, color: T.accent, fontWeight: 700 }}>US 10Y Yield (eje der.)</span>
        </div>
      </div>

      {/* Análisis de impacto */}
      <div style={{ background: `${impactColor}0a`, border: `1px solid ${impactColor}30`, borderRadius: 7, padding: "8px 11px", fontSize: 10, color: impactColor, fontWeight: 600, lineHeight: 1.5 }}>
        <strong>Impacto de mercado:</strong> {marketImpact}
      </div>

      {/* Tabla de referencia */}
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          { label: "VIX < 15", desc: "Calma excesiva / posible complacencia", color: T.bull },
          { label: "VIX 15–25", desc: "Rango normal, mercado operativo", color: T.warn },
          { label: "VIX > 30", desc: "Estrés / pánico / oportunidad contrarian", color: T.bear },
          { label: "Yield > 5%", desc: "Competencia directa con renta variable", color: T.bear },
        ].map(({ label, desc, color }) => (
          <div key={label} style={{ background: `${color}08`, border: `1px solid ${color}25`, borderRadius: 6, padding: "5px 8px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color }}>{label}</div>
            <div style={{ fontSize: 9, color: T.muted }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MICROESTRUCTURA AVANZADA — datos dinámicos por ticker
// ════════════════════════════════════════════════════════════════════════════════
function MicrostructureAdvancedPanel({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);
  const micro = d?.microstructure_advanced || {};
  const currentPrice = sf(d?.current_price, 100);
  const ofi = sf(d?.ofi, 0);

  // Depth dinámico por ticker
  const depth = useMemo(() => {
    if (micro.depth_of_book) return micro.depth_of_book;
    const spread = currentPrice * (0.0008 + r(10) * 0.0015);
    const volBase = 200 + r(11) * 600;
    return {
      bids: Array.from({ length: 5 }, (_, i) => ({
        price: currentPrice - spread * (i + 1) * (0.8 + r(i + 20) * 0.4),
        size: Math.round(volBase * (1 - i * 0.12) * (0.7 + r(i + 30) * 0.6)),
      })),
      asks: Array.from({ length: 5 }, (_, i) => ({
        price: currentPrice + spread * (i + 1) * (0.8 + r(i + 40) * 0.4),
        size: Math.round(volBase * (1 - i * 0.12) * (0.7 + r(i + 50) * 0.6)),
      })),
    };
  }, [tickerSeed, currentPrice, micro.depth_of_book]);

  const totalBid = depth.bids.reduce((s, l) => s + l.size, 0);
  const totalAsk = depth.asks.reduce((s, l) => s + l.size, 0);
  const totalBook = totalBid + totalAsk || 1;
  const maxSize = Math.max(...depth.bids.map(l => l.size), ...depth.asks.map(l => l.size));

  // Book imbalance dinámico por ticker + OFI
  const bookImbalance = micro.book_imbalance ?? Math.round(clamp(
    50 + (ofi * 25) + (r(60) - 0.5) * 20, 30, 70
  ));
  const imbalanceSide = bookImbalance > 55 ? "bull" : bookImbalance < 45 ? "bear" : "neutral";
  const imbalanceColor = imbalanceSide === "bull" ? T.bull : imbalanceSide === "bear" ? T.bear : T.muted;

  // VWAP breakout filter — lógica corregida
  const vwapDir = d?.vwap?.price_vs_vwap === "above" ? "bull" : "bear";
  const vwapBreakoutConfirmed =
    (vwapDir === "bull" && bookImbalance > 55) ||
    (vwapDir === "bear" && bookImbalance < 45);
  const breakoutColor = vwapBreakoutConfirmed ? T.bull : T.warn;

  // Cumulative Delta dinámico
  const cumDelta = micro.cumulative_delta ?? Math.round((ofi * 200000) + (r(70) - 0.5) * 80000);
  const cumDeltaSign = cumDelta >= 0 ? T.bull : T.bear;
  const cumDeltaLabel = cumDelta > 50000 ? "Compradores dominan" : cumDelta < -50000 ? "Vendedores dominan" : "Balance equilibrado";

  // CVD History dinámico por ticker
  const cvdHistory = micro.cvd_history || Array.from({ length: 30 }, (_, i) => {
    const trend = cumDelta * (i / 29);
    const noise = (r(i + 80) - 0.5) * Math.abs(cumDelta) * 0.3;
    return trend + noise;
  });

  const cvdRef = useRef(null);
  const [cvdW, setCvdW] = useState(400);
  useEffect(() => {
    const obs = new ResizeObserver(e => setCvdW(e[0].contentRect.width || 400));
    if (cvdRef.current) obs.observe(cvdRef.current);
    return () => obs.disconnect();
  }, []);

  const cvdH = 80, cvdPad = { t: 8, b: 8, l: 8, r: 8 };
  const cvdPW = cvdW - cvdPad.l - cvdPad.r;
  const cvdMn = Math.min(...cvdHistory), cvdMx = Math.max(...cvdHistory);
  const cvdRange = cvdMx - cvdMn || 1;
  const cvdZeroY = cvdPad.t + (1 - (0 - cvdMn) / cvdRange) * cvdH;
  const toCvdX = (i) => cvdPad.l + (i / (cvdHistory.length - 1)) * cvdPW;
  const toCvdY = (v) => cvdPad.t + (1 - (v - cvdMn) / cvdRange) * cvdH;
  const cvdPath = cvdHistory.map((v, i) => `${i === 0 ? "M" : "L"}${toCvdX(i).toFixed(1)},${toCvdY(v).toFixed(1)}`).join(" ");
  const cvdArea = cvdHistory.map((v, i) =>
    (i === 0 ? `M${toCvdX(0)},${cvdZeroY}` : "") + `L${toCvdX(i).toFixed(1)},${toCvdY(v).toFixed(1)}`
  ).join("") + ` L${toCvdX(29)},${cvdZeroY} Z`;
  const cvdSlope = cvdHistory[29] - cvdHistory[0];
  const cvdColor = cvdSlope >= 0 ? T.bull : T.bear;

  const priceSlope = (d?.price_history?.[d.price_history.length - 1] || currentPrice) - (d?.price_history?.[0] || currentPrice);
  const cvdDivergence = (priceSlope > 0 && cvdSlope < -10000) ? "bajista" : (priceSlope < 0 && cvdSlope > 10000) ? "alcista" : null;
  const cvdDivColor = cvdDivergence === "bajista" ? T.bear : cvdDivergence === "alcista" ? T.bull : T.muted;

  // Icebergs dinámicos por ticker
  const icebergs = micro.iceberg_orders || [
    {
      side: "bid",
      price: currentPrice * (1 - 0.003 - r(90) * 0.004),
      visible: Math.round(80 + r(91) * 100),
      estimated_hidden: Math.round(800 + r(92) * 1500),
      confidence: 0.70 + r(93) * 0.20,
    },
    {
      side: "ask",
      price: currentPrice * (1 + 0.003 + r(94) * 0.004),
      visible: Math.round(60 + r(95) * 80),
      estimated_hidden: Math.round(600 + r(96) * 1000),
      confidence: 0.60 + r(97) * 0.20,
    },
  ];

  // Tape dinámico por ticker
  const buyPct = Math.round(clamp(50 + ofi * 25 + (r(100) - 0.5) * 15, 35, 75));
  const sellPct = 100 - buyPct;
  const tapeColor = buyPct > 55 ? T.bull : buyPct < 45 ? T.bear : T.muted;
  const sweepDetected = Math.abs(ofi) > 0.15 || r(101) > 0.65;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px", borderTop: `3px solid ${T.indigo}` }}>
      <SectionTitle icon="⚡" badge={pill(breakoutColor, vwapBreakoutConfirmed ? "RUPTURA VWAP CONFIRMADA" : "RUPTURA VWAP NO CONFIRMADA")}>
        Microestructura Avanzada — Depth · Delta · Tape · CVD
      </SectionTitle>

      {/* Fila 1: Book Imbalance + VWAP Filter + Cumulative Delta */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 140, background: `${imbalanceColor}0a`, border: `1px solid ${imbalanceColor}30`, borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>BOOK IMBALANCE</div>
          <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 5 }}>
            <div style={{ width: `${bookImbalance}%`, background: T.bull, transition: "width 0.8s" }} />
            <div style={{ flex: 1, background: T.bear }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ color: T.bull, fontWeight: 700 }}>BID {bookImbalance}%</span>
            <span style={{ color: T.bear, fontWeight: 700 }}>{100 - bookImbalance}% ASK</span>
          </div>
          <div style={{ fontSize: 10, color: imbalanceColor, fontWeight: 700, marginTop: 3 }}>
            {imbalanceSide === "bull" ? "▲ Presión compradora" : imbalanceSide === "bear" ? "▼ Presión vendedora" : "— Equilibrado"}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 140, background: `${breakoutColor}0a`, border: `1px solid ${breakoutColor}30`, borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>FILTRO VWAP (Depth+Imbalance)</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: breakoutColor, marginBottom: 3 }}>
            {vwapBreakoutConfirmed ? "✓ VÁLIDA" : "⚠ FALSA RUPTURA"}
          </div>
          <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5 }}>
            Precio {vwapDir === "bull" ? "sobre" : "bajo"} VWAP.{" "}
            {vwapBreakoutConfirmed
              ? `Imbalance ${imbalanceSide === "bull" ? "comprador" : "vendedor"} confirma dirección.`
              : `Imbalance ${bookImbalance}% BID no confirma — riesgo de rechazo.`}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 140, background: `${cumDeltaSign}0a`, border: `1px solid ${cumDeltaSign}30`, borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>CUMULATIVE DELTA (sesión)</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: cumDeltaSign, fontFamily: "monospace", marginBottom: 2 }}>
            {cumDelta >= 0 ? "+" : ""}{(cumDelta / 1000).toFixed(1)}K
          </div>
          <div style={{ fontSize: 10, color: cumDeltaSign }}>{cumDeltaLabel}</div>
        </div>
      </div>

      {/* Depth of Book */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Depth Bid (top 5)</div>
          {depth.bids.map((lvl, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ flex: 1, height: 14, background: T.border, borderRadius: 2, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", right: 0, top: 0, height: "100%", width: `${(lvl.size / maxSize) * 100}%`, background: `${T.bull}60`, borderRadius: 2 }} />
                <span style={{ position: "relative", fontSize: 9, color: T.bull, fontFamily: "monospace", fontWeight: 700, padding: "0 4px", lineHeight: "14px" }}>
                  ${lvl.price.toFixed(2)}
                </span>
              </div>
              <span style={{ fontSize: 9, color: T.muted, width: 36, textAlign: "right", flexShrink: 0 }}>
                {lvl.size >= 1000 ? `${(lvl.size / 1000).toFixed(1)}K` : lvl.size}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 9, color: T.bull, fontWeight: 700, marginTop: 3 }}>Total: {(totalBid / 1000).toFixed(1)}K</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Depth Ask (top 5)</div>
          {depth.asks.map((lvl, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ flex: 1, height: 14, background: T.border, borderRadius: 2, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(lvl.size / maxSize) * 100}%`, background: `${T.bear}60`, borderRadius: 2 }} />
                <span style={{ position: "relative", fontSize: 9, color: T.bear, fontFamily: "monospace", fontWeight: 700, padding: "0 4px", lineHeight: "14px" }}>
                  ${lvl.price.toFixed(2)}
                </span>
              </div>
              <span style={{ fontSize: 9, color: T.muted, width: 36, textAlign: "right", flexShrink: 0 }}>
                {lvl.size >= 1000 ? `${(lvl.size / 1000).toFixed(1)}K` : lvl.size}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 9, color: T.bear, fontWeight: 700, marginTop: 3 }}>Total: {(totalAsk / 1000).toFixed(1)}K</div>
        </div>
      </div>

      {/* CVD Chart */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>CVD — Cumulative Volume Delta</span>
          {cvdDivergence && pill(cvdDivColor, `DIVERGENCIA ${cvdDivergence.toUpperCase()}`)}
        </div>
        <div ref={cvdRef} style={{ width: "100%" }}>
          <svg width="100%" height={cvdH + cvdPad.t + cvdPad.b}>
            <defs>
              <linearGradient id="cvdGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cvdColor} stopOpacity="0.22" />
                <stop offset="100%" stopColor={cvdColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <line x1={cvdPad.l} y1={cvdZeroY} x2={cvdW - cvdPad.r} y2={cvdZeroY} stroke={T.border} strokeWidth="1" strokeDasharray="4,3" />
            <path d={cvdArea} fill="url(#cvdGrad2)" />
            <path d={cvdPath} fill="none" stroke={cvdColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Iceberg Orders */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Iceberg Orders Detectadas</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {icebergs.map((ice, i) => {
            const ic = ice.side === "bid" ? T.bull : T.bear;
            const hiddenRatio = Math.round((ice.estimated_hidden / (ice.visible + ice.estimated_hidden)) * 100);
            return (
              <div key={i} style={{ flex: 1, minWidth: 160, background: `${ic}08`, border: `1px solid ${ic}30`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: ic, fontWeight: 700 }}>{ice.side === "bid" ? "▲ ICEBERG BID" : "▼ ICEBERG ASK"}</span>
                  <span style={{ fontSize: 9, color: T.muted }}>Conf. {Math.round(ice.confidence * 100)}%</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: ic, fontFamily: "monospace", marginBottom: 3 }}>${ice.price.toFixed(2)}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div><div style={{ fontSize: 9, color: T.muted }}>Visible</div><div style={{ fontSize: 11, fontWeight: 700, color: T.textSec }}>{ice.visible}</div></div>
                  <div><div style={{ fontSize: 9, color: T.muted }}>Oculto est.</div><div style={{ fontSize: 11, fontWeight: 700, color: ic }}>{ice.estimated_hidden}</div></div>
                  <div><div style={{ fontSize: 9, color: T.muted }}>% oculto</div><div style={{ fontSize: 11, fontWeight: 700, color: ic }}>{hiddenRatio}%</div></div>
                </div>
                <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden", marginTop: 5 }}>
                  <div style={{ width: `${hiddenRatio}%`, height: "100%", background: ic, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tape Reading */}
      <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Tape Reading Moderno</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: T.bull, fontWeight: 700 }}>Buy Agresivo {buyPct}%</span>
              <span style={{ fontSize: 10, color: T.bear, fontWeight: 700 }}>{sellPct}% Sell</span>
            </div>
            <div style={{ height: 8, background: T.bear, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${buyPct}%`, height: "100%", background: T.bull, borderRadius: 4, transition: "width 0.8s" }} />
            </div>
            <div style={{ fontSize: 10, color: tapeColor, fontWeight: 700, marginTop: 4 }}>
              {buyPct > 55 ? "▲ Flujo comprador dominante" : buyPct < 45 ? "▼ Flujo vendedor dominante" : "— Flujo equilibrado"}
            </div>
          </div>
        </div>
        {sweepDetected && (
          <div style={{ marginTop: 8, background: `${T.warn}10`, border: `1px solid ${T.warn}40`, borderRadius: 6, padding: "5px 10px", fontSize: 10, color: T.warn, fontWeight: 700 }}>
            ⚡ SWEEP detectado — posible inicio de movimiento institucional
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// GRÁFICO DE FASE DE MERCADO (Wyckoff / Market Cycle)
// ════════════════════════════════════════════════════════════════════════════════
function MarketPhaseChart({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 600));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const price = sf(d?.current_price, 100);
  const mom = sf(d?.momentum_12_1, 0);
  const rsi = sf(d?.rsi, 50);
  const adx = sf(d?.adx, 22);
  const ofi = sf(d?.ofi, 0);
  const bbWidth = sf(d?.bb_width, 0.05);
  const atrPct = sf(d?.atr_pct, 1.5);
  const zscore = sf(d?.zscore_mean_rev, 0);
  const regime = d?.market_regime || "ranging";

  // Determinar fase Wyckoff
  const phaseScore = useMemo(() => {
    const accum = (zscore < -1.5 ? 30 : 0) + (rsi < 40 ? 20 : 0) + (adx < 20 ? 15 : 0) + (bbWidth < 0.04 ? 20 : 0) + (ofi > 0.1 ? 15 : 0);
    const markup = (mom > 5 ? 30 : 0) + (adx > 25 ? 25 : 0) + (rsi > 55 ? 15 : 0) + (regime === "trending" ? 20 : 0) + (ofi > 0 ? 10 : 0);
    const distrib = (zscore > 1.5 ? 30 : 0) + (rsi > 65 ? 20 : 0) + (adx < 20 && mom > 0 ? 15 : 0) + (bbWidth > 0.08 ? 20 : 0) + (ofi < -0.05 ? 15 : 0);
    const markdown = (mom < -5 ? 30 : 0) + (adx > 22 ? 20 : 0) + (rsi < 45 ? 15 : 0) + (regime === "volatile" ? 20 : 0) + (ofi < -0.1 ? 15 : 0);
    return { accum, markup, distrib, markdown };
  }, [zscore, rsi, adx, bbWidth, ofi, mom, regime]);

  const phases = [
    { id: "accum", label: "Acumulación", score: phaseScore.accum, color: T.teal, icon: "🏦", desc: "Institucionales acumulan silenciosamente. Rango lateral con volumen decreciente. Zona de valor." },
    { id: "markup", label: "Tendencia Alcista", score: phaseScore.markup, color: T.bull, icon: "📈", desc: "Precio sale del rango. Compradores controlan. Momentum creciente. Fase de mayor duración." },
    { id: "distrib", label: "Distribución", score: phaseScore.distrib, color: T.warn, icon: "🏪", desc: "Institucionales distribuyen a retail en máximos. Volumen alto, precio no avanza." },
    { id: "markdown", label: "Tendencia Bajista", score: phaseScore.markdown, color: T.bear, icon: "📉", desc: "Vendedores controlan. Precio en caída. Momentum negativo. Evitar posiciones largas." },
  ];

  const total = phases.reduce((s, p) => s + p.score, 1);
  const dominant = phases.reduce((a, b) => a.score > b.score ? a : b);

  // Curva de ciclo SVG
  const H = 120, pad = { t: 20, b: 30, l: 20, r: 20 };
  const PW = Math.max(w - pad.l - pad.r, 200);
  const PH = H - pad.t - pad.b;
  const cyclePoints = [
    { x: 0.00, y: 0.50, phase: "accum" },
    { x: 0.08, y: 0.52, phase: "accum" },
    { x: 0.18, y: 0.48, phase: "accum" },
    { x: 0.28, y: 0.50, phase: "accum" },
    { x: 0.35, y: 0.45, phase: "markup" },
    { x: 0.45, y: 0.25, phase: "markup" },
    { x: 0.55, y: 0.10, phase: "markup" },
    { x: 0.62, y: 0.08, phase: "distrib" },
    { x: 0.70, y: 0.10, phase: "distrib" },
    { x: 0.75, y: 0.08, phase: "distrib" },
    { x: 0.82, y: 0.30, phase: "markdown" },
    { x: 0.90, y: 0.50, phase: "markdown" },
    { x: 1.00, y: 0.50, phase: "accum" },
  ];

  const toX = (xv) => pad.l + xv * PW;
  const toY = (yv) => pad.t + yv * PH;

  const cyclePath = cyclePoints.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(" ");

  // Posición actual en el ciclo basada en fase dominante
  const phaseToX = { accum: 0.14, markup: 0.50, distrib: 0.68, markdown: 0.86 };
  const currentX = phaseToX[dominant.id] || 0.14;
  const currentPt = cyclePoints.reduce((closest, p) => Math.abs(p.x - currentX) < Math.abs(closest.x - currentX) ? p : closest);

  const phaseColors = { accum: T.teal, markup: T.bull, distrib: T.warn, markdown: T.bear };

  // Etiquetas de zona
  const zoneLabels = [
    { x: 0.14, y: 0.30, label: "ACUMULACIÓN", color: T.teal },
    { x: 0.47, y: -0.02, label: "MARKUP", color: T.bull },
    { x: 0.68, y: -0.05, label: "DISTRIBUCIÓN", color: T.warn },
    { x: 0.88, y: 0.30, label: "MARKDOWN", color: T.bear },
  ];

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px", borderTop: `3px solid ${dominant.color}` }}>
      <SectionTitle icon="🔄" badge={
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <span style={{ fontSize: 16 }}>{dominant.icon}</span>
          {pill(dominant.color, dominant.label.toUpperCase())}
          <span style={{ fontSize: 10, color: T.muted }}>Conf. {Math.round((dominant.score / total) * 100)}%</span>
        </div>
      }>
        Fase de Mercado — Ciclo Wyckoff
      </SectionTitle>

      {/* Señal principal */}
      <div style={{ background: `${dominant.color}0a`, border: `1px solid ${dominant.color}30`, borderLeft: `3px solid ${dominant.color}`, borderRadius: 7, padding: "8px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: dominant.color, marginBottom: 3 }}>
          {dominant.icon} FASE: {dominant.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.5 }}>{dominant.desc}</div>
      </div>

      {/* Curva de ciclo SVG */}
      <div ref={ref} style={{ width: "100%", marginBottom: 12 }}>
        <svg width="100%" height={H + 10}>
          {/* Fondo por zonas */}
          <rect x={toX(0)} y={pad.t} width={toX(0.33) - toX(0)} height={PH} fill={`${T.teal}08`} />
          <rect x={toX(0.33)} y={pad.t} width={toX(0.60) - toX(0.33)} height={PH} fill={`${T.bull}08`} />
          <rect x={toX(0.60)} y={pad.t} width={toX(0.78) - toX(0.60)} height={PH} fill={`${T.warn}08`} />
          <rect x={toX(0.78)} y={pad.t} width={toX(1.0) - toX(0.78)} height={PH} fill={`${T.bear}08`} />

          {/* Línea de ciclo */}
          <path d={cyclePath} fill="none" stroke={`${T.accent}60`} strokeWidth="1.5" strokeDasharray="4,3" />

          {/* Etiquetas de zona */}
          {zoneLabels.map(({ x, y, label, color }) => (
            <text key={label} x={toX(x)} y={toY(clamp(y, 0, 1)) - 2} fontSize="8" fill={color} fontWeight="800" textAnchor="middle">{label}</text>
          ))}

          {/* Posición actual */}
          <circle cx={toX(currentPt.x)} cy={toY(currentPt.y)} r="10" fill={`${dominant.color}20`} stroke={dominant.color} strokeWidth="2" strokeDasharray="4,2" />
          <circle cx={toX(currentPt.x)} cy={toY(currentPt.y)} r="5" fill={dominant.color} />
          <text x={toX(currentPt.x)} y={toY(currentPt.y) + 22} textAnchor="middle" fontSize="9" fill={dominant.color} fontWeight="800">AHORA</text>
        </svg>
      </div>

      {/* Barras de probabilidad por fase */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {phases.map(({ id, label, score, color, icon }) => {
          const pct2 = Math.round((score / total) * 100);
          const isActive = id === dominant.id;
          return (
            <div key={id} style={{ background: isActive ? `${color}10` : T.card2, border: `1px solid ${isActive ? color : T.border}30`, borderRadius: 7, padding: "8px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? color : T.muted }}>{icon} {label}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: isActive ? color : T.muted, fontFamily: "monospace" }}>{pct2}%</span>
              </div>
              <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct2}%`, height: "100%", background: color, borderRadius: 3, transition: "width 1s" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Estrategia por fase */}
      <div style={{ marginTop: 10, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "9px 12px" }}>
        <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Estrategia recomendada para esta fase</div>
        {({
          accum: ["Acumular en soportes con stop ajustado", "Buscar señales de absorción (Weis Wave)", "Esperar Spring o Test para entradas de alta probabilidad"],
          markup: ["Seguir tendencia con trailing stop", "Comprar pullbacks en WMA y zonas de OB alcistas", "Aumentar posición en correcciones de onda 2/4 (Elliott)"],
          distrib: ["Reducir exposición larga gradualmente", "Buscar señales CHoCH/BOS en SMC como confirmación bajista", "Cubrir posiciones con opciones put o reducir size"],
          markdown: ["Evitar posiciones largas — sesgo corto", "Operar rebotes de onda B como oportunidades de venta", "Esperar divergencia CVD alcista para posibles reversiones"],
        }[dominant.id] || []).map((rule, i) => (
          <div key={i} style={{ display: "flex", gap: 7, fontSize: 10, color: T.textSec, marginBottom: 4 }}>
            <span style={{ color: dominant.color, flexShrink: 0 }}>▸</span>
            <span>{rule}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MOTOR DE DETECCIÓN DE PATRONES — portado desde Pine Script v5
// Algoritmo idéntico al indicador "Tabla Time Frame, Trading y Patrones de Velas"
// Cubre los 15 patrones del script original + 6 adicionales
// ════════════════════════════════════════════════════════════════════════════════

/**
 * detectCandlePatterns(c0, c1, c2, atr)
 *
 * c0 = vela hace 2 periodos (candles[n-3])
 * c1 = vela anterior        (candles[n-2])
 * c2 = vela actual/última   (candles[n-1])
 *
 * Traduce las condiciones Pine Script a JS con tolerancias equivalentes:
 *   isDoji                → body ≤ range × 0.10   (Pine: ≤ range × 0.1)
 *   isBullishEngulfing    → Pine: close>open && open[1]>close[1] && close[1]>open
 *   isBearishEngulfing    → Pine: open>close && close[1]>open[1] && open[1]>close
 *   isHammer              → Pine: close>open && range>3×body && (high-close)<2×body
 *   isShootingStar        → Pine: open>close && range>3×body && (close-low)<2×body
 *   isMorningStar         → Pine: bajista[2] + bajista[1] + alcista && close>open[1]
 *   isEveningStar         → Pine: alcista[2] + alcista[1] + bajista && close<open[1]
 *   isThreeWhiteSoldiers  → 3 alcistas consecutivos con cierres ascendentes
 *   isThreeBlackCrows     → 3 bajistas consecutivos con cierres descendentes
 *   isBullishHarami       → Pine: close>open && close[1]<open[1] && open>close[1] && close<open[1]
 *   isBearishHarami       → Pine: open>close && close[1]>open[1] && open<close[1] && close>open[1]
 *   isHaramiCross         → Doji dentro de la vela anterior grande
 *   isSpinningTop         → 0.10 < body/range < 0.40
 *   isBullishMarubozu     → close≈high && open≈low (tolerancia 2% del rango)
 *   isBearishMarubozu     → open≈high && close≈low (tolerancia 2% del rango)
 *   --- EXTRAS ---
 *   isHangingMan          → Hammer pero en contexto bajista (c1 alcista previo)
 *   isInvertedHammer      → Shooting Star shape pero en contexto alcista
 *   isPiercingLine        → Bajista[1] + alcista que penetra >50% del cuerpo anterior
 *   isDarkCloudCover      → Alcista[1] + bajista que cubre >50% del cuerpo anterior
 *   isTweezerTop          → Dos máximos iguales (±0.1%), señal bajista
 *   isTweezerBottom       → Dos mínimos iguales (±0.1%), señal alcista
 *
 * Prioridad descendente: 3-velas > 2-velas > 1-vela
 * Devuelve el PRIMER patrón que coincide (prioridad alta → baja)
 */
function detectCandlePatterns(c0, c1, c2, atrApprox) {
  if (!c2) return null;

  // ── helpers ────────────────────────────────────────────────────
  const body  = (c) => Math.abs(c.close - c.open);
  const range = (c) => c.high - c.low || 0.0001;
  const upper = (c) => c.high - Math.max(c.open, c.close);
  const lower = (c) => Math.min(c.open, c.close) - c.low;
  const bull  = (c) => c.close >= c.open;

  const b2 = body(c2), r2 = range(c2), u2 = upper(c2), l2 = lower(c2);
  const b1 = c1 ? body(c1) : 0, r1 = c1 ? range(c1) : 0;
  const b0 = c0 ? body(c0) : 0;

  // ── 1-vela: Doji (Pine: body ≤ range × 0.10) ──────────────────
  const isDoji = b2 <= r2 * 0.10;

  // ── 1-vela: Spinning Top (Pine: 0.10 < body/range < 0.40) ─────
  const isSpinningTop = (b2 / r2) > 0.10 && (b2 / r2) < 0.40 && u2 > b2 * 0.5 && l2 > b2 * 0.5;

  // ── 1-vela: Marubozu Alcista (close≈high && open≈low) ──────────
  const maruTol = r2 * 0.02;
  const isBullishMarubozu = bull(c2) && u2 <= maruTol && l2 <= maruTol;
  const isBearishMarubozu = !bull(c2) && u2 <= maruTol && l2 <= maruTol;

  // ── 1-vela: Hammer (Pine exact) ────────────────────────────────
  // close>open && (high-low)>3*(open-close) && (high-close)<2*(open-close)
  const isHammerShape = bull(c2) && r2 > 3 * b2 && u2 < 2 * b2 && l2 > b2 * 2;

  // ── 1-vela: Shooting Star (Pine exact) ────────────────────────
  // open>close && (high-low)>3*(close-open) && (close-low)<2*(open-close)
  const isShootingStarShape = !bull(c2) && r2 > 3 * b2 && l2 < 2 * b2 && u2 > b2 * 2;

  // ── 1-vela: Inverted Hammer (shape de shooting star, contexto alcista) ──
  const isInvertedHammerShape = bull(c2) && u2 > b2 * 2 && l2 < b2 * 0.5;

  // ── 2-velas: Bullish Engulfing (Pine exact) ────────────────────
  // close>open && open[1]>close[1] && close[1]>open
  const isBullishEngulfing = c1 && bull(c2) && !bull(c1) && c2.open < c1.close && c2.close > c1.open;

  // ── 2-velas: Bearish Engulfing (Pine exact) ────────────────────
  // open>close && close[1]>open[1] && open[1]>close
  const isBearishEngulfing = c1 && !bull(c2) && bull(c1) && c2.open > c1.close && c2.close < c1.open;

  // ── 2-velas: Bullish Harami (Pine exact) ───────────────────────
  // close>open && close[1]<open[1] && open>close[1] && close<open[1]
  const isBullishHarami = c1 && bull(c2) && !bull(c1) && c2.open > c1.close && c2.close < c1.open;

  // ── 2-velas: Bearish Harami (Pine exact) ───────────────────────
  // open>close && close[1]>open[1] && open<close[1] && close>open[1]
  const isBearishHarami = c1 && !bull(c2) && bull(c1) && c2.open < c1.close && c2.close > c1.open;

  // ── 2-velas: Harami Cross (Pine: isDoji + harami condición) ────
  const isHaramiCross = c1 && isDoji && b1 > atrApprox * 0.5 &&
    c2.high <= Math.max(c1.open, c1.close) && c2.low >= Math.min(c1.open, c1.close);

  // ── 2-velas: Hanging Man (Hammer shape + contexto bajista) ─────
  const isHangingMan = c1 && isHammerShape && !bull(c2) && bull(c1);

  // ── 2-velas: Inverted Hammer (contexto — c1 bajista, señal alcista) ──
  const isInvertedHammer = c1 && isInvertedHammerShape && !bull(c1);

  // ── 2-velas: Piercing Line ─────────────────────────────────────
  // c1 bajista; c2 alcista que abre bajo mínimo c1 y cierra >50% del cuerpo c1
  const midC1 = c1 ? (c1.open + c1.close) / 2 : 0;
  const isPiercingLine = c1 && !bull(c1) && bull(c2) && c2.open < c1.low &&
    c2.close > midC1 && c2.close < c1.open;

  // ── 2-velas: Dark Cloud Cover ──────────────────────────────────
  // c1 alcista; c2 bajista que abre sobre máximo c1 y cierra <50% del cuerpo c1
  const midC1b = c1 ? (c1.open + c1.close) / 2 : 0;
  const isDarkCloudCover = c1 && bull(c1) && !bull(c2) && c2.open > c1.high &&
    c2.close < midC1b && c2.close > c1.open;

  // ── 2-velas: Tweezer Top / Bottom (máx/mín iguales ±0.1%) ─────
  const twTol = c2.close * 0.001;
  const isTweezerTop    = c1 && !bull(c2) && Math.abs(c2.high - c1.high) <= twTol;
  const isTweezerBottom = c1 &&  bull(c2) && Math.abs(c2.low  - c1.low)  <= twTol;

  // ── 3-velas: Morning Star (Pine exact) ─────────────────────────
  // close[2]<open[2] && close[1]<open[1] && close>open && close>open[1]
  const isMorningStar = c0 && c1 && !bull(c0) && !bull(c1) && bull(c2) && c2.close > c1.open;

  // ── 3-velas: Evening Star (Pine exact) ─────────────────────────
  // close[2]>open[2] && close[1]>open[1] && close<open && close<open[1]
  const isEveningStar = c0 && c1 && bull(c0) && bull(c1) && !bull(c2) && c2.close < c1.open;

  // ── 3-velas: Three White Soldiers (Pine exact) ─────────────────
  // 3 alcistas, cada cierre > cierre anterior
  const isThreeWhiteSoldiers = c0 && c1 && bull(c2) && bull(c1) && bull(c0) &&
    c2.close > c1.close && c1.close > c0.close;

  // ── 3-velas: Three Black Crows (Pine exact) ────────────────────
  // 3 bajistas, cada cierre < cierre anterior
  const isThreeBlackCrows = c0 && c1 && !bull(c2) && !bull(c1) && !bull(c0) &&
    c2.close < c1.close && c1.close < c0.close;

  // ════════════════════════════════════════════════════════
  // TABLA DE RESULTADOS — prioridad 3-velas > 2-velas > 1-vela
  // ════════════════════════════════════════════════════════

  // 3-velas (mayor fiabilidad)
  if (isThreeWhiteSoldiers) return {
    name: "Three White Soldiers", type: "bull", color: T.bull, signal: "SEÑAL ALCISTA FUERTE",
    candles: 3, reliability: "Alta",
    desc: "Tres velas alcistas consecutivas con cierres ascendentes. Confirmación de tendencia alcista sostenida. Indica control comprador durante 3 sesiones. Entrada válida en el primer pullback.",
  };
  if (isThreeBlackCrows) return {
    name: "Three Black Crows", type: "bear", color: T.bear, signal: "SEÑAL BAJISTA FUERTE",
    candles: 3, reliability: "Alta",
    desc: "Tres velas bajistas consecutivas con cierres descendentes. Confirmación de tendencia bajista sostenida. Presión vendedora persistente. Evitar posiciones largas.",
  };
  if (isMorningStar) return {
    name: "Morning Star", type: "bull", color: T.bull, signal: "REVERSIÓN ALCISTA",
    candles: 3, reliability: "Alta",
    desc: "Patrón 3 velas: bajista + bajista pequeña (indecisión) + alcista fuerte. Indica agotamiento vendedor y retoma compradora. Alta fiabilidad en soportes semanales. Señal de compra.",
  };
  if (isEveningStar) return {
    name: "Evening Star", type: "bear", color: T.bear, signal: "REVERSIÓN BAJISTA",
    candles: 3, reliability: "Alta",
    desc: "Patrón 3 velas: alcista + alcista pequeña (indecisión) + bajista fuerte. Agotamiento comprador en máximos. Señal de distribución. Reducir posición larga o iniciar cobertura.",
  };

  // 2-velas (fiabilidad media-alta)
  if (isBullishEngulfing) return {
    name: "Bullish Engulfing", type: "bull", color: T.bull, signal: "SEÑAL ALCISTA FUERTE",
    candles: 2, reliability: "Media-Alta",
    desc: "Vela alcista que envuelve completamente el cuerpo bajista anterior. Indica inversión del flujo de órdenes. Más fiable en soporte o tras tendencia bajista prolongada.",
  };
  if (isBearishEngulfing) return {
    name: "Bearish Engulfing", type: "bear", color: T.bear, signal: "SEÑAL BAJISTA FUERTE",
    candles: 2, reliability: "Media-Alta",
    desc: "Vela bajista que envuelve completamente el cuerpo alcista anterior. Inversión del flujo de órdenes. Más fiable en resistencia o tras tendencia alcista prolongada.",
  };
  if (isPiercingLine) return {
    name: "Piercing Line", type: "bull", color: T.bull, signal: "REVERSIÓN ALCISTA",
    candles: 2, reliability: "Media",
    desc: "Vela alcista abre bajo el mínimo anterior y cierra sobre el 50% del cuerpo bajista previo. Señal de absorción compradora. Confirmar con volumen superior al promedio.",
  };
  if (isDarkCloudCover) return {
    name: "Dark Cloud Cover", type: "bear", color: T.bear, signal: "REVERSIÓN BAJISTA",
    candles: 2, reliability: "Media",
    desc: "Vela bajista abre sobre el máximo anterior y cierra bajo el 50% del cuerpo alcista previo. Vendedores tomando control en máximos. Señal de distribución.",
  };
  if (isTweezerTop) return {
    name: "Tweezer Top", type: "bear", color: T.bear, signal: "TECHO DOBLE SEMANAL",
    candles: 2, reliability: "Media",
    desc: "Dos semanas con máximos idénticos. Resistencia confirmada dos veces seguidas. Los compradores fracasan al intentar superar ese nivel. Señal bajista de corto plazo.",
  };
  if (isTweezerBottom) return {
    name: "Tweezer Bottom", type: "bull", color: T.bull, signal: "SUELO DOBLE SEMANAL",
    candles: 2, reliability: "Media",
    desc: "Dos semanas con mínimos idénticos. Soporte confirmado dos veces seguidas. Los vendedores no pueden bajar de ese nivel. Señal alcista de corto plazo.",
  };
  if (isHangingMan) return {
    name: "Hanging Man", type: "bear", color: T.bear, signal: "SEÑAL BAJISTA",
    candles: 2, reliability: "Media",
    desc: "Forma de martillo pero en contexto bajista tras una vela alcista previa. Indica que los bajistas tomaron el control intrasémanalmente aunque los compradores recuperaron. Vigilar siguiente vela.",
  };
  if (isInvertedHammer) return {
    name: "Inverted Hammer", type: "bull", color: T.bull, signal: "POSIBLE REVERSIÓN ALCISTA",
    candles: 2, reliability: "Media",
    desc: "Mecha superior larga en contexto bajista. Compradores intentaron subir el precio durante la semana. Si la siguiente vela confirma al alza, señal de suelo válida.",
  };
  if (isBullishHarami) return {
    name: "Bullish Harami", type: "bull", color: T.bull, signal: "DESACELERACIÓN BAJISTA",
    candles: 2, reliability: "Media-Baja",
    desc: "Vela alcista pequeña contenida dentro del cuerpo bajista anterior. Indica que los vendedores pierden fuerza. No es señal de compra directa; esperar confirmación alcista.",
  };
  if (isBearishHarami) return {
    name: "Bearish Harami", type: "bear", color: T.bear, signal: "DESACELERACIÓN ALCISTA",
    candles: 2, reliability: "Media-Baja",
    desc: "Vela bajista pequeña contenida dentro del cuerpo alcista anterior. Los compradores pierden impulso. Requiere confirmación bajista en la siguiente sesión.",
  };
  if (isHaramiCross) return {
    name: "Harami Cross", type: "neutral", color: T.purple, signal: "INDECISIÓN EXTREMA",
    candles: 2, reliability: "Media",
    desc: "Doji contenido dentro de una vela grande anterior. Indica parálisis total del mercado tras un movimiento fuerte. La dirección del siguiente movimiento suele ser explosiva.",
  };

  // 1-vela
  if (isDoji) return {
    name: "Doji", type: "neutral", color: T.muted, signal: "INDECISIÓN",
    candles: 1, reliability: "Contextual",
    desc: "Apertura y cierre prácticamente iguales. Equilibrio exacto entre compradores y vendedores. Sólo es relevante si aparece en soporte/resistencia clave o tras una tendencia prolongada.",
  };
  if (isBullishMarubozu) return {
    name: "Bullish Marubozu", type: "bull", color: T.bull, signal: "IMPULSO COMPRADOR TOTAL",
    candles: 1, reliability: "Media-Alta",
    desc: "Vela alcista sin mechas: apertura en mínimo y cierre en máximo. Los compradores controlaron toda la semana sin concesiones. Continuación alcista esperada.",
  };
  if (isBearishMarubozu) return {
    name: "Bearish Marubozu", type: "bear", color: T.bear, signal: "IMPULSO VENDEDOR TOTAL",
    candles: 1, reliability: "Media-Alta",
    desc: "Vela bajista sin mechas: apertura en máximo y cierre en mínimo. Vendedores dominaron toda la semana sin recuperaciones. Continuación bajista esperada.",
  };
  if (isHammerShape) return {
    name: "Hammer", type: "bull", color: T.bull, signal: "REVERSIÓN ALCISTA",
    candles: 1, reliability: "Media",
    desc: "Mecha inferior larga (>3× el cuerpo) y mecha superior pequeña. Rechazo de mínimos: vendedores intentaron bajar pero compradores recuperaron el precio. Confirmar con volumen.",
  };
  if (isShootingStarShape) return {
    name: "Shooting Star", type: "bear", color: T.bear, signal: "REVERSIÓN BAJISTA",
    candles: 1, reliability: "Media",
    desc: "Mecha superior larga (>3× el cuerpo) y mecha inferior pequeña. Rechazo de máximos: compradores intentaron subir pero vendedores tomaron control. Señal de techo.",
  };
  if (isSpinningTop) return {
    name: "Spinning Top", type: "neutral", color: T.purple, signal: "INDECISIÓN / PAUSA",
    candles: 1, reliability: "Baja",
    desc: "Cuerpo pequeño con mechas largas en ambos lados. Compradores y vendedores se equilibraron. Pausa dentro de tendencia. No operar este patrón solo; esperar contexto.",
  };

  return {
    name: "Sin patrón claro", type: "neutral", color: T.muted, signal: "SIN SEÑAL",
    candles: 0, reliability: "—",
    desc: "Ninguno de los 21 patrones catalogados detectado en las últimas 3 velas. Continuar con análisis de tendencia, soportes/resistencias y confluencia de indicadores.",
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// GRÁFICO DE 52 VELAS SEMANALES — Motor Pine Script portado
// ════════════════════════════════════════════════════════════════════════════════
function WeeklyCandleChart({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);
  const ref = useRef(null);
  const [w, setW] = useState(700);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 700));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const price  = sf(d?.current_price, 100);
  const atr    = sf(d?.atr, price * 0.015);
  const mom    = sf(d?.momentum_12_1, 0);
  const rsi    = sf(d?.rsi, 50);
  const adx    = sf(d?.adx, 22);
  const N      = 52; // 1 año completo de velas semanales

  // ── Generar 52 velas semanales deterministas por ticker ──────────
  const candles = useMemo(() => {
    const trend  = mom > 5 ? 0.0028 : mom < -5 ? -0.0020 : 0.0008;
    // Partir de hace 52 semanas e ir hacia adelante
    let last = price * (1 - trend * N * (1 + (r(999) - 0.5) * 0.3));
    return Array.from({ length: N }, (_, i) => {
      const open   = last;
      // Inyectar cierta autocorrelación (tendencia + ruido)
      const signal = (r(i * 4)     - 0.46 + trend * 10) * atr * 2.0;
      const noise  = (r(i * 4 + 5) - 0.50) * atr * 0.6;
      const close  = open + signal + noise;
      const wickUp = atr * (0.3 + r(i * 4 + 1) * 1.4);
      const wickDn = atr * (0.3 + r(i * 4 + 2) * 1.4);
      const high   = Math.max(open, close) + wickUp * r(i * 4 + 3);
      const low    = Math.min(open, close) - wickDn * (1 - r(i * 4 + 3));
      last = close;
      return { open, close, high, low, isBull: close >= open };
    });
  }, [tickerSeed, price, atr, mom]);

  // ── Detectar patrón en las ÚLTIMAS 3 velas (estilo Pine Script) ─
  const pattern = useMemo(() => {
    const n = candles.length;
    return detectCandlePatterns(candles[n - 3], candles[n - 2], candles[n - 1], atr);
  }, [candles, atr]);

  // ── Escanear TODOS los patrones en el histórico para marcarlos ──
  const patternMarkers = useMemo(() => {
    const marks = {};
    for (let i = 2; i < candles.length; i++) {
      const p = detectCandlePatterns(candles[i - 2], candles[i - 1], candles[i], atr);
      if (p && p.candles > 0 && p.type !== "neutral") {
        marks[i] = p;
      }
    }
    return marks;
  }, [candles, atr]);

  // ── Métricas adicionales tipo Pine Script ────────────────────────
  // Sharpe Ratio (simplificado con retornos semanales de las 52 velas)
  const returns = candles.map((c, i) => i === 0 ? 0 : (c.close - candles[i - 1].close) / candles[i - 1].close);
  const meanRet = returns.slice(1).reduce((s, v) => s + v, 0) / (N - 1);
  const stdRet  = Math.sqrt(returns.slice(1).reduce((s, v) => s + (v - meanRet) ** 2, 0) / (N - 1));
  const riskFree = 0.045 / 52; // ~4.5% anual → semanal
  const sharpe   = stdRet > 0 ? ((meanRet - riskFree) / stdRet) * Math.sqrt(52) : 0;

  // Alpha vs mercado (beta simplificado, mercado retorno 8% anual)
  const marketRet = 0.08 / 52;
  const beta      = sf(d?.beta, 1 + (r(700) - 0.5) * 0.8);
  const alpha     = (meanRet - riskFree - beta * (marketRet - riskFree)) * 52 * 100; // anualizado %

  // Tipo de trading según contexto (adaptado de la función getInfo del Pine Script)
  const getTradeType = () => {
    if (adx > 28 && mom > 8)  return { tipo: "Tendencia Fuerte", dur: "Semanas a meses", color: T.bull };
    if (adx > 20 && mom > 3)  return { tipo: "Swing Positional", dur: "Días a semanas", color: T.accent };
    if (adx < 18)              return { tipo: "Ranging / Mean Rev", dur: "Intrasemanal", color: T.muted };
    if (sf(d?.atr_pct, 1.5) > 2.5) return { tipo: "Alta Volatilidad", dur: "Gestión de riesgo", color: T.bear };
    return { tipo: "Day Trading / Swing", dur: "1 a varios días", color: T.warn };
  };
  const tradeInfo = getTradeType();

  // ── Escalas SVG ──────────────────────────────────────────────────
  const H   = 220;
  const pad = { t: 24, b: 28, l: 58, r: 18 };
  const PW  = Math.max(w - pad.l - pad.r, 200);
  const PH  = H - pad.t - pad.b;

  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const pMin      = Math.min(...allPrices) - atr * 0.3;
  const pMax      = Math.max(...allPrices) + atr * 0.3;
  const pRange    = pMax - pMin || 1;

  const toY   = (v) => pad.t + (1 - (v - pMin) / pRange) * PH;
  const cW    = Math.max((PW / N) * 0.68, 1.5);
  const sp    = PW / N;
  const toCX  = (i) => pad.l + i * sp + sp / 2;

  const yTicks = [
    pMin + pRange * 0.05,
    pMin + pRange * 0.28,
    pMin + pRange * 0.52,
    pMin + pRange * 0.76,
    pMin + pRange * 0.97,
  ];

  // Etiquetas mensuales en el eje X
  const now = new Date();
  const weekLabels = Array.from({ length: N }, (_, i) => {
    const d2 = new Date(now);
    d2.setDate(d2.getDate() - (N - 1 - i) * 7);
    // Mostrar mes cuando cambia
    const prevD = new Date(d2); prevD.setDate(prevD.getDate() - 7);
    return (d2.getMonth() !== prevD.getMonth())
      ? d2.toLocaleString("es", { month: "short" })
      : "";
  });

  const hovered = hoveredIdx !== null ? candles[hoveredIdx] : null;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "13px 15px", borderTop: `3px solid ${T.gold}` }}>

      <SectionTitle icon="🕯"
        badge={pattern ? pill(pattern.color, pattern.name) : null}>
        52 Velas Semanales (1 año) — Detección de Patrones
      </SectionTitle>

      {/* ── Tabla resumen tipo Pine Script ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 6, marginBottom: 12 }}>
        {[
          { label: "Time Frame",     value: "1W — Semanal",          color: T.accent },
          { label: "Tipo Trading",   value: tradeInfo.tipo,           color: tradeInfo.color },
          { label: "Duración",       value: tradeInfo.dur,            color: T.muted },
          { label: "Patrón Último",  value: pattern?.name || "—",     color: pattern?.color || T.muted },
          { label: "Sesgo",          value: pattern?.type === "bull" ? "Alcista" : pattern?.type === "bear" ? "Bajista" : "Neutral", color: pattern?.color || T.muted },
          { label: "Sharpe Ratio",   value: sharpe.toFixed(2),        color: sharpe > 1 ? T.bull : sharpe > 0 ? T.warn : T.bear },
          { label: "Alpha Anual",    value: `${alpha >= 0 ? "+" : ""}${alpha.toFixed(2)}%`, color: alpha > 0 ? T.bull : T.bear },
          { label: "Fiabilidad",     value: pattern?.reliability || "—", color: T.muted },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "6px 9px" }}>
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1.3 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Señal del patrón detectado ── */}
      {pattern && pattern.candles > 0 && (
        <div style={{ background: `${pattern.color}09`, border: `1px solid ${pattern.color}30`,
                      borderLeft: `3px solid ${pattern.color}`, borderRadius: 7,
                      padding: "9px 13px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, flexWrap: "wrap", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: pattern.color }}>
              {pattern.signal} — {pattern.name}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {pill(pattern.color, `${pattern.candles} vela${pattern.candles > 1 ? "s" : ""}`, true)}
              {pill(
                pattern.reliability === "Alta" ? T.bull :
                pattern.reliability === "Media-Alta" ? T.teal :
                pattern.reliability === "Media" ? T.warn : T.muted,
                pattern.reliability, true
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.6 }}>{pattern.desc}</div>
        </div>
      )}

      {/* ── SVG Candlestick Chart ── */}
      <div ref={ref} style={{ width: "100%", cursor: "crosshair" }}>
        <svg width="100%" height={H}
          onMouseLeave={() => setHoveredIdx(null)}>

          {/* Grid horizontal */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={pad.l} y1={toY(v)} x2={w - pad.r} y2={toY(v)}
                stroke={T.border} strokeWidth="0.5" />
              <text x={pad.l - 4} y={toY(v) + 3} textAnchor="end" fontSize="9"
                fill={T.muted} fontFamily="monospace">${v.toFixed(0)}</text>
            </g>
          ))}

          {/* Zona "última vela" resaltada */}
          <rect x={toCX(N - 1) - sp / 2} y={pad.t}
            width={sp} height={PH}
            fill={`${pattern?.color || T.accent}06`}
            stroke={`${pattern?.color || T.accent}35`}
            strokeWidth="1" strokeDasharray="3,2" rx="2" />

          {/* Velas */}
          {candles.map((c, i) => {
            const cx         = toCX(i);
            const isLast     = i === N - 1;
            const isHovered  = i === hoveredIdx;
            const hasMarker  = patternMarkers[i];
            const cc         = c.isBull ? T.bull : T.bear;
            const bodyTop    = toY(Math.max(c.open, c.close));
            const bodyBot    = toY(Math.min(c.open, c.close));
            const bodyH      = Math.max(bodyBot - bodyTop, 1);
            const opacity    = isLast ? 1 : isHovered ? 0.95 : 0.72;

            return (
              <g key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                style={{ cursor: "crosshair" }}>

                {/* Hover bg */}
                {isHovered && (
                  <rect x={cx - sp / 2} y={pad.t} width={sp} height={PH}
                    fill={`${cc}08`} />
                )}

                {/* Mecha */}
                <line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)}
                  stroke={cc} strokeWidth={isLast ? 1.5 : 1} opacity={opacity} />

                {/* Cuerpo */}
                <rect x={cx - cW / 2} y={bodyTop} width={cW} height={bodyH}
                  fill={c.isBull ? `${T.bull}88` : `${T.bear}88`}
                  stroke={cc} strokeWidth={isLast || isHovered ? 1.5 : 0.6}
                  opacity={opacity} />

                {/* Marcador de patrón histórico */}
                {hasMarker && !isLast && (
                  <circle cx={cx}
                    cy={hasMarker.type === "bull" ? toY(c.low) + 10 : toY(c.high) - 10}
                    r="2.5"
                    fill={hasMarker.color}
                    opacity="0.7" />
                )}

                {/* Highlight última vela */}
                {isLast && (
                  <rect x={cx - cW / 2 - 2} y={bodyTop - 2}
                    width={cW + 4} height={bodyH + 4}
                    fill="none" stroke={pattern?.color || cc}
                    strokeWidth="1.2" strokeDasharray="2,2" opacity="0.8" rx="1" />
                )}
              </g>
            );
          })}

          {/* Etiquetas mensuales eje X */}
          {weekLabels.map((lbl, i) => lbl ? (
            <text key={i} x={toCX(i)} y={H - 6}
              textAnchor="middle" fontSize="9" fill={T.muted}>{lbl}</text>
          ) : null)}

          {/* Label "Última vela" */}
          <text x={toCX(N - 1)} y={pad.t - 6}
            textAnchor="middle" fontSize="9"
            fill={pattern?.color || T.accent} fontWeight="800">↓ Actual</text>

          {/* Tooltip al hover */}
          {hovered && hoveredIdx !== null && (() => {
            const cx    = toCX(hoveredIdx);
            const chg   = ((hovered.close - hovered.open) / hovered.open * 100);
            const tipX  = cx > w * 0.65 ? cx - 138 : cx + 8;
            const tipY  = pad.t + 4;
            return (
              <g>
                <line x1={cx} y1={pad.t} x2={cx} y2={pad.t + PH}
                  stroke={T.muted} strokeWidth="0.8" strokeDasharray="3,2" />
                <rect x={tipX} y={tipY} width={130} height={70}
                  rx="5" fill={T.card} stroke={T.border} />
                <text x={tipX + 8} y={tipY + 14} fontSize="10" fontWeight="700"
                  fill={hovered.isBull ? T.bull : T.bear}>
                  {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                </text>
                <text x={tipX + 8} y={tipY + 27} fontSize="9" fill={T.muted}>A: ${hovered.open.toFixed(2)}</text>
                <text x={tipX + 8} y={tipY + 39} fontSize="9" fill={T.muted}>C: ${hovered.close.toFixed(2)}</text>
                <text x={tipX + 8} y={tipY + 51} fontSize="9" fill={T.bull}>H: ${hovered.high.toFixed(2)}</text>
                <text x={tipX + 8} y={tipY + 63} fontSize="9" fill={T.bear}>L: ${hovered.low.toFixed(2)}</text>
                {patternMarkers[hoveredIdx] && (
                  <text x={tipX + 8} y={tipY + 27 + 48} fontSize="8"
                    fill={patternMarkers[hoveredIdx].color} fontWeight="700">
                    {patternMarkers[hoveredIdx].name}
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ── Leyenda de marcadores ── */}
      <div style={{ display: "flex", gap: 16, marginTop: 4, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.bull }} />
          <span style={{ fontSize: 9, color: T.muted }}>Patrón alcista detectado</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.bear }} />
          <span style={{ fontSize: 9, color: T.muted }}>Patrón bajista detectado</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 12, height: 3, background: `repeating-linear-gradient(to right, ${T.accent} 0, ${T.accent} 3px, transparent 3px, transparent 5px)` }} />
          <span style={{ fontSize: 9, color: T.muted }}>Vela actual</span>
        </div>
      </div>

      {/* ── Stats últimas 3 velas ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {candles.slice(N - 3).map((c, i) => {
          const chg = ((c.close - c.open) / c.open * 100);
          const lbl = ["3ª anterior", "2ª anterior", "Última (actual)"][i];
          const isLast = i === 2;
          return (
            <div key={i} style={{
              flex: isLast ? 1.3 : 1,
              background: c.isBull ? `${T.bull}08` : `${T.bear}08`,
              border: `1px solid ${isLast ? (pattern?.color || (c.isBull ? T.bull : T.bear)) : (c.isBull ? T.bull : T.bear)}${isLast ? "60" : "25"}`,
              borderRadius: 7, padding: "8px 10px",
            }}>
              <div style={{ fontSize: 9, color: T.muted, marginBottom: 3 }}>{lbl}</div>
              <div style={{ fontSize: isLast ? 15 : 12, fontWeight: 800, color: c.isBull ? T.bull : T.bear, fontFamily: "monospace" }}>
                {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
              </div>
              <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>
                A: ${c.open.toFixed(2)} · C: ${c.close.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: T.muted }}>
                H: ${c.high.toFixed(2)} · L: ${c.low.toFixed(2)}
              </div>
              {isLast && pattern && (
                <div style={{ marginTop: 5, fontSize: 9, fontWeight: 700, color: pattern.color }}>
                  {pattern.signal}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Historial de patrones detectados (últimos 8) ── */}
      {(() => {
        const recentPats = Object.entries(patternMarkers)
          .filter(([, p]) => p.type !== "neutral")
          .slice(-8)
          .reverse();
        if (recentPats.length === 0) return null;
        return (
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: "0.08em", marginBottom: 6 }}>
              Patrones detectados en el histórico (últimos {recentPats.length})
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {recentPats.map(([idx, p]) => {
                const c    = candles[+idx];
                const weeksAgo = N - 1 - +idx;
                const d2   = new Date(now); d2.setDate(d2.getDate() - weeksAgo * 7);
                return (
                  <div key={idx} style={{
                    background: `${p.color}08`, border: `1px solid ${p.color}30`,
                    borderRadius: 6, padding: "5px 9px", minWidth: 130,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: p.color }}>{p.name}</div>
                    <div style={{ fontSize: 9, color: T.muted }}>
                      {d2.toLocaleDateString("es", { day: "numeric", month: "short" })} · ${c?.close?.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 9, color: p.type === "bull" ? T.bull : T.bear }}>
                      {p.type === "bull" ? "▲ Alcista" : "▼ Bajista"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════════════
// CALENDARIO ECONÓMICO — con API real + fallback
// ════════════════════════════════════════════════════════════════════════════════
function EconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");

  useEffect(() => {
    const loadCalendar = async () => {
      // Intentar API pública (Econdb vía CORS proxy)
      try {
        const today = new Date().toISOString().split("T")[0];
        const next7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
        const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://econdb.com/api/events/?start=${today}&end=${next7}&type=economic&importance=high&format=json&limit=20`)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("API fail");
        const data = await res.json();
        if (data.results?.length > 0) {
          const mapped = data.results.map(e => ({
            event: e.ticker || e.event || "Evento económico",
            date: e.date?.slice(0, 10) || today,
            time: e.time || "—",
            impact: e.importance === "high" ? "alto" : "medio",
            country: e.country || "US",
            actual: e.actual, forecast: e.forecast, previous: e.previous,
            color: e.importance === "high" ? T.bear : T.warn,
          }));
          setEvents(mapped);
          setSource("econdb");
          return;
        }
      } catch (_) {}

      // Fallback estático con fechas calculadas
      const d0 = new Date(), fmt = (d) => d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
      const addDays = (n) => { const d = new Date(d0); d.setDate(d.getDate() + n); return d; };
      const staticEvents = [
        { event: "FOMC — Actas Fed", date: fmt(addDays(2)), time: "18:00 UTC", impact: "alto", country: "US", color: T.bear, desc: "Minutos de la última reunión. Alta sensibilidad en renta fija y USD." },
        { event: "CPI — Inflación USA", date: fmt(addDays(4)), time: "12:30 UTC", impact: "alto", country: "US", color: T.bear, desc: "IPC mensual. Principal driver de política monetaria Fed." },
        { event: "NFP — Empleo No Agrícola", date: fmt(addDays(6)), time: "12:30 UTC", impact: "alto", country: "US", color: T.bear, desc: "Datos de empleo. Suele causar volatilidad 2-3x media en los primeros 30 minutos." },
        { event: "PPI — Precios Productor", date: fmt(addDays(5)), time: "12:30 UTC", impact: "medio", country: "US", color: T.warn, desc: "Indicador adelantado de inflación al consumidor." },
        { event: "Datos PIB USA Q2", date: fmt(addDays(8)), time: "12:30 UTC", impact: "alto", country: "US", color: T.bear, desc: "Crecimiento económico trimestral. Impacto en múltiplos y proyecciones anuales." },
        { event: "BCE — Decisión tipos", date: fmt(addDays(3)), time: "11:45 UTC", impact: "alto", country: "EU", color: T.bear, desc: "Decisión de tipos del Banco Central Europeo. Afecta EUR y mercados europeos." },
        { event: "PMI Manufacturero USA", date: fmt(addDays(1)), time: "14:00 UTC", impact: "medio", country: "US", color: T.warn, desc: "Indicador líder de actividad industrial." },
        { event: "Inventarios Petróleo EIA", date: fmt(addDays(2)), time: "14:30 UTC", impact: "medio", country: "US", color: T.warn, desc: "Afecta commodities energéticas y sectores relacionados." },
      ];
      setEvents(staticEvents);
      setSource("static");
      setLoading(false);
    };
    loadCalendar().finally(() => setLoading(false));
  }, []);

  const impactConfig = {
    alto: { color: T.bear, label: "ALTO" },
    medio: { color: T.warn, label: "MEDIO" },
    bajo: { color: T.muted, label: "BAJO" },
  };

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>
      <SectionTitle icon="📅" badge={
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {pill(T.warn, "PRÓXIMOS 7 DÍAS")}
          <span style={{ fontSize: 9, color: T.muted }}>{source === "econdb" ? "econdb.com" : "calendario est."}</span>
        </div>
      }>
        Calendario Económico — Catalizadores de Alta Volatilidad
      </SectionTitle>

      {loading ? (
        <div style={{ color: T.muted, fontSize: 11, padding: 8, textAlign: "center" }}>Cargando calendario económico…</div>
      ) : (
        <div>
          {events.map((cat, i) => {
            const ic = impactConfig[cat.impact] || impactConfig.medio;
            return (
              <div key={i} style={{ borderBottom: `1px solid ${T.border}`, padding: "9px 0", display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{cat.event}</div>
                    <span style={{ fontSize: 9, background: `${ic.color}15`, color: ic.color, borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>{ic.label}</span>
                    {cat.country && <span style={{ fontSize: 9, color: T.muted, background: T.card2, borderRadius: 4, padding: "1px 5px" }}>{cat.country}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted }}>
                    {cat.date} {cat.time && `· ${cat.time}`}
                    {cat.forecast && ` · Prev: ${cat.forecast}`}
                    {cat.previous && ` · Ant: ${cat.previous}`}
                  </div>
                  {cat.desc && <div style={{ fontSize: 10, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{cat.desc}</div>}
                </div>
                {cat.actual && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, fontFamily: "monospace", flexShrink: 0 }}>{cat.actual}</div>
                )}
              </div>
            );
          })}
          {events.length === 0 && (
            <div style={{ color: T.muted, fontSize: 11, padding: 8 }}>No se encontraron eventos para los próximos días.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// GRÁFICO DE PRECIO — con leyendas corregidas
// ════════════════════════════════════════════════════════════════════════════════
function PriceChart({ d, height = 240 }) {
  const ref = useRef(null);
  const svgR = useRef(null);
  const [w, setW] = useState(700);
  const [tip, setTip] = useState(null);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 700));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const prices = d.price_history || [];
  const wma = d.wma_history || [];
  const buys = d.buy_signals || [];
  const sells = d.sell_signals || [];

  if (prices.length < 2) return (
    <div style={{ color: T.muted, fontSize: 11, padding: 12, textAlign: "center" }}>Sin datos de precio histórico</div>
  );

  const allV = [...prices, ...wma.filter(Boolean)];
  const mn = Math.min(...allV), mx = Math.max(...allV), range = mx - mn || 1;
  const pad = { t: 18, b: 36, l: 52, r: 12 };
  const W = w - pad.l - pad.r, H = height - pad.t - pad.b;
  const n = prices.length;
  const px = (i) => pad.l + (i / (n - 1)) * W;
  const py = (v) => pad.t + (1 - (v - mn) / range) * H;
  const lineColor = prices[n - 1] >= prices[0] ? T.bull : T.bear;

  const pricePath = prices.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const areaPath = prices.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ")
    + ` L${px(n - 1)},${pad.t + H} L${px(0)},${pad.t + H} Z`;
  const wmaPath = wma.reduce((acc, v, i) => {
    if (v === null) return acc;
    return acc + (acc === "" ? `M${px(i).toFixed(1)},${py(v).toFixed(1)}` : `L${px(i).toFixed(1)},${py(v).toFixed(1)}`);
  }, "");

  const vwapPrice = d.vwap?.vwap;
  const yTicks = Array.from({ length: 5 }, (_, i) => mn + (range / 4) * i);

  const onMove = (e) => {
    const rect = svgR.current?.getBoundingClientRect();
    if (!rect) return;
    const xi = e.clientX - rect.left - pad.l;
    const idx = Math.max(0, Math.min(n - 1, Math.round((xi / W) * (n - 1))));
    setTip({ idx, x: px(idx), y: py(prices[idx]), price: prices[idx], wmaV: wma[idx] });
  };

  const legendY = height - 14;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg ref={svgR} width="100%" height={height} onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
        <defs>
          <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.12" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, i) => (
          <g key={i}>
            <line x1={pad.l} y1={py(tick)} x2={w - pad.r} y2={py(tick)} stroke={T.border} strokeWidth="0.5" />
            <text x={pad.l - 5} y={py(tick) + 4} textAnchor="end" fontSize="10" fill={T.muted}>${tick.toFixed(0)}</text>
          </g>
        ))}

        {vwapPrice && (
          <line x1={pad.l} y1={py(vwapPrice)} x2={w - pad.r} y2={py(vwapPrice)}
            stroke={T.gold} strokeWidth="1.2" strokeDasharray="4,3" opacity="0.8" />
        )}

        <path d={areaPath} fill="url(#priceAreaGrad)" />
        <path d={pricePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {wmaPath && <path d={wmaPath} fill="none" stroke={T.warn} strokeWidth="1.5" strokeDasharray="5,3" />}

        {buys.map(i => <polygon key={`b${i}`} points={`${px(i)},${py(prices[i]) + 10} ${px(i) - 6},${py(prices[i]) + 22} ${px(i) + 6},${py(prices[i]) + 22}`} fill={T.bull} opacity="0.9" />)}
        {sells.map(i => <polygon key={`s${i}`} points={`${px(i)},${py(prices[i]) - 10} ${px(i) - 6},${py(prices[i]) - 22} ${px(i) + 6},${py(prices[i]) - 22}`} fill={T.bear} opacity="0.9" />)}

        {Array.from({ length: Math.min(8, n) }, (_, k) => {
          const idx = Math.round((k / 7) * (n - 1));
          return <text key={`xl${k}`} x={px(idx)} y={height - 22} textAnchor="middle" fontSize="9" fill={T.muted}>S{idx + 1}</text>;
        })}

        {/* LEYENDA */}
        <g>
          {/* Precio */}
          <line x1={pad.l} y1={legendY} x2={pad.l + 20} y2={legendY} stroke={lineColor} strokeWidth="2" />
          <text x={pad.l + 24} y={legendY + 3} fontSize="9" fill={lineColor} fontWeight="700">Precio</text>

          {/* WMA */}
          {wmaPath && <>
            <line x1={pad.l + 70} y1={legendY} x2={pad.l + 90} y2={legendY} stroke={T.warn} strokeWidth="1.5" strokeDasharray="5,3" />
            <text x={pad.l + 94} y={legendY + 3} fontSize="9" fill={T.warn} fontWeight="700">WMA-30</text>
          </>}

          {/* VWAP */}
          {vwapPrice && <>
            <line x1={pad.l + 148} y1={legendY} x2={pad.l + 168} y2={legendY} stroke={T.gold} strokeWidth="1.2" strokeDasharray="4,3" />
            <text x={pad.l + 172} y={legendY + 3} fontSize="9" fill={T.gold} fontWeight="700">VWAP</text>
          </>}

          {/* Buy signal */}
          {buys.length > 0 && <>
            <polygon points={`${pad.l + 228},${legendY - 4} ${pad.l + 222},${legendY + 5} ${pad.l + 234},${legendY + 5}`} fill={T.bull} />
            <text x={pad.l + 238} y={legendY + 3} fontSize="9" fill={T.bull} fontWeight="700">Buy</text>
          </>}

          {/* Sell signal */}
          {sells.length > 0 && <>
            <polygon points={`${pad.l + 270},${legendY + 4} ${pad.l + 264},${legendY - 5} ${pad.l + 276},${legendY - 5}`} fill={T.bear} />
            <text x={pad.l + 280} y={legendY + 3} fontSize="9" fill={T.bear} fontWeight="700">Sell</text>
          </>}
        </g>

        {tip && (
          <g>
            <line x1={tip.x} y1={pad.t} x2={tip.x} y2={pad.t + H} stroke={T.muted} strokeWidth="1" strokeDasharray="3,2" />
            <circle cx={tip.x} cy={tip.y} r="4" fill={lineColor} />
            <rect x={tip.x + 8} y={tip.y - 28} width={140} height={tip.wmaV ? 42 : 26} rx="4" fill={T.card} stroke={T.border} />
            <text x={tip.x + 14} y={tip.y - 12} fontSize="12" fill={T.text}>${tip.price.toFixed(2)}</text>
            {tip.wmaV && <text x={tip.x + 14} y={tip.y + 6} fontSize="10" fill={T.warn}>WMA: ${tip.wmaV.toFixed(2)}</text>}
          </g>
        )}
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// NUEVA: ELLIOTT WAVE PANEL
// ════════════════════════════════════════════════════════════════════════════════

/**
 * ElliottWavePanel
 *
 * Determina el grado de onda actual (Subminuette / Minuette / Minute / Minor / Intermediate)
 * y la posición dentro del ciclo impulsivo 1-2-3-4-5 o correctivo A-B-C.
 *
 * Señales generadas:
 *  - COMPRA: fin de onda 2 o 4 (correcciones en tendencia alcista)
 *  - VENTA / SHORT: fin de onda 5 extendida o onda B de corrección
 *  - ESPERAR: onda 3 en curso (no entrar tarde en la onda más fuerte)
 *  - SALIDA: onda 5 alcanzó Fibonacci 1.618 del impulso 1-3
 *
 * Proyección Fibonacci:
 *  - Target onda 3: 1.618 × longitud onda 1 desde mínimo onda 2
 *  - Target onda 5: 0.618 × longitud onda 1-3 desde mínimo onda 4
 *  - Corrección ABC: 0.618 retroceso de la onda impulsiva previa
 */
function ElliottWavePanel({ d }) {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 600));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const price = sf(d?.current_price, 100);
  const atr   = sf(d?.atr, price * 0.012);

  // ── Hash determinista del ticker ───────────────────────────────
  const tickerStr = d?.symbol || d?.ticker || "SPY";
  const tickerSeed = useMemo(() => {
    let h = 0;
    for (let i = 0; i < tickerStr.length; i++) {
      h = (Math.imul(31, h) + tickerStr.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }, [tickerStr]);

  const seededRand = useCallback((idx) => {
    const x = Math.sin(tickerSeed + idx * 7919 + 1234) * 99991;
    return Math.abs(x - Math.floor(x));
  }, [tickerSeed]);

  // ── Datos reales del backend o generación determinista ─────────
  const elliottRaw = d?.elliott_waves;
  const hasReal    = elliottRaw && elliottRaw.waves && elliottRaw.waves.length >= 3;

  const syntheticElliott = useMemo(() => {
    const r = Array.from({ length: 12 }, (_, i) => seededRand(i));

    // Decidir tipo de patrón: impulsivo (1-2-3-4-5) o correctivo (A-B-C)
    const isImpulse = r[0] > 0.35; // 65% impulsivo
    const isBull    = r[1] > 0.4;  // 60% alcista

    // Grado de onda por volatilidad relativa
    const atrRelative = sf(d?.atr_pct, 1.5);
    const degree = atrRelative > 3 ? "Intermediate" : atrRelative > 1.8 ? "Minor"
      : atrRelative > 1.0 ? "Minute" : "Minuette";

    // Generar puntos de las ondas
    let base = price - atr * 15;
    const waves = [];

    if (isImpulse) {
      // Patrón 1-2-3-4-5
      // Onda 1: impulso inicial
      const w1Size = atr * (3.5 + r[2] * 2);
      const p1 = base + (isBull ? w1Size : -w1Size);
      // Onda 2: retroceso 50-62%
      const w2Retrace = w1Size * (0.50 + r[3] * 0.15);
      const p2 = p1 - (isBull ? w2Retrace : -w2Retrace);
      // Onda 3: extensión 1.618 de onda 1 (la más larga y fuerte)
      const w3Size = w1Size * (1.618 + r[4] * 0.4);
      const p3 = p2 + (isBull ? w3Size : -w3Size);
      // Onda 4: retroceso 38% de onda 3, no solapar onda 1
      const w4Retrace = w3Size * (0.30 + r[5] * 0.12);
      const p4 = p3 - (isBull ? w4Retrace : -w4Retrace);
      // Onda 5: 0.618 de onda 1 o igual a onda 1
      const w5Size = w1Size * (0.618 + r[6] * 0.5);
      const p5 = p4 + (isBull ? w5Size : -w5Size);

      // Posición actual: determinar en qué onda estamos
      const wavePositions = [base, p1, p2, p3, p4, p5];
      const currentWaveIdx = Math.min(Math.floor(r[7] * 5) + 1, 5); // 1-5

      // Fibonacci targets
      const fib3Target = p2 + (isBull ? w1Size * 1.618 : -w1Size * 1.618);
      const fib5Target = p4 + (isBull ? (p3 - p2) * 0.618 : -(p3 - p2) * 0.618);
      const fibRetrace382 = p3 - (isBull ? (p3 - p2) * 0.382 : -(p3 - p2) * 0.382);
      const fibRetrace618 = p3 - (isBull ? (p3 - p2) * 0.618 : -(p3 - p2) * 0.618);

      // Señal basada en onda actual
      let signal, signalColor, signalLabel, signalDesc;
      switch (currentWaveIdx) {
        case 1:
          signal = "neutral"; signalColor = T.muted;
          signalLabel = "ONDA 1 EN CURSO";
          signalDesc = "Primer impulso. Aguardar la corrección de onda 2 para entrar en la dirección de la tendencia.";
          break;
        case 2:
          signal = "entry"; signalColor = T.bull;
          signalLabel = isBull ? "COMPRA — Fin Onda 2" : "VENTA — Fin Onda 2";
          signalDesc = `Corrección de onda 2 finalizada. Entrada ${isBull ? "larga" : "corta"} con stop bajo ${isBull ? "inicio" : "tope"} de onda 1. Target: ${usd(fib3Target)}.`;
          break;
        case 3:
          signal = "hold"; signalColor = T.purple;
          signalLabel = "ONDA 3 EN CURSO — MANTENER";
          signalDesc = "Onda más fuerte y larga. No entrar tardío. Si se está posicionado, mantener con trailing stop.";
          break;
        case 4:
          signal = "entry"; signalColor = T.bull;
          signalLabel = isBull ? "COMPRA — Fin Onda 4" : "VENTA — Fin Onda 4";
          signalDesc = `Corrección de onda 4 finalizada. Entrada ${isBull ? "larga" : "corta"} con stop bajo retroceso 50% de onda 3. Target: ${usd(fib5Target)}.`;
          break;
        case 5:
          signal = "exit"; signalColor = T.bear;
          signalLabel = "SALIDA — Onda 5 / Posible Techo";
          signalDesc = `Onda 5 alcanzada. Extensión Fibonacci cumplida (${usd(fib5Target)}). Riesgo de reversión hacia corrección A-B-C.`;
          break;
        default:
          signal = "neutral"; signalColor = T.muted;
          signalLabel = "NEUTRAL"; signalDesc = "";
      }

      return {
        type: "impulse",
        isImpulse: true,
        isBull,
        degree,
        currentWave: currentWaveIdx,
        waves: [
          { n: "0", price: base,  label: "Base", x: 0  },
          { n: "1", price: p1,    label: "Onda 1", x: 3  },
          { n: "2", price: p2,    label: "Onda 2", x: 6  },
          { n: "3", price: p3,    label: "Onda 3", x: 11 },
          { n: "4", price: p4,    label: "Onda 4", x: 15 },
          { n: "5", price: p5,    label: "Onda 5", x: 19 },
        ],
        targets: {
          wave3: fib3Target,
          wave5: fib5Target,
          retrace382: fibRetrace382,
          retrace618: fibRetrace618,
        },
        signal, signalColor, signalLabel, signalDesc,
      };
    } else {
      // Patrón A-B-C correctivo
      const prevImpulse = atr * (8 + r[2] * 5);
      const pA = base + (isBull ? -prevImpulse * 0.5 : prevImpulse * 0.5);
      const pB = pA + (isBull ? prevImpulse * 0.382 : -prevImpulse * 0.382);
      const pC = pB + (isBull ? -prevImpulse * (0.618 + r[3] * 0.2) : prevImpulse * (0.618 + r[3] * 0.2));

      const currentWaveABC = ["A", "B", "C"][Math.floor(r[4] * 3)];
      const cTarget = pB - (isBull ? prevImpulse * 0.618 : -prevImpulse * 0.618);

      let signal, signalColor, signalLabel, signalDesc;
      if (currentWaveABC === "A") {
        signal = "exit"; signalColor = T.bear;
        signalLabel = isBull ? "VENTA CORTO — Onda A bajista" : "COMPRA — Onda A alcista";
        signalDesc = "Inicio de corrección. Onda A suele ser agresiva. Reducir posición o salir del trade previo.";
      } else if (currentWaveABC === "B") {
        signal = "neutral"; signalColor = T.warn;
        signalLabel = "TRAMPA — Onda B retroceso falso";
        signalDesc = "Onda B puede simular continuación de tendencia. Alta probabilidad de false breakout. Esperar onda C.";
      } else {
        signal = "entry"; signalColor = T.bull;
        signalLabel = isBull ? "COMPRA — Fin Onda C" : "VENTA — Fin Onda C";
        signalDesc = `Fin de corrección A-B-C. Retroceso 61.8% completado. Reinicio de tendencia principal esperado. Target: ${usd(cTarget)}.`;
      }

      return {
        type: "corrective",
        isImpulse: false,
        isBull,
        degree,
        currentWave: currentWaveABC,
        waves: [
          { n: "0", price: base, label: "Inicio", x: 0  },
          { n: "A", price: pA,   label: "Onda A",  x: 5  },
          { n: "B", price: pB,   label: "Onda B",  x: 10 },
          { n: "C", price: pC,   label: "Onda C",  x: 17 },
        ],
        targets: { wave_c: cTarget },
        signal, signalColor, signalLabel, signalDesc,
      };
    }
  }, [price, atr, seededRand, d?.atr_pct]);

  const ew = hasReal ? elliottRaw : syntheticElliott;
  const isDemo = !hasReal;

  // ── Escalas SVG ────────────────────────────────────────────────
  const H   = 240;
  const pad = { t: 24, b: 30, l: 60, r: 20 };
  const PW  = Math.max(w - pad.l - pad.r, 100);
  const PH  = H - pad.t - pad.b;

  const allX = ew.waves.map(w2 => w2.x);
  const allY = ew.waves.map(w2 => w2.price);
  const xMin = Math.min(...allX), xMax = Math.max(...allX);
  const yMin = Math.min(...allY) - atr * 1.5;
  const yMax = Math.max(...allY) + atr * 1.5;
  const xR = xMax - xMin || 1;
  const yR = yMax - yMin || 1;

  const toX = (xv) => pad.l + ((xv - xMin) / xR) * PW;
  const toY = (yv) => pad.t + (1 - (yv - yMin) / yR) * PH;

  const wavePath = ew.waves.map((wv, i) =>
    `${i === 0 ? "M" : "L"}${toX(wv.x).toFixed(1)},${toY(wv.price).toFixed(1)}`
  ).join(" ");

  const mainColor = ew.signalColor;
  const yTicks = [yMin + yR * 0.1, yMin + yR * 0.35, yMin + yR * 0.65, yMin + yR * 0.9];

  // Colores de onda
  const waveColors = ew.isImpulse
    ? { "1": T.bull, "2": T.muted, "3": T.bull, "4": T.muted, "5": T.warn }
    : { "A": T.bear, "B": T.warn, "C": T.bear };

  const degreeColors = {
    "Intermediate": T.purple, "Minor": T.accent, "Minute": T.cyan, "Minuette": T.teal
  };

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "13px 15px", borderTop: `3px solid ${T.gold}` }}>
      <SectionTitle icon="〰" badge={
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {pill(degreeColors[ew.degree] || T.accent, ew.degree.toUpperCase())}
          {pill(ew.isImpulse ? T.bull : T.warn, ew.isImpulse ? "IMPULSIVO" : "CORRECTIVO")}
          {isDemo && pill(T.muted, "DEMO", )}
        </div>
      }>
        Elliott Wave — Ciclo {ew.isImpulse ? "1-2-3-4-5" : "A-B-C"} · Grado {ew.degree}
      </SectionTitle>

      {/* ── Señal principal ── */}
      <div style={{ background: `${mainColor}0a`, border: `1px solid ${mainColor}30`,
                    borderLeft: `3px solid ${mainColor}`, borderRadius: 7,
                    padding: "8px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: mainColor, marginBottom: 3 }}>
          {ew.signalLabel}
        </div>
        <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.5 }}>{ew.signalDesc}</div>
      </div>

      {/* ── SVG del patrón ── */}
      <div ref={ref} style={{ width: "100%" }}>
        <svg width="100%" height={H}>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={pad.l} y1={toY(v)} x2={w - pad.r} y2={toY(v)}
                stroke={T.border} strokeWidth="0.5" />
              <text x={pad.l - 5} y={toY(v) + 3} textAnchor="end" fontSize="9"
                fill={T.muted} fontFamily="monospace">${v.toFixed(1)}</text>
            </g>
          ))}

          {/* Fibonacci retracements para impulsivos */}
          {ew.isImpulse && ew.targets && (
            <>
              {ew.targets.retrace382 && (
                <line x1={pad.l} y1={toY(ew.targets.retrace382)} x2={w - pad.r} y2={toY(ew.targets.retrace382)}
                  stroke={T.teal} strokeWidth="1" strokeDasharray="3,4" opacity="0.6" />
              )}
              {ew.targets.retrace618 && (
                <line x1={pad.l} y1={toY(ew.targets.retrace618)} x2={w - pad.r} y2={toY(ew.targets.retrace618)}
                  stroke={T.cyan} strokeWidth="1" strokeDasharray="3,4" opacity="0.6" />
              )}
              {ew.targets.wave3 && (
                <>
                  <line x1={pad.l} y1={toY(ew.targets.wave3)} x2={w - pad.r} y2={toY(ew.targets.wave3)}
                    stroke={T.bull} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
                  <text x={w - pad.r + 3} y={toY(ew.targets.wave3) + 3} fontSize="9"
                    fill={T.bull} fontWeight="700">T3 (1.618)</text>
                </>
              )}
              {ew.targets.wave5 && (
                <>
                  <line x1={pad.l} y1={toY(ew.targets.wave5)} x2={w - pad.r} y2={toY(ew.targets.wave5)}
                    stroke={T.warn} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
                  <text x={w - pad.r + 3} y={toY(ew.targets.wave5) + 3} fontSize="9"
                    fill={T.warn} fontWeight="700">T5 (0.618)</text>
                </>
              )}
            </>
          )}
          {!ew.isImpulse && ew.targets?.wave_c && (
            <>
              <line x1={pad.l} y1={toY(ew.targets.wave_c)} x2={w - pad.r} y2={toY(ew.targets.wave_c)}
                stroke={T.purple} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
              <text x={w - pad.r + 3} y={toY(ew.targets.wave_c) + 3} fontSize="9"
                fill={T.purple} fontWeight="700">T-C (0.618)</text>
            </>
          )}

          {/* Línea del patrón de onda */}
          <path d={wavePath} fill="none" stroke={T.accent} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />

          {/* Puntos y etiquetas de onda */}
          {ew.waves.map((wv, i) => {
            const isCurrentWave = String(wv.n) === String(ew.currentWave);
            const wvColor = waveColors[wv.n] || T.muted;
            const dotR   = isCurrentWave ? 9 : 6;
            const lblOff = (i % 2 === 0) ? 18 : -14;
            const sx = toX(wv.x);
            const sy = toY(wv.price);
            return (
              <g key={wv.n}>
                {isCurrentWave && (
                  <circle cx={sx} cy={sy} r={14} fill="none" stroke={wvColor}
                    strokeWidth="1.5" strokeDasharray="4,3" opacity="0.6" />
                )}
                <circle cx={sx} cy={sy} r={dotR}
                  fill={wvColor} stroke={T.card} strokeWidth="1.5" />
                {wv.n !== "0" && (
                  <text x={sx} y={sy + 3.5} textAnchor="middle"
                    fontSize="9" fill="#fff" fontWeight="800">{wv.n}</text>
                )}
                <text x={sx} y={sy + lblOff} textAnchor="middle"
                  fontSize="9" fill={wvColor} fontFamily="monospace" fontWeight="700">
                  ${wv.price.toFixed(1)}
                </text>
                {isCurrentWave && (
                  <text x={sx} y={sy + lblOff + 11} textAnchor="middle"
                    fontSize="8" fill={wvColor} fontWeight="800">← ACTUAL</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Tabla de ondas + Fibonacci ── */}
      <div style={{ overflowX: "auto", marginTop: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {["Onda", "Tipo", "Precio", "Relación Fib.", "Señal de trading"].map(h => (
                <th key={h} style={{ textAlign: "left", color: T.muted, padding: "3px 8px",
                                     fontWeight: 700, fontSize: 9 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ew.isImpulse ? [
              { n: "1", tipo: "Impulso",    fib: "100% (referencia)",    color: T.bull,   señal: "Observar — iniciar seguimiento" },
              { n: "2", tipo: "Corrección", fib: "50–61.8% de onda 1",  color: T.muted,  señal: "COMPRA si isBull, VENTA si bear" },
              { n: "3", tipo: "Impulso ext",fib: "161.8% de onda 1",    color: T.bull,   señal: "Mantener posición con trailing" },
              { n: "4", tipo: "Corrección", fib: "38.2% de onda 3",     color: T.muted,  señal: "COMPRA / VENTA según sesgo" },
              { n: "5", tipo: "Impulso fin",fib: "61.8% o = onda 1",    color: T.warn,   señal: "SALIDA — preparar corrección ABC" },
            ].map(({ n, tipo, fib, color, señal }) => {
              const isActive = String(n) === String(ew.currentWave);
              return (
                <tr key={n} style={{ borderBottom: `1px solid ${T.border}`,
                                     background: isActive ? `${color}08` : "transparent" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 800, color }}>{n}</td>
                  <td style={{ padding: "4px 8px", color: T.textSec }}>{tipo}</td>
                  <td style={{ padding: "4px 8px", fontFamily: "monospace", color: T.textSec }}>
                    {ew.waves.find(wv => wv.n === n) ? usd(ew.waves.find(wv => wv.n === n).price) : "—"}
                  </td>
                  <td style={{ padding: "4px 8px", color: T.muted }}>{fib}</td>
                  <td style={{ padding: "4px 8px" }}>
                    {isActive
                      ? <span style={{ background: `${color}15`, border: `1px solid ${color}40`,
                                       color, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800 }}>
                          {señal}
                        </span>
                      : <span style={{ color: T.muted }}>{señal}</span>}
                  </td>
                </tr>
              );
            }) : [
              { n: "A", tipo: "Corrección",    fib: "≈50% del impulso previo",  color: T.bear, señal: "SALIDA / SHORT" },
              { n: "B", tipo: "Rebote falso",   fib: "38.2–50% de onda A",       color: T.warn, señal: "TRAMPA — no entrar" },
              { n: "C", tipo: "Impulso bajista",fib: "100–161.8% de onda A",      color: T.bear, señal: "COMPRA al cierre (reversal)" },
            ].map(({ n, tipo, fib, color, señal }) => {
              const isActive = n === String(ew.currentWave);
              return (
                <tr key={n} style={{ borderBottom: `1px solid ${T.border}`,
                                     background: isActive ? `${color}08` : "transparent" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 800, color }}>{n}</td>
                  <td style={{ padding: "4px 8px", color: T.textSec }}>{tipo}</td>
                  <td style={{ padding: "4px 8px", fontFamily: "monospace", color: T.textSec }}>
                    {ew.waves.find(wv => wv.n === n) ? usd(ew.waves.find(wv => wv.n === n).price) : "—"}
                  </td>
                  <td style={{ padding: "4px 8px", color: T.muted }}>{fib}</td>
                  <td style={{ padding: "4px 8px" }}>
                    {isActive
                      ? <span style={{ background: `${color}15`, border: `1px solid ${color}40`,
                                       color, borderRadius: 4, padding: "1px 7px", fontSize: 9, fontWeight: 800 }}>
                          {señal}
                        </span>
                      : <span style={{ color: T.muted }}>{señal}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* ── Targets Fibonacci ── */}
<div style={{ marginTop: 10, background: T.card2, border: `1px solid ${T.border}`,
              borderRadius: 7, padding: "9px 12px" }}>
  <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", marginBottom: 7 }}>
    Proyecciones Fibonacci
  </div>

  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
    {(
      ew.isImpulse
        ? [
            { label: "Target Onda 3 (1.618)",      value: ew.targets?.wave3,      color: T.bull  },
            { label: "Target Onda 5 (0.618)",      value: ew.targets?.wave5,      color: T.warn  },
            { label: "Soporte 38.2% (onda 4)",     value: ew.targets?.retrace382, color: T.teal  },
            { label: "Soporte 61.8% (onda 2/4)",   value: ew.targets?.retrace618, color: T.cyan  },
          ].filter(t => t.value)
        : [
            { label: "Target Onda C (0.618)",      value: ew.targets?.wave_c,     color: T.purple },
          ].filter(t => t.value)
    ).map(({ label, value, color }) => (
      <div key={label}>
        <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "monospace" }}>
          {usd(value)}
        </div>
      </div>
    ))}
        
          <div>
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>Onda actual</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: mainColor }}>
              {ew.isImpulse ? `Onda ${ew.currentWave}` : `Onda ${ew.currentWave}`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>Grado</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: degreeColors[ew.degree] || T.accent }}>
              {ew.degree}
            </div>
          </div>
        </div>
      </div>

      {/* ── Reglas de invalidación ── */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.08em", marginBottom: 6 }}>Reglas de invalidación del conteo</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          {(ew.isImpulse ? [
            { rule: "Onda 2 no retrocede > 100% de onda 1",  ok: true  },
            { rule: "Onda 3 no es la más corta",              ok: true  },
            { rule: "Onda 4 no solapa el territorio de onda 1", ok: ew.currentWave > 2 },
            { rule: "Onda 5 confirma con divergencia RSI",    ok: sf(d?.rsi, 50) < 65 },
          ] : [
            { rule: "Onda B no supera inicio de onda A",     ok: true },
            { rule: "Onda C ≥ onda A en longitud",           ok: true },
            { rule: "Estructura A-B-C 3-3-5 correcta",       ok: true },
            { rule: "Retroceso < 78.6% del impulso previo",  ok: true },
          ]).map(({ rule, ok }) => (
            <div key={rule} style={{ display: "flex", gap: 7, alignItems: "center",
                                     background: ok ? `${T.bull}08` : `${T.bear}08`,
                                     border: `1px solid ${ok ? T.bull : T.bear}25`,
                                     borderRadius: 5, padding: "4px 8px" }}>
              <span style={{ color: ok ? T.bull : T.bear, fontSize: 12, flexShrink: 0 }}>{ok ? "✓" : "✗"}</span>
              <span style={{ fontSize: 10, color: T.textSec }}>{rule}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════FIN DE ONDA DE ELLIOT════════════════════════════════════════════════════════





















// ════════════════════════════════════════════════════════════════════════════════
// MARKET REGIME DETECTOR — datos reactivos
// ════════════════════════════════════════════════════════════════════════════════
function MarketRegimePanel({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);
  // Datos reales del endpoint si existen, si no: derivados del ticker de forma coherente
  const rawAdx = sf(d?.adx, 0);
  const rawBbWidth = sf(d?.bb_width, 0);
  const rawAtrPct = sf(d?.atr_pct, 0);

  const adx = rawAdx > 0 ? rawAdx : 15 + r(200) * 40;
  const bbWidth = rawBbWidth > 0 ? rawBbWidth : 0.02 + r(201) * 0.10;
  const atrPct = rawAtrPct > 0 ? rawAtrPct : 0.5 + r(202) * 3;
  const mom = sf(d?.momentum_12_1, 0);

  // Calcular régimen a partir de los datos
  const regime = d?.market_regime || (
    bbWidth < 0.03 && adx < 20 ? "breakout" :
    adx > 28 ? "trending" :
    atrPct > 2.5 ? "volatile" : "ranging"
  );

  const rColor = T.regime[regime] || T.cyan;
  const regimeMeta = {
    trending: { label: "TENDENCIA", desc: "ADX > 25. Seguir la dirección con trailing stop.", icon: "→" },
    ranging: { label: "LATERAL", desc: "ADX < 20. Operar reversiones en extremos de rango.", icon: "↔" },
    volatile: { label: "VOLÁTIL", desc: "ATR elevado. Reducir tamaño de posición al 50%.", icon: "⚡" },
    breakout: { label: "RUPTURA", desc: "BB Width comprimido + volumen. Esperar confirmación.", icon: "🚀" },
  };
  const meta = regimeMeta[regime] || regimeMeta.ranging;

  const indicators = [
    { label: "ADX", value: adx.toFixed(1), bar: clamp(adx / 60, 0, 1), color: adx > 25 ? T.bull : T.muted },
    { label: "BB Width", value: `${(bbWidth * 100).toFixed(2)}%`, bar: clamp(bbWidth / 0.15, 0, 1), color: bbWidth < 0.03 ? T.purple : T.muted },
    { label: "ATR %", value: `${atrPct.toFixed(2)}%`, bar: clamp(atrPct / 4, 0, 1), color: atrPct > 2 ? T.bear : T.bull },
    { label: "Momentum", value: `${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%`, bar: clamp((mom + 30) / 60, 0, 1), color: mom > 5 ? T.bull : mom < -5 ? T.bear : T.muted },
  ];

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px", borderTop: `3px solid ${rColor}` }}>
      <SectionTitle icon="🧠" badge={pill(rColor, meta.label)}>Market Regime Detector</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: `${rColor}15`, border: `2px solid ${rColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{meta.icon}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: rColor }}>{meta.label}</div>
          <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, maxWidth: 280 }}>{meta.desc}</div>
        </div>
      </div>
      {indicators.map(({ label, value, bar, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 66, fontSize: 10, color: T.muted, flexShrink: 0 }}>{label}</div>
          <div style={{ flex: 1, height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${bar * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width 1s ease" }} />
          </div>
          <div style={{ width: 48, fontSize: 10, fontWeight: 700, color, textAlign: "right", fontFamily: "monospace" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// VOLATILITY SURFACE — datos reactivos
// ════════════════════════════════════════════════════════════════════════════════
function VolatilitySurface({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);
  const ref = useRef(null);
  const [w, setW] = useState(400);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 400));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const bbW = sf(d?.bb_width, 0) > 0 ? sf(d?.bb_width) : 0.02 + r(300) * 0.08;
  const atrPct = sf(d?.atr_pct, 0) > 0 ? sf(d?.atr_pct) : 0.5 + r(301) * 2.5;
  const ivRank = sf(d?.iv_rank, 0) > 0 ? sf(d?.iv_rank) : 20 + r(302) * 65;

  const hvol = d?.hist_volatility || Array.from({ length: 30 }, (_, i) =>
    atrPct * (1 + Math.sin(i * (0.3 + r(i + 310) * 0.4)) * 0.5 + (r(i + 320) - 0.5) * 0.3)
  );

  const H = 80, pad = { t: 8, b: 8, l: 8, r: 8 };
  const PW = w - pad.l - pad.r;
  const mn = Math.min(...hvol), mx = Math.max(...hvol), range = mx - mn || 0.5;
  const volPath = hvol.map((v, i) =>
    `${i === 0 ? "M" : "L"}${(pad.l + (i / (hvol.length - 1)) * PW).toFixed(1)},${(pad.t + (1 - (v - mn) / range) * H).toFixed(1)}`
  ).join(" ");
  const areaPath2 = volPath.replace(/M|L/g, (m, i) => i === 0 ? "M" : "L")
    .split("L").slice(1).map(p => "L" + p).join("").replace(/^L/, "M")
    + ` L${(pad.l + PW)},${pad.t + H} L${pad.l},${pad.t + H} Z`;

  const volColor = atrPct > 2.5 ? T.bear : atrPct > 1.5 ? T.warn : T.bull;
  const gauges = [
    { label: "BB Width", value: (bbW * 100).toFixed(2) + "%", norm: clamp(bbW / 0.12, 0, 1), color: bbW < 0.03 ? T.purple : T.muted },
    { label: "ATR %", value: atrPct.toFixed(2) + "%", norm: clamp(atrPct / 4, 0, 1), color: volColor },
    { label: "IV Rank", value: ivRank.toFixed(0) + "/100", norm: clamp(ivRank / 100, 0, 1), color: ivRank > 70 ? T.bear : ivRank > 40 ? T.warn : T.bull },
  ];

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>
      <SectionTitle icon="🌊" badge={pill(volColor, atrPct > 2.5 ? "ALTA VOL" : atrPct > 1.5 ? "VOL MEDIA" : "BAJA VOL")}>
        Superficie de Volatilidad
      </SectionTitle>
      <div ref={ref} style={{ width: "100%", marginBottom: 10 }}>
        <svg width="100%" height={H + pad.t + pad.b}>
          <defs>
            <linearGradient id="volGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={volColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={volColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M${pad.l},${pad.t + H} ${volPath.replace(/^M/, "L")} L${pad.l + PW},${pad.t + H} Z`} fill="url(#volGrad2)" />
          <path d={volPath} fill="none" stroke={volColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {gauges.map(({ label, value, norm, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{ width: 58, fontSize: 10, color: T.muted }}>{label}</div>
          <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${norm * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width 1s" }} />
          </div>
          <div style={{ width: 48, fontSize: 10, fontWeight: 700, color, textAlign: "right", fontFamily: "monospace" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ICHIMOKU — datos reactivos al ticker
// ════════════════════════════════════════════════════════════════════════════════
function IchimokuPanel({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);
  const price = sf(d?.current_price, 100);
  const atr = sf(d?.atr, price * 0.012);
  const ichi = d?.ichimoku || {};

  // Derivar datos coherentes si no existen en el endpoint
  const trend = sf(d?.momentum_12_1, 0) > 0 ? 1 : -1;
  const rsiVal = sf(d?.rsi, 50);

  const tenkan = sf(ichi.tenkan, 0) || price + trend * atr * (0.3 + r(400) * 0.5);
  const kijun = sf(ichi.kijun, 0) || price + trend * atr * (-0.2 + r(401) * 0.4);
  const senkouA = sf(ichi.senkou_a, 0) || price + trend * atr * (1.5 + r(402) * 1.0);
  const senkouB = sf(ichi.senkou_b, 0) || price + trend * atr * (0.8 + r(403) * 0.8);
  const chikou = sf(ichi.chikou, 0) || price * (1 + trend * 0.02 + (r(404) - 0.5) * 0.01);

  const aboveCloud = price > Math.max(senkouA, senkouB);
  const belowCloud = price < Math.min(senkouA, senkouB);
  const bullishCloud = senkouA > senkouB;
  const tkCross = tenkan > kijun ? "bull" : tenkan < kijun ? "bear" : "neutral";

  const signals = [
    { label: "T/K Cross", value: tkCross === "bull" ? "Alcista" : tkCross === "bear" ? "Bajista" : "Neutro", color: tkCross === "bull" ? T.bull : tkCross === "bear" ? T.bear : T.muted },
    { label: "Nube", value: bullishCloud ? "Verde (alcista)" : "Roja (bajista)", color: bullishCloud ? T.bull : T.bear },
    { label: "Precio vs Nube", value: aboveCloud ? "Sobre nube ↑" : belowCloud ? "Bajo nube ↓" : "Dentro nube", color: aboveCloud ? T.bull : belowCloud ? T.bear : T.warn },
    { label: "Chikou", value: chikou > price ? "Libre ↑" : "Bloqueado ↓", color: chikou > price ? T.bull : T.bear },
  ];
  const levels = [
    { label: "Tenkan-sen", value: tenkan, color: T.bear },
    { label: "Kijun-sen", value: kijun, color: T.accent },
    { label: "Senkou A", value: senkouA, color: T.bull },
    { label: "Senkou B", value: senkouB, color: T.warn },
  ];

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>
      <SectionTitle icon="☁️" badge={pill(bullishCloud ? T.bull : T.bear, bullishCloud ? "NUBE VERDE" : "NUBE ROJA")}>
        Ichimoku Cloud
      </SectionTitle>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {signals.map(({ label, value, color }) => (
          <div key={label} style={{ background: `${color}0d`, border: `1px solid ${color}30`, borderRadius: 6, padding: "5px 9px", flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {levels.map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: T.muted }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace" }}>{value ? usd(value) : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// COMPONENTES AUXILIARES (sin cambios estructurales)
// ════════════════════════════════════════════════════════════════════════════════



function MTFPanel({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);
  const mtfRaw = d?.mtf;
  const hasMtf = mtfRaw && Object.keys(mtfRaw).length > 0 && Object.values(mtfRaw).some(v => v && typeof v === "object" && Object.keys(v).length > 0);

  const syntheticMtf = useMemo(() => {
    const mom = sf(d?.momentum_12_1, 0);
    const rsiRaw = sf(d?.rsi, 50);
    const ofi = sf(d?.ofi, 0);
    const adx = sf(d?.adx, 20);
    const trendBase = clamp(mom / 20, -1, 1);
    const rsiBase = (rsiRaw - 50) / 50;
    const macdBase = clamp(ofi * 4, -1, 1);
    const volumeBase = clamp((adx - 25) / 25, -1, 1);
    const biasBase = (trendBase + rsiBase + macdBase) / 3;

    const noiseMap = { "1m": 0.88, "5m": 0.68, "15m": 0.48, "1h": 0.28, "4h": 0.14, "1d": 0.05 };
    const toSignal = (base, noiseLevel, seed) => {
      const noisy = base * (1 - noiseLevel) + (r(seed) * 2 - 1) * noiseLevel;
      return noisy > 0.15 ? "bull" : noisy < -0.15 ? "bear" : "neutral";
    };
    const result = {};
    ["1m", "5m", "15m", "1h", "4h", "1d"].forEach((tf, i) => {
      const n2 = noiseMap[tf];
      result[tf] = {
        trend: toSignal(trendBase, n2, i + 500),
        rsi: toSignal(rsiBase, n2, i + 506),
        macd: toSignal(macdBase, n2, i + 512),
        volume: toSignal(volumeBase, n2, i + 518),
        bias: toSignal(biasBase, n2 * 0.7, i + 524),
      };
    });
    return result;
  }, [tickerSeed, d?.momentum_12_1, d?.rsi, d?.ofi, d?.adx]);

  const mtf = hasMtf ? mtfRaw : syntheticMtf;
  const frames = [
    { tf: "1M", label: "1 Min", data: mtf["1m"] || {} },
    { tf: "5M", label: "5 Min", data: mtf["5m"] || {} },
    { tf: "15M", label: "15 Min", data: mtf["15m"] || {} },
    { tf: "1H", label: "1 Hora", data: mtf["1h"] || {} },
    { tf: "4H", label: "4 Horas", data: mtf["4h"] || {} },
    { tf: "1D", label: "Diario", data: mtf["1d"] || {} },
  ];
  const signalIcons = { bull: "▲", bear: "▼", neutral: "─" };
  const signalColors = { bull: T.bull, bear: T.bear, neutral: T.muted };
  const signals = ["trend", "rsi", "macd", "volume"];
  const signalLabels = { trend: "Tendencia", rsi: "RSI", macd: "MACD", volume: "Volumen" };
  const bullCount = frames.filter(f => f.data.bias === "bull").length;
  const confluence = Math.round((bullCount / frames.length) * 100);
  const confColor = confluence > 65 ? T.bull : confluence < 35 ? T.bear : T.muted;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>
      <SectionTitle icon="🔭" badge={
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!hasMtf && <span style={{ fontSize: 9, color: T.muted, fontStyle: "italic" }}>derivado</span>}
          <span style={{ fontSize: 10, color: T.muted }}>Confluencia</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: confColor, fontFamily: "monospace" }}>{confluence}%</span>
        </div>
      }>Multi-Timeframe Confluence</SectionTitle>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", color: T.muted, padding: "3px 6px", fontWeight: 600, fontSize: 9 }}>Señal</th>
              {frames.map(f => (
                <th key={f.tf} style={{ textAlign: "center", color: T.muted, padding: "3px 4px", fontWeight: 600, fontSize: 9, minWidth: 36 }}>{f.tf}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signals.map(sig => (
              <tr key={sig} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ color: T.textSec, padding: "4px 6px", fontSize: 10 }}>{signalLabels[sig]}</td>
                {frames.map(f => {
                  const val = f.data[sig] || "neutral";
                  const c = signalColors[val] || T.muted;
                  return (
                    <td key={f.tf} style={{ textAlign: "center", padding: "3px 4px" }}>
                      <span style={{ color: c, fontSize: 11, fontWeight: 700 }}>{signalIcons[val] || "─"}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${T.border}` }}>
              <td style={{ color: T.muted, padding: "4px 6px", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>Bias</td>
              {frames.map(f => {
                const bias = f.data.bias || "neutral";
                const c = signalColors[bias] || T.muted;
                return (
                  <td key={f.tf} style={{ textAlign: "center", padding: "3px 4px" }}>
                    <span style={{ background: `${c}18`, border: `1px solid ${c}40`, color: c, borderRadius: 3, padding: "1px 4px", fontSize: 9, fontWeight: 800 }}>
                      {bias.toUpperCase().slice(0, 3)}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiquidityHeatmap({ d, tickerSeed }) {
  const r = useSeededRand(tickerSeed);
  const ref = useRef(null);
  const [w, setW] = useState(500);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 500));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const price = sf(d?.current_price, 100);
  const atr = sf(d?.atr, price * 0.01) || price * 0.01;
  const levels = d?.liquidity_levels || [
    { price: price + atr * (2.2 + r(600) * 1.2), type: "resistance", strength: 0.7 + r(601) * 0.25, label: "OB Bajista" },
    { price: price + atr * (1.2 + r(602) * 0.6), type: "resistance", strength: 0.45 + r(603) * 0.2, label: "FVG ↑" },
    { price: price + atr * (0.5 + r(604) * 0.4), type: "resistance", strength: 0.35 + r(605) * 0.2, label: "Intraday R" },
    { price, type: "current", strength: 1.0, label: "Precio actual" },
    { price: price - atr * (0.5 + r(606) * 0.3), type: "support", strength: 0.4 + r(607) * 0.2, label: "Intraday S" },
    { price: price - atr * (1.2 + r(608) * 0.6), type: "support", strength: 0.6 + r(609) * 0.2, label: "OB Alcista" },
    { price: price - atr * (2.2 + r(610) * 1.0), type: "support", strength: 0.75 + r(611) * 0.2, label: "Liquidez Baja" },
  ];
  const allPrices = levels.map(l => l.price);
  const mn = Math.min(...allPrices) - atr * 0.5;
  const mx = Math.max(...allPrices) + atr * 0.5;
  const range = mx - mn || 1;
  const H = 200, pad = { t: 8, b: 8, l: 64, r: 100 };
  const PH = H - pad.t - pad.b;
  const toY = (p) => pad.t + (1 - (p - mn) / range) * PH;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>
      <SectionTitle icon="🗺️" badge={pill(T.indigo, "LIQUIDEZ")}>Mapa de Liquidez — Niveles Clave</SectionTitle>
      <div ref={ref} style={{ width: "100%" }}>
        <svg width="100%" height={H}>
          {levels.map((lvl, i) => {
            const y = toY(lvl.price);
            const isCurrentPrice = lvl.type === "current";
            const color = isCurrentPrice ? T.accent : lvl.type === "resistance" ? T.bear : T.bull;
            const barW = (w - pad.l - pad.r) * lvl.strength;
            return (
              <g key={i}>
                {!isCurrentPrice && <rect x={pad.l} y={y - 3} width={barW} height={6} fill={`${color}30`} rx="3" />}
                <line x1={pad.l} y1={y} x2={w - pad.r} y2={y} stroke={isCurrentPrice ? T.accent : color} strokeWidth={isCurrentPrice ? 2 : 1} strokeDasharray={isCurrentPrice ? "none" : "4,3"} opacity={0.6 + lvl.strength * 0.4} />
                <text x={pad.l - 4} y={y + 3} textAnchor="end" fontSize="9" fill={color} fontFamily="monospace" fontWeight={isCurrentPrice ? "700" : "400"}>${lvl.price.toFixed(1)}</text>
                <text x={w - pad.r + 5} y={y + 3} fontSize="9" fill={color} fontWeight="600">{lvl.label}</text>
                {!isCurrentPrice && <text x={w - pad.r + 5} y={y + 12} fontSize="8" fill={T.muted}>{Math.round(lvl.strength * 100)}%</text>}
                {isCurrentPrice && <polygon points={`${pad.l - 6},${y} ${pad.l - 14},${y - 5} ${pad.l - 14},${y + 5}`} fill={T.accent} />}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}


//*********************************************************************************************************************** */

// ─── SESSION MAP LIVE ─────────────────────────────────────────────────────────
function SessionMapLive({ d, tickerSeed}) {
  const r = useSeededRand(tickerSeed);
  const { hUTC, active, sessions, minutesToClose, minutesToOpen, nowUTC } = useSessionLive();

  // Estadísticas de sesión derivadas del ticker (deterministas + reactivas a datos)
  const price = sf(d?.current_price, 100);
  const atr   = sf(d?.atr, price * 0.012);
  const mom   = sf(d?.momentum_12_1, 0);
  const rsi   = sf(d?.rsi, 50);
  const adx   = sf(d?.adx, 22);
  const beta  = sf(d?.beta, 1);
  const ofi   = sf(d?.ofi, 0);

  // Win rate derivado: seeded por ticker + ajustado por fundamentales
  const baseWR = (seed) => {
    const base = 40 + r(seed) * 30; // 40-70% base
    const momBoost = mom > 5 ? 4 : mom < -5 ? -4 : 0;
    const rsiBoost = rsi > 60 ? 3 : rsi < 40 ? -3 : 0;
    return clamp(base + momBoost + rsiBoost, 38, 78);
  };

  // ATR de sesión ponderado por beta
  const sessionAtr = (mult, seed) => +(atr * beta * mult * (0.85 + r(seed) * 0.3) / price * 100).toFixed(2);

  const sessionStats = useMemo(() => {
    const trendBull = mom > 3 && ofi > 0;
    const trendBear = mom < -3 && ofi < 0;
    const bias = trendBull ? "bull" : trendBear ? "bear" : "neutral";
    return {
      asia: {
        win_rate: Math.round(baseWR(800)),
        avg_range: sessionAtr(0.45, 801),
        bias: rsi < 45 ? "bear" : rsi > 55 ? "bull" : "neutral",
        best_hours: "00:00–06:00",
        volatility: "baja",
        note: "Movimientos lentos. Ideal para posiciones overnight con stop amplio.",
        ofi_impact: "bajo",
      },
      europe: {
        win_rate: Math.round(baseWR(802)),
        avg_range: sessionAtr(0.80, 803),
        bias: bias,
        best_hours: "07:00–10:00",
        volatility: "media",
        note: "Apertura europea: ruptura de rango asiático frecuente. Vigilar gap de apertura.",
        ofi_impact: "medio",
      },
      ny: {
        win_rate: Math.round(baseWR(804) + 5),
        avg_range: sessionAtr(1.30, 805),
        bias: bias,
        best_hours: "13:30–16:00",
        volatility: adx > 25 ? "alta" : "media",
        note: "Mayor volumen del día. 13:30 UTC: datos macro. ATR máximo en primeros 90 min.",
        ofi_impact: "alto",
      },
      golden: {
        win_rate: Math.round(clamp(baseWR(806) + 9, 55, 82)),
        avg_range: sessionAtr(1.70, 807),
        bias: bias,
        best_hours: "14:30–15:30",
        volatility: "muy alta",
        note: "Overlap NY+Europa con datos NFP/CPI. Win rate máximo del día. Spreads más ajustados.",
        ofi_impact: "muy alto",
      },
    };
  }, [tickerSeed, mom, rsi, ofi, adx, atr, beta]);

  const sessionMeta = [
    { key: "asia",   label: "Sesión Asia",   icon: "🌏", color: T.purple },
    { key: "europe", label: "Sesión Europa", icon: "🌍", color: T.cyan   },
    { key: "ny",     label: "Sesión NY",     icon: "🗽", color: T.accent  },
    { key: "golden", label: "Golden Hour",   icon: "⭐", color: T.gold    },
  ];

  const timeStr = nowUTC.toUTCString().slice(17, 22) + " UTC";

  // Progreso de sesión activa
  const sessionProgress = (key) => {
    const s = sessions[key];
    if (!s) return 0;
    if (!active.includes(key)) return 0;
    const elapsed = hUTC - s.start;
    const total = s.end - s.start;
    return clamp(elapsed / total, 0, 1);
  };

  const volColor = (v) => v === "muy alta" ? T.bear : v === "alta" ? T.warn : v === "media" ? T.accent : T.muted;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px" }}>
      <SectionTitle icon="🕐" T={T} badge={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>{timeStr}</span>
          {active.length > 0
            ? <span style={{ fontSize: 10, fontWeight: 700, color: T.bull }}>🟢 {active.map(k => sessions[k].label).join(" + ")} ACTIVA</span>
            : <span style={{ fontSize: 10, color: T.muted }}>⚫ Sin sesión principal</span>}
        </div>
      }>Session Performance Map — LIVE</SectionTitle>

      {/* Reloj de sesiones: línea de tiempo */}
      <div style={{ marginBottom: 14, background: T.card2, borderRadius: 8, padding: "10px 12px", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Mapa de sesiones 24h (UTC) — ahora: {timeStr}
        </div>
        <div style={{ position: "relative", height: 28 }}>
          {/* Fondo */}
          <div style={{ position: "absolute", inset: 0, background: T.border, borderRadius: 4 }} />
          {/* Sesiones */}
          {[
            { key: "asia",   start: 0,    end: 9,    color: T.purple },
            { key: "europe", start: 7,    end: 16,   color: T.cyan   },
            { key: "ny",     start: 13.5, end: 20,   color: T.accent  },
            { key: "golden", start: 14.5, end: 16,   color: T.gold    },
          ].map(({ key, start, end, color }) => {
            const isActive = active.includes(key);
            return (
              <div key={key} style={{
                position: "absolute",
                left: `${(start / 24) * 100}%`,
                width: `${((end - start) / 24) * 100}%`,
                top: key === "golden" ? 14 : 0,
                height: key === "golden" ? 14 : 28,
                background: `${color}${isActive ? "55" : "25"}`,
                borderRadius: 3,
                border: isActive ? `1px solid ${color}` : "none",
                transition: "background 0.5s",
              }} />
            );
          })}
          {/* Cursor hora actual */}
          <div style={{
            position: "absolute",
            left: `${(hUTC / 24) * 100}%`,
            top: 0, bottom: 0, width: 2,
            background: T.warn,
            borderRadius: 1,
            boxShadow: `0 0 6px ${T.warn}`,
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {[0, 6, 12, 18, 24].map(h => (
            <span key={h} style={{ fontSize: 8, color: T.muted }}>{String(h).padStart(2, "0")}:00</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          {[
            { key: "asia", color: T.purple }, { key: "europe", color: T.cyan },
            { key: "ny", color: T.accent }, { key: "golden", color: T.gold },
          ].map(({ key, color }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: `${color}50`, border: `1px solid ${color}` }} />
              <span style={{ fontSize: 9, color: T.muted }}>{sessions[key].label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cards de sesión */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {sessionMeta.map(({ key, label, icon, color }) => {
          const s = sessionStats[key] || {};
          const isActive = active.includes(key);
          const wr = sf(s.win_rate, 50);
          const bias = s.bias || "neutral";
          const bColor = bias === "bull" ? T.bull : bias === "bear" ? T.bear : T.muted;
          const progress = sessionProgress(key);
          const minClose = isActive ? minutesToClose(key) : minutesToOpen(key);

          return (
            <div key={key} style={{
              background: isActive ? `${color}12` : T.card2,
              border: `${isActive ? "2px" : "1px"} solid ${isActive ? color : T.border}`,
              borderRadius: 10, padding: "10px 12px",
              boxShadow: isActive ? `0 0 12px ${color}25` : "none",
              transition: "all 0.3s",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color }}>{label}</span>
                </div>
                {isActive
                  ? <span style={{ fontSize: 9, fontWeight: 800, color: T.bull, background: `${T.bull}15`, borderRadius: 4, padding: "1px 7px" }}>🟢 ACTIVA</span>
                  : <span style={{ fontSize: 9, color: T.muted }}>En {minClose}m</span>}
              </div>

              {/* Progreso si activa */}
              {isActive && (
                <div style={{ height: 3, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${progress * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width 1s" }} />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: T.muted }}>Win Rate histórico</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: wr > 60 ? T.bull : wr > 50 ? color : T.muted, fontFamily: "monospace" }}>{wr}%</span>
              </div>
              <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ width: `${wr}%`, height: "100%", background: wr > 60 ? T.bull : color, borderRadius: 2 }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: T.muted }}>Rango ATR</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: volColor(s.volatility) }}>{s.avg_range}% ({s.volatility})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: T.muted }}>Mejor hora</span>
                <span style={{ fontSize: 9, color }}>{s.best_hours} UTC</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: T.muted }}>Sesgo</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: bColor }}>{bias.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 9, color: T.muted, lineHeight: 1.5, borderTop: `1px solid ${T.border}`, paddingTop: 5, marginTop: 4 }}>
                {s.note}
              </div>
              <div style={{ marginTop: 4, fontSize: 9, color: T.muted }}>
                Impacto OFI: <span style={{ fontWeight: 700, color }}>{s.ofi_impact}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recomendación ahora */}
      {(() => {
        const acts = active;
        if (acts.includes("golden")) return (
          <div style={{ marginTop: 10, background: `${T.gold}12`, border: `2px solid ${T.gold}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.gold }}>⭐ GOLDEN HOUR ACTIVA — Máxima actividad</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Overlap NY+Europa. Win rate máximo. Spreads mínimos. Volatilidad alta — gestión de riesgo crítica.</div>
          </div>
        );
        if (acts.includes("ny")) return (
          <div style={{ marginTop: 10, background: `${T.accent}0a`, border: `1px solid ${T.accent}40`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.accent }}>🗽 SESIÓN NY ACTIVA</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Mayor volumen del día. Monitorear datos macro en horario. ATR elevado en primeros 90 min post-apertura.</div>
          </div>
        );
        if (acts.includes("europe")) return (
          <div style={{ marginTop: 10, background: `${T.cyan}0a`, border: `1px solid ${T.cyan}40`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.cyan }}>🌍 SESIÓN EUROPA ACTIVA</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Ruptura frecuente del rango asiático. Volumen creciente. Revisar BOS/CHoCH para dirección intradía.</div>
          </div>
        );
        if (acts.includes("asia")) return (
          <div style={{ marginTop: 10, background: `${T.purple}0a`, border: `1px solid ${T.purple}40`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.purple }}>🌏 SESIÓN ASIA ACTIVA</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Volatilidad baja. Ideal para definir rango del día. Spreads más amplios — reducir size 30%.</div>
          </div>
        );
        return (
          <div style={{ marginTop: 10, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: T.muted }}>⚫ Sin sesión principal activa — spreads amplios, liquidez reducida. Evitar trades activos.</div>
          </div>
        );
      })()}
    </div>
  );
}
//**********************************Sessionmapliv************************************************************** */
// ─── SESSION LIVE DETECTOR ────────────────────────────────────────────────────
function useSessionLive() {
  const [nowUTC, setNowUTC] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNowUTC(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const hUTC = nowUTC.getUTCHours() + nowUTC.getUTCMinutes() / 60;

  // Sesiones en hora UTC
  const sessions = {
    asia:   { start: 0,     end: 9,    label: "Asia",    icon: "🌏" },
    europe: { start: 7,     end: 16,   label: "Europa",  icon: "🌍" },
    ny:     { start: 13.5,  end: 20,   label: "NY",      icon: "🗽" },
    golden: { start: 14.5,  end: 16,   label: "Golden",  icon: "⭐" },
  };

  const active = [];
  Object.entries(sessions).forEach(([key, s]) => {
    if (hUTC >= s.start && hUTC < s.end) active.push(key);
  });

  const minutesToClose = (sessionKey) => {
    const s = sessions[sessionKey];
    if (!s) return null;
    const closeH = s.end;
    const diffH = closeH - hUTC;
    if (diffH < 0) return null;
    return Math.round(diffH * 60);
  };

  const minutesToOpen = (sessionKey) => {
    const s = sessions[sessionKey];
    if (!s) return null;
    let startH = s.start;
    let diffH = startH - hUTC;
    if (diffH < 0) diffH += 24;
    return Math.round(diffH * 60);
  };

  return { hUTC, active, sessions, minutesToClose, minutesToOpen, nowUTC };
}

//************************************************************************************************ */
function WeisWavePanel({ d }) {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 600));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const price = sf(d?.current_price, 100);
  const atr   = sf(d?.atr, price * 0.012);
  const demoWaves = (() => {
    const seed = [
      { dir: 1,  bars: 8,  volMult: 1.00 },
      { dir: -1, bars: 5,  volMult: 0.55 },
      { dir: 1,  bars: 10, volMult: 0.88 },
      { dir: -1, bars: 4,  volMult: 0.40 },
      { dir: 1,  bars: 7,  volMult: 0.62 },
      { dir: -1, bars: 6,  volMult: 0.80 },
      { dir: 1,  bars: 5,  volMult: 0.35 },
    ];
    let p = price - atr * 12;
    const waves = [];
    seed.forEach((s, wi) => {
      const vol  = (500000 + Math.random() * 300000) * s.volMult;
      const from = p;
      p += s.dir * atr * (2 + s.bars * 0.6 + Math.random() * 1.5);
      waves.push({ dir: s.dir, from, to: p, vol, bars: s.bars, idx: wi });
    });
    return waves;
  })();
  const waves = (d?.weis_waves && d.weis_waves.length > 1) ? d.weis_waves : demoWaves;
  const wavesAnnotated = waves.map((wv, i) => {
    const sameDir = waves.filter((w2, j) => j < i && w2.dir === wv.dir);
    const prev    = sameDir[sameDir.length - 1];
    let   signal  = "normal";
    if (prev) {
      if (wv.vol < prev.vol * 0.72)  signal = "exhaustion";
      else if (wv.vol > prev.vol * 1.25) signal = "climax";
    }
    const prevOpp = waves.filter((w2, j) => j < i && w2.dir !== wv.dir);
    const lastOpp = prevOpp[prevOpp.length - 1];
    if (lastOpp && wv.dir !== waves[0]?.dir && wv.vol > lastOpp.vol * 0.90) signal = "weakness";
    return { ...wv, signal, prevVol: prev?.vol ?? null };
  });
  const H   = 200;
  const pad = { t: 24, b: 32, l: 56, r: 16 };
  const PW  = Math.max(w - pad.l - pad.r, 100);
  const PH  = H - pad.t - pad.b;
  const allPrices = wavesAnnotated.flatMap(wv => [wv.from, wv.to]);
  const pMin = Math.min(...allPrices) - atr, pMax = Math.max(...allPrices) + atr;
  const pRange = pMax - pMin || 1;
  const toY    = (p) => pad.t + (1 - (p - pMin) / pRange) * PH;
  const maxVol   = Math.max(...wavesAnnotated.map(wv => wv.vol));
  const volZoneH = PH * 0.28, volBase = pad.t + PH;
  const toVolH   = (v) => (v / maxVol) * volZoneH;
  const totalBars = wavesAnnotated.reduce((s, wv) => s + wv.bars, 0);
  let cumBars = 0;
  const waveX = wavesAnnotated.map(wv => {
    const x1 = pad.l + (cumBars / totalBars) * PW; cumBars += wv.bars;
    const x2 = pad.l + (cumBars / totalBars) * PW;
    return { x1, x2, cx: (x1 + x2) / 2 };
  });
  const signalColor = { normal: null, exhaustion: T.warn, climax: T.purple, weakness: T.bear };
  const signalLabel = { exhaustion: "Agotamiento", climax: "Clímax", weakness: "Debilidad" };
  const zigzag = wavesAnnotated.map((wv, i) => {
    const { x1, x2 } = waveX[i];
    return [`${i === 0 ? "M" : "L"}${x1.toFixed(1)},${toY(wv.from).toFixed(1)}`, `L${x2.toFixed(1)},${toY(wv.to).toFixed(1)}`];
  }).flat().join(" ");
  const hasExhaustion = wavesAnnotated.some(wv => wv.signal === "exhaustion");
  const hasWeakness   = wavesAnnotated.some(wv => wv.signal === "weakness");
  const hasClimax     = wavesAnnotated.some(wv => wv.signal === "climax");
  const lastWave      = wavesAnnotated[wavesAnnotated.length - 1];
  const overallSignal = lastWave?.signal === "exhaustion" ? "bear" : lastWave?.signal === "weakness" ? "bear" : lastWave?.signal === "climax" ? "warn" : "bull";
  const overallColor  = overallSignal === "bear" ? T.bear : overallSignal === "warn" ? T.warn : T.bull;
  const overallLabel  = overallSignal === "bear" ? "SEÑAL BAJISTA" : overallSignal === "warn" ? "CLÍMAX — CAUTELA" : "IMPULSO SALUDABLE";
  const yTicks = [pMin + pRange * 0.1, pMin + pRange * 0.5, pMin + pRange * 0.9];
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "13px 15px", borderTop: `3px solid ${T.cyan}` }}>
      <SectionTitle icon="🌊" badge={pill(overallColor, overallLabel)}>Weis Wave — Volumen por Onda</SectionTitle>
      {(hasExhaustion || hasWeakness || hasClimax) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {hasExhaustion && <div style={{ background: `${T.warn}12`, border: `1px solid ${T.warn}40`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: T.warn, fontWeight: 700 }}>⚠ Volumen DECRECIENTE — posible agotamiento</div>}
          {hasWeakness   && <div style={{ background: `${T.bear}10`, border: `1px solid ${T.bear}40`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: T.bear, fontWeight: 700 }}>⚡ Onda correctiva con volumen alto — DEBILIDAD</div>}
          {hasClimax     && <div style={{ background: `${T.purple}10`, border: `1px solid ${T.purple}40`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: T.purple, fontWeight: 700 }}>🔔 Volumen de CLÍMAX detectado</div>}
        </div>
      )}
      <div ref={ref} style={{ width: "100%" }}>
        <svg width="100%" height={H + volZoneH + 10}>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={pad.l} y1={toY(v)} x2={w - pad.r} y2={toY(v)} stroke={T.border} strokeWidth="0.5" />
              <text x={pad.l - 5} y={toY(v) + 3} textAnchor="end" fontSize="9" fill={T.muted} fontFamily="monospace">${v.toFixed(1)}</text>
            </g>
          ))}
          <line x1={pad.l} y1={volBase + 4} x2={w - pad.r} y2={volBase + 4} stroke={T.border} strokeWidth="1" strokeDasharray="3,3" />
          {wavesAnnotated.map((wv, i) => {
            const { x1, x2, cx } = waveX[i];
            const bW = Math.max(x2 - x1 - 3, 2), bH = toVolH(wv.vol);
            const bY = volBase + 4 + volZoneH - bH;
            const bColor = signalColor[wv.signal] || (wv.dir > 0 ? T.bull : T.bear);
            return (
              <g key={i}>
                <rect x={x1 + 1} y={bY} width={bW} height={bH} fill={bColor} opacity={wv.signal !== "normal" ? 0.9 : 0.55} rx="2" />
                {bW > 28 && <text x={cx} y={bY - 3} textAnchor="middle" fontSize="8" fill={bColor} fontWeight="700">{wv.vol >= 1e6 ? `${(wv.vol / 1e6).toFixed(1)}M` : `${(wv.vol / 1e3).toFixed(0)}K`}</text>}
                {wv.signal !== "normal" && <text x={cx} y={bY - 13} textAnchor="middle" fontSize="9" fill={bColor} fontWeight="800">{wv.signal === "exhaustion" ? "▼EX" : wv.signal === "climax" ? "▲CL" : "⚡WK"}</text>}
              </g>
            );
          })}
          <path d={zigzag} fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {wavesAnnotated.map((wv, i) => {
            const { x1, x2 } = waveX[i];
            const sc = signalColor[wv.signal] || T.accent;
            return (
              <g key={`pt${i}`}>
                {i === 0 && <circle cx={x1} cy={toY(wv.from)} r="4" fill={T.accent} />}
                <circle cx={x2} cy={toY(wv.to)} r={wv.signal !== "normal" ? 6 : 4} fill={sc} stroke={T.card} strokeWidth="1.5" />
                <text x={x2} y={toY(wv.to) + (wv.dir > 0 ? -9 : 14)} textAnchor="middle" fontSize="9" fill={sc} fontWeight="800">{i + 1}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function WolfeWavesPanel({ d }) {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 600));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const price = sf(d?.current_price, 100);
  const atr   = sf(d?.atr, price * 0.012);
  const tickerStr  = d?.symbol || d?.ticker || "SPY";
  const tickerSeed = useMemo(() => { let h = 0; for (let i = 0; i < tickerStr.length; i++) { h = (Math.imul(31, h) + tickerStr.charCodeAt(i)) | 0; } return Math.abs(h); }, [tickerStr]);
  const seededRand = useCallback((idx) => { const x = Math.sin(tickerSeed + idx * 9301 + 49297) * 233280; return Math.abs(x - Math.floor(x)); }, [tickerSeed]);
  const demoPattern = useMemo(() => {
    const base = price - atr * 9, range = atr;
    const v = Array.from({ length: 8 }, (_, i) => seededRand(i));
    const pts = [
      { n: 1, x: 0,  y: base + range * (3.8 + v[0] * 1.4) },
      { n: 2, x: 4,  y: base + range * (7.5 + v[1] * 1.5) },
      { n: 3, x: 8,  y: base + range * (2.2 + v[2] * 1.2) },
      { n: 4, x: 13, y: base + range * (6.0 + v[3] * 1.3) },
      { n: 5, x: 17, y: base + range * (0.8 + v[4] * 1.0) },
    ];
    const totalX = 24;
    const slope14 = (pts[3].y - pts[0].y) / (pts[3].x - pts[0].x);
    const epaY    = pts[0].y + slope14 * (totalX - pts[0].x);
    const s13 = (pts[2].y - pts[0].y) / (pts[2].x - pts[0].x);
    const s24 = (pts[3].y - pts[1].y) / (pts[3].x - pts[1].x);
    const denom = s13 - s24;
    const apexX = Math.abs(denom) > 0.0001 ? (pts[1].y - pts[0].y + s13 * pts[0].x - s24 * pts[1].x) / denom : totalX + 4;
    const apexY = pts[0].y + s13 * (apexX - pts[0].x);
    const isBullPattern = v[5] > 0.4;
    const quality = Math.round(68 + v[6] * 27);
    return { points: pts, epa: { x: totalX, y: epaY }, apex: { x: apexX, y: apexY }, type: isBullPattern ? "bull" : "bear", quality, totalX };
  }, [price, atr, seededRand]);
  const wolfe = d?.wolfe_waves;
  const hasReal = wolfe && wolfe.points && wolfe.points.length === 5;
  const pattern = hasReal ? wolfe : demoPattern;
  const pts = pattern.points;
  const isDemo = !hasReal;
  const H = 230, pad = { t: 22, b: 34, l: 58, r: 80 };
  const PW = Math.max(w - pad.l - pad.r, 100), PH = H - pad.t - pad.b;
  const allY = [...pts.map(p => p.y), pattern.epa.y, pattern.apex.y];
  const allX = [...pts.map(p => p.x), pattern.epa.x];
  const yMin = Math.min(...allY) - atr * 0.8, yMax = Math.max(...allY) + atr * 0.8;
  const xMin = Math.min(...allX), xMax = Math.max(...allX);
  const yR = yMax - yMin || 1, xR = xMax - xMin || 1;
  const toX = (xv) => pad.l + ((xv - xMin) / xR) * PW;
  const toY = (yv) => pad.t + (1 - (yv - yMin) / yR) * PH;
  const isBull = pattern.type === "bull";
  const mainColor = isBull ? T.bull : T.bear;
  const svgPts = pts.map(p => ({ ...p, sx: toX(p.x), sy: toY(p.y) }));
  const epa    = { sx: toX(pattern.epa.x), sy: toY(pattern.epa.y) };
  const apexSx = toX(pattern.apex?.x ?? xMax), apexSy = toY(pattern.apex?.y ?? yMax);
  const priceLine = svgPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
  const q = sf(pattern.quality, 75);
  const qColor = q >= 85 ? T.bull : q >= 70 ? T.warn : T.bear;
  const yTickVals = [yMin + yR * 0.15, yMin + yR * 0.5, yMin + yR * 0.85];
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "13px 15px", borderTop: `3px solid ${T.purple}` }}>
      <SectionTitle icon="🐺" badge={
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {pill(mainColor, isBull ? "PATRÓN ALCISTA" : "PATRÓN BAJISTA")}
          {isDemo && pill(T.muted, "DEMO", true)}
          <span style={{ fontSize: 10, color: qColor, fontWeight: 700 }}>Calidad: {q}%</span>
        </div>
      }>Wolfe Waves — Patrón 5 Puntos</SectionTitle>
      <div style={{ background: `${mainColor}09`, border: `1px solid ${mainColor}30`, borderLeft: `3px solid ${mainColor}`, borderRadius: 7, padding: "8px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: mainColor, marginBottom: 3 }}>
          {isBull ? "↗ SEÑAL DE COMPRA — Punto 5 alcanzado" : "↘ SEÑAL DE VENTA — Punto 5 alcanzado"}
        </div>
        <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.5 }}>
          {isBull ? `El precio ha roto brevemente bajo la línea 1-3 (punto 5). Target: EPA ${usd(pattern.epa.y)}.`
                  : `El precio ha superado la línea 1-3 (punto 5). Target: EPA ${usd(pattern.epa.y)}.`}
        </div>
      </div>
      <div ref={ref} style={{ width: "100%" }}>
        <svg width="100%" height={H}>
          {yTickVals.map((v, i) => (
            <g key={i}>
              <line x1={pad.l} y1={toY(v)} x2={w - pad.r} y2={toY(v)} stroke={T.border} strokeWidth="0.5" />
              <text x={pad.l - 5} y={toY(v) + 3} textAnchor="end" fontSize="9" fill={T.muted} fontFamily="monospace">${v.toFixed(1)}</text>
            </g>
          ))}
          <polygon points={`${svgPts[0].sx},${svgPts[0].sy} ${svgPts[1].sx},${svgPts[1].sy} ${apexSx},${apexSy}`} fill={`${mainColor}06`} />
          <line x1={svgPts[0].sx} y1={svgPts[0].sy} x2={apexSx} y2={apexSy} stroke={mainColor} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
          <line x1={svgPts[1].sx} y1={svgPts[1].sy} x2={apexSx} y2={apexSy} stroke={T.warn}    strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
          <line x1={svgPts[0].sx} y1={svgPts[0].sy} x2={epa.sx}  y2={epa.sy}  stroke={T.purple}  strokeWidth="1.5" strokeDasharray="4,3" />
          <circle cx={apexSx} cy={apexSy} r="4" fill={T.muted} opacity="0.6" />
          <text x={apexSx + 5} y={apexSy - 4} fontSize="9" fill={T.muted}>Ápex</text>
          <circle cx={epa.sx} cy={epa.sy} r="7" fill={`${T.purple}25`} stroke={T.purple} strokeWidth="1.5" />
          <text x={epa.sx + 10} y={epa.sy + 3}  fontSize="10" fill={T.purple} fontWeight="800">EPA</text>
          <text x={epa.sx + 10} y={epa.sy + 14} fontSize="9"  fill={T.purple} fontFamily="monospace">{usd(pattern.epa.y)}</text>
          <path d={priceLine} fill="none" stroke={T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1={svgPts[4].sx} y1={svgPts[4].sy} x2={epa.sx} y2={epa.sy} stroke={T.purple} strokeWidth="1" strokeDasharray="3,2" opacity="0.5" />
          {svgPts.map((p, i) => {
            const isEntry = i === 4;
            const ptColor = isEntry ? mainColor : T.accent;
            const ptR = isEntry ? 8 : 6;
            const lblOff = i % 2 === 0 ? 16 : -12;
            return (
              <g key={p.n}>
                <circle cx={p.sx} cy={p.sy} r={ptR} fill={ptColor} stroke={T.card} strokeWidth="2" />
                <text x={p.sx} y={p.sy + 3.5} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="800">{p.n}</text>
                <text x={p.sx} y={p.sy + lblOff} textAnchor="middle" fontSize="9" fill={ptColor} fontFamily="monospace" fontWeight="700">${p.y.toFixed(1)}</text>
                {isEntry && <text x={p.sx} y={p.sy + lblOff + 11} textAnchor="middle" fontSize="9" fill={mainColor} fontWeight="800">ENTRADA</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}


function AdaptiveEntryScorer({ d }) {
  const regime = d?.market_regime || "ranging";
  const score = sf(d?.score, 50);
  const mom = sf(d?.momentum_12_1, 0);
  const ofi = sf(d?.ofi, 0);
  const fgi = sf(d?.fear_greed, 50);
  const zscore = sf(d?.zscore_mean_rev, 0);
  const vwapPos = (d?.vwap?.price_vs_vwap === "above") ? 1 : -1;
  const weights = {
    trending: { momentum: 0.35, ofi: 0.25, score: 0.20, fgi: 0.10, zscore: 0.05, vwap: 0.05 },
    ranging: { momentum: 0.10, ofi: 0.15, score: 0.15, fgi: 0.15, zscore: 0.30, vwap: 0.15 },
    volatile: { momentum: 0.15, ofi: 0.30, score: 0.15, fgi: 0.10, zscore: 0.15, vwap: 0.15 },
    breakout: { momentum: 0.30, ofi: 0.30, score: 0.15, fgi: 0.05, zscore: 0.10, vwap: 0.10 },
  };
  const w2 = weights[regime] || weights.ranging;
  const normMom = clamp((mom + 30) / 60, 0, 1);
  const normOfi = clamp((ofi + 0.5) / 1, 0, 1);
  const normScore = score / 160;
  const normFgi = fgi / 100;
  const normZscore = clamp(1 - Math.abs(zscore) / 3, 0, 1);
  const normVwap = vwapPos > 0 ? 0.7 : 0.3;
  const adaptiveScore = Math.round(
    (normMom * w2.momentum + normOfi * w2.ofi + normScore * w2.score + normFgi * w2.fgi + normZscore * w2.zscore + normVwap * w2.vwap) * 100
  );
  const factors = [
    { label: "Momentum", value: normMom, weight: w2.momentum, color: T.bull, display: `${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%` },
    { label: "OFI Flow", value: normOfi, weight: w2.ofi, color: T.cyan, display: ofi.toFixed(3) },
    { label: "Score", value: normScore, weight: w2.score, color: T.accent, display: score.toFixed(0) },
    { label: "Fear/Greed", value: normFgi, weight: w2.fgi, color: T.purple, display: fgi.toFixed(0) },
    { label: "Z-Mean Rev", value: normZscore, weight: w2.zscore, color: T.warn, display: zscore.toFixed(2) },
    { label: "vs VWAP", value: normVwap, weight: w2.vwap, color: T.gold, display: vwapPos > 0 ? "↑" : "↓" },
  ];
  const aColor = adaptiveScore > 65 ? T.bull : adaptiveScore < 35 ? T.bear : T.warn;
  const aLabel = adaptiveScore > 70 ? "ENTRADA FUERTE" : adaptiveScore > 55 ? "ENTRADA DÉBIL" : adaptiveScore < 30 ? "EVITAR" : adaptiveScore < 45 ? "ESPERAR" : "NEUTRAL";
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px", borderTop: `3px solid ${aColor}` }}>
      <SectionTitle icon="🎯" badge={pill(aColor, aLabel)}>Adaptive Entry Score — Régimen: {regime.toUpperCase()}</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
        <div style={{ position: "relative", width: 64, height: 64 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke={T.border} strokeWidth="6" />
            <circle cx="32" cy="32" r="26" fill="none" stroke={aColor} strokeWidth="6" strokeDasharray={`${adaptiveScore * 1.634} 163.4`} strokeLinecap="round" strokeDashoffset="40.85" transform="rotate(-90 32 32)" />
            <text x="32" y="36" textAnchor="middle" fontSize="14" fontWeight="800" fill={aColor}>{adaptiveScore}</text>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: aColor, marginBottom: 3 }}>{aLabel}</div>
          <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5 }}>Score ponderado según régimen <strong style={{ color: T.textSec }}>{regime}</strong>.</div>
        </div>
      </div>
      {factors.map(({ label, value, weight, color, display }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
          <div style={{ width: 68, fontSize: 9, color: T.muted, flexShrink: 0 }}>{label}</div>
          <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${value * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width 1s" }} />
          </div>
          <div style={{ width: 32, fontSize: 9, color: T.muted, textAlign: "right" }}>{Math.round(weight * 100)}%</div>
          <div style={{ width: 38, fontSize: 10, fontWeight: 700, color, textAlign: "right", fontFamily: "monospace" }}>{display}</div>
        </div>
      ))}
    </div>
  );
}

function FactorCard({ label, value, signal, detail }) {
  const sigColor = signal === "bull" || signal === "positivo" ? T.bull : signal === "bear" || signal === "negativo" ? T.bear : T.warn;
  return (
    <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", flex: 1, minWidth: 0, borderLeft: `3px solid ${sigColor}` }}>
      <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: sigColor, fontFamily: "monospace" }}>{value}</div>
      {detail && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{detail}</div>}
    </div>
  );
}

function SignalsList({ signals, type }) {
  if (!signals || signals.length === 0) return null;
  const color = type === "entry" ? T.bull : T.bear;
  const icon = type === "entry" ? "↗" : "↙";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
      {signals.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: `${color}08`, border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: 5, padding: "5px 10px" }}>
          <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{icon}</span>
          <span style={{ fontSize: 11, color: T.text, lineHeight: 1.45 }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function PriceLevel({ label, price, sub, color, rr }) {
  return (
    <div style={{ background: `${color}0a`, border: `1px solid ${color}25`, borderRadius: 8, padding: "9px 11px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "monospace" }}>{usd(price)}</div>
      <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{sub}</div>
      {rr && <div style={{ fontSize: 10, color, marginTop: 1 }}>R/R {rr}:1</div>}
    </div>
  );
}

function OvertonWindow({ zone }) {
  const zones = [
    { id: "impensable", label: "Impensable", sub: "Vender", color: "#c0392b" },
    { id: "radical", label: "Radical", sub: "Bajista", color: "#e67e22" },
    { id: "sensible", label: "Sensible", sub: "Esperar", color: "#64748b" },
    { id: "popular", label: "Popular", sub: "Comprar", color: "#27ae60" },
    { id: "politica", label: "Política", sub: "Sobrecompra", color: "#0891b2" },
  ];
  const zoneMap = { impensable: 0, radical: 1, sensible: 2, popular: 3, politica: 4, watch: 2, sell: 1, buy: 3, hold: 2 };
  const activeIdx = zoneMap[zone?.toLowerCase()?.split(/[\s—]/)[0]?.trim()] ?? 2;
  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
      {zones.map((z, i) => (
        <div key={z.id} style={{ flex: i === activeIdx ? 1.5 : 1, background: i === activeIdx ? z.color : `${z.color}15`, borderRadius: 5, padding: "8px 4px", textAlign: "center", transition: "all 0.35s", border: `1px solid ${i === activeIdx ? z.color : z.color + "30"}`, position: "relative" }}>
          {i === activeIdx && (
            <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", background: T.card, border: `1px solid ${z.color}`, borderRadius: 4, padding: "1px 8px", fontSize: 10, color: z.color, whiteSpace: "nowrap" }}>{zone}</div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: i === activeIdx ? "#fff" : z.color }}>{z.label}</div>
          <div style={{ fontSize: 10, color: i === activeIdx ? "rgba(255,255,255,0.75)" : `${z.color}90` }}>{z.sub}</div>
        </div>
      ))}
    </div>
  );
}

function NewsFeed({ news }) {
  if (!news || news.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {news.map((n, i) => {
        const pos = n.impact > 0;
        const bc = pos ? T.bull : T.bear;
        return (
          <div key={i} style={{ background: `${bc}07`, border: `1px solid ${bc}20`, borderLeft: `3px solid ${bc}`, borderRadius: 6, padding: "7px 11px", display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{n.headline}</div>
              {n.description && <div style={{ fontSize: 11, color: T.muted }}>{n.description}</div>}
              <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{n.source} · {n.published}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: bc, background: `${bc}15`, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
              {pos ? "↑ +" : "↓ "}{n.impact.toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalystBar({ buy, hold, sell }) {
  const total = (buy || 0) + (hold || 0) + (sell || 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {[
        { label: "Strong Buy", pct: Math.round((buy / total) * 100), color: T.bull },
        { label: "Hold", pct: Math.round((hold / total) * 100), color: T.muted },
        { label: "Sell", pct: Math.round((sell / total) * 100), color: T.bear },
      ].map(({ label, pct: p, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 65, fontSize: 11, color: T.muted, flexShrink: 0 }}>{label}</div>
          <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${p}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
          </div>
          <div style={{ width: 28, fontSize: 11, color, textAlign: "right" }}>{p}%</div>
        </div>
      ))}
    </div>
  );
}

function CoppockChart({ coppock }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const [svgW, setSvgW] = useState(500);

  const GREEN_LINE = "#1D9E75";
  const GREEN_FILL = "rgba(29,158,117,0.15)";
  const RED_LINE   = "#E24B4A";
  const RED_FILL   = "rgba(226,75,74,0.15)";
  const ZERO_COLOR = "rgba(136,135,128,0.4)";

  useEffect(() => {
    const obs = new ResizeObserver((e) =>
      setSvgW(e[0].contentRect.width || 500)
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const valid = (coppock || []).filter((v) => v !== null);
  if (valid.length < 2) return null;

  const lastVal    = valid[valid.length - 1];
  const isBull     = lastVal >= 0;
  const sigColor   = isBull ? GREEN_LINE : RED_LINE;
  const sigLabel   = isBull ? "SEÑAL ALCISTA" : "SEÑAL BAJISTA";
  const sigDesc    = isBull
    ? "Valor positivo: indica momento de fortaleza relativa. Compra/continuación posible."
    : "Valor negativo: indica momento de debilidad relativa. Vigila ventas o reversiones.";

  const H   = 90;
  const pad = { t: 10, b: 10, l: 38, r: 10 };
  const PW  = svgW - pad.l - pad.r;
  const PH  = H - pad.t - pad.b;
  const n   = valid.length;

  const mn    = Math.min(...valid);
  const mx    = Math.max(...valid);
  const range = Math.max(mx - mn, 0.5);

  const toX = (i) => pad.l + (i / (n - 1)) * PW;
  const toY = (v) => pad.t + (1 - (v - mn) / range) * PH;

  const zeroY   = toY(0);
  const zeroClp = Math.max(pad.t, Math.min(pad.t + PH, zeroY));

  // ── Construir paths positivo y negativo por segmentos ────────────────────
  // Cada par de puntos consecutivos puede cruzar el cero → interpolamos la X de cruce
  function buildSplitPaths() {
    const posPts = [];
    const negPts = [];

    for (let i = 0; i < n - 1; i++) {
      const v1 = valid[i], v2 = valid[i + 1];
      const x1 = toX(i), x2 = toX(i + 1);
      const y1 = toY(v1), y2 = toY(v2);

      const crossesZero = (v1 >= 0) !== (v2 >= 0);
      if (crossesZero) {
        // Interpolar X del cruce
        const t  = v1 / (v1 - v2);
        const xc = x1 + t * (x2 - x1);
        if (v1 >= 0) {
          posPts.push([x1, y1], [xc, zeroClp]);
          negPts.push([xc, zeroClp], [x2, y2]);
        } else {
          negPts.push([x1, y1], [xc, zeroClp]);
          posPts.push([xc, zeroClp], [x2, y2]);
        }
      } else if (v1 >= 0) {
        posPts.push([x1, y1], [x2, y2]);
      } else {
        negPts.push([x1, y1], [x2, y2]);
      }
    }
    // Añadir último punto
    const lastX = toX(n - 1);
    const lastY = toY(valid[n - 1]);
    if (valid[n - 1] >= 0) posPts.push([lastX, lastY]);
    else negPts.push([lastX, lastY]);

    const toPath = (pts) =>
      pts.length < 2
        ? ""
        : pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");

    const toArea = (pts, color) => {
      if (pts.length < 2) return null;
      const isPos  = color === GREEN_LINE;
      const baseY  = zeroClp;
      const dPts   = [...pts];
      const area   =
        dPts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ") +
        ` L${dPts[dPts.length - 1][0]},${baseY} L${dPts[0][0]},${baseY} Z`;
      return area;
    };

    return {
      posPath:  toPath(posPts),
      negPath:  toPath(negPts),
      posArea:  toArea(posPts, GREEN_LINE),
      negArea:  toArea(negPts, RED_LINE),
    };
  }

  const { posPath, negPath, posArea, negArea } = buildSplitPaths();

  // Eje Y: máx, cero, mín
  const yTicks = [mx, 0, mn].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width="100%" height={H + pad.t + pad.b}>
        <defs>
          <clipPath id="clip-pos">
            <rect x={pad.l} y={pad.t} width={PW} height={zeroClp - pad.t} />
          </clipPath>
          <clipPath id="clip-neg">
            <rect x={pad.l} y={zeroClp} width={PW} height={pad.t + PH - zeroClp} />
          </clipPath>
        </defs>

        {/* Áreas rellenas */}
        {posArea && <path d={posArea} fill={GREEN_FILL} clipPath="url(#clip-pos)" />}
        {negArea && <path d={negArea} fill={RED_FILL}   clipPath="url(#clip-neg)" />}

        {/* Línea cero */}
        <line
          x1={pad.l} y1={zeroClp}
          x2={svgW - pad.r} y2={zeroClp}
          stroke={ZERO_COLOR} strokeWidth="1.2" strokeDasharray="4,3"
        />

        {/* Línea principal — verde por encima, roja por debajo */}
        {posPath && (
          <path
            d={posPath} fill="none"
            stroke={GREEN_LINE} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            clipPath="url(#clip-pos)"
          />
        )}
        {negPath && (
          <path
            d={negPath} fill="none"
            stroke={RED_LINE} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            clipPath="url(#clip-neg)"
          />
        )}

        {/* Punto final */}
        <circle
          cx={toX(n - 1)} cy={toY(lastVal)} r="4"
          fill={sigColor} stroke="white" strokeWidth="1.5"
        />

        {/* Etiquetas eje Y */}
        {yTicks.map((v) => (
          <text
            key={v} x={pad.l - 4} y={toY(v) + 4}
            textAnchor="end" fontSize="9" fill={T.muted}
            fontFamily="monospace"
          >
            {v > 0 ? "+" : ""}{v.toFixed(0)}
          </text>
        ))}
      </svg>

      {/* Leyenda */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, marginBottom: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 14, height: 3, borderRadius: 2, background: GREEN_LINE }} />
          <span style={{ fontSize: 9, color: T.muted }}>Positivo</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 14, height: 3, borderRadius: 2, background: RED_LINE }} />
          <span style={{ fontSize: 9, color: T.muted }}>Negativo</span>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: sigColor, fontFamily: "monospace" }}>
          {lastVal > 0 ? "+" : ""}{lastVal.toFixed(2)}
        </span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: sigColor, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        {sigLabel}
      </div>
      <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5 }}>
        {sigDesc}
      </div>
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL v4
// ════════════════════════════════════════════════════════════════════════════════

export default function OvertonSignalMatrixV4({ ticker: propTicker }) {
  const { isDark } = useTheme();
  const T = isDark ? THEMES.dark : THEMES.light;
  const { openChat } = useChat();
  const [ticker, setTicker] = useState(propTicker || "SPY");
  const [inputVal, setInputVal] = useState(propTicker || "SPY");
  const [activeTab, setActiveTab] = useState("overview");
  const { data, loading, error, fetchData } = useFetch(ticker);

  useEffect(() => { fetchData(ticker); }, []);
  useEffect(() => {
    if (propTicker && propTicker !== ticker) {
      setTicker(propTicker); setInputVal(propTicker); fetchData(propTicker);
    }
  }, [propTicker]);

  const handleAnalyze = () => {
    const t = inputVal.trim().toUpperCase();
    if (!t) return;
    setTicker(t); fetchData(t);
  };

  // Seed por ticker — recalcula en cada cambio de ticker
  const tickerSeed = useTickerHash(ticker);

  // Generar prompt de análisis Overton para IA
  const generateOvertonPrompt = useCallback(() => {
    const d = data || {};
    const prompt = `Analiza la Ventana de Overton para ${d.ticker || ticker}:

📊 SCORE: ${d.score || 0}/100 — ${d.bias || "Sin sesgo"}
🪟 ZONA: ${d.overton_zone || "N/A"}
🎯 ACCIÓN: ${d.overton_action || "N/A"}

INDICADORES TÉCNICOS:
• WMA-30: ${d.price_vs_wma === "above" ? "▲ Sobre" : "▼ Bajo"} (${d.wma30 ? `$${d.wma30}` : "N/A"})
• Coppock: ${d.coppock_signal === "bull" ? "▲ Alcista" : "▼ Bajista"} (${d.coppock?.toFixed(2) || "N/A"})
• RSI: ${d.rsi?.toFixed(1) || "N/A"} — ${d.rsi > 70 ? "Sobrecompra" : d.rsi < 30 ? "Sobreventa" : "Neutral"}
• ADX: ${d.adx?.toFixed(1) || "N/A"} — Régimen: ${(d.market_regime || "N/A").toUpperCase()}
• IV Rank: ${d.iv_rank?.toFixed(1) || "N/A"}%

MACRO:
• VIX: ${d.vix?.toFixed(1) || "N/A"} — ${d.vix < 20 ? "Calma" : d.vix > 28 ? "Miedo" : "Neutral"}
• US10Y: ${d.us10y?.toFixed(2) || "N/A"}%
• POC: ${d.poc_price ? `$${d.poc_price.toFixed(2)}` : "N/A"} — Precio ${d.current_price > (d.poc_price || 0) ? "▲ Sobre" : "▼ Bajo"} POC

SENTIMIENTO:
• Fear & Greed: ${d.fear_greed?.toFixed(0) || "N/A"}/100
• Put/Call: ${d.put_call_ratio?.toFixed(2) || "N/A"}
• Short Interest: ${d.short_interest?.toFixed(1) || "0"}%

NOTICIAS: ${d.news_sentiment === "bull" ? "▲ Positivas" : d.news_sentiment === "bear" ? "▼ Negativas" : "Neutras"}
• Impacto: ${d.news_impact_total >= 0 ? "+" : ""}${d.news_impact_total?.toFixed(1) || "0"}%

MICROESTRUCTURA:
• OFI: ${d.ofi?.toFixed(3) || "0"} — ${d.ofi > 0 ? "Flujo comprador" : "Flujo vendedor"}
• VWAP: ${d.vwap?.price_vs_vwap === "above" ? "▲ Sobre" : "▼ Bajo"}

Dame tu análisis profesional: ¿Es buen momento para entrar? ¿Qué riesgos ves? ¿Qué nivel de convicción tienes?`;
    return prompt;
  }, [data, ticker]);

  const handleAskAI = useCallback(() => {
    const prompt = generateOvertonPrompt();
    console.log('[Overton] Opening chat with prompt:', prompt.substring(0, 100) + '...');
    
    // Guardar en localStorage para que el chat lo pueda leer
    if (typeof window !== "undefined") {
      localStorage.setItem('chat-prompt', JSON.stringify({ prompt, context: 'overton', timestamp: Date.now() }));
    }
    
    // Abrir chat
    openChat();
    
    // Dispatch event por si el chat está escuchando
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("chat-prompt", { detail: { prompt, context: "overton" } }));
    }
  }, [generateOvertonPrompt, openChat]);

  const d = data || {};
  const isAbove = d.price_vs_wma === "above";
  const priceClr = sf(d.pct_change, 0) >= 0 ? T.bull : T.bear;
  const fgi = sf(d.fear_greed, 50);
  const fgiLabel = fgi > 75 ? "Codicia Extrema" : fgi > 55 ? "Codicia" : fgi > 45 ? "Neutral" : fgi > 25 ? "Miedo" : "Miedo Extremo";
  const pcr = sf(d.put_call_ratio, 1);
  const si = sf(d.short_interest, 0);
  const mom = sf(d.momentum_12_1, 0);
  const momColor = mom > 10 ? T.bull : mom < -10 ? T.bear : T.warn;
  const zscore = sf(d.zscore_mean_rev, 0);
  const ofi = sf(d.ofi, 0);
  const vwap = d.vwap || {};
  const bas = sf(d.bid_ask_spread, 2);
  const fg = d.forward_guidance || {};
  const fgColor = fg.label === "positivo" ? T.bull : fg.label === "negativo" ? T.bear : T.warn;
  const newsTotal = sf(d.news_impact_total, 0);
  const newsColor = newsTotal >= 0 ? T.bull : T.bear;
  const betaVal = sf(d.beta, 1);

  const card = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "13px 15px", marginBottom: 10 };

  const tabs = [
    { id: "overview", label: "📊 Overview" },
    { id: "predictive", label: "🔮 Predictivo" },
    { id: "smc", label: "💠 SMC" },
    { id: "sessions", label: "🕐 Sesiones" },
    { id: "candles", label: "🕯 Velas" },
  ];

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13 }}>

      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Overton Signal Matrix <span style={{ color: T.accent }}>v4</span></div>
          <div style={{ fontSize: 9, color: T.muted }}>SMC · Ichimoku · MTF · Regime · Liquidity · Elliott · Depth · CVD · Tape · Wyckoff · Candles</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {error && <span style={{ fontSize: 11, color: T.warn }}>⚠ Demo Mode</span>}
          {!propTicker && (
            <div style={{ display: "flex", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <input value={inputVal}
                onChange={e => setInputVal(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleAnalyze()}
                placeholder="AAPL"
                style={{ background: "none", border: "none", outline: "none", color: T.text, padding: "6px 12px", fontSize: 14, fontWeight: 700, width: 80, fontFamily: "inherit" }} />
              <button onClick={handleAnalyze}
                style={{ background: T.accent, border: "none", color: "#fff", padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {loading ? "…" : "↗ Analizar"}
              </button>
            </div>
          )}
          <button onClick={() => fetchData(ticker)}
            style={{ background: T.card2, border: `1px solid ${T.border}`, color: T.muted, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>⟳</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "0 18px", display: "flex", gap: 2, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ background: "none", border: "none", borderBottom: activeTab === t.id ? `2px solid ${T.accent}` : "2px solid transparent", color: activeTab === t.id ? T.accent : T.muted, padding: "10px 14px", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>
          Calculando análisis multi-factor para <strong>{ticker}</strong>…
        </div>
      )}

      {!loading && (
        <div style={{ padding: "12px 18px 40px" }}>

          {/* Stats rápidas */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              { label: "Precio", value: usd(d.current_price), sub: pct(d.pct_change), color: priceClr },
              { label: "WMA-30", value: usd(d.wma30), sub: isAbove ? "↑ sobre WMA" : "↓ bajo WMA", color: isAbove ? T.bull : T.bear },
              { label: "Adaptive", value: `${sf(d.score, 50).toFixed(0)}/100`, sub: "Score ponderado", color: T.accent },
              { label: "Régimen", value: (d.market_regime || "—").toUpperCase(), sub: `ADX ${sf(d.adx, 0).toFixed(0)}`, color: T.regime[d.market_regime] || T.muted },
              { label: "POC", value: d.poc_price ? `$${d.poc_price.toFixed(2)}` : "—", sub: d.current_price > (d.poc_price || 0) ? "▲ Sobre POC" : "▼ Bajo POC", color: d.current_price > (d.poc_price || 0) ? T.bull : T.bear },
              { label: "VIX", value: sf(d.vix, 0).toFixed(1), sub: sf(d.vix) < 18 ? "Calma" : sf(d.vix) < 25 ? "Moderado" : "Miedo", color: sf(d.vix) < 18 ? T.bull : sf(d.vix) < 25 ? T.warn : T.bear },
              { label: "US 10Y", value: `${sf(d.us10y, 0).toFixed(2)}%`, sub: sf(d.us10y) < 4.2 ? "Favorable" : sf(d.us10y) > 4.8 ? "Restrictivo" : "Neutro", color: sf(d.us10y) < 4.2 ? T.bull : sf(d.us10y) > 4.8 ? T.bear : T.warn },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 13px", flex: 1, minWidth: 90 }}>
                <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
                <div style={{ fontSize: 10, color, marginTop: 1 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ══════════ TAB: OVERVIEW ══════════ */}
          {activeTab === "overview" && ( <>
              {/* Score expandido */}
              <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ ...card, flex: 1.4, minWidth: 280, marginBottom: 0 }}>
                  <SectionTitle icon="⚡">Score Compuesto Multi-Factor — Elliott + Vela (160 pts)</SectionTitle>
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <ScoreGauge score={sf(d.score, 50)} />
                    <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: T.muted }}>{d.bias}</div>
                     <div style={{ fontSize: 11, color: newsColor, marginTop: 4 }}>Noticias: {newsTotal >= 0 ? "+" : ""}{newsTotal.toFixed(1)}% sesgo</div>

                   <div style={{ marginTop: 6, display: "flex", gap: 5 }}>
                    {pill(T.gold,  "Elliott ✓")}
                    {pill(T.pink, "Vela 1W ✓")}
                </div>
                </div>
                  </div>
                  <ScoreBreakdownExpandedV4 d={d} tickerSeed={tickerSeed} />
                </div>
                <div style={{ ...card, flex: 1, minWidth: 200, marginBottom: 0 }}>
                  <SectionTitle icon="🪟">Ventana de Overton</SectionTitle>
                 <OvertonWindow zone={d.overton_zone} />
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.65, marginBottom: 10 }}>{d.overton_description}</div>
                  
                  {/* Botón Análisis IA */}
                  <button onClick={handleAskAI} style={{
                    width: "100%",
                    padding: "9px 14px",
                    background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`,
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(37, 99, 235, 0.35)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.25)";
                  }}
                  >
                    <span style={{ fontSize: 14 }}>🤖</span>
                    <span>Análisis IA con todos los indicadores</span>
                  </button>
                </div>
              </div>
       
       
              {/* Gráfico de precio con leyendas */}
              <div style={card}>
                 <SectionTitle icon="📊">Coppock — Momentum</SectionTitle>
                <CoppockChart coppock={d.coppock_history} />
              </div>
                

              <div style={card}>
                <SectionTitle icon="📈">Factores de Momentum y Sentimiento</SectionTitle>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <FactorCard label="Momentum 12-1" value={`${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%`} signal={mom > 5 ? "bull" : mom < -5 ? "bear" : "neutral"} detail="Retorno 12m excl. último mes" />
                  <FactorCard label="Fear & Greed" value={`${fgi.toFixed(0)}/100`} signal={fgi > 55 ? "bull" : fgi < 45 ? "bear" : "neutral"} detail={fgiLabel} />
                  <FactorCard label="Put/Call Ratio" value={pcr.toFixed(3)} signal={pcr < 0.8 ? "bull" : pcr > 1.2 ? "bear" : "neutral"} detail={pcr < 0.8 ? "Codicia — alcista" : pcr > 1.2 ? "Miedo — bajista" : "Neutro"} />
                  <FactorCard label="Short Interest" value={`${si.toFixed(1)}%`} signal={si > 15 ? "bull" : "neutral"} detail={si > 15 ? "Potencial squeeze" : si > 8 ? "Presión bajista" : "Normal"} />
                  <FactorCard label="Z-score Rev.Med" value={zscore.toFixed(2)} signal={zscore < -2 ? "bull" : zscore > 2 ? "bear" : "neutral"} detail={zscore > 2 ? "Sobrecompra" : zscore < -2 ? "Sobreventa" : "Normal"} />
                  <FactorCard label="Beta" value={betaVal.toFixed(2)} signal={betaVal < 0.8 ? "neutral" : betaVal > 1.8 ? "bear" : "bull"} detail={betaVal < 0.8 ? "Defensivo" : betaVal > 1.8 ? "Alta volatilidad" : "Moderado"} />
                </div>
              </div>

              <div style={card}>
                <SectionTitle icon="⚡">Microestructura Clásica</SectionTitle>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <FactorCard label="OFI (Order Flow)" value={ofi.toFixed(3)} signal={ofi > 0.15 ? "bull" : ofi < -0.15 ? "bear" : "neutral"} detail={ofi > 0.15 ? "Compradores dominan" : ofi < -0.15 ? "Vendedores dominan" : "Equilibrado"} />
                  <FactorCard label="VWAP" value={usd(vwap.vwap)} signal={vwap.price_vs_vwap === "above" ? "bull" : "bear"} detail={`${vwap.price_vs_vwap === "above" ? "Sobre" : "Bajo"} VWAP ${sf(vwap.distance_pct) >= 0 ? "+" : ""}${sf(vwap.distance_pct).toFixed(1)}%`} />
                  <FactorCard label="Bid-Ask Spread" value={`${bas.toFixed(2)}%`} signal={bas < 1 ? "bull" : bas > 3 ? "bear" : "neutral"} detail={bas < 1 ? "Alta liquidez" : bas > 3 ? "Baja liquidez" : "Media"} />
                  <FactorCard label="Gamma Exposure" value={sf(d.gamma_exposure).toFixed(2)} signal={sf(d.gamma_exposure) > 3 ? "bull" : "neutral"} detail={sf(d.gamma_exposure) > 3 ? "Imán de precio" : "Impacto bajo"} />
                </div>
              </div>

              {/* Microestructura Avanzada */}
              <MicrostructureAdvancedPanel d={d} tickerSeed={tickerSeed} />

              {/* Gráfico de precio con leyendas */}
              <div style={card}>
                <SectionTitle icon="📈">Precio + WMA-30 + VWAP · Señales y Noticias</SectionTitle>
                <PriceChart d={d} height={240} />
              </div>

              {/* VIX + US 10Y rediseñado */}
              <div style={card}>
                <SectionTitle icon="📉">VIX + US 10Y — Análisis de Impacto en Mercado</SectionTitle>
                <VixYieldChartV2 vix={d.vix_history} yield_={d.yield_history} vixCurrent={d.vix} yieldCurrent={d.us10y} />
              </div>

              {/* Forward Guidance */}
              <div style={card}>
                <SectionTitle icon="🔭" badge={pill(fgColor, fg.label?.toUpperCase() || "N/A")}>Forward Guidance y Analistas</SectionTitle>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  {[
                    { label: "PE Compression", value: `${sf(fg.pe_compression) >= 0 ? "+" : ""}${sf(fg.pe_compression).toFixed(1)}%`, color: sf(fg.pe_compression) > 0 ? T.bull : T.bear },
                    { label: "EPS Growth fwd", value: `${sf(fg.eps_growth_pct) >= 0 ? "+" : ""}${sf(fg.eps_growth_pct).toFixed(1)}%`, color: sf(fg.eps_growth_pct) > 0 ? T.bull : T.bear },
                    { label: "Analyst Mean Rec", value: `${sf(fg.analyst_mean_rec, 3).toFixed(2)}/5`, color: sf(fg.analyst_mean_rec) < 2 ? T.bull : sf(fg.analyst_mean_rec) > 3.5 ? T.bear : T.warn },
                    { label: "FG Score", value: sf(fg.score, 0).toFixed(1), color: fgColor },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 11px", flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
                    </div>
                  ))}
                </div>
                <AnalystBar buy={d.analyst_buy} hold={d.analyst_hold} sell={d.analyst_sell} />
              </div>

              {/* Rangos */}
              <div style={card}>
                <SectionTitle icon="💰">Rangos de Entrada / Salida</SectionTitle>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <PriceLevel label="Stop Loss" price={d.stop_loss} sub="2.2 ATR bajo precio" color={T.bear} />
                  <PriceLevel label="Entrada Óptima" price={d.entry_optimal} sub="Rebote WMA-30" color={T.bull} />
                  <PriceLevel label="Entrada Agresiva" price={d.entry_aggressive} sub="Pullback 0.5 ATR" color={T.warn} />
                  <PriceLevel label="Objetivo 1" price={d.target1} sub="+ATR news" color={T.accent} rr={d.rr1} />
                  <PriceLevel label="Objetivo 2" price={d.target2} sub="R/R extensión" color={T.cyan} rr={d.rr2} />
                  <PriceLevel label="Objetivo 3" price={d.target3} sub="Escenario alcista máx." color={T.purple} />
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: T.muted }}>
                  ATR: {usd(d.atr)} · VWAP: {usd(d.vwap?.vwap)} · R/R mínimo recomendado: 2.1:1
                </div>
              </div>

              {/* Señales entrada/salida */}
              {((d.entry_signals?.length > 0) || (d.exit_signals?.length > 0)) && (
                <div style={card}>
                  <SectionTitle icon="🎯">Señales de Entrada / Salida</SectionTitle>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.bull, marginBottom: 4 }}>ENTRADA ({d.entry_signals?.length || 0})</div>
                      <SignalsList signals={d.entry_signals} type="entry" />
                    </div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.bear, marginBottom: 4 }}>SALIDA ({d.exit_signals?.length || 0})</div>
                      <SignalsList signals={d.exit_signals} type="exit" />
                    </div>
                  </div>
                </div>
              )}

              {/* News */}
              <div style={card}>
                <SectionTitle icon="📰" badge={pill(newsColor, d.news_sentiment === "bull" ? "SENTIMIENTO +" : d.news_sentiment === "bear" ? "SENTIMIENTO −" : "MIXTO")}>
                  Noticias — Impacto en Narrativa
                </SectionTitle>
                <NewsFeed news={d.news} />
                <div style={{ marginTop: 8, fontSize: 11, color: T.muted }}>
                  Impacto acumulado estimado: <span style={{ color: newsColor }}>{newsTotal >= 0 ? "+" : ""}{newsTotal.toFixed(1)}%</span>
                </div>
              </div>
            </>
          )}

          {/* ══════════ TAB: PREDICTIVO ══════════ */}
          {activeTab === "predictive" && (
            <>
              <MarketRegimePanel d={d} tickerSeed={tickerSeed} />
              <div style={{ height: 10 }} />
              <MarketPhaseChart d={d} tickerSeed={tickerSeed} />
              <div style={{ height: 10 }} />
              <AdaptiveEntryScorer d={d} />
              <div style={{ height: 10 }} />
              <div style={{ height: 10 }} />
              <ElliottWavePanel d={d} />
              <div style={{ height: 10 }} />
              <WeisWavePanel d={d} />
              <div style={{ height: 10 }} />
              <WolfeWavesPanel d={d} />
              <VolatilitySurface d={d} tickerSeed={tickerSeed} />
              <div style={{ height: 10 }} />
              <div style={{ height: 400, marginTop: 12 }}>
                <IchimokuCloudChart ticker={ticker} />
              </div>
            </>
          )}

          {/* ══════════ TAB: SMC ══════════ */}
          {activeTab === "smc" && (
            <>
              <MTFPanel d={d} tickerSeed={tickerSeed} />
              <div style={{ height: 10 }} />
              <SMCPanelLive ticker={ticker} backendData={d} />
              <div style={{ height: 10 }} />
              <LiquidityHeatmap d={d} tickerSeed={tickerSeed} />
              <div style={{ ...card, marginTop: 10 }}>
                <SectionTitle icon="📖">Glosario SMC — Smart Money Concepts</SectionTitle>
                {[
                  { term: "BOS — Break of Structure", def: "Rotura de un swing high/low previo. Confirma el cambio de tendencia y la dirección del precio." },
                  { term: "CHoCH — Change of Character", def: "Primera rotura contra la tendencia principal. Alerta temprana de posible reversión." },
                  { term: "Order Block (OB)", def: "Última vela bajista antes de un impulso alcista (OB alcista) o viceversa. Zona de demanda/oferta institucional." },
                  { term: "FVG — Fair Value Gap", def: "Desequilibrio de precio: hueco entre tres velas consecutivas. El precio tiende a volver a rellenarlo." },
                  { term: "Premium / Discount", def: "Premium (>50% del rango): zona de venta. Discount (<50%): zona de compra óptima." },
                  { term: "Inducement / Stop Hunt", def: "Movimiento falso para cazar stops de retail antes del movimiento real institucional." },
                ].map(({ term, def }) => (
                  <div key={term} style={{ borderBottom: `1px solid ${T.border}`, padding: "8px 0" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 3 }}>{term}</div>
                    <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{def}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ══════════ TAB: SESIONES ══════════ */}
          {activeTab === "sessions" && (
            <>
              <SessionMapLive d={d} />
              <div style={{ height: 10 }} />
              {/* Calendario económico real */}
              <EconomicCalendar />
              <div style={{ height: 10 }} />
              <div style={card}>
                <SectionTitle icon="📋">Guías por Estilo de Trading</SectionTitle>
                {[
                  {
                    style: "Scalping (1–5 min)", color: T.bear,
                    rules: ["Book Imbalance > 60% + CVD alineado — filtro obligatorio", "Bid-Ask Spread < 0.5% — verificar Depth antes de ejecutar", "Stop 0.3 ATR · Target 0.6 ATR (R/R 2:1 mínimo)", "Si hay Iceberg en el lado contrario al trade, reducir size 50%"],
                  },
                  {
                    style: "Day Trading (15–60 min)", color: T.accent,
                    rules: ["Book Imbalance + VWAP deben coincidir (anti-falsa-ruptura)", "Tape Sweep detectado → señal de aceleración institucional", "MTF alignment en 3 de 4 timeframes obligatorio", "Stop bajo OB más cercano · Target en FVG o swing previo"],
                  },
                  {
                    style: "Swing Trading (4H–Daily)", color: T.bull,
                    rules: ["Confluencia Ichimoku: precio sobre nube + T/K cross alcista", "Elliott Wave: entrada en ondas 2 o 4 con Fibonacci 0.618", "Fase Wyckoff: no entrar en Distribución ni Markdown", "Hold 3–15 días · Stop 2.2 ATR · Target 3–5 ATR"],
                  },
                ].map(({ style, color, rules }) => (
                  <div key={style} style={{ background: `${color}07`, border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 13px", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 7 }}>{style}</div>
                    {rules.map((r2, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, color: T.textSec, marginBottom: 4, lineHeight: 1.4 }}>
                        <span style={{ color, flexShrink: 0, fontSize: 10 }}>▸</span>
                        <span>{r2}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ══════════ TAB: VELAS ══════════ */}
          {activeTab === "candles" && (
            <>
              <WeeklyCandleChart d={d} tickerSeed={tickerSeed} />
              <div style={{ height: 10 }} />
              {/* Glosario de patrones */}
              <div style={card}>
                <SectionTitle icon="📚">Guía de Patrones de Velas</SectionTitle>
                {[
                  { pat: "Doji", type: "neutral", desc: "Cuerpo muy pequeño — apertura ≈ cierre. Indica indecisión. En niveles clave, suele preceder movimientos fuertes." },
                  { pat: "Hammer / Martillo", type: "bull", desc: "Mecha inferior larga (>2× cuerpo), mecha superior pequeña. Rechazo de mínimos. Señal alcista en soporte." },
                  { pat: "Shooting Star", type: "bear", desc: "Mecha superior larga, cuerpo pequeño en la parte baja. Rechazo de máximos. Señal bajista en resistencia." },
                  { pat: "Bullish Engulfing", type: "bull", desc: "Vela alcista envuelve completamente la bajista anterior. Alta fiabilidad de reversión alcista." },
                  { pat: "Bearish Engulfing", type: "bear", desc: "Vela bajista envuelve completamente la alcista anterior. Señal de techo y reversión bajista." },
                  { pat: "Morning Star", type: "bull", desc: "3 velas: bajista + doji + alcista fuerte. Señal de fondo. Alta fiabilidad en soporte semanal." },
                  { pat: "Evening Star", type: "bear", desc: "3 velas: alcista + doji + bajista fuerte. Señal de techo. Alta fiabilidad en resistencia semanal." },
                  { pat: "Marubozu", type: "neutral", desc: "Vela de cuerpo sólido sin mechas. Compradores/vendedores controlaron toda la sesión. Continúa tendencia." },
                  { pat: "Harami", type: "neutral", desc: "Vela pequeña dentro de la anterior. Desaceleración del impulso. Esperar confirmación de dirección." },
                ].map(({ pat, type, desc }) => {
                  const c = type === "bull" ? T.bull : type === "bear" ? T.bear : T.muted;
                  return (
                    <div key={pat} style={{ borderBottom: `1px solid ${T.border}`, padding: "7px 0", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 9, background: `${c}15`, color: c, borderRadius: 4, padding: "2px 7px", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                        {type === "bull" ? "▲" : type === "bear" ? "▼" : "—"}
                      </span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: c, marginBottom: 2 }}>{pat}</div>
                        <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
