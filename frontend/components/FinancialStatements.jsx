import { useState, useEffect, useCallback } from "react";

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

const color = (v) => {
  if (v == null || v === "") return "#6b7280";
  return Number(v) >= 0 ? "#059669" : "#dc2626";
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
    const bg = row.isSection ? "#1e293b" : ri % 2 === 0 ? "#f8fafc" : "#ffffff";
    const textColor = row.isSection ? "#ffffff" : row.isBold ? "#0f172a" : "#374151";
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
        const valColor = row.isSection ? "#ffffff" : Number(val) < 0 ? "#dc2626" : textColor;
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
                  text-anchor="middle" fill="#ffffff">${escapeXml(yr)}</text>
            <text x="${xPos}" y="${margin + titleH + 52}" 
                  font-family="Georgia, serif" font-size="9" 
                  text-anchor="middle" fill="#94a3b8">(M USD)</text>`;
  }).join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">
  <defs>
    <linearGradient id="hdrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e3a5f"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${W}" height="${totalH}" fill="#f8fafc"/>
  
  <!-- Header gradient block -->
  <rect x="0" y="0" width="${W}" height="${margin + titleH + headerH}" fill="url(#hdrGrad)"/>
  
  <!-- Accent bar -->
  <rect x="0" y="${margin + titleH + headerH - 4}" width="${W}" height="4" fill="#3b82f6"/>

  <!-- Company & Title -->
  <text x="${margin}" y="${margin + 28}" font-family="Georgia, serif" font-size="22" 
        font-weight="bold" fill="#ffffff">${escapeXml(companyName)} · ${escapeXml(ticker)}</text>
  <text x="${margin}" y="${margin + 50}" font-family="Georgia, serif" font-size="15" 
        fill="#94a3b8">${escapeXml(title)}</text>
  <text x="${W - margin}" y="${margin + 50}" font-family="Georgia, serif" font-size="10" 
        fill="#64748b" text-anchor="end">Generado: ${new Date().toLocaleDateString("es-ES")}</text>

  <!-- Table header -->
  <rect x="${margin}" y="${margin + titleH}" width="${W - margin * 2}" height="${headerH - 8}" 
        fill="#1e293b" rx="4"/>
  <text x="${margin + 12}" y="${margin + titleH + 35}" font-family="Georgia, serif" 
        font-size="12" font-weight="bold" fill="#ffffff">Concepto</text>
  ${yearHeaders}

  <!-- Rows -->
  ${cells}

  <!-- Footer -->
  <line x1="${margin}" y1="${tableTop + rows.length * rowH + 16}" 
        x2="${W - margin}" y2="${tableTop + rows.length * rowH + 16}" 
        stroke="#e2e8f0" stroke-width="1"/>
  <text x="${margin}" y="${tableTop + rows.length * rowH + 36}" 
        font-family="Georgia, serif" font-size="9" fill="#94a3b8">
    * Valores en millones de USD (M). Datos provistos por Yahoo Finance vía API.
  </text>
  <text x="${W - margin}" y="${tableTop + rows.length * rowH + 36}" 
        font-family="Georgia, serif" font-size="9" fill="#94a3b8" text-anchor="end">
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
  const [localVal, setLocalVal] = useState(value ?? "");

  useEffect(() => setLocalVal(value ?? ""), [value]);

  if (!isEditing) {
    return (
      <span style={{
        display: "block",
        textAlign: align,
        fontFamily: "'Courier New', monospace",
        fontSize: 13,
        color: value == null || value === "" ? "#9ca3af" : color(value),
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
        background: "#dbeafe",
        border: "2px solid #3b82f6",
        borderRadius: 4,
        padding: "2px 6px",
        textAlign: "right",
        fontSize: 12,
        fontFamily: "'Courier New', monospace",
        color: "#1e3a5f",
        outline: "none",
      }}
    />
  );
}

// ─── Statement Table ──────────────────────────────────────────────────────────

function StatementTable({ title, rows, years, editMode, onCellChange, ticker, companyName, accentColor }) {
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div style={{
      background: "#ffffff",
      borderRadius: 16,
      overflow: "hidden",
      boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      border: "1px solid #e2e8f0",
      marginBottom: 32,
    }}>
      {/* Table Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px 16px",
        background: `linear-gradient(135deg, ${accentColor}08 0%, #ffffff 100%)`,
        borderBottom: `3px solid ${accentColor}30`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 4, height: 28, borderRadius: 2,
            background: accentColor,
          }} />
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a", fontFamily: "Georgia, serif" }}>
              {title}
            </h3>
            <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
              Valores en millones USD (M)
            </span>
          </div>
        </div>
        <button
          onClick={() => generatePDF(title, ticker, companyName, rows, years)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px",
            background: "#0f172a",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
            fontFamily: "Georgia, serif",
          }}
          onMouseEnter={e => e.target.style.background = accentColor}
          onMouseLeave={e => e.target.style.background = "#0f172a"}
        >
          ⬇ Exportar SVG/PDF
        </button>
      </div>

      {/* Column Headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `240px repeat(${years.length}, 1fr)`,
        background: "#1e293b",
        padding: "12px 24px",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
          Concepto
        </span>
        {years.map(yr => (
          <span key={yr} style={{
            fontSize: 12, fontWeight: 700, color: "#ffffff",
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
                gridTemplateColumns: `240px repeat(${years.length}, 1fr)`,
                padding: "10px 24px",
                background: "#f1f5f9",
                borderTop: "1px solid #e2e8f0",
                borderBottom: "1px solid #e2e8f0",
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#64748b",
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
                gridTemplateColumns: `240px repeat(${years.length}, 1fr)`,
                padding: "8px 24px",
                background: isHovered ? `${accentColor}06` : ri % 2 === 0 ? "#fafafa" : "#ffffff",
                borderBottom: "1px solid #f1f5f9",
                transition: "background 0.15s",
                cursor: editMode ? "text" : "default",
              }}
            >
              <span style={{
                fontSize: row.isBold ? 13 : 12,
                fontWeight: row.isBold ? 700 : 400,
                color: row.isBold ? "#0f172a" : "#374151",
                fontFamily: "Georgia, serif",
                display: "flex",
                alignItems: "center",
                paddingLeft: row.indent ? `${row.indent * 16}px` : 0,
              }}>
                {row.isBold && (
                  <span style={{ marginRight: 6, color: accentColor, fontSize: 10 }}>▶</span>
                )}
                {row.label}
              </span>
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
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinancialStatements({ ticker, companyName }) {
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
    { id: "income", label: "Cuenta de Resultados", emoji: "📊", color: "#3b82f6" },
    { id: "balance", label: "Balance", emoji: "⚖️", color: "#8b5cf6" },
    { id: "cashflow", label: "Flujo de Caja", emoji: "💵", color: "#059669" },
  ];

  const activeTabData = tabs.find(t => t.id === activeTab);

  // ── Render ────────────────────────────────────────────────────────
  if (!ticker) {
    return (
      <div style={styles.emptyState}>
        <span style={{ fontSize: 48 }}>📋</span>
        <p style={{ color: "#94a3b8", fontFamily: "Georgia, serif" }}>
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
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
            📋 Estados Financieros
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            {companyName || ticker} · Últimos 4 ejercicios fiscales · Millones USD
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={fetchStatements}
            disabled={loading}
            style={{ ...styles.btn, background: "#f1f5f9", color: "#374151" }}
          >
            {loading ? "⏳" : "🔄"} Actualizar
          </button>
          <button
            onClick={() => setEditMode(e => !e)}
            style={{
              ...styles.btn,
              background: editMode ? "#dbeafe" : "#0f172a",
              color: editMode ? "#1e40af" : "#ffffff",
              border: editMode ? "2px solid #3b82f6" : "2px solid transparent",
            }}
          >
            {editMode ? "✅ Modo edición ON" : "✏️ Editar valores"}
          </button>
        </div>
      </div>

      {editMode && (
        <div style={styles.editBanner}>
          ✏️ <strong>Modo edición activo</strong> — Haz clic en cualquier celda numérica para modificarla.
          Los cambios se reflejan en tiempo real y en la exportación.
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span style={{ marginLeft: 12, color: "#64748b" }}>
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
                  background: activeTab === tab.id ? "#ffffff" : "transparent",
                  color: activeTab === tab.id ? tab.color : "#64748b",
                  borderBottom: activeTab === tab.id ? `3px solid ${tab.color}` : "3px solid transparent",
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  boxShadow: activeTab === tab.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {tab.emoji} {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tables ── */}
          <div style={{ marginTop: 20 }}>
            {activeTab === "income" && (
              <StatementTable
                title="Cuenta de Resultados (Income Statement)"
                rows={incomeRows}
                years={years}
                editMode={editMode}
                onCellChange={handleCellChange(setIncomeRows)}
                ticker={ticker}
                companyName={companyName || ticker}
                accentColor="#3b82f6"
              />
            )}
            {activeTab === "balance" && (
              <StatementTable
                title="Balance de Situación (Balance Sheet)"
                rows={balanceRows}
                years={years}
                editMode={editMode}
                onCellChange={handleCellChange(setBalanceRows)}
                ticker={ticker}
                companyName={companyName || ticker}
                accentColor="#8b5cf6"
              />
            )}
            {activeTab === "cashflow" && (
              <StatementTable
                title="Estado de Flujo de Efectivo (Cash Flow)"
                rows={cashflowRows}
                years={years}
                editMode={editMode}
                onCellChange={handleCellChange(setCashflowRows)}
                ticker={ticker}
                companyName={companyName || ticker}
                accentColor="#059669"
              />
            )}
          </div>

          {/* ── Export All ── */}
          <div style={styles.exportAll}>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              Exportar individualmente: haz clic en "Exportar SVG/PDF" en cada estado
            </span>
            <button
              onClick={() => {
                generatePDF("Cuenta de Resultados", ticker, companyName || ticker, incomeRows, years);
                setTimeout(() => generatePDF("Balance", ticker, companyName || ticker, balanceRows, years), 500);
                setTimeout(() => generatePDF("Flujo de Caja", ticker, companyName || ticker, cashflowRows, years), 1000);
              }}
              style={{ ...styles.btn, background: "#0f172a", color: "#ffffff" }}
            >
              ⬇ Exportar los 3 estados
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

const styles = {
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
    flexWrap: "wrap",
    gap: 12,
  },
  btn: {
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "Georgia, serif",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  editBanner: {
    background: "#dbeafe",
    border: "1px solid #93c5fd",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 13,
    color: "#1e40af",
    marginBottom: 16,
  },
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 60,
    background: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e2e8f0",
  },
  spinner: {
    width: 28,
    height: 28,
    border: "3px solid #e2e8f0",
    borderTop: "3px solid #3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  tabs: {
    display: "flex",
    background: "#f8fafc",
    borderRadius: 12,
    padding: 4,
    gap: 4,
    border: "1px solid #e2e8f0",
  },
  tab: {
    flex: 1,
    padding: "10px 12px",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.2s",
    fontFamily: "Georgia, serif",
    letterSpacing: 0.2,
  },
  exportAll: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    background: "#f8fafc",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
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
    background: "#f8fafc",
    borderRadius: 16,
    border: "1px dashed #e2e8f0",
    gap: 12,
  },
};

// CSS animation injection
if (typeof document !== "undefined" && !document.getElementById("fs-anim")) {
  const style = document.createElement("style");
  style.id = "fs-anim";
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
