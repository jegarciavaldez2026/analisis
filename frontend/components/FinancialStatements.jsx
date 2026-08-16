import { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";

const BACKEND_URL = typeof process !== "undefined" && process.env?.EXPO_PUBLIC_BACKEND_URL
  ? process.env.EXPO_PUBLIC_BACKEND_URL
  : "";

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (v, decimals = 1) => {
  if (v == null || v === "" || isNaN(Number(v))) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1) return `${n.toFixed(decimals)}M`;
  return `${n.toFixed(2)}M`;
};

/** Signo de una cifra en el codigo del producto. `c` es la paleta activa. */
const color = (v, c) => {
  if (v == null || v === "") return c.inkFaint;
  return Number(v) >= 0 ? c.up : c.down;
};

// ─── PDF Generator ───────────────────────────────────────────────────────────

function generatePDF(title, ticker, companyName, rows, years) {
  const W = 794, H = 1123, margin = 48;
  const colW = (W - margin * 2 - 240) / Math.max(years.length, 1);

  const escapeXml = (s) => String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const rowH = 28;
  const headerH = 120;
  const titleH = 60;
  const tableTop = margin + titleH + headerH;
  const totalH = Math.max(H, tableTop + rows.length * rowH + 80);

  const cells = rows.map((row, ri) => {
    const bg = row.isSection ? c.ink : ri % 2 === 0 ? c.surfaceSunken : c.surface;
    const textColor = row.isSection ? c.surface : row.isBold ? c.ink : c.inkMuted;
    const rectY = tableTop + ri * rowH;
    return `
      <rect x="${margin}" y="${rectY}" width="${W - margin * 2}" height="${rowH}" fill="${bg}" />
      <text x="${margin + 12}" y="${rectY + 19}" 
            font-family="Georgia, serif" font-size="${row.isSection ? 11 : 10}" 
            font-weight="${row.isSection || row.isBold ? 'bold' : 'normal'}" 
            fill="${textColor}">${escapeXml(row.label)}</text>
      ${years.map((yr, ci) => {
        const val = row.values?.[yr];
        const displayVal = val == null || val === "" ? "—" : fmt(val);
        const valColor = row.isSection ? c.surface : Number(val) < 0 ? c.down : textColor;
        const xPos = margin + 240 + ci * colW + colW / 2;
        return `<text x="${xPos}" y="${rectY + 19}" 
                      font-family="Courier New, monospace" font-size="10" 
                      font-weight="${row.isBold ? 'bold' : 'normal'}"
                      text-anchor="middle" fill="${valColor}">${escapeXml(displayVal)}</text>`;
      }).join("")}
    `;
  }).join("");

  const yearHeaders = years.map((yr, ci) => {
    const xPos = margin + 240 + ci * colW + colW / 2;
    return `<text x="${xPos}" y="${margin + titleH + 35}" 
                  font-family="Georgia, serif" font-size="12" font-weight="bold" 
                  text-anchor="middle" fill={c.surface}>${escapeXml(yr)}</text>
            <text x="${xPos}" y="${margin + titleH + 52}" 
                  font-family="Georgia, serif" font-size="9" 
                  text-anchor="middle" fill={c.inkFaint}>(M USD)</text>`;
  }).join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">
  <defs>
    <linearGradient id="hdrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <!-- El PDF exportado no sigue el tema de la app a proposito: un documento
           impreso no deberia invertirse porque el usuario tenga el modo oscuro. -->
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e3a5f"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${W}" height="${totalH}" fill={c.surfaceSunken}/>
  
  <!-- Header gradient block -->
  <rect x="0" y="0" width="${W}" height="${margin + titleH + headerH}" fill="url(#hdrGrad)"/>
  
  <!-- Accent bar -->
  <rect x="0" y="${margin + titleH + headerH - 4}" width="${W}" height="4" fill={c.accent}/>

  <!-- Company & Title -->
  <text x="${margin}" y="${margin + 28}" font-family="Georgia, serif" font-size="22" 
        font-weight="bold" fill={c.surface}>${escapeXml(companyName)} · ${escapeXml(ticker)}</text>
  <text x="${margin}" y="${margin + 50}" font-family="Georgia, serif" font-size="15" 
        fill={c.inkFaint}>${escapeXml(title)}</text>
  <text x="${W - margin}" y="${margin + 50}" font-family="Georgia, serif" font-size="10" 
        fill={c.inkMuted} text-anchor="end">Generado: ${new Date().toLocaleDateString("es-ES")}</text>

  <!-- Table header -->
  <rect x="${margin}" y="${margin + titleH}" width="${W - margin * 2}" height="${headerH - 8}" 
        fill={c.ink} rx="4"/>
  <text x="${margin + 12}" y="${margin + titleH + 35}" font-family="Georgia, serif" 
        font-size="12" font-weight="bold" fill={c.surface}>Concepto</text>
  ${yearHeaders}

  <!-- Rows -->
  ${cells}

  <!-- Footer -->
  <line x1="${margin}" y1="${tableTop + rows.length * rowH + 16}" 
        x2="${W - margin}" y2="${tableTop + rows.length * rowH + 16}" 
        stroke={c.rule} stroke-width="1"/>
  <text x="${margin}" y="${tableTop + rows.length * rowH + 36}" 
        font-family="Georgia, serif" font-size="9" fill={c.inkFaint}>
    * Valores en millones de USD (M). Datos provistos por Yahoo Finance vía API.
  </text>
  <text x="${W - margin}" y="${tableTop + rows.length * rowH + 36}" 
        font-family="Georgia, serif" font-size="9" fill={c.inkFaint} text-anchor="end">
    FinAnalysis Pro
  </text>
</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ticker}_${title.replace(/\s+/g, "_")}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Editable Cell ────────────────────────────────────────────────────────────

