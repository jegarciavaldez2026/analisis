/**
 * OvertonSignalMatrix_enhanced.jsx
 *
 * Drop-in replacement del componente OvertonSignalMatrix.
 * Incorpora todos los nuevos factores del score multi-factor:
 *   - Momentum 12-1, Fear & Greed, Put/Call Ratio, Short Interest
 *   - Reversión a la media (Z-score), Beta, Forward Guidance
 *   - OFI, VWAP, Bid-Ask Spread, Gamma Exposure, Market Impact
 *   - Señales de entrada/salida automáticas
 *   - Desglose del score por bloque (fundamental/momentum/sentimiento/microestruc)
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = typeof process !== "undefined" && process.env?.EXPO_PUBLIC_BACKEND_URL
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
  : "/api";

// ─── Tema oscuro ─────────────────────────────────────────────────────────────────────
//const T = {
//  bg:      "#07090f",
//  surface: "#0c0f19",
//  card:    "#10131f",
//  card2:   "#141828",
// border:  "#1c2138",
//  borderH: "#2a3055",
//  text:    "#dce4f5",
//  muted:   "#4a5580",
//  accent:  "#3d7fff",
//  bull:    "#00c97a",
//  bear:    "#ff3d5a",
//  warn:    "#f59e0b",
//  purple:  "#9b5dff",
//  cyan:    "#00c9e4",
//  gold:    "#f5c518",
//};

// ─── Tema claro ─────────────────────────────────────────────────────────────────────
const T = {
  bg:      "#f5f7fc",
  surface: "#ffffff",
  card:    "#ffffff",
  card2:   "#f7f9ff",
  border:  "#dde2f0",
  borderH: "#b8c3e0",
  text:    "#1a1f36",
  muted:   "#8892b0",
  accent:  "#3d7fff",
  bull:    "#00a85e",
  bear:    "#e0253a",
  warn:    "#d97706",
  purple:  "#7c3aed",
  cyan:    "#0891b2",
  gold:    "#b45309",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sf = (v, d = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? d : n;
};

const pct = (v, dec = 1) => `${sf(v, 0) >= 0 ? "+" : ""}${sf(v, 0).toFixed(dec)}%`;
const usd = (v, dec = 2) => `$${sf(v, 0).toFixed(dec)}`;

const pill = (color, label) => (
  <span style={{
    background: `${color}22`, border: `1px solid ${color}55`,
    color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
    whiteSpace: "nowrap",
  }}>{label}</span>
);

// ─── useFetch ────────────────────────────────────────────────────────────────
const useFetch = (ticker) => {
  const [data,     setData]    = useState(null);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState(null);

  const fetchData = useCallback(async (t) => {
    if (!t) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/overton/${t.toUpperCase()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData };
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

/** Gauge semicircular del score */
function ScoreGauge({ score }) {
  const angle    = (score / 100) * 180 - 90;
  const toRad    = (d) => (d * Math.PI) / 180;
  const nX       = 60 + 42 * Math.cos(toRad(angle - 90));
  const nY       = 60 + 42 * Math.sin(toRad(angle - 90));
  const color    = score >= 65 ? T.bull : score <= 35 ? T.bear : T.warn;
  const label    = score >= 65 ? "COMPRAR" : score <= 35 ? "VENDER" : "MANTENER";
  const zones    = [
    { s: 180, e: 144, c: T.bear },
    { s: 144, e: 108, c: "#e07040" },
    { s: 108, e: 72,  c: T.warn },
    { s: 72,  e: 36,  c: "#8bc94a" },
    { s: 36,  e: 0,   c: T.bull },
  ];
  const arc = (s, e, r, cx, cy) => {
    const a1 = toRad(s - 90); const a2 = toRad(e - 90);
    const x1 = cx + r * Math.cos(a1); const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2); const y2 = cy + r * Math.sin(a2);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="120" height="72" viewBox="0 0 120 70">
        {zones.map(z => (
          <path key={z.s} d={arc(z.s, z.e, 52, 60, 62)} fill="none" stroke={z.c} strokeWidth="10" opacity="0.25" />
        ))}
        {zones.map(z => (
          <path key={`f${z.s}`} d={arc(z.s, z.e, 52, 60, 62)} fill="none" stroke={z.c} strokeWidth="10" />
        ))}
        <line x1="60" y1="62" x2={nX.toFixed(1)} y2={nY.toFixed(1)} stroke={T.text} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="60" cy="62" r="4" fill={color} />
        <text x="60" y="54" textAnchor="middle" fontSize="17" fontWeight="800" fill={color}>{score}</text>
      </svg>
      <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: 1.5, marginTop: -4 }}>{label}</span>
    </div>
  );
}

