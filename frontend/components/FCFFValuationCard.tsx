import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../contexts/ThemeContext';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface FCFFInputs {
  ebit: string; tax: string; da: string; capex: string;
  wc: string; debt: string; shares: string; price: string;
  rf: string; beta: string; erp: string; kd: string;
  we: string; g1: string; years: string; gterm: string;
}

interface SensCell {
  price: number; isBase: boolean;
  signal: 'buy' | 'hold' | 'sell' | 'invalid';
}

interface FCFFResult {
  wacc: number; ke: number; fcff0: number; nopat: number;
  ev: number; pvFcf: number; pvTv: number; pricePerShare: number;
  updown: number; tvPct: number; verdict: 'buy' | 'hold' | 'sell';
  sensitivity: SensCell[][]; waccRows: number[]; gtermCols: number[];
}

interface FCFFValuationCardProps {
  ticker?: string;
  currentPrice?: number;
  beta?: number;
  rfRate?: number;
  taxRate?: number;
}

/** Campos auto-rellenados desde el backend y su fuente (año fiscal) */
interface AutoFilledMeta {
  fields: (keyof FCFFInputs)[];
  fiscal_year?: string;
  company_name?: string;
}

// ─────────────────────────────────────────────
// Core model (pure)
// ─────────────────────────────────────────────
function runFCFF(
  ebit: number, tax: number, da: number, capex: number, wc: number,
  g1: number, years: number, gterm: number, wacc: number,
  debt: number, shares: number
) {
  const nopat = ebit * (1 - tax / 100);
  const fcff0 = nopat + da - capex - wc;
  let pvFcf = 0, fcffT = fcff0;
  for (let t = 1; t <= years; t++) {
    fcffT *= (1 + g1 / 100);
    pvFcf += fcffT / Math.pow(1 + wacc / 100, t);
  }
  const tv   = fcffT * (1 + gterm / 100) / (wacc / 100 - gterm / 100);
  const pvTv = tv / Math.pow(1 + wacc / 100, years);
  const ev   = pvFcf + pvTv;
  return { pricePerShare: shares > 0 ? (ev - debt) / shares : 0, ev, pvFcf, pvTv, fcff0, nopat };
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
function InputField({
  label, value, onChangeText, placeholder, suffix, isAutoFilled, s, colors,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; suffix?: string; isAutoFilled?: boolean;
  s: Styles; colors: ThemeColors;
}) {
  return (
    <View style={s.inputField}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={s.inputLabel}>{label}</Text>
        {isAutoFilled && (
          <View style={s.autoTag}>
            <Text style={s.autoTagText}>auto</Text>
          </View>
        )}
      </View>
      <View style={[s.inputWrapper, isAutoFilled && s.inputWrapperAuto]}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? '0'}
          placeholderTextColor={colors.inkFaint}
          keyboardType="decimal-pad"
        />
        {suffix ? <Text style={s.inputSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function Tile({ label, value, color, sub, s }: { label: string; value: string; color?: string; sub?: string; s: Styles }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={[s.tileValue, color ? { color } : {}]}>{value}</Text>
      {sub ? <Text style={s.tileSub}>{sub}</Text> : null}
    </View>
  );
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
export default function FCFFValuationCard({
  ticker = 'TICKER',
  currentPrice = 0,
  beta = 1.0,
  rfRate = 4.5,
  taxRate = 21,
}: FCFFValuationCardProps) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);


  const defaultInputs = (): FCFFInputs => ({
    ebit: '', tax: taxRate.toFixed(1), da: '', capex: '', wc: '0',
    debt: '', shares: '', price: currentPrice > 0 ? currentPrice.toFixed(2) : '',
    rf: rfRate.toFixed(1), beta: beta.toFixed(2),
    erp: '5.5', kd: '5.0', we: '70', g1: '8', years: '7', gterm: '2.5',
  });

  const [inputs, setInputs]       = useState<FCFFInputs>(defaultInputs);
  const [result, setResult]       = useState<FCFFResult | null>(null);
  const [margin, setMargin]       = useState(30);
  const [loading, setLoading]     = useState(false);
  const [fetching, setFetching]   = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [autoMeta, setAutoMeta]   = useState<AutoFilledMeta | null>(null);
  const [exp, setExp]             = useState({ inputs1: true, inputs2: false, result: true, sens: false });

  // Reset completo cuando cambia el ticker
  useEffect(() => {
    setResult(null);
    setAutoMeta(null);
    setFetchError(null);
    const fresh = {
      ebit: '', tax: taxRate.toFixed(1), da: '', capex: '', wc: '0',
      debt: '', shares: '',
      price: currentPrice > 0 ? currentPrice.toFixed(2) : '',
      rf: rfRate.toFixed(1), beta: beta.toFixed(2),
      erp: '5.5', kd: '5.0', we: '70', g1: '8', years: '7', gterm: '2.5',
    };
    setInputs(fresh);
    if (ticker && ticker !== 'TICKER') fetchFinancialData(fresh);
  }, [ticker]);

  // Actualizar rf/beta/tax/price si cambian props (y el usuario no los tocó aún)
  useEffect(() => {
    setInputs(prev => ({
      ...prev,
      rf:    rfRate > 0 ? rfRate.toFixed(1) : prev.rf,
      beta:  beta  > 0 ? beta.toFixed(2)   : prev.beta,
      tax:   taxRate > 0 ? taxRate.toFixed(1) : prev.tax,
      price: currentPrice > 0 && prev.price === '' ? currentPrice.toFixed(2) : prev.price,
    }));
  }, [rfRate, beta, taxRate, currentPrice]);

  /**
   * Llama al endpoint /api/financial-statements/{ticker} y rellena los campos
   * obligatorios con los datos reales del último año fiscal.
   * El usuario puede sobrescribir cualquier campo manualmente después.
   */
  const fetchFinancialData = async (base?: FCFFInputs) => {
    setFetching(true);
    setFetchError(null);
    try {
      const r = await axios.get(`${BACKEND_URL}/api/financial-statements/${ticker}`);
      const fd = r.data;

      const filled: (keyof FCFFInputs)[] = [];

      setInputs(prev => {
        const next = { ...(base ?? prev) };

        if (fd.ebit != null)         { next.ebit  = fd.ebit.toFixed(0);            filled.push('ebit'); }
        if (fd.da != null)           { next.da    = fd.da.toFixed(0);              filled.push('da'); }
        if (fd.capex != null)        { next.capex = fd.capex.toFixed(0);           filled.push('capex'); }
        if (fd.wc != null)           { next.wc    = fd.wc.toFixed(0);             filled.push('wc'); }
        if (fd.net_debt != null)     { next.debt  = fd.net_debt.toFixed(0);        filled.push('debt'); }
        if (fd.shares != null)       { next.shares = fd.shares.toFixed(2);         filled.push('shares'); }
        if (fd.current_price != null){ next.price  = fd.current_price.toFixed(2);  filled.push('price'); }
        if (fd.tax_rate != null)     { next.tax    = fd.tax_rate.toFixed(1);        filled.push('tax'); }
        if (fd.beta != null)         { next.beta   = fd.beta.toFixed(2);            filled.push('beta'); }
        if (fd.we != null)           { next.we     = fd.we.toFixed(1);             filled.push('we'); }
        if (fd.kd != null)           { next.kd     = fd.kd.toFixed(2);             filled.push('kd'); }

        return next;
      });

      setAutoMeta({
        fields:       filled,
        fiscal_year:  fd.fiscal_year,
        company_name: fd.company_name,
      });

    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'No se pudieron cargar los datos financieros automáticamente.';
      setFetchError(msg);
    } finally {
      setFetching(false);
    }
  };

  const isAuto = useCallback(
    (key: keyof FCFFInputs) => autoMeta?.fields.includes(key) ?? false,
    [autoMeta]
  );

  const set = useCallback((key: keyof FCFFInputs) => (val: string) => {
    // Al editar manualmente, quitar la marca "auto" de ese campo
    setAutoMeta(prev => prev ? { ...prev, fields: prev.fields.filter(f => f !== key) } : prev);
    setInputs(prev => ({ ...prev, [key]: val }));
  }, []);

  const calculate = () => {
    const n = (k: keyof FCFFInputs) => parseFloat(inputs[k]) || 0;
    const ebit = n('ebit'), tax = n('tax'), da = n('da'), capex = n('capex'),
          wc   = n('wc'),  debt = n('debt'), shares = n('shares'), price = n('price'),
          rf   = n('rf'),  betaV = n('beta'), erp = n('erp'), kd = n('kd'),
          we   = n('we'),  g1 = n('g1'),  gterm = n('gterm'),
          years = Math.max(1, Math.round(n('years')));

    if (ebit === 0 || shares === 0) {
      Alert.alert(
        'Datos insuficientes',
        'Introduce al menos EBIT (*) y Acciones (*).\n\n' +
        'Encuéntralos en:\n• Yahoo Finance → Financials\n• Macrotrends.net\n• Informe anual 10-K (en millones $)'
      );
      return;
    }
    const ke   = rf + betaV * erp;
    const wd   = 100 - we;
    const wacc = (we / 100) * ke + (wd / 100) * kd * (1 - tax / 100);
    if (wacc <= gterm) {
      Alert.alert('Error de modelo', `WACC (${wacc.toFixed(2)}%) debe ser > g∞ (${gterm}%). Reduce el crecimiento terminal.`);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const { pricePerShare, ev, pvFcf, pvTv, fcff0, nopat } = runFCFF(ebit, tax, da, capex, wc, g1, years, gterm, wacc, debt, shares);
      const updown  = price > 0 ? ((pricePerShare - price) / price) * 100 : 0;
      const tvPct   = ev > 0 ? (pvTv / ev) * 100 : 0;
      const verdict: FCFFResult['verdict'] = pricePerShare > price * 1.15 ? 'buy' : pricePerShare < price * 0.85 ? 'sell' : 'hold';

      const waccRows  = [-2, -1, 0, 1, 2].map(d  => parseFloat((wacc  + d).toFixed(2)));
      const gtermCols = [-1, -0.5, 0, 0.5, 1].map(d => parseFloat((gterm + d).toFixed(2)));
      const ref = price || pricePerShare;

      const sensitivity: SensCell[][] = waccRows.map((w, wi) =>
        gtermCols.map((g, gi) => {
          if (w <= g) return { price: 0, isBase: false, signal: 'invalid' as const };
          const { pricePerShare: p } = runFCFF(ebit, tax, da, capex, wc, g1, years, g, w, debt, shares);
          return { price: p, isBase: wi === 2 && gi === 2, signal: p > ref * 1.1 ? 'buy' : p < ref * 0.9 ? 'sell' : 'hold' };
        })
      );
      setResult({ wacc, ke, fcff0, nopat, ev, pvFcf, pvTv, pricePerShare, updown, tvPct, verdict, sensitivity, waccRows, gtermCols });
      setExp(prev => ({ ...prev, result: true, sens: true }));
      setLoading(false);
    }, 80);
  };

  const targetPrice = result ? result.pricePerShare * (1 - margin / 100) : 0;
  const VC = {
    buy:  { bg: colors.upWash, border: colors.upWash, text: colors.up, badge: colors.upWash, badgeText: colors.up },
    hold: { bg: colors.cautionWash, border: colors.cautionWash, text: colors.caution, badge: colors.cautionWash, badgeText: colors.caution },
    sell: { bg: colors.downWash, border: colors.downWash, text: colors.down, badge: colors.downWash, badgeText: colors.down },
  };
  const vc = result ? VC[result.verdict] : VC.hold;

  const evFmt = (v: number) => v > 1000 ? `$${(v / 1000).toFixed(1)}B` : `$${v.toFixed(0)}M`;

  const autoCount = autoMeta?.fields.length ?? 0;

  return (
    <View style={s.container}>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerIcon}>🏛️</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Valoración FCFF / WACC</Text>
          <Text style={s.headerSub}>
            Modelo institucional · {autoMeta?.company_name ? `${autoMeta.company_name} (${ticker})` : ticker}
          </Text>
        </View>
        {/* Botón de recarga manual */}
        {!fetching && (
          <TouchableOpacity
            style={s.reloadBtn}
            onPress={() => fetchFinancialData()}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={16} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={s.methodNote}>
        Estándar CFA: NOPAT → FCFF → Dos fases + perpetuidad Gordon. WACC por CAPM.
      </Text>

      {/* Banner estado datos */}
      {fetching ? (
        <View style={s.banner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={s.bannerText}>Cargando datos financieros reales de {ticker}…</Text>
        </View>
      ) : fetchError ? (
        <View style={[s.banner, { backgroundColor: colors.downWash, borderColor: colors.downWash }]}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.down} />
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerText, { color: colors.down }]}>{fetchError}</Text>
            <Text style={[s.bannerText, { color: colors.down, marginTop: 2 }]}>
              Introduce los datos del 10-K manualmente. Los campos con * son obligatorios.
            </Text>
          </View>
        </View>
      ) : autoCount > 0 ? (
        <View style={[s.banner, { backgroundColor: colors.upWash, borderColor: colors.upWash }]}>
          <Ionicons name="checkmark-circle" size={14} color={colors.up} />
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerText, { color: colors.up, fontWeight: '600' }]}>
              {autoCount} campos completados automáticamente
              {autoMeta?.fiscal_year ? ` · FY ${autoMeta.fiscal_year.slice(0, 7)}` : ''}
            </Text>
            <Text style={[s.bannerText, { color: colors.up }]}>
              Datos reales de Yahoo Finance. Puedes editar cualquier campo libremente.
            </Text>
          </View>
        </View>
      ) : (
        <View style={[s.banner, { backgroundColor: colors.cautionWash, borderColor: colors.cautionWash }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.caution} />
          <Text style={[s.bannerText, { color: colors.caution }]}>
            Introduce los datos del 10-K en millones ($). Los campos con * son obligatorios.
          </Text>
        </View>
      )}

      {/* Inputs: estado financiero */}
      <TouchableOpacity style={s.toggle} onPress={() => setExp(p => ({ ...p, inputs1: !p.inputs1 }))} activeOpacity={0.7}>
        <View style={s.toggleLeft}>
          <Text style={s.toggleIcon}>📋</Text>
          <Text style={s.toggleTitle}>Estado financiero</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {autoCount > 0 && (
            <View style={s.autoCountBadge}>
              <Text style={s.autoCountText}>{autoCount} auto</Text>
            </View>
          )}
          <Ionicons name={exp.inputs1 ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkFaint} />
        </View>
      </TouchableOpacity>
      {exp.inputs1 && (
        <View style={s.inputsCard}>
          <View style={s.inputRow}>
            <InputField
              label="EBIT (M$) *"
              value={inputs.ebit}
              onChangeText={set('ebit')}
              placeholder="ej. 120"
              isAutoFilled={isAuto('ebit')}
             s={s} colors={colors} />
            <InputField
              label="Tasa impositiva (%)"
              value={inputs.tax}
              onChangeText={set('tax')}
              placeholder="ej. 21"
              suffix="%"
              isAutoFilled={isAuto('tax')}
             s={s} colors={colors} />
          </View>
          <View style={s.inputRow}>
            <InputField
              label="D&A (M$)"
              value={inputs.da}
              onChangeText={set('da')}
              placeholder="ej. 30"
              isAutoFilled={isAuto('da')}
             s={s} colors={colors} />
            <InputField
              label="Capex (M$)"
              value={inputs.capex}
              onChangeText={set('capex')}
              placeholder="ej. 45"
              isAutoFilled={isAuto('capex')}
             s={s} colors={colors} />
          </View>
          <View style={s.inputRow}>
            <InputField
              label="Var. Cap. Circulante (M$)"
              value={inputs.wc}
              onChangeText={set('wc')}
              placeholder="ej. 10"
              isAutoFilled={isAuto('wc')}
             s={s} colors={colors} />
            <InputField
              label="Deuda neta (M$) *"
              value={inputs.debt}
              onChangeText={set('debt')}
              placeholder="ej. 200"
              isAutoFilled={isAuto('debt')}
             s={s} colors={colors} />
          </View>
          <View style={s.inputRow}>
            <InputField
              label="Acciones (M) *"
              value={inputs.shares}
              onChangeText={set('shares')}
              placeholder="ej. 50"
              isAutoFilled={isAuto('shares')}
             s={s} colors={colors} />
            <InputField
              label="Precio actual ($)"
              value={inputs.price}
              onChangeText={set('price')}
              placeholder="ej. 85"
              suffix="$"
              isAutoFilled={isAuto('price')}
             s={s} colors={colors} />
          </View>
          <View style={s.helpBox}>
            <Text style={s.helpText}>
              💡 Datos obtenidos de Yahoo Finance (último año fiscal).{'\n'}
              Los campos marcados <Text style={{ fontWeight: '700' }}>auto</Text> están pre-rellenados. Edítalos si lo necesitas.
            </Text>
          </View>
        </View>
      )}

      {/* Inputs: WACC */}
      <TouchableOpacity style={s.toggle} onPress={() => setExp(p => ({ ...p, inputs2: !p.inputs2 }))} activeOpacity={0.7}>
        <View style={s.toggleLeft}><Text style={s.toggleIcon}>⚙️</Text><Text style={s.toggleTitle}>Parámetros WACC y crecimiento</Text></View>
        <Ionicons name={exp.inputs2 ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkFaint} />
      </TouchableOpacity>
      {exp.inputs2 && (
        <View style={s.inputsCard}>
          <View style={s.waccFormulaRow}>
            <Text style={s.waccFormula}>ke = rf + β × ERP</Text>
            <Text style={s.waccFormulaSub}>WACC = We·ke + Wd·kd·(1-t)</Text>
          </View>
          <View style={s.inputRow}>
            <InputField label="rf (%)" value={inputs.rf} onChangeText={set('rf')} suffix="%"  s={s} colors={colors} />
            <InputField
              label="Beta (β)"
              value={inputs.beta}
              onChangeText={set('beta')}
              placeholder="ej. 1.2"
              isAutoFilled={isAuto('beta')}
             s={s} colors={colors} />
          </View>
          <View style={s.inputRow}>
            <InputField label="ERP (%)" value={inputs.erp} onChangeText={set('erp')} suffix="%"  s={s} colors={colors} />
            <InputField
              label="kd (%)"
              value={inputs.kd}
              onChangeText={set('kd')}
              suffix="%"
              isAutoFilled={isAuto('kd')}
             s={s} colors={colors} />
          </View>
          <View style={s.inputRow}>
            <InputField
              label="Peso equity We (%)"
              value={inputs.we}
              onChangeText={set('we')}
              suffix="%"
              isAutoFilled={isAuto('we')}
             s={s} colors={colors} />
            <InputField label="Crecimiento g1 (%)" value={inputs.g1} onChangeText={set('g1')} suffix="%"  s={s} colors={colors} />
          </View>
          <View style={s.inputRow}>
            <InputField label="Años fase alta" value={inputs.years} onChangeText={set('years')} placeholder="ej. 7"  s={s} colors={colors} />
            <InputField label="g∞ terminal (%)" value={inputs.gterm} onChangeText={set('gterm')} suffix="%"  s={s} colors={colors} />
          </View>
        </View>
      )}

      {/* Botón calcular */}
      <TouchableOpacity style={s.calcBtn} onPress={calculate} disabled={loading} activeOpacity={0.85}>
        {loading
          ? <ActivityIndicator color={colors.surface} />
          : <>
              <Ionicons name="calculator-outline" size={18} color={colors.surface} />
              <Text style={s.calcBtnText}>Calcular valoración FCFF</Text>
            </>
        }
      </TouchableOpacity>

      {/* Resultado */}
      {result && (
        <>
          {/* Veredicto */}
          <View style={[s.verdictCard, { backgroundColor: vc.bg, borderColor: vc.border }]}>
            <View style={s.verdictTop}>
              <View style={{ flex: 1 }}>
                <Text style={[s.verdictLabel, { color: vc.text }]}>Valor intrínseco por acción</Text>
                <Text style={[s.verdictPrice, { color: vc.text }]}>${result.pricePerShare.toFixed(2)}</Text>
                <Text style={[s.verdictSub, { color: vc.text }]}>
                  {result.updown >= 0 ? '↑' : '↓'} {Math.abs(result.updown).toFixed(1)}% vs. precio actual
                  {inputs.price ? ` ($${parseFloat(inputs.price).toFixed(2)})` : ''}
                </Text>
              </View>
              <View style={[s.verdictBadge, { backgroundColor: vc.badge }]}>
                <Text style={[s.verdictBadgeText, { color: vc.badgeText }]}>
                  {result.verdict === 'buy' ? '✓ INFRAVALORADA' : result.verdict === 'sell' ? '✗ SOBREVALORADA' : '~ PRECIO JUSTO'}
                </Text>
              </View>
            </View>

            {/* Margen de seguridad */}
            <View style={[s.msBox, { borderTopColor: vc.border }]}>
              <View style={s.msRow}>
                <Text style={[s.msLabel, { color: vc.text }]}>Margen de seguridad</Text>
                <Text style={[s.msValue, { color: vc.text }]}>{margin}%</Text>
              </View>
              <View style={s.msChips}>
                {[0, 10, 20, 30, 40, 50].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[s.msChip, margin === v && { backgroundColor: vc.badge, borderColor: vc.border }]}
                    onPress={() => setMargin(v)}
                  >
                    <Text style={[s.msChipText, margin === v && { color: vc.badgeText, fontWeight: '700' }]}>{v}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.msTarget}>
                <Text style={[s.msTargetLabel, { color: vc.text }]}>Precio objetivo con margen:</Text>
                <Text style={[s.msTargetPrice, { color: vc.text }]}>${targetPrice.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Desglose */}
          <TouchableOpacity style={s.toggle} onPress={() => setExp(p => ({ ...p, result: !p.result }))} activeOpacity={0.7}>
            <View style={s.toggleLeft}><Text style={s.toggleIcon}>📊</Text><Text style={s.toggleTitle}>Desglose WACC y flujos</Text></View>
            <Ionicons name={exp.result ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkFaint} />
          </TouchableOpacity>
          {exp.result && (
            <View style={s.resultsCard}>
              <View style={s.waccChips}>
                {[
                  { l: 'rf',   v: `${parseFloat(inputs.rf).toFixed(1)}%` },
                  { l: 'β',    v: parseFloat(inputs.beta).toFixed(2) },
                  { l: 'ERP',  v: `${parseFloat(inputs.erp).toFixed(1)}%` },
                  { l: 'ke',   v: `${result.ke.toFixed(2)}%` },
                  { l: 'kd',   v: `${parseFloat(inputs.kd).toFixed(1)}%` },
                  { l: 'WACC', v: `${result.wacc.toFixed(2)}%` },
                ].map(({ l, v }) => (
                  <View key={l} style={[s.waccChip, l === 'WACC' && { backgroundColor: colors.accentWash }]}>
                    <Text style={s.waccChipLabel}>{l}</Text>
                    <Text style={[s.waccChipValue, l === 'WACC' && { color: colors.accent }]}>{v}</Text>
                  </View>
                ))}
              </View>
              <View style={s.divider} />
              <View style={s.tilesGrid}>
                <Tile label="WACC"      value={`${result.wacc.toFixed(2)}%`}              sub="Coste capital"  s={s} />
                <Tile label="ke (CAPM)" value={`${result.ke.toFixed(2)}%`}                sub="Rentab. equity"  s={s} />
                <Tile label="NOPAT"     value={`$${result.nopat.toFixed(1)}M`}            sub="EBIT×(1-t)"  s={s} />
                <Tile label="FCFF año0" value={`$${result.fcff0.toFixed(1)}M`}            sub="FCF base"  s={s} />
                <Tile label="EV total"  value={evFmt(result.ev)}                          sub="Valor empresa"  s={s} />
                <Tile label="Upside"
                  value={`${result.updown >= 0 ? '+' : ''}${result.updown.toFixed(1)}%`}
                  color={result.updown >= 0 ? colors.up : colors.down}
                  sub="vs. precio actual" s={s} />
              </View>
              <View style={s.divider} />
              <Text style={s.phaseTitle}>Composición del valor empresa</Text>
              <View style={s.phaseBar}>
                <View style={[s.phaseSeg, { flex: Math.max(1, 100 - result.tvPct), backgroundColor: colors.up }]} />
                <View style={[s.phaseSeg, { flex: Math.max(1, result.tvPct),        backgroundColor: colors.accent }]} />
              </View>
              <View style={s.phaseLegend}>
                {[
                  { color: colors.up, label: `FCF fase alta (${(100 - result.tvPct).toFixed(0)}%)` },
                  { color: colors.accent, label: `Valor terminal (${result.tvPct.toFixed(0)}%)` },
                ].map(({ color, label }) => (
                  <View key={label} style={s.phaseLegendItem}>
                    <View style={[s.phaseDot, { backgroundColor: color }]} />
                    <Text style={s.phaseLegendText}>{label}</Text>
                  </View>
                ))}
              </View>
              {result.tvPct > 75 && (
                <View style={s.warnBox}>
                  <Ionicons name="warning-outline" size={14} color={colors.caution} />
                  <Text style={s.warnText}>
                    Valor terminal = {result.tvPct.toFixed(0)}% del EV. Alta sensibilidad a WACC y g∞ — revisa la tabla.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Sensibilidad */}
          <TouchableOpacity style={s.toggle} onPress={() => setExp(p => ({ ...p, sens: !p.sens }))} activeOpacity={0.7}>
            <View style={s.toggleLeft}><Text style={s.toggleIcon}>🎯</Text><Text style={s.toggleTitle}>Tabla de sensibilidad</Text></View>
            <Ionicons name={exp.sens ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkFaint} />
          </TouchableOpacity>
          {exp.sens && (
            <View style={s.sensCard}>
              <Text style={s.sensSubtitle}>Precio intrínseco ($) · WACC ±2pp × g∞ ±1pp</Text>
              <View style={s.sensLegRow}>
                {[{ c: colors.up, l: 'Alcista' }, { c: colors.down, l: 'Sobrevalorado' },
                  { c: colors.caution, l: 'Justo' }, { c: colors.accent, l: 'Base' }].map(({ c, l }) => (
                  <View key={l} style={s.sensLegItem}>
                    <View style={[s.sensLegDot, { backgroundColor: c }]} />
                    <Text style={s.sensLegText}>{l}</Text>
                  </View>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.sensWrapper}>
                  <View style={s.sensRow}>
                    <View style={[s.sensHCell, s.sensCorner]}><Text style={s.sensHText}>WACC\g∞</Text></View>
                    {result.gtermCols.map((g, i) => (
                      <View key={i} style={s.sensHCell}><Text style={s.sensHText}>{g.toFixed(1)}%</Text></View>
                    ))}
                  </View>
                  {result.sensitivity.map((row, ri) => (
                    <View key={ri} style={s.sensRow}>
                      <View style={s.sensRH}><Text style={s.sensRHText}>{result.waccRows[ri].toFixed(1)}%</Text></View>
                      {row.map((cell, ci) => (
                        <View key={ci} style={[
                          s.sensCell,
                          cell.signal === 'invalid' && s.sensInvalid,
                          cell.signal === 'buy'  && !cell.isBase && s.sensBuy,
                          cell.signal === 'sell' && !cell.isBase && s.sensSell,
                          cell.signal === 'hold' && !cell.isBase && s.sensHold,
                          cell.isBase && s.sensBase,
                        ]}>
                          <Text style={[
                            s.sensCellText,
                            cell.signal === 'buy'     && { color: colors.up },
                            cell.signal === 'sell'    && { color: colors.down },
                            cell.signal === 'hold'    && { color: colors.caution },
                            cell.signal === 'invalid' && { color: colors.inkFaint },
                            cell.isBase && s.sensCellBase,
                          ]}>
                            {cell.signal === 'invalid' ? '—' : `$${cell.price.toFixed(0)}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </>
      )}

      <Text style={s.disclaimer}>
        ⚠️ Modelo orientativo. No constituye asesoramiento financiero. FCFF/WACC estándar CFA Institute.
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
/**
 * Estilos de la tarjeta de valoración FCFF. Reciben la paleta activa: antes
 * eran 103 literales fijos y la tarjeta se quedaba blanca sobre el chasis.
 */
type Styles = ReturnType<typeof makeStyles>;

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container:    { marginHorizontal: 16, marginBottom: 24 },
    header:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    headerIcon:   { fontSize: 22 },
    headerTitle:  { fontSize: 20, fontWeight: 'bold', color: c.ink },
    headerSub:    { fontSize: 12, color: c.inkMuted, marginTop: 1 },
    methodNote:   { fontSize: 12, color: c.inkMuted, lineHeight: 17, marginBottom: 10, fontStyle: 'italic' },

    reloadBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: c.accentWash, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.accentWash,
    },

    banner: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      backgroundColor: c.surfaceSunken, borderRadius: 10,
      borderWidth: 1, borderColor: c.rule,
      padding: 10, marginBottom: 12,
    },
    bannerText: { fontSize: 12, color: c.inkMuted, flex: 1, lineHeight: 16 },

    autoTag: {
      backgroundColor: c.accentWash, borderRadius: 4,
      paddingHorizontal: 4, paddingVertical: 1,
    },
    autoTagText: { fontSize: 9, color: c.accent, fontWeight: '700' },

    autoCountBadge: {
      backgroundColor: c.accentWash, borderRadius: 10,
      paddingHorizontal: 7, paddingVertical: 2,
    },
    autoCountText: { fontSize: 10, color: c.accent, fontWeight: '600' },

    toggle: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: c.surface, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      marginBottom: 2, borderWidth: 1, borderColor: c.rule,
    },
    toggleLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
    toggleIcon:  { fontSize: 16 },
    toggleTitle: { fontSize: 15, fontWeight: '600', color: c.ink },

    inputsCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      marginBottom: 8, borderWidth: 1, borderColor: c.rule, gap: 10,
    },
    inputRow:     { flexDirection: 'row', gap: 10 },
    inputField:   { flex: 1, gap: 4 },
    inputLabel:   { fontSize: 11, color: c.inkMuted, fontWeight: '500' },
    inputWrapper: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surfaceSunken, borderRadius: 8,
      borderWidth: 1, borderColor: c.rule, paddingHorizontal: 10, height: 38,
    },
    inputWrapperAuto: {
      backgroundColor: c.accentWash,
      borderColor: c.accentWash,
    },
    input:        { flex: 1, fontSize: 14, color: c.ink, padding: 0 },
    inputSuffix:  { fontSize: 13, color: c.inkFaint, marginLeft: 4 },
    helpBox:      { backgroundColor: c.accentWash, borderRadius: 8, padding: 10, marginTop: 2 },
    helpText:     { fontSize: 11, color: c.accent, lineHeight: 16 },

    waccFormulaRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      backgroundColor: c.accentWash, borderRadius: 8, padding: 10, marginBottom: 4,
    },
    waccFormula:    { fontSize: 12, color: c.accent, fontWeight: '600', fontStyle: 'italic' },
    waccFormulaSub: { fontSize: 11, color: c.accent, fontStyle: 'italic' },

    calcBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.accent, borderRadius: 12,
      paddingVertical: 14, gap: 8, marginVertical: 10,
    },
    calcBtnText: { color: c.surface, fontSize: 15, fontWeight: '600' },

    verdictCard: { borderRadius: 16, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
    verdictTop: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'flex-start', padding: 16,
    },
    verdictLabel:     { fontSize: 12, fontWeight: '500', marginBottom: 4 },
    verdictPrice:     { fontSize: 34, fontWeight: 'bold', letterSpacing: -0.5 },
    verdictSub:       { fontSize: 12, marginTop: 4, opacity: 0.8 },
    verdictBadge:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    verdictBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

    msBox:        { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    msRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    msLabel:      { fontSize: 12, fontWeight: '500' },
    msValue:      { fontSize: 14, fontWeight: '700' },
    msChips:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    msChip: {
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: 'rgba(255,255,255,0.5)',
    },
    msChipText:    { fontSize: 12, fontWeight: '500', color: c.inkMuted },
    msTarget:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    msTargetLabel: { fontSize: 12, opacity: 0.8 },
    msTargetPrice: { fontSize: 18, fontWeight: '700' },

    resultsCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 16,
      marginBottom: 8, borderWidth: 1, borderColor: c.rule,
    },
    waccChips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    waccChip: {
      backgroundColor: c.surfaceSunken, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 5,
      flexDirection: 'row', gap: 4, alignItems: 'center',
    },
    waccChipLabel: { fontSize: 11, color: c.inkFaint, fontWeight: '500' },
    waccChipValue: { fontSize: 12, color: c.ink, fontWeight: '600' },
    divider:       { height: 1, backgroundColor: c.rule, marginVertical: 12 },
    tilesGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tile: {
      width: '30%', flexGrow: 1, backgroundColor: c.surfaceSunken,
      borderRadius: 10, padding: 10, alignItems: 'center',
    },
    tileLabel:  { fontSize: 10, color: c.inkFaint, marginBottom: 4, textAlign: 'center' },
    tileValue:  { fontSize: 15, fontWeight: '700', color: c.ink },
    tileSub:    { fontSize: 10, color: c.inkFaint, marginTop: 2, textAlign: 'center' },
    phaseTitle: { fontSize: 12, color: c.inkMuted, fontWeight: '500', marginBottom: 8 },
    phaseBar: {
      height: 10, borderRadius: 5, overflow: 'hidden',
      flexDirection: 'row', backgroundColor: c.rule, marginBottom: 6,
    },
    phaseSeg:      { height: '100%' },
    phaseLegend:   { flexDirection: 'row', gap: 16, marginBottom: 4 },
    phaseLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    phaseDot:      { width: 8, height: 8, borderRadius: 2 },
    phaseLegendText: { fontSize: 11, color: c.inkMuted },
    warnBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6,
      backgroundColor: c.cautionWash, borderRadius: 8, padding: 10,
      marginTop: 12, borderWidth: 1, borderColor: c.cautionWash,
    },
    warnText: { fontSize: 11, color: c.caution, flex: 1, lineHeight: 16 },

    sensCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      marginBottom: 8, borderWidth: 1, borderColor: c.rule,
    },
    sensSubtitle: { fontSize: 11, color: c.inkMuted, marginBottom: 8 },
    sensLegRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    sensLegItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sensLegDot:   { width: 8, height: 8, borderRadius: 2 },
    sensLegText:  { fontSize: 10, color: c.inkMuted },
    sensWrapper:  { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: c.rule },
    sensRow:      { flexDirection: 'row' },
    sensHCell: {
      width: 56, backgroundColor: c.surfaceSunken, paddingVertical: 7, paddingHorizontal: 3,
      borderBottomWidth: 1, borderRightWidth: 1, borderColor: c.rule,
      alignItems: 'center', justifyContent: 'center',
    },
    sensCorner:   { width: 50 },
    sensHText:    { fontSize: 10, color: c.inkMuted, fontWeight: '600', textAlign: 'center' },
    sensRH: {
      width: 50, backgroundColor: c.surfaceSunken, paddingVertical: 8, paddingHorizontal: 3,
      alignItems: 'center', justifyContent: 'center',
      borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.rule,
    },
    sensRHText:    { fontSize: 10, fontWeight: '600', color: c.inkMuted, textAlign: 'center' },
    sensCell: {
      width: 56, paddingVertical: 8, paddingHorizontal: 3,
      alignItems: 'center', justifyContent: 'center',
      borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.rule,
    },
    sensCellText:  { fontSize: 10, fontWeight: '500', textAlign: 'center' },
    sensCellBase:  { fontWeight: '800', fontSize: 11 },
    sensBuy:       { backgroundColor: c.upWash },
    sensSell:      { backgroundColor: c.downWash },
    sensHold:      { backgroundColor: c.cautionWash },
    sensBase:      { backgroundColor: c.accentWash, borderWidth: 2, borderColor: c.accent },
    sensInvalid:   { backgroundColor: c.surfaceSunken },

    disclaimer: {
      fontSize: 10, color: c.inkFaint, lineHeight: 15,
      textAlign: 'center', marginTop: 8, paddingHorizontal: 4,
    },
  });
}