function EditableCell({ value, onChange, isEditing, align = "right" }) {
  const { colors: c } = useTheme();
  const [localVal, setLocalVal] = useState(value ?? "");

  useEffect(() => setLocalVal(value ?? ""), [value]);

  if (!isEditing) {
    return (
      <span style={{
        display: "block",
        textAlign: align,
        fontFamily: "'Courier New', monospace",
        fontSize: 13,
        color: value == null || value === "" ? c.inkFaint : color(value, c),
        fontWeight: Math.abs(Number(value)) > 0 ? 500 : 400,
      }}>
        {value == null || value === "" ? "—" : fmt(value)}
      </span>
    );
  }

  return (
    <input
      type="number"
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => onChange(localVal === "" ? null : Number(localVal))}
      onKeyDown={(e) => e.key === "Enter" && onChange(localVal === "" ? null : Number(localVal))}
      style={{
        width: "100%",
        background: c.accentWash,
        border: `2px solid ${c.accent}`,
        borderRadius: 4,
        padding: "2px 6px",
        textAlign: "right",
        fontSize: 12,
        fontFamily: "'Courier New', monospace",
        color: c.ink,
        outline: "none",
      }}
    />
  );
}

// ─── Statement Table ──────────────────────────────────────────────────────────

/* ==========================================================================
 * Sparkline de fila
 *
 * Una minigrafica por partida, a la izquierda de los anos: deja ver si la
 * cuenta sube o baja sin tener que leer y comparar cinco cifras. El tono lo
 * decide la direccion del tramo completo, con el codigo verde/rojo del
 * producto. Donde no hay dato el trazo se interrumpe: no se interpola.
 * ========================================================================== */

/**
 * El backend devuelve los anos de mas nuevo a mas viejo (`sorted(..., reverse=True)`),
 * que es el orden correcto para LEER la tabla pero el contrario para DIBUJAR una
 * serie. Se ordena ascendente aqui, en un solo sitio, en vez de confiar en que
 * quien llame se acuerde de invertir.
 */