/** Barra de desglose del score */
function ScoreBreakdown({ breakdown }) {
  if (!breakdown) return null;
  const items = [
    { key: "fundamental",  label: "Fundamental",    max: 30, color: T.accent  },
    { key: "momentum",     label: "Momentum",        max: 25, color: T.bull   },
    { key: "sentimiento",  label: "Sentimiento",     max: 20, color: T.purple },
    { key: "microestruc",  label: "Microestructura", max: 25, color: T.cyan   },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      {items.map(({ key, label, max, color }) => {
        const val = sf(breakdown[key], 0);
        const pct = Math.round((val / max) * 100);
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 100, fontSize: 10, color: T.muted, flexShrink: 0 }}>
              {label} <span style={{ color }}>{val.toFixed(1)}/{max}</span>
            </div>
            <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3,
                            transition: "width 0.9s ease", boxShadow: `0 0 6px ${color}` }} />
            </div>
            <div style={{ width: 28, fontSize: 10, color, textAlign: "right" }}>{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

/** Ventana de Overton visual */
function OvertonWindow({ zone }) {
  const zones = [
    { id: "impensable", label: "Impensable", sub: "Vender",     color: "#c0392b", range: [0, 20]  },
    { id: "radical",    label: "Radical",    sub: "Bajista",    color: "#e67e22", range: [20, 38] },
    { id: "sensible",   label: "Sensible",   sub: "Esperar",    color: "#95a5a6", range: [38, 55] },
    { id: "popular",    label: "Popular",    sub: "Comprar",    color: "#27ae60", range: [55, 75] },
    { id: "politica",   label: "Política",   sub: "Sobrecompra",color: "#1abc9c", range: [75, 100]},
  ];
  const zoneMap = { impensable: 0, radical: 1, sensible: 2, popular: 3, politica: 4,
                    watch: 2, sell: 1, buy: 3, hold: 2 };
  const activeIdx = zoneMap[zone?.toLowerCase()?.split(/[\s—]/)[0]?.trim()] ?? 2;

  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
      {zones.map((z, i) => (
        <div key={z.id} style={{
          flex: i === activeIdx ? 1.5 : 1,
          background: i === activeIdx ? z.color : `${z.color}18`,
          borderRadius: 5, padding: "8px 4px", textAlign: "center",
          transition: "all 0.35s", border: `1px solid ${i === activeIdx ? z.color : z.color + "30"}`,
          position: "relative",
        }}>
          {i === activeIdx && (
            <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)",
                          background: T.card, border: `1px solid ${z.color}`, borderRadius: 4,
                          padding: "1px 8px", fontSize: 10, color: z.color, whiteSpace: "nowrap" }}>
              {zone}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: i === activeIdx ? "#fff" : z.color }}>{z.label}</div>
          <div style={{ fontSize: 10, color: i === activeIdx ? "rgba(255,255,255,0.75)" : `${z.color}90` }}>{z.sub}</div>
        </div>
      ))}
    </div>
  );
}

/** Tarjeta de un indicador cuantitativo */
function FactorCard({ label, value, signal, detail, color, icon }) {
  const sigColor = signal === "bull" || signal === "positivo" ? T.bull
                 : signal === "bear" || signal === "negativo" ? T.bear
                 : T.warn;
  return (
    <div style={{
      background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: "9px 12px", flex: 1, minWidth: 0,
      borderLeft: `3px solid ${sigColor}`,
    }}>
      <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase",
                    letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: sigColor, fontFamily: "monospace" }}>{value}</div>
      {detail && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{detail}</div>}
    </div>
  );
}