function cronologico(years) {
  return [...years].sort((a, b) => {
    const na = Number(String(a).slice(0, 4));
    const nb = Number(String(b).slice(0, 4));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

function RowSparkline({ values, years, c, width = 64, height = 20 }) {
  const eje = useMemo(() => cronologico(years), [years]);
  const serie = eje.map((yr) => {
    const v = values?.[yr];
    return v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  });
  const validos = serie.filter((v) => v != null);
  if (validos.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const min = Math.min(...validos);
  const max = Math.max(...validos);
  const span = max - min || Math.abs(max) || 1;
  const pad = 2;
  const x = (i) => (serie.length <= 1 ? width / 2 : (i / (serie.length - 1)) * (width - 2)) + 1;
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);

  let d = "";
  let abierto = false;
  serie.forEach((v, i) => {
    if (v == null) { abierto = false; return; }
    d += `${abierto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    abierto = true;
  });

  const primero = validos[0];
  const ultimo = validos[validos.length - 1];
  const trazo = ultimo > primero ? c.up : ultimo < primero ? c.down : c.inkMuted;
  const ultimoIdx = serie.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <path d={d} fill="none" stroke={trazo} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ultimoIdx)} cy={y(ultimo)} r="1.9" fill={trazo} />
    </svg>
  );
}

/* ==========================================================================
 * Estadisticas derivadas
 *
 * Se calculan desde las propias filas del estado, no desde una llamada nueva:
 * si el numerador o el denominador falta, el ratio sale como sin senal en vez
 * de como cero. El umbral de cada uno decide su tono.
 * ========================================================================== */

const buscarFila = (rows, label) => rows.find((r) => r.label === label)?.values ?? null;

const razon = (a, b, yr) => {
  const num = a?.[yr];
  const den = b?.[yr];
  if (num == null || den == null || Number(den) === 0) return null;
  const v = Number(num) / Number(den);
  return Number.isFinite(v) ? v : null;
};

function derivarEstadisticas(tab, rows, years) {
  const f = (label) => buscarFila(rows, label);

  if (tab === "balance") {
    const activoCorriente = f("Total Activo Corriente");
    const pasivoCorriente = f("Total Pasivo Corriente");
    const pasivoTotal     = f("TOTAL PASIVO");
    const patrimonio      = f("Total Patrimonio Neto");
    const activoTotal     = f("TOTAL ACTIVO");
    return [
      { label: "Current Ratio", hint: "Activo corriente / pasivo corriente", decimales: 2,
        bueno: (v) => v >= 1.5, malo: (v) => v < 1,
        values: Object.fromEntries(years.map((yr) => [yr, razon(activoCorriente, pasivoCorriente, yr)])) },
      { label: "Deuda / Patrimonio", hint: "Apalancamiento", decimales: 2,
        bueno: (v) => v <= 1, malo: (v) => v > 2,
        values: Object.fromEntries(years.map((yr) => [yr, razon(pasivoTotal, patrimonio, yr)])) },
      { label: "Patrimonio / Activo", hint: "Cuanto del activo es propio", decimales: 2,
        bueno: (v) => v >= 0.5, malo: (v) => v < 0.25,
        values: Object.fromEntries(years.map((yr) => [yr, razon(patrimonio, activoTotal, yr)])) },
    ];
  }

  if (tab === "income") {
    const ingresos = f("Ingresos Totales");
    const bruto    = f("Beneficio Bruto");
    const ebit     = f("EBIT / Beneficio Operativo");
    const neto     = f("Beneficio Neto");
    return [
      { label: "Margen bruto", hint: "Beneficio bruto / ingresos", decimales: 1, porcentaje: true,
        bueno: (v) => v >= 0.4, malo: (v) => v < 0.2,
        values: Object.fromEntries(years.map((yr) => [yr, razon(bruto, ingresos, yr)])) },
      { label: "Margen operativo", hint: "EBIT / ingresos", decimales: 1, porcentaje: true,
        bueno: (v) => v >= 0.15, malo: (v) => v < 0.05,
        values: Object.fromEntries(years.map((yr) => [yr, razon(ebit, ingresos, yr)])) },
      { label: "Margen neto", hint: "Beneficio neto / ingresos", decimales: 1, porcentaje: true,
        bueno: (v) => v >= 0.1, malo: (v) => v < 0,
        values: Object.fromEntries(years.map((yr) => [yr, razon(neto, ingresos, yr)])) },
    ];
  }

  const ocf   = f("Flujo de Caja Operativo (OCF)");
  const fcf   = f("Flujo de Caja Libre (FCF)");
  const neto  = f("Beneficio Neto");
  const capex = f("Inversiones en PP&E (Capex)");
  return [
    { label: "Conversion a caja", hint: "OCF / beneficio neto", decimales: 2,
      bueno: (v) => v >= 1, malo: (v) => v < 0.7,
      values: Object.fromEntries(years.map((yr) => [yr, razon(ocf, neto, yr)])) },
    { label: "FCF / OCF", hint: "Cuanto del flujo operativo queda libre", decimales: 2,
      bueno: (v) => v >= 0.6, malo: (v) => v < 0.3,
      values: Object.fromEntries(years.map((yr) => [yr, razon(fcf, ocf, yr)])) },
    { label: "Capex / OCF", hint: "Intensidad de inversion", decimales: 2,
      bueno: (v) => v <= 0.3, malo: (v) => v > 0.6,
      values: Object.fromEntries(years.map((yr) => [yr, Math.abs(razon(capex, ocf, yr) ?? NaN) || null])) },
  ];
}

function StatsSection({ tab, rows, years, c }) {
  const stats = useMemo(() => derivarEstadisticas(tab, rows, years), [tab, rows, years]);
  if (!stats.length || !years.length) return null;

  const tono = (st, v) => (v == null ? c.noSignal : st.bueno(v) ? c.up : st.malo(v) ? c.down : c.caution);
  const fmtV = (st, v) =>
    v == null ? "—" : st.porcentaje ? `${(v * 100).toFixed(st.decimales)} %` : v.toFixed(st.decimales);

  return (
    <div style={{ borderTop: `1px solid ${c.rule}` }}>
      <div style={{ padding: "12px 24px 8px", background: c.surfaceSunken }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.inkFaint, textTransform: "uppercase", letterSpacing: 1 }}>
          Estadisticas derivadas
        </span>
      </div>
      {stats.map((st, i) => (
        <div key={st.label} style={{
          display: "grid",
          gridTemplateColumns: `220px 72px repeat(${years.length}, 1fr)`,
          padding: "8px 24px",
          borderBottom: i < stats.length - 1 ? `1px solid ${c.rule}` : "none",
        }}>
          <span style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.ink }}>{st.label}</span>
            <span style={{ fontSize: 10, color: c.inkFaint }}>{st.hint}</span>
          </span>
          <div style={{ display: "flex", alignItems: "center" }}>
            <RowSparkline values={st.values} years={years} c={c} />
          </div>
          {years.map((yr) => (
            <span key={yr} style={{
              fontSize: 12, fontWeight: 600, textAlign: "right", paddingLeft: 8,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontVariantNumeric: "tabular-nums",
              color: tono(st, st.values[yr]),
            }}>
              {fmtV(st, st.values[yr])}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
/* ==========================================================================
 * Graficos al pie del estado
 *
 * Tres formas, una por lo que cada estado necesita mostrar:
 *
 *  - Area apilada espejada (balance): el activo se apila hacia arriba desde la
 *    linea cero y el pasivo mas patrimonio hacia abajo. Cuadran por definicion,
 *    asi que la simetria es la lectura: si un lado crece mas que el otro, se ve.
 *  - Barras agrupadas (balance): activo contra pasivo, separados en corto y
 *    largo plazo. Responde a "con que se financia lo que se tiene, y a que plazo".
 *  - Multilinea (resultados y flujo): magnitudes que se comparan en el tiempo.
 *
 * Todo en SVG inline, sin dependencias, con la paleta activa.
 * ========================================================================== */

/** Mezcla dos colores hex. Sirve para derivar una segunda capa del acento sin
 *  meter un color nuevo que no esté en el sistema. */
function mixSuave(a, b, t = 0.38) {
  const p = (h) => {
    const x = h.replace('#', '');
    const f = x.length === 3 ? x.split('').map((ch) => ch + ch).join('') : x.slice(0, 6);
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const h = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`;
}

const numOf = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Rotulo compacto para los ejes: 1.2B, 340M, 12k. */
function ejeFmt(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}B`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}MM`;
  if (a >= 1) return `${v.toFixed(0)}M`;
  return v === 0 ? "0" : v.toFixed(1);
}

function Leyenda({ series, c }) {
  return (
    <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
      {series.map((s) => (
        <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: c.inkMuted }}>
          <span style={{ width: 10, height: 10, background: s.color, display: "inline-block", borderRadius: 2 }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ── Area apilada espejada ────────────────────────────────────────────────── */

function AreaEspejada({ arriba, abajo, years, c, etiquetaArriba, etiquetaAbajo }) {
  const W = 480, H = 210, PAD = { t: 14, r: 10, b: 22, l: 46 };
  const plotW = W - PAD.l - PAD.r;
  const semiH = (H - PAD.t - PAD.b) / 2;
  const cero = PAD.t + semiH;

  const suma = (capas, yr) => capas.reduce((acc, cap) => acc + Math.abs(numOf(cap.values?.[yr]) ?? 0), 0);
  const max = Math.max(...years.flatMap((yr) => [suma(arriba, yr), suma(abajo, yr)]), 1);

  const x = (i) => PAD.l + (years.length <= 1 ? plotW / 2 : (i / (years.length - 1)) * plotW);
  const alto = (v) => (Math.abs(v) / max) * semiH;

  /** Cada capa se dibuja como banda entre su acumulado previo y el nuevo. */
  const bandas = (capas, signo) => {
    const acum = years.map(() => 0);
    return capas.map((cap) => {
      const base = [...acum];
      years.forEach((yr, i) => { acum[i] += Math.abs(numOf(cap.values?.[yr]) ?? 0); });
      const arribaPts = years.map((_, i) => `${x(i).toFixed(1)},${(cero - signo * alto(acum[i])).toFixed(1)}`);
      const abajoPts = years.map((_, i) => `${x(i).toFixed(1)},${(cero - signo * alto(base[i])).toFixed(1)}`).reverse();
      return { ...cap, d: `M${arribaPts.join(" L")} L${abajoPts.join(" L")} Z` };
    });
  };

  const bandasArriba = bandas(arriba, 1);
  const bandasAbajo = bandas(abajo, -1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      {bandasAbajo.concat(bandasArriba).map((b) => (
        <path key={b.label} d={b.d} fill={b.color} fillOpacity="0.75" stroke={b.color} strokeWidth="1" />
      ))}

      {/* Linea cero: el eje de simetria, que es de lo que va este grafico */}
      <line x1={PAD.l} x2={W - PAD.r} y1={cero} y2={cero} stroke={c.ruleStrong} strokeWidth="1" />

      <text x={4} y={PAD.t + semiH / 2} fontSize="9" fill={c.inkFaint}
            style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>{etiquetaArriba}</text>
      <text x={4} y={cero + semiH / 2} fontSize="9" fill={c.inkFaint}
            style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>{etiquetaAbajo}</text>

      {years.map((yr, i) => (
        <text key={yr} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={c.inkFaint}
              fontFamily="ui-monospace, monospace">{yr}</text>
      ))}
    </svg>
  );
}

/* ── Barras agrupadas ─────────────────────────────────────────────────────── */

function BarrasAgrupadas({ grupos, series, c }) {
  const W = 480, H = 210, PAD = { t: 14, r: 10, b: 34, l: 52 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const valores = grupos.flatMap((g) => g.valores.map((v) => Math.abs(v ?? 0)));
  const max = Math.max(...valores, 1);
  const anchoGrupo = plotW / grupos.length;
  const anchoBarra = Math.min(46, (anchoGrupo * 0.6) / series.length);
  const y = (v) => PAD.t + plotH - (Math.abs(v) / max) * plotH;
  const ticks = [0, max / 2, max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={c.rule} strokeWidth="1" />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill={c.inkFaint}
                fontFamily="ui-monospace, monospace">{ejeFmt(t)}</text>
        </g>
      ))}

      {grupos.map((g, gi) => {
        const centro = PAD.l + anchoGrupo * (gi + 0.5);
        const inicio = centro - (anchoBarra * series.length) / 2;
        return (
          <g key={g.label}>
            {g.valores.map((v, si) => {
              if (v == null) return null;
              const bx = inicio + anchoBarra * si;
              return (
                <rect key={series[si].label} x={bx + 2} y={y(v)} width={anchoBarra - 4}
                      height={Math.max(PAD.t + plotH - y(v), 1)} fill={series[si].color} />
              );
            })}
            <text x={centro} y={H - 16} textAnchor="middle" fontSize="10" fill={c.inkMuted}>{g.label}</text>
          </g>
        );
      })}

      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} stroke={c.ruleStrong} strokeWidth="1" />
    </svg>
  );
}

/* ── Multilinea ───────────────────────────────────────────────────────────── */

function MultiLinea({ series, years, c, decimales = 0 }) {
  const W = 480, H = 210, PAD = { t: 14, r: 10, b: 22, l: 52 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const todos = series.flatMap((s) => years.map((yr) => numOf(s.values?.[yr]))).filter((v) => v != null);
  if (!todos.length) return null;

  const min = Math.min(...todos, 0);
  const max = Math.max(...todos);
  const span = max - min || Math.abs(max) || 1;
  const x = (i) => PAD.l + (years.length <= 1 ? plotW / 2 : (i / (years.length - 1)) * plotW);
  const y = (v) => PAD.t + plotH - ((v - min) / span) * plotH;
  const ticks = [min, min + span / 2, max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={c.rule} strokeWidth="1" />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill={c.inkFaint}
                fontFamily="ui-monospace, monospace">
            {decimales ? t.toFixed(decimales) : ejeFmt(t)}
          </text>
        </g>
      ))}

      {min < 0 && (
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke={c.ruleStrong} strokeWidth="1" strokeDasharray="3 3" />
      )}

      {series.map((s) => {
        let d = "", abierto = false;
        const puntos = [];
        years.forEach((yr, i) => {
          const v = numOf(s.values?.[yr]);
          if (v == null) { abierto = false; return; }
          d += `${abierto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
          puntos.push({ x: x(i), y: y(v) });
          abierto = true;
        });
        return (
          <g key={s.label}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {puntos.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="2.6" fill={c.surface} stroke={s.color} strokeWidth="1.6" />
            ))}
          </g>
        );
      })}

      {years.map((yr, i) => (
        <text key={yr} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={c.inkFaint}
              fontFamily="ui-monospace, monospace">{yr}</text>
      ))}
    </svg>
  );
}

/* ── Compositor ───────────────────────────────────────────────────────────── */

function StatementCharts({ tab, rows, years, c }) {
  const anos = useMemo(() => cronologico(years), [years]);
  const f = useCallback((label) => buscarFila(rows, label), [rows]);

  const bloques = useMemo(() => {
    if (!anos.length) return null;

    if (tab === "balance") {
      const activoC = { label: "Activo corriente", values: f("Total Activo Corriente"), color: c.accent };
      const activoNC = { label: "Activo no corriente", values: f("Total Activo No Corriente"), color: mixSuave(c.accent, c.ink) };
      const pasivoC = { label: "Pasivo corriente", values: f("Total Pasivo Corriente"), color: c.caution };
      const pasivoNC = { label: "Pasivo no corriente", values: f("Total Pasivo No Corriente"), color: c.down };
      const patrimonio = { label: "Patrimonio neto", values: f("Total Patrimonio Neto"), color: c.up };
      const ultimo = anos[anos.length - 1];
      const v = (fila) => numOf(fila?.[ultimo]);

      return {
        izq: {
          titulo: "Balance a lo largo del tiempo",
          leyenda: [activoC, activoNC, pasivoC, pasivoNC, patrimonio],
          grafico: (
            <AreaEspejada
              arriba={[activoC, activoNC]}
              abajo={[pasivoC, pasivoNC, patrimonio]}
              years={anos}
              c={c}
              etiquetaArriba="Activo"
              etiquetaAbajo="Pasivo + patrimonio"
            />
          ),
        },
        der: {
          titulo: `Corto vs largo plazo · ${ultimo}`,
          leyenda: [{ label: "Activo", color: c.accent }, { label: "Pasivo", color: c.caution }],
          grafico: (
            <BarrasAgrupadas
              series={[{ label: "Activo", color: c.accent }, { label: "Pasivo", color: c.caution }]}
              grupos={[
                { label: "Corto plazo", valores: [v(activoC.values), v(pasivoC.values)] },
                { label: "Largo plazo", valores: [v(activoNC.values), v(pasivoNC.values)] },
              ]}
              c={c}
            />
          ),
        },
      };
    }

    if (tab === "income") {
      const lineas = [
        { label: "Ingresos", values: f("Ingresos Totales"), color: c.accent },
        { label: "EBIT", values: f("EBIT / Beneficio Operativo"), color: c.caution },
        { label: "Beneficio neto", values: f("Beneficio Neto"), color: c.down },
        { label: "EBITDA", values: f("EBITDA"), color: c.up },
      ].filter((s) => s.values);
      const bpa = [
        { label: "BPA básico", values: f("BPA Básico (EPS)"), color: c.accent },
        { label: "BPA diluido", values: f("BPA Diluido (EPS)"), color: c.caution },
      ].filter((s) => s.values);

      return {
        izq: { titulo: "Cuenta de resultados", leyenda: lineas, grafico: <MultiLinea series={lineas} years={anos} c={c} /> },
        der: bpa.length
          ? { titulo: "Beneficio por acción", leyenda: bpa, grafico: <MultiLinea series={bpa} years={anos} c={c} decimales={2} /> }
          : null,
      };
    }

    const flujos = [
      { label: "Flujo operativo", values: f("Flujo de Caja Operativo (OCF)"), color: c.accent },
      { label: "Flujo libre", values: f("Flujo de Caja Libre (FCF)"), color: c.up },
      { label: "Capex", values: f("Inversiones en PP&E (Capex)"), color: c.down },
    ].filter((s) => s.values);
    const reparto = [
      { label: "Dividendos", values: f("Dividendos Pagados"), color: c.accent },
      { label: "Recompras", values: f("Recompra de Acciones"), color: c.caution },
    ].filter((s) => s.values);

    return {
      izq: { titulo: "Flujos de caja", leyenda: flujos, grafico: <MultiLinea series={flujos} years={anos} c={c} /> },
      der: reparto.length
        ? { titulo: "Retribución al accionista", leyenda: reparto, grafico: <MultiLinea series={reparto} years={anos} c={c} /> }
        : null,
    };
  }, [tab, anos, f, c]);

  if (!bloques) return null;

  const panel = (b) =>
    b && (
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: c.inkFaint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          {b.titulo}
        </div>
        {b.grafico}
        <Leyenda series={b.leyenda} c={c} />
      </div>
    );

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
      gap: 24,
      padding: 20,
      borderTop: `1px solid ${c.rule}`,
      background: c.surfaceSunken,
    }}>
      {panel(bloques.izq)}
      {panel(bloques.der)}
    </div>
  );
}

function StatementTable({ title, rows, years, editMode, onCellChange, ticker, companyName, accentColor, statementTab }) {
  const { colors: c } = useTheme();
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div style={{
      background: c.surface,
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      border: `1px solid ${c.rule}`,
      marginBottom: 32,
    }}>
      {/* Table Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px 16px",
        background: c.surface,
        borderBottom: `3px solid ${accentColor}30`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 4, height: 28, borderRadius: 2,
            background: accentColor,
          }} />
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: c.ink, fontFamily: "Georgia, serif" }}>
              {title}
            </h3>
            <span style={{ fontSize: 11, color: c.inkFaint, fontFamily: "monospace" }}>
              Valores en millones USD (M)
            </span>
          </div>
        </div>
        <button
          onClick={() => generatePDF(title, ticker, companyName, rows, years)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 16px",
            background: c.accent,
            color: c.inkOnAccent,
            border: `1px solid ${c.accent}`,
            borderRadius: 5,
            minHeight: 40,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0.2,
            cursor: "pointer",
            transition: "background 160ms",
            fontFamily: "inherit",
          }}
          onMouseEnter={e => e.target.style.background = c.accentPressed}
          onMouseLeave={e => e.target.style.background = c.accent}
        >
          Exportar SVG/PDF
        </button>
      </div>

      {/* Column Headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `220px 72px repeat(${years.length}, 1fr)`,
        background: c.ink,
        padding: "12px 24px",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.inkFaint, textTransform: "uppercase", letterSpacing: 1 }}>
          Concepto
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.inkFaint, textTransform: "uppercase", letterSpacing: 1 }}>
          Tendencia
        </span>
        {years.map(yr => (
          <span key={yr} style={{
            fontSize: 12, fontWeight: 700, color: c.surface,
            textAlign: "right", fontFamily: "Georgia, serif",
          }}>
            {yr}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div>
        {rows.map((row, ri) => {
          if (row.isSection) {
            return (
              <div key={ri} style={{
                display: "grid",
                gridTemplateColumns: `220px 72px repeat(${years.length}, 1fr)`,
                padding: "10px 24px",
                background: c.rule,
                borderTop: `1px solid ${c.rule}`,
                borderBottom: `1px solid ${c.rule}`,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: c.inkMuted,
                  textTransform: "uppercase", letterSpacing: 0.8,
                }}>
                  {row.label}
                </span>
              </div>
            );
          }

          const isHovered = hoveredRow === ri;

          return (
            <div
              key={ri}
              onMouseEnter={() => setHoveredRow(ri)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                display: "grid",
                gridTemplateColumns: `220px 72px repeat(${years.length}, 1fr)`,
                padding: "8px 24px",
                background: isHovered ? `${accentColor}06` : ri % 2 === 0 ? c.surfaceSunken : c.surface,
                borderBottom: `1px solid ${c.rule}`,
                transition: "background 0.15s",
                cursor: editMode ? "text" : "default",
              }}
            >
              <span style={{
                fontSize: row.isBold ? 13 : 12,
                fontWeight: row.isBold ? 700 : 400,
                color: row.isBold ? c.ink : c.inkMuted,
                fontFamily: "Georgia, serif",
                display: "flex",
                alignItems: "center",
                paddingLeft: row.indent ? `${row.indent * 16}px` : 0,
              }}>
                {row.isBold && (
                  <span style={{ marginRight: 8, width: 3, height: 13, background: accentColor, display: "inline-block", flexShrink: 0 }} />
                )}
                {row.label}
              </span>
              <div style={{ display: "flex", alignItems: "center" }}>
                <RowSparkline values={row.values} years={years} c={c} />
              </div>
              {years.map(yr => (
                <div key={yr} style={{ paddingLeft: 8 }}>
                  <EditableCell
                    value={row.values?.[yr]}
                    isEditing={editMode}
                    onChange={(val) => onCellChange(ri, yr, val)}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <StatsSection tab={statementTab} rows={rows} years={years} c={c} />
      <StatementCharts tab={statementTab} rows={rows} years={years} c={c} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinancialStatements({ ticker, companyName }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("income");
  const [editMode, setEditMode] = useState(false);
  const [years, setYears] = useState([]);

  // Raw data from API
  const [rawData, setRawData] = useState(null);

  // Editable rows for each statement
  const [incomeRows, setIncomeRows] = useState([]);
  const [balanceRows, setBalanceRows] = useState([]);
  const [cashflowRows, setCashflowRows] = useState([]);

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchStatements = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/financial-statements-full/${ticker}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setRawData(data);
      const yrs = data.years || [];
      setYears(yrs);
      setIncomeRows(buildIncomeRows(data.income, yrs));
      setBalanceRows(buildBalanceRows(data.balance, yrs));
      setCashflowRows(buildCashflowRows(data.cashflow, yrs));
    } catch (e) {
      // Try fallback mock if no backend yet
      const mock = buildMockData(ticker);
      setRawData(mock);
      setYears(mock.years);
      setIncomeRows(buildIncomeRows(mock.income, mock.years));
      setBalanceRows(buildBalanceRows(mock.balance, mock.years));
      setCashflowRows(buildCashflowRows(mock.cashflow, mock.years));
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { fetchStatements(); }, [fetchStatements]);

  // ── Cell change handler ──────────────────────────────────────────
  const handleCellChange = (setter) => (rowIdx, yr, val) => {
    setter(prev => {
      const next = prev.map((r, i) =>
        i === rowIdx ? { ...r, values: { ...r.values, [yr]: val } } : r
      );
      return next;
    });
  };

  const tabs = [
    { id: "income", label: "Cuenta de resultados", color: c.accent },
    { id: "balance", label: "Balance", color: c.accent },
    { id: "cashflow", label: "Flujo de caja", color: c.up },
  ];

  const activeTabData = tabs.find(t => t.id === activeTab);

  // ── Render ────────────────────────────────────────────────────────
  if (!ticker) {
    return (
      <div style={styles.emptyState}>
        
        <p style={{ color: c.inkFaint, fontFamily: "Georgia, serif" }}>
          Analiza una acción para ver sus estados financieros
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Georgia, serif" }}>

      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: c.ink }}>
            Estados financieros
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: c.inkMuted }}>
            {companyName || ticker} · Últimos 4 ejercicios fiscales · Millones USD
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={fetchStatements}
            disabled={loading}
            style={{ ...styles.btn, background: c.surfaceSunken, color: c.ink }}
          >
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
          <button
            onClick={() => setEditMode(e => !e)}
            style={{
              ...styles.btn,
              background: editMode ? c.accentWash : c.accent,
              color: editMode ? c.accent : c.inkOnAccent,
              borderColor: c.accent,
            }}
          >
            {editMode ? "Terminar edición" : "Editar valores"}
          </button>
        </div>
      </div>

      {editMode && (
        <div style={styles.editBanner}>
          <strong>Modo edición activo</strong> — Haz clic en cualquier celda numérica para modificarla.
          Los cambios se reflejan en tiempo real y en la exportación.
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span style={{ marginLeft: 12, color: c.inkMuted }}>
            Cargando estados financieros de {ticker}...
          </span>
        </div>
      )}

      {!loading && (
        <>
          {/* ── Tabs ── */}
          <div style={styles.tabs}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...styles.tab,
                  background: activeTab === tab.id ? c.surface : "transparent",
                  color: activeTab === tab.id ? tab.color : c.inkMuted,
                  borderBottom: activeTab === tab.id ? `3px solid ${tab.color}` : "3px solid transparent",
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  boxShadow: activeTab === tab.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tables ── */}
          <div style={{ marginTop: 20 }}>
            {activeTab === "income" && (
              <StatementTable
                statementTab="income"
                title="Cuenta de Resultados (Income Statement)"
                rows={incomeRows}
                years={years}
                editMode={editMode}
                onCellChange={handleCellChange(setIncomeRows)}
                ticker={ticker}
                companyName={companyName || ticker}
                accentColor={c.accent}
              />
            )}
            {activeTab === "balance" && (
              <StatementTable
                statementTab="balance"
                title="Balance de Situación (Balance Sheet)"
                rows={balanceRows}
                years={years}
                editMode={editMode}
                onCellChange={handleCellChange(setBalanceRows)}
                ticker={ticker}
                companyName={companyName || ticker}
                accentColor={c.accent}
              />
            )}
            {activeTab === "cashflow" && (
              <StatementTable
                statementTab="cashflow"
                title="Estado de Flujo de Efectivo (Cash Flow)"
                rows={cashflowRows}
                years={years}
                editMode={editMode}
                onCellChange={handleCellChange(setCashflowRows)}
                ticker={ticker}
                companyName={companyName || ticker}
                accentColor={c.up}
              />
            )}
          </div>

          {/* ── Export All ── */}
          <div style={styles.exportAll}>
            <span style={{ fontSize: 13, color: c.inkMuted }}>
              Exportar individualmente: haz clic en "Exportar SVG/PDF" en cada estado
            </span>
            <button
              onClick={() => {
                generatePDF("Cuenta de Resultados", ticker, companyName || ticker, incomeRows, years);
                setTimeout(() => generatePDF("Balance", ticker, companyName || ticker, balanceRows, years), 500);
                setTimeout(() => generatePDF("Flujo de Caja", ticker, companyName || ticker, cashflowRows, years), 1000);
              }}
              style={{ ...styles.btn, background: c.accent, color: c.inkOnAccent, borderColor: c.accent }}
            >
              Exportar los tres estados
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Row Builders ─────────────────────────────────────────────────────────────

const M = (v) => v != null ? Math.round(v / 1e6 * 10) / 10 : null;

function buildIncomeRows(data, years) {
  if (!data) return [];
  const v = (key) => {
    const obj = {};
    years.forEach(yr => { obj[yr] = data[yr]?.[key] ?? null; });
    return obj;
  };
  return [
    { label: "INGRESOS", isSection: true },
    { label: "Ingresos Totales", isBold: true, values: v("Total Revenue") },
    { label: "Coste de Ventas", indent: 1, values: v("Cost Of Revenue") },
    { label: "Beneficio Bruto", isBold: true, values: v("Gross Profit") },
    { label: "GASTOS OPERATIVOS", isSection: true },
    { label: "I+D", indent: 1, values: v("Research Development") },
    { label: "Ventas, Generales y Admin.", indent: 1, values: v("Selling General Administrative") },
    { label: "Gastos Operativos Totales", isBold: true, values: v("Operating Expense") },
    { label: "RESULTADO", isSection: true },
    { label: "EBIT / Beneficio Operativo", isBold: true, values: v("Operating Income") },
    { label: "Ingresos Financieros Netos", indent: 1, values: v("Net Non Operating Interest Income Expense") },
    { label: "Gastos por Intereses", indent: 1, values: v("Interest Expense") },
    { label: "EBT (Antes de Impuestos)", isBold: true, values: v("Pretax Income") },
    { label: "Impuesto sobre Beneficios", indent: 1, values: v("Tax Provision") },
    { label: "Beneficio Neto", isBold: true, values: v("Net Income") },
    { label: "EBITDA", isBold: true, values: v("EBITDA") },
    { label: "BPA Básico (EPS)", indent: 1, values: v("Basic EPS") },
    { label: "BPA Diluido (EPS)", indent: 1, values: v("Diluted EPS") },
    { label: "Acciones en circulación (M)", indent: 1, values: v("Basic Average Shares") },
  ];
}

function buildBalanceRows(data, years) {
  if (!data) return [];
  const v = (key) => {
    const obj = {};
    years.forEach(yr => { obj[yr] = data[yr]?.[key] ?? null; });
    return obj;
  };
  return [
    { label: "ACTIVO CORRIENTE", isSection: true },
    { label: "Efectivo y Equivalentes", indent: 1, values: v("Cash And Cash Equivalents") },
    { label: "Inversiones a C/P", indent: 1, values: v("Short Term Investments") },
    { label: "Cuentas por Cobrar", indent: 1, values: v("Accounts Receivable") },
    { label: "Inventario", indent: 1, values: v("Inventory") },
    { label: "Total Activo Corriente", isBold: true, values: v("Current Assets") },
    { label: "ACTIVO NO CORRIENTE", isSection: true },
    { label: "PP&E Neto", indent: 1, values: v("Net PPE") },
    { label: "Fondo de Comercio", indent: 1, values: v("Goodwill") },
    { label: "Activos Intangibles", indent: 1, values: v("Intangible Assets") },
    { label: "Total Activo No Corriente", isBold: true, values: v("Total Non Current Assets") },
    { label: "TOTAL ACTIVO", isBold: true, values: v("Total Assets") },
    { label: "PASIVO CORRIENTE", isSection: true },
    { label: "Cuentas por Pagar", indent: 1, values: v("Accounts Payable") },
    { label: "Deuda a C/P", indent: 1, values: v("Current Debt") },
    { label: "Total Pasivo Corriente", isBold: true, values: v("Current Liabilities") },
    { label: "PASIVO NO CORRIENTE", isSection: true },
    { label: "Deuda a L/P", indent: 1, values: v("Long Term Debt") },
    { label: "Total Pasivo No Corriente", isBold: true, values: v("Total Non Current Liabilities Net Minority Interest") },
    { label: "TOTAL PASIVO", isBold: true, values: v("Total Liabilities Net Minority Interest") },
    { label: "PATRIMONIO NETO", isSection: true },
    { label: "Capital Social", indent: 1, values: v("Common Stock") },
    { label: "Reservas / Beneficios Acumulados", indent: 1, values: v("Retained Earnings") },
    { label: "Total Patrimonio Neto", isBold: true, values: v("Stockholders Equity") },
    { label: "TOTAL PASIVO + PATRIMONIO", isBold: true, values: v("Total Assets") },
  ];
}

function buildCashflowRows(data, years) {
  if (!data) return [];
  const v = (key) => {
    const obj = {};
    years.forEach(yr => { obj[yr] = data[yr]?.[key] ?? null; });
    return obj;
  };
  return [
    { label: "ACTIVIDADES DE EXPLOTACIÓN", isSection: true },
    { label: "Beneficio Neto", isBold: true, values: v("Net Income") },
    { label: "Depreciación y Amortización", indent: 1, values: v("Depreciation And Amortization") },
    { label: "Variación de Capital Circulante", indent: 1, values: v("Change In Working Capital") },
    { label: "Otros ajustes operativos", indent: 1, values: v("Other Non Cash Items") },
    { label: "Flujo de Caja Operativo (OCF)", isBold: true, values: v("Operating Cash Flow") },
    { label: "ACTIVIDADES DE INVERSIÓN", isSection: true },
    { label: "Inversiones en PP&E (Capex)", indent: 1, values: v("Capital Expenditure") },
    { label: "Compras de Inversiones", indent: 1, values: v("Purchase Of Investment") },
    { label: "Ventas de Inversiones", indent: 1, values: v("Sale Of Investment") },
    { label: "Flujo de Caja de Inversión", isBold: true, values: v("Investing Cash Flow") },
    { label: "ACTIVIDADES DE FINANCIACIÓN", isSection: true },
    { label: "Dividendos Pagados", indent: 1, values: v("Cash Dividends Paid") },
    { label: "Recompra de Acciones", indent: 1, values: v("Repurchase Of Capital Stock") },
    { label: "Emisión de Deuda", indent: 1, values: v("Long Term Debt Issuance") },
    { label: "Repago de Deuda", indent: 1, values: v("Long Term Debt Payments") },
    { label: "Flujo de Caja de Financiación", isBold: true, values: v("Financing Cash Flow") },
    { label: "RESUMEN", isSection: true },
    { label: "Flujo de Caja Libre (FCF)", isBold: true, values: v("Free Cash Flow") },
    { label: "Variación Neta de Efectivo", isBold: true, values: v("Changes In Cash") },
    { label: "Efectivo inicio del período", indent: 1, values: v("Beginning Cash Position") },
    { label: "Efectivo fin del período", indent: 1, values: v("End Cash Position") },
  ];
}

// ─── Mock data builder (fallback) ─────────────────────────────────────────────

function buildMockData(ticker) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear].map(String);
  const seed = ticker.charCodeAt(0) * 100;

  const grow = (base, factor, yr, base_yr) => {
    const years_diff = parseInt(yr) - base_yr;
    return Math.round(base * Math.pow(factor, years_diff) * 10) / 10;
  };

  const baseRevenue = seed * 30 + 50000;
  const baseNI = seed * 5 + 8000;

  const income = {};
  const balance = {};
  const cashflow = {};

  years.forEach((yr, i) => {
    income[yr] = {
      "Total Revenue": grow(baseRevenue, 1.08, yr, parseInt(years[0])),
      "Cost Of Revenue": grow(baseRevenue * 0.55, 1.07, yr, parseInt(years[0])),
      "Gross Profit": grow(baseRevenue * 0.45, 1.09, yr, parseInt(years[0])),
      "Research Development": grow(seed * 4, 1.06, yr, parseInt(years[0])),
      "Operating Income": grow(baseNI * 1.3, 1.1, yr, parseInt(years[0])),
      "Net Income": grow(baseNI, 1.1, yr, parseInt(years[0])),
      "EBITDA": grow(baseNI * 1.8, 1.1, yr, parseInt(years[0])),
      "Pretax Income": grow(baseNI * 1.15, 1.1, yr, parseInt(years[0])),
      "Tax Provision": grow(baseNI * 0.15, 1.05, yr, parseInt(years[0])),
      "Basic EPS": grow(5.2, 1.08, yr, parseInt(years[0])),
      "Diluted EPS": grow(5.0, 1.08, yr, parseInt(years[0])),
    };

    const totalAssets = grow(seed * 120 + 100000, 1.07, yr, parseInt(years[0]));
    balance[yr] = {
      "Total Assets": totalAssets,
      "Cash And Cash Equivalents": grow(seed * 20 + 20000, 1.05, yr, parseInt(years[0])),
      "Accounts Receivable": grow(seed * 10 + 8000, 1.06, yr, parseInt(years[0])),
      "Current Assets": grow(totalAssets * 0.35, 1.06, yr, parseInt(years[0])),
      "Net PPE": grow(seed * 30 + 30000, 1.04, yr, parseInt(years[0])),
      "Goodwill": grow(seed * 15 + 15000, 1.02, yr, parseInt(years[0])),
      "Total Liabilities Net Minority Interest": grow(totalAssets * 0.55, 1.05, yr, parseInt(years[0])),
      "Current Liabilities": grow(totalAssets * 0.2, 1.04, yr, parseInt(years[0])),
      "Long Term Debt": grow(seed * 25 + 25000, 1.03, yr, parseInt(years[0])),
      "Stockholders Equity": grow(totalAssets * 0.45, 1.09, yr, parseInt(years[0])),
      "Retained Earnings": grow(seed * 40 + 40000, 1.12, yr, parseInt(years[0])),
    };

    const ocf = grow(baseNI * 1.4, 1.1, yr, parseInt(years[0]));
    const capex = grow(seed * 5 + 5000, 1.07, yr, parseInt(years[0]));
    cashflow[yr] = {
      "Net Income": income[yr]["Net Income"],
      "Depreciation And Amortization": grow(seed * 3 + 3000, 1.05, yr, parseInt(years[0])),
      "Operating Cash Flow": ocf,
      "Capital Expenditure": -capex,
      "Free Cash Flow": ocf - capex,
      "Cash Dividends Paid": grow(-seed * 1 - 1000, 1.05, yr, parseInt(years[0])),
      "Investing Cash Flow": grow(-capex * 2.5, 1.06, yr, parseInt(years[0])),
      "Financing Cash Flow": grow(-baseNI * 0.3, 0.97, yr, parseInt(years[0])),
      "Changes In Cash": grow(baseNI * 0.1, 1.05, yr, parseInt(years[0])),
    };
  });

  return { years, income, balance, cashflow };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c) {
  return {
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 20,
      flexWrap: "wrap",
      gap: 12,
    },
    btn: {
      minHeight: 40,
      padding: "0 16px",
      borderRadius: 5,
      border: `1px solid ${c.rule}`,
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 0.2,
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "background 160ms, border-color 160ms",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    editBanner: {
      background: c.accentWash,
      border: `1px solid ${c.accent}`,
      borderRadius: 8,
      padding: "10px 16px",
      fontSize: 13,
      color: c.accent,
      marginBottom: 16,
    },
    loading: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 60,
      background: c.surface,
      borderRadius: 16,
      border: `1px solid ${c.rule}`,
    },
    spinner: {
      width: 28,
      height: 28,
      border: `3px solid ${c.rule}`,
      borderTop: `3px solid ${c.accent}`,
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    },
    tabs: {
      display: "flex",
      background: c.surfaceSunken,
      borderRadius: 12,
      padding: 4,
      gap: 4,
      border: `1px solid ${c.rule}`,
    },
    tab: {
      flex: 1,
      minHeight: 44,
      padding: "0 12px",
      border: "none",
      borderRadius: 0,
      fontSize: 13,
      cursor: "pointer",
      transition: "background 160ms, color 160ms",
      fontFamily: "inherit",
      letterSpacing: 0.2,
    },
    exportAll: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 20px",
      background: c.surfaceSunken,
      borderRadius: 12,
      border: `1px solid ${c.rule}`,
      marginTop: 8,
      flexWrap: "wrap",
      gap: 10,
    },
    emptyState: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 60,
      background: c.surfaceSunken,
      borderRadius: 16,
      border: `1px dashed ${c.rule}`,
      gap: 12,
    },
  };
}

// CSS animation injection
if (typeof document !== "undefined" && !document.getElementById("fs-anim")) {
  const style = document.createElement("style");
  style.id = "fs-anim";
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