/** Señales de entrada / salida */
function SignalsList({ signals, type }) {
  if (!signals || signals.length === 0) return null;
  const color = type === "entry" ? T.bull : T.bear;
  const icon  = type === "entry" ? "↗" : "↙";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
      {signals.map((s, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          background: `${color}0d`, border: `1px solid ${color}30`,
          borderLeft: `3px solid ${color}`, borderRadius: 5, padding: "5px 10px",
        }}>
          <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{icon}</span>
          <span style={{ fontSize: 11, color: T.text, lineHeight: 1.45 }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

/** Mini gráfico SVG responsive */
function MiniChart({ data, lineColor = T.bull, height = 80 }) {
  const ref = useRef(null);
  const [w,  setW] = useState(300);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 300));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const valid = (data || []).filter(v => v !== null && !isNaN(v));
  if (valid.length < 2) return <div ref={ref} style={{ height }} />;
  const mn = Math.min(...valid), mx = Math.max(...valid), range = mx - mn || 1;
  const pad = { t: 6, b: 6, l: 4, r: 4 };
  const W = w - pad.l - pad.r, H = height - pad.t - pad.b;
  const pts = data.map((v, i) => v === null ? null : {
    x: pad.l + (i / (data.length - 1)) * W,
    y: pad.t + (1 - (v - mn) / range) * H,
  });
  let d = "";
  pts.forEach((p, i) => {
    if (!p) return;
    const prev = pts.slice(0, i).reverse().find(x => x);
    d += prev ? `L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  });
  const last = pts.filter(Boolean).pop();
  const first = pts.filter(Boolean)[0];
  const area = first && last
    ? `M${first.x},${height - pad.b} ${d.replace(/^M/, "L")} L${last.x},${height - pad.b} Z`
    : "";

  return (
    <div ref={ref} style={{ width: "100%", height }}>
      <svg width="100%" height={height}>
        <defs>
          <linearGradient id={`g${lineColor.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <path d={area} fill={`url(#g${lineColor.replace("#", "")})`} />}
        <path d={d} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Gráfico de precio principal con WMA, señales y noticias */
function PriceChart({ d, height = 220 }) {
  const ref  = useRef(null);
  const svgR = useRef(null);
  const [w, setW] = useState(700);
  const [tip, setTip] = useState(null);
  useEffect(() => {
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width || 700));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const prices = d.price_history || [];
  const wma    = d.wma_history   || [];
  const buys   = d.buy_signals   || [];
  const sells  = d.sell_signals  || [];
  const news   = d.news_events   || [];
  if (prices.length < 2) return null;

  const allV = [...prices, ...wma.filter(Boolean)];
  const mn = Math.min(...allV), mx = Math.max(...allV), range = mx - mn || 1;
  const pad = { t: 18, b: 28, l: 52, r: 12 };
  const W = w - pad.l - pad.r, H = height - pad.t - pad.b;
  const n = prices.length;
  const px = (i) => pad.l + (i / (n - 1)) * W;
  const py = (v) => pad.t + (1 - (v - mn) / range) * H;
  const lineColor = prices[n - 1] >= prices[0] ? T.bull : T.bear;

  const pricePath = prices.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const areaPath  = prices.map((v, i) => (i === 0 ? "M" : "L") + `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ")
    + ` L${px(n - 1)},${pad.t + H} L${px(0)},${pad.t + H} Z`;
  const wmaPath = wma.reduce((acc, v, i) => {
    if (v === null) return acc;
    const prev = wma.slice(0, i).reverse().find(x => x !== null);
    return acc + (!prev ? `M${px(i).toFixed(1)},${py(v).toFixed(1)}`
                        : `L${px(i).toFixed(1)},${py(v).toFixed(1)}`);
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

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg ref={svgR} width="100%" height={height} onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
        <defs>
          <linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
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
            stroke={T.gold} strokeWidth="1" strokeDasharray="4,3" opacity="0.7" />
        )}
        <path d={areaPath} fill="url(#priceArea)" />
        <path d={pricePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {wmaPath && <path d={wmaPath} fill="none" stroke={T.warn} strokeWidth="1.5" strokeDasharray="5,3" />}
        {news.map(i  => <line key={`n${i}`}  x1={px(i)} y1={pad.t} x2={px(i)} y2={pad.t + H} stroke={T.purple} strokeWidth="1" strokeDasharray="3,3" opacity="0.45" />)}
        {buys.map(i  => <polygon key={`b${i}`}  points={`${px(i)},${py(prices[i]) + 11} ${px(i) - 6},${py(prices[i]) + 22} ${px(i) + 6},${py(prices[i]) + 22}`} fill={T.bull} opacity="0.9" />)}
        {sells.map(i => <polygon key={`s${i}`}  points={`${px(i)},${py(prices[i]) - 11} ${px(i) - 6},${py(prices[i]) - 22} ${px(i) + 6},${py(prices[i]) - 22}`} fill={T.bear} opacity="0.9" />)}
        {Array.from({ length: Math.min(8, n) }, (_, k) => {
          const idx = Math.round((k / 7) * (n - 1));
          return <text key={`xl${k}`} x={px(idx)} y={height - 6} textAnchor="middle" fontSize="10" fill={T.muted}>S{idx + 1}</text>;
        })}
        {tip && (
          <g>
            <line x1={tip.x} y1={pad.t} x2={tip.x} y2={pad.t + H} stroke={T.muted} strokeWidth="1" strokeDasharray="3,2" />
            <circle cx={tip.x} cy={tip.y} r="4" fill={lineColor} />
            <rect x={tip.x + 8} y={tip.y - 28} width={130} height={tip.wmaV ? 40 : 24} rx="4" fill={T.card} stroke={T.border} />
            <text x={tip.x + 14} y={tip.y - 12} fontSize="12" fill={T.text}>${tip.price.toFixed(2)}</text>
            {tip.wmaV && <text x={tip.x + 14} y={tip.y + 4} fontSize="10" fill={T.warn}>WMA: ${tip.wmaV.toFixed(2)}</text>}
          </g>
        )}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 4 }}>
        {[
          { color: lineColor, label: "Precio" },
          { color: T.warn,    label: "WMA-30",  dashed: true },
          { color: T.gold,    label: "VWAP",    dashed: true },
          { color: T.purple,  label: "Noticia", dashed: true },
          { color: T.bull,    label: "Compra",  shape: "triangle" },
          { color: T.bear,    label: "Venta",   shape: "triangle" },
        ].map(({ color, label, dashed, shape }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {shape === "triangle"
              ? <div style={{ width: 10, height: 10, background: color, clipPath: "polygon(50% 0%,0% 100%,100% 100%)" }} />
              : <div style={{ width: 18, height: 2, background: color, borderTop: dashed ? `2px dashed ${color}` : undefined }} />
            }
            <span style={{ fontSize: 10, color: T.muted }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Gráfico Coppock */
function CoppockChart({ coppock }) {
  const ref = useRef(null);
  const [svgW, setSvgW] = useState(400);
  useEffect(() => {
    const obs = new ResizeObserver(e => setSvgW(e[0].contentRect.width || 400));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const valid = (coppock || []).filter(v => v !== null);
  if (valid.length < 2) return null;
  const mn = Math.min(...valid), mx = Math.max(...valid), range = Math.max(mx - mn, 0.5);
  const H = 80, pad = { t: 10, b: 10, l: 10, r: 10 };
  const W = svgW - pad.l - pad.r, n = coppock.length;
  const zeroY = pad.t + (1 - (0 - mn) / range) * H;

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width="100%" height={H + pad.t + pad.b}>
        <line x1={pad.l} y1={zeroY} x2={svgW - pad.r} y2={zeroY} stroke={T.border} strokeWidth="1" />
        {coppock.map((v, i) => {
          if (v === null) return null;
          const x = pad.l + (i / (n - 1)) * W;
          const bH = Math.abs(v) / range * H * 0.85;
          const y  = v >= 0 ? zeroY - bH : zeroY;
          const op = 0.5 + (Math.abs(v) / (Math.abs(mx) + 0.001)) * 0.5;
          return <rect key={i} x={x - W / n / 2 * 0.6} y={y} width={Math.max(W / n * 0.6, 2)} height={bH}
                       fill={v >= 0 ? T.bull : T.bear} opacity={op} />;
        })}
        <text x={pad.l + 4} y={pad.t + 12} fontSize="10" fill={T.muted}>+{mx.toFixed(1)}</text>
        <text x={pad.l + 4} y={H + pad.t - 4} fontSize="10" fill={T.muted}>{mn.toFixed(1)}</text>
      </svg>
    </div>
  );
}

/** VIX + US10Y */
function VixYieldChart({ vix, yield_ }) {
  const ref = useRef(null);
  const [svgW, setSvgW] = useState(400);
  useEffect(() => {
    const obs = new ResizeObserver(e => setSvgW(e[0].contentRect.width || 400));
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  if (!vix || !yield_ || vix.length < 2) return null;
  const vMn = Math.min(...vix), vMx = Math.max(...vix);
  const yMn = Math.min(...yield_), yMx = Math.max(...yield_);
  const H = 80, pad = { t: 10, b: 14, l: 24, r: 28 };
  const W = svgW - pad.l - pad.r, n = vix.length;
  const vp = (v) => pad.t + (1 - (v - vMn) / ((vMx - vMn) || 1)) * H;
  const yp = (v) => pad.t + (1 - (v - yMn) / ((yMx - yMn) || 1)) * H;
  const vPath = vix.map((v, i) => `${i === 0 ? "M" : "L"}${(pad.l + (i / (n - 1)) * W).toFixed(1)},${vp(v).toFixed(1)}`).join(" ");
  const yPath = yield_.map((v, i) => `${i === 0 ? "M" : "L"}${(pad.l + (i / (n - 1)) * W).toFixed(1)},${yp(v).toFixed(1)}`).join(" ");

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width="100%" height={H + pad.t + pad.b}>
        {[0, 0.5, 1].map(t => {
          const y = pad.t + (1 - t) * H;
          return (
            <g key={t}>
              <line x1={pad.l} y1={y} x2={svgW - pad.r} y2={y} stroke={T.border} strokeWidth="0.5" />
              <text x={pad.l - 3} y={y + 3} textAnchor="end" fontSize="9" fill={T.bear}>{(vMn + t * (vMx - vMn)).toFixed(0)}</text>
              <text x={svgW - pad.r + 3} y={y + 3} textAnchor="start" fontSize="9" fill={T.accent}>{(yMn + t * (yMx - yMn)).toFixed(2)}%</text>
            </g>
          );
        })}
        <path d={vPath} fill="none" stroke={T.bear}  strokeWidth="1.5" />
        <path d={yPath} fill="none" stroke={T.accent} strokeWidth="1.5" strokeDasharray="4,2" />
      </svg>
    </div>
  );
}

/** Barra analistas */
function AnalystBar({ buy, hold, sell }) {
  const total = (buy || 0) + (hold || 0) + (sell || 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {[
        { label: "Strong Buy", pct: Math.round((buy  / total) * 100), color: T.bull },
        { label: "Hold",       pct: Math.round((hold / total) * 100), color: T.muted },
        { label: "Sell",       pct: Math.round((sell / total) * 100), color: T.bear },
      ].map(({ label, pct, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 65, fontSize: 11, color: T.muted, flexShrink: 0 }}>{label}</div>
          <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
          </div>
          <div style={{ width: 28, fontSize: 11, color, textAlign: "right" }}>{pct}%</div>
        </div>
      ))}
    </div>
  );
}

/** Level precio (objetivo/stop) */
function PriceLevel({ label, price, sub, color, rr }) {
  return (
    <div style={{ background: `${color}0f`, border: `1px solid ${color}30`,
                  borderRadius: 8, padding: "9px 11px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase",
                    letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "monospace" }}>{usd(price)}</div>
      <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{sub}</div>
      {rr && <div style={{ fontSize: 10, color, marginTop: 1 }}>R/R {rr}:1</div>}
    </div>
  );
}

/** Noticias */
function NewsFeed({ news }) {
  if (!news || news.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {news.map((n, i) => {
        const pos = n.impact > 0;
        const bc  = pos ? T.bull : T.bear;
        return (
          <div key={i} style={{ background: `${bc}0a`, border: `1px solid ${bc}28`,
                                 borderLeft: `3px solid ${bc}`, borderRadius: 6, padding: "7px 11px",
                                 display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{n.headline}</div>
              {n.description && <div style={{ fontSize: 11, color: T.muted }}>{n.description}</div>}
              <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{n.source} · {n.published}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: bc, background: `${bc}18`,
                          borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
              {pos ? "↑ +" : "↓ "}{n.impact.toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function OvertonSignalMatrixEnhanced({ ticker: propTicker }) {
  const [ticker,   setTicker]   = useState(propTicker || "SPY");
  const [inputVal, setInputVal] = useState(propTicker || "SPY");
  const { data, loading, error, fetchData } = useFetch(ticker);

  useEffect(() => {
    fetchData(ticker);
  }, []);

  useEffect(() => {
    if (propTicker && propTicker !== ticker) {
      setTicker(propTicker);
      setInputVal(propTicker);
      fetchData(propTicker);
    }
  }, [propTicker]);

  const handleAnalyze = () => {
    const t = inputVal.trim().toUpperCase();
    if (!t) return;
    setTicker(t);
    fetchData(t);
  };

  if (!data && !loading && !error) return null;

  const d = data || {};
  const isAbove  = d.price_vs_wma === "above";
  const isBull   = d.coppock_signal === "bull";
  const priceClr = sf(d.pct_change, 0) >= 0 ? T.bull : T.bear;
  const fgi      = sf(d.fear_greed, 50);
  const fgiColor = fgi > 65 ? T.bull : fgi < 35 ? T.bear : T.warn;
  const fgiLabel = fgi > 75 ? "Codicia Extrema" : fgi > 55 ? "Codicia" : fgi > 45 ? "Neutral" : fgi > 25 ? "Miedo" : "Miedo Extremo";
  const pcr      = sf(d.put_call_ratio, 1);
  const pcrColor = pcr < 0.7 ? T.bull : pcr > 1.3 ? T.bear : T.warn;
  const si       = sf(d.short_interest, 0);
  const siColor  = si > 15 ? T.bull : si > 8 ? T.warn : T.muted;
  const mom      = sf(d.momentum_12_1, 0);
  const momColor = mom > 10 ? T.bull : mom < -10 ? T.bear : T.warn;
  const zscore   = sf(d.zscore_mean_rev, 0);
  const zColor   = zscore > 2 ? T.bear : zscore < -2 ? T.bull : T.muted;
  const ofi      = sf(d.ofi, 0);
  const ofiColor = ofi > 0.15 ? T.bull : ofi < -0.15 ? T.bear : T.muted;
  const vwap     = d.vwap || {};
  const vwapColor = vwap.price_vs_vwap === "above" ? T.bull : T.bear;
  const bas      = sf(d.bid_ask_spread, 2);
  const basColor = bas < 1 ? T.bull : bas > 3 ? T.bear : T.warn;
  const fg       = d.forward_guidance || {};
  const fgColor  = fg.label === "positivo" ? T.bull : fg.label === "negativo" ? T.bear : T.warn;
  const newsTotal = sf(d.news_impact_total, 0);
  const newsColor = newsTotal >= 0 ? T.bull : T.bear;
  const betaVal  = sf(d.beta, 1);
  const betaColor = betaVal < 0.8 ? T.cyan : betaVal > 1.8 ? T.bear : T.bull;

  const card = {
    background: T.card, border: `1px solid ${T.border}`,
    borderRadius: 10, padding: "13px 15px", marginBottom: 10,
  };
  const secTitle = {
    fontSize: 11, fontWeight: 700, color: T.muted,
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13 }}>

      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`,
                    padding: "10px 18px", display: "flex", alignItems: "center",
                    justifyContent: "space-between", flexWrap: "wrap", gap: 10,
                    position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Overton Signal Matrix v2</div>
          <div style={{ fontSize: 9, color: T.muted }}>
            WMA-30 · Coppock · Momentum · FGI · PCR · SI · OFI · VWAP · Beta · GEX · Guidance · Noticias
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {error && <span style={{ fontSize: 11, color: T.warn }}>⚠ Demo</span>}
          {!propTicker && (
            <div style={{ display: "flex", background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <input value={inputVal}
                onChange={e => setInputVal(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleAnalyze()}
                placeholder="AAPL"
                style={{ background: "none", border: "none", outline: "none", color: T.text,
                         padding: "6px 12px", fontSize: 14, fontWeight: 700, width: 80, fontFamily: "inherit" }}
              />
              <button onClick={handleAnalyze}
                style={{ background: T.accent, border: "none", color: "#fff",
                         padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {loading ? "…" : "↗ Analizar"}
              </button>
            </div>
          )}
          <button onClick={() => fetchData(ticker)}
            style={{ background: T.card, border: `1px solid ${T.border}`, color: T.muted,
                     padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
            ⟳
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>
          Calculando análisis multi-factor…
        </div>
      )}

      {!loading && (
        <div style={{ padding: "12px 18px 40px" }}>

          {/* ── Precio y stats principales ── */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              { label: "Precio",    value: usd(d.current_price), sub: pct(d.pct_change), color: priceClr },
              { label: "WMA-30",    value: usd(d.wma30), sub: isAbove ? "↑ sobre WMA" : "↓ bajo WMA", color: isAbove ? T.bull : T.bear },
              { label: "Coppock",   value: sf(d.coppock, 0).toFixed(2), sub: isBull ? "Alcista" : "Bajista", color: isBull ? T.bull : T.bear },
              { label: "Sharpe 30S",value: sf(d.sharpe, 0).toFixed(2), sub: sf(d.sharpe) > 1 ? "Excelente" : sf(d.sharpe) > 0 ? "Moderado" : "Bajo", color: sf(d.sharpe) > 1 ? T.bull : sf(d.sharpe) > 0 ? T.warn : T.bear },
              { label: "VIX",       value: sf(d.vix, 0).toFixed(1), sub: sf(d.vix) < 18 ? "Calma" : sf(d.vix) < 25 ? "Moderado" : "Miedo", color: sf(d.vix) < 18 ? T.bull : sf(d.vix) < 25 ? T.warn : T.bear },
              { label: "US 10Y",    value: `${sf(d.us10y, 0).toFixed(2)}%`, sub: sf(d.us10y) < 4.2 ? "Favorable" : sf(d.us10y) > 4.8 ? "Restrictivo" : "Neutro", color: sf(d.us10y) < 4.2 ? T.bull : sf(d.us10y) > 4.8 ? T.bear : T.warn },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: T.card, border: `1px solid ${T.border}`,
                                        borderRadius: 8, padding: "9px 13px", flex: 1, minWidth: 90 }}>
                <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
                <div style={{ fontSize: 10, color, marginTop: 1 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ── NUEVOS FACTORES — Fila 1: Momentum / Sentimiento ── */}
          <div style={card}>
            <div style={secTitle}>📈 Factores de Momentum y Sentimiento</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FactorCard label="Momentum 12-1" value={`${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%`}
                signal={mom > 5 ? "bull" : mom < -5 ? "bear" : "neutral"}
                detail="Retorno 12m excl. último mes" color={momColor} />
              <FactorCard label="Fear & Greed" value={`${fgi.toFixed(0)}/100`}
                signal={fgi > 55 ? "bull" : fgi < 45 ? "bear" : "neutral"}
                detail={fgiLabel} color={fgiColor} />
              <FactorCard label="Put/Call Ratio" value={pcr.toFixed(3)}
                signal={pcr < 0.8 ? "bull" : pcr > 1.2 ? "bear" : "neutral"}
                detail={pcr < 0.8 ? "Codicia — alcista" : pcr > 1.2 ? "Miedo — bajista" : "Neutro"} color={pcrColor} />
              <FactorCard label="Short Interest" value={`${si.toFixed(1)}%`}
                signal={si > 15 ? "bull" : si > 8 ? "neutral" : "neutral"}
                detail={si > 15 ? "Potencial squeeze" : si > 8 ? "Presión bajista" : "Normal"} color={siColor} />
              <FactorCard label="Z-score (Rev.Media)" value={zscore.toFixed(2)}
                signal={zscore < -2 ? "bull" : zscore > 2 ? "bear" : "neutral"}
                detail={zscore > 2 ? "Sobrecompra" : zscore < -2 ? "Sobreventa" : "Rango normal"} color={zColor} />
              <FactorCard label="Beta" value={betaVal.toFixed(2)}
                signal={betaVal < 0.8 ? "neutral" : betaVal > 1.8 ? "bear" : "bull"}
                detail={betaVal < 0.8 ? "Defensivo" : betaVal > 1.8 ? "Alta volatilidad" : "Moderado"} color={betaColor} />
            </div>
          </div>

          {/* ── NUEVOS FACTORES — Fila 2: Microestructura ── */}
          <div style={card}>
            <div style={secTitle}>⚡ Microestructura de Mercado</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FactorCard label="OFI (Order Flow)" value={ofi.toFixed(3)}
                signal={ofi > 0.15 ? "bull" : ofi < -0.15 ? "bear" : "neutral"}
                detail={ofi > 0.15 ? "Compradores dominan" : ofi < -0.15 ? "Vendedores dominan" : "Equilibrado"} color={ofiColor} />
              <FactorCard label="VWAP" value={usd(vwap.vwap)}
                signal={vwap.price_vs_vwap === "above" ? "bull" : "bear"}
                detail={`Precio ${vwap.price_vs_vwap === "above" ? "sobre" : "bajo"} VWAP ${vwap.distance_pct >= 0 ? "+" : ""}${sf(vwap.distance_pct).toFixed(1)}%`} color={vwapColor} />
              <FactorCard label="Bid-Ask Spread" value={`${bas.toFixed(2)}%`}
                signal={bas < 1 ? "bull" : bas > 3 ? "bear" : "neutral"}
                detail={bas < 1 ? "Alta liquidez" : bas > 3 ? "Baja liquidez" : "Liquidez media"} color={basColor} />
              <FactorCard label="Gamma Exposure" value={sf(d.gamma_exposure).toFixed(2)}
                signal={sf(d.gamma_exposure) > 3 ? "bull" : "neutral"}
                detail={sf(d.gamma_exposure) > 3 ? "Imán de precio activo" : "Impacto bajo"} color={sf(d.gamma_exposure) > 3 ? T.gold : T.muted} />
              <FactorCard label="Market Impact" value={sf(d.market_impact).toFixed(3)}
                signal={sf(d.market_impact) < 0.1 ? "bull" : sf(d.market_impact) > 0.4 ? "bear" : "neutral"}
                detail={sf(d.market_impact) < 0.1 ? "Coste ejecución bajo" : "Coste ejecución alto"} color={sf(d.market_impact) < 0.1 ? T.bull : T.bear} />
            </div>
          </div>

          {/* ── Forward Guidance ── */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={secTitle}>🔭 Forward Guidance y Analistas</div>
              {pill(fgColor, fg.label?.toUpperCase() || "N/A")}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              {[
                { label: "PE Compression", value: `${sf(fg.pe_compression) >= 0 ? "+" : ""}${sf(fg.pe_compression).toFixed(1)}%`, color: sf(fg.pe_compression) > 0 ? T.bull : T.bear },
                { label: "EPS Growth fwd", value: `${sf(fg.eps_growth_pct) >= 0 ? "+" : ""}${sf(fg.eps_growth_pct).toFixed(1)}%`, color: sf(fg.eps_growth_pct) > 0 ? T.bull : T.bear },
                { label: "Analyst Mean Rec", value: `${sf(fg.analyst_mean_rec, 3).toFixed(2)}/5`, color: sf(fg.analyst_mean_rec) < 2 ? T.bull : sf(fg.analyst_mean_rec) > 3.5 ? T.bear : T.warn },
                { label: "FG Score",       value: sf(fg.score, 0).toFixed(1), color: fgColor },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: T.card2, border: `1px solid ${T.border}`,
                                          borderRadius: 7, padding: "7px 11px", flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
                </div>
              ))}
            </div>
            <AnalystBar buy={d.analyst_buy} hold={d.analyst_hold} sell={d.analyst_sell} />
          </div>

          {/* ── Score multi-factor ── */}
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ ...card, flex: 1.2, minWidth: 220, marginBottom: 0 }}>
              <div style={secTitle}>Score Compuesto Multi-Factor</div>
              <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                <ScoreGauge score={sf(d.score, 50)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.muted }}>{d.bias}</div>
                  <div style={{ fontSize: 11, color: newsColor, marginTop: 4 }}>
                    Noticias: {newsTotal >= 0 ? "+" : ""}{newsTotal.toFixed(1)}% sesgo
                  </div>
                  <ScoreBreakdown breakdown={d.score_breakdown} />
                </div>
              </div>
            </div>
            <div style={{ ...card, flex: 1, minWidth: 200, marginBottom: 0 }}>
              <div style={secTitle}>Ventana de Overton</div>
              <OvertonWindow zone={d.overton_zone} />
              <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.65 }}>{d.overton_description}</div>
            </div>
          </div>

          {/* ── Señales de entrada y salida ── */}
          {((d.entry_signals?.length > 0) || (d.exit_signals?.length > 0)) && (
            <div style={card}>
              <div style={secTitle}>🎯 Señales de Entrada / Salida — Microestructura</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.bull, marginBottom: 4 }}>
                    SEÑALES ENTRADA ({d.entry_signals?.length || 0})
                  </div>
                  <SignalsList signals={d.entry_signals} type="entry" />
                  {(!d.entry_signals || d.entry_signals.length === 0) && (
                    <div style={{ fontSize: 11, color: T.muted }}>Sin señales de entrada activas</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.bear, marginBottom: 4 }}>
                    SEÑALES SALIDA ({d.exit_signals?.length || 0})
                  </div>
                  <SignalsList signals={d.exit_signals} type="exit" />
                  {(!d.exit_signals || d.exit_signals.length === 0) && (
                    <div style={{ fontSize: 11, color: T.muted }}>Sin señales de salida activas</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Noticias ── */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={secTitle}>📰 Noticias — Impacto en Narrativa</div>
              {pill(newsColor, d.news_sentiment === "bull" ? "SENTIMIENTO +" : d.news_sentiment === "bear" ? "SENTIMIENTO −" : "MIXTO")}
            </div>
            <NewsFeed news={d.news} />
            <div style={{ marginTop: 8, fontSize: 11, color: T.muted }}>
              Impacto acumulado estimado: <span style={{ color: newsColor }}>{newsTotal >= 0 ? "+" : ""}{newsTotal.toFixed(1)}%</span>
            </div>
          </div>

          {/* ── Rangos de precio ── */}
          <div style={card}>
            <div style={secTitle}>💰 Rangos de Entrada / Salida</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <PriceLevel label="Stop Loss"        price={d.stop_loss}        sub="2.2 ATR bajo precio"     color={T.bear} />
              <PriceLevel label="Entrada Óptima"   price={d.entry_optimal}    sub="Rebote WMA-30"            color={T.bull} />
              <PriceLevel label="Entrada Agresiva" price={d.entry_aggressive}  sub="Pullback 0.5 ATR"         color={T.warn} />
              <PriceLevel label="Objetivo 1"       price={d.target1}          sub="+ATR news"                color={T.accent} rr={d.rr1} />
              <PriceLevel label="Objetivo 2"       price={d.target2}          sub="R/R extensión"            color={T.cyan}   rr={d.rr2} />
              <PriceLevel label="Objetivo 3"       price={d.target3}          sub="Escenario alcista máx."   color={T.purple} />
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: T.muted }}>
              ATR: {usd(d.atr)} · VWAP: {usd(d.vwap?.vwap)} · R/R mínimo recomendado: 2.1:1
            </div>
          </div>

          {/* ── Gráfico precio ── */}
          <div style={card}>
            <div style={secTitle}>📊 Precio + WMA-30 + VWAP · Señales y Noticias</div>
            <PriceChart d={d} height={230} />
          </div>

          {/* ── Coppock + VIX/Yield ── */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ ...card, flex: 1.4, minWidth: 260, marginBottom: 0 }}>
              <div style={secTitle}>Coppock — Momentum</div>
              <CoppockChart coppock={d.coppock_history} />
            </div>
            <div style={{ ...card, flex: 1, minWidth: 200, marginBottom: 0 }}>
              <div style={secTitle}>VIX + US 10Y</div>
              <VixYieldChart vix={d.vix_history} yield_={d.yield_history} />
            </div>
          </div>

          {/* ── Setup recomendado ── */}
          <div style={card}>
            <div style={secTitle}>🚀 Setup de Trading Recomendado</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 12 }}>
              {[
                { label: "Entrada",         value: `Cierre sobre WMA-30 + OFI > 0.15`, color: T.bull },
                { label: "Stop Loss",       value: `${usd(d.stop_loss)} (2.2 ATR)`,     color: T.bear },
                { label: "Target 1",        value: usd(d.target1),                      color: T.accent },
                { label: "Target 2",        value: usd(d.target2),                      color: T.cyan },
                { label: "Momentum",        value: `${mom >= 0 ? "+" : ""}${mom.toFixed(1)}%`, color: momColor },
                { label: "Tamaño posición", value: "1–2% capital por trade",            color: T.muted },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 11, color, fontWeight: 600, lineHeight: 1.4 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
