/**
 * Estilos de la pantalla de resultados.
 *
 * Antes vivían en un `StyleSheet.create` de módulo con 289 literales de color
 * de la piel iOS anterior, así que la pantalla no tenía modo oscuro real: los
 * blancos seguían siendo blancos. Ahora es una fábrica que recibe la paleta,
 * y el módulo no conoce ni un solo color.
 *
 * Reglas del mundo aplicadas aquí: esquinas contenidas (8 en placa, 5 en
 * control, 3 en chip), reglas de un pelo en toda separación, y cara mono
 * tabular en todo lo que sea una medida.
 */

import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../../contexts/ThemeContext';
import { numeric, radius, space, type } from '../../theme/tokens';

const HAIR = StyleSheet.hairlineWidth;

export function makeResultsStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.canvas },
    scrollContent: { paddingBottom: space.h2, maxWidth: 1440, width: '100%', alignSelf: 'center' },

    /* ── Dos columnas en escritorio ──
       La responsividad es estructural: cambia la composición, no el cuerpo de
       letra. Por debajo del corte, `columnFull` deja las secciones tal cual. */
    columnsRow: { flexDirection: 'row', alignItems: 'flex-start' },
    columnsStack: { flexDirection: 'column' },
    /** Evidencia del veredicto: necesita el ancho, las tablas son anchas. */
    columnMain: { flex: 1.25, minWidth: 0 },
    /** Contexto de mercado. */
    columnSide: { flex: 1, minWidth: 0 },
    columnFull: { width: '100%' },

    header: {
      padding: space.lg,
      backgroundColor: c.chrome,
      borderBottomWidth: HAIR,
      borderBottomColor: c.rule,
    },
    backButton: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    backButtonText: { ...type.label, color: c.accent, fontWeight: '600' },

    companySection: {
      padding: space.xl,
      backgroundColor: c.surface,
      borderBottomWidth: HAIR,
      borderBottomColor: c.rule,
    },
    companyTicker: { ...type.title1, ...numeric, color: c.ink },
    companyName: { ...type.body, color: c.inkMuted, marginBottom: space.sm },
    metadataRow: { flexDirection: 'row', flexWrap: 'wrap' },
    metadataText: { ...type.caption, color: c.inkFaint },

    /* ── Secciones ── */
    sectionTitle: { ...type.title3, color: c.ink, marginBottom: space.md },

    /* ── Indicadores clave (flags) ── */
    flagsSection: { margin: space.lg },
    flagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    flagItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      minHeight: 44,
      borderRadius: radius.xs,
      gap: space.xs,
      borderWidth: HAIR,
      borderColor: c.rule,
    },
    /** Marca de índice: el veredicto de cada flag no viaja sólo en el color. */
    flagMark: { width: 3, height: 18 },
    flagLabel: { ...type.caption, color: c.ink, fontWeight: '600' },

    /* ── Categorías de ratios ── */
    ratiosSection: { margin: space.lg },
    categoryCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      marginBottom: space.md,
      overflow: 'hidden',
    },
    categoryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: space.lg,
      minHeight: 52,
    },
    categoryTitle: { ...type.title3, color: c.ink, flex: 1 },
    categoryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    categoryCount: { ...type.caption, ...numeric, color: c.inkMuted, fontWeight: '600' },
    metricsContainer: { borderTopWidth: HAIR, borderTopColor: c.rule },
    metricItem: { padding: space.lg, borderBottomWidth: HAIR, borderBottomColor: c.rule },

    /* ── Tabla de ratios: columnas fijas para poder barrer con la mirada ── */
    ratioTableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingTop: space.md,
      paddingBottom: space.sm,
      backgroundColor: c.surfaceSunken,
    },
    ratioHeadText: { ...type.legend, color: c.inkFaint },
    ratioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
      minHeight: 48,
    },
    ratioColName: { flex: 1, minWidth: 0 },
    ratioColValue: { width: 92, textAlign: 'right' },
    ratioColThreshold: { width: 88, textAlign: 'right' },
    ratioColState: { width: 96, textAlign: 'right' },
    ratioCellNum: { ...type.label, ...numeric, fontWeight: '600' },
    ratioStateCell: {
      width: 96,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 3,
    },
    ratioStateText: { ...type.legend, fontWeight: '700', letterSpacing: 0.3 },
    metricHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: space.sm,
      gap: space.md,
    },
    metricNameContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: space.sm },
    metricName: { ...type.label, color: c.ink, flex: 1 },
    metricValue: { ...type.bodyStrong, ...numeric },
    metricThreshold: { ...type.caption, ...numeric, color: c.inkFaint, marginBottom: 2 },
    metricInterpretation: { ...type.caption, color: c.inkMuted },

    /* ── TradingView ── */
    tradingViewSection: { marginHorizontal: space.lg, marginBottom: space.lg },
    tradingViewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.sm,
    },
    tvThemeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.md,
      minHeight: 40,
      borderRadius: radius.xs,
      borderWidth: HAIR,
      gap: space.xs,
    },
    tvThemeBtnText: { ...type.caption, fontWeight: '600' },
    tradingViewContainer: {
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      overflow: 'hidden',
      height: 500,
    },

    /* ── Gráfico de precio ── */
    chartSection: {
      marginHorizontal: space.lg,
      marginBottom: space.lg,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.lg,
      minHeight: 580,
    },
    priceContainer: { alignItems: 'center', marginBottom: space.lg },
    currentPrice: { ...type.display, ...numeric, color: c.ink, marginBottom: space.sm },
    priceChangeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
      borderRadius: radius.xs,
      borderWidth: HAIR,
      gap: space.xxs,
    },
    priceChangeText: { ...type.caption, ...numeric, fontWeight: '700' },
    chartLoadingContainer: { height: 220, justifyContent: 'center', alignItems: 'center' },
    chartLoadingText: { ...type.caption, color: c.inkMuted, marginTop: space.md },
    chartContainer: { marginTop: space.sm, height: 500, justifyContent: 'center' },
    chartLegend: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: space.lg,
      gap: space.xxl,
    },
    chartErrorContainer: { height: 220, justifyContent: 'center', alignItems: 'center' },
    chartErrorText: { ...type.caption, color: c.inkFaint, marginTop: space.md },

    aiFab: {
      position: 'absolute',
      right: space.xl,
      bottom: space.h1,
      width: 56,
      height: 56,
      borderRadius: radius.md,
      backgroundColor: c.accent,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 4,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 5,
      shadowOpacity: 1,
    },

    /* ── Riesgo accionarial ── */
    riskContainer: {
      marginTop: space.lg,
      borderRadius: radius.sm,
      borderWidth: HAIR,
      padding: space.md,
      gap: space.sm,
    },
    riskHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    riskTitle: { ...type.labelStrong },
    riskDescription: { ...type.caption, color: c.inkMuted, lineHeight: 18 },
    riskIndicators: {
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.xs,
      paddingHorizontal: space.md,
      paddingVertical: space.xxs,
    },
    riskIndicatorRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: space.sm,
      borderBottomWidth: HAIR,
      borderBottomColor: c.rule,
    },
    riskIndicatorLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    riskDot: { width: 3, height: 14 },
    riskIndicatorLabel: { ...type.caption, color: c.inkMuted, fontWeight: '600' },
    riskIndicatorRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    riskIndicatorValue: { ...type.label, ...numeric, fontWeight: '700' },
    riskIndicatorTag: { ...type.legend, color: c.inkFaint, minWidth: 60, textAlign: 'right', letterSpacing: 0 },
    riskDisclaimer: { ...type.legend, color: c.inkFaint, letterSpacing: 0, marginTop: 2 },

    /* ── Análisis técnico ── */
    technicalSection: { margin: space.lg },
    technicalLoadingContainer: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.h2,
      alignItems: 'center',
    },
    technicalLoadingText: { ...type.caption, color: c.inkMuted, marginTop: space.md },
    technicalErrorContainer: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.h2,
      alignItems: 'center',
    },
    technicalErrorText: { ...type.caption, color: c.inkFaint, marginTop: space.md },
    technicalSummaryCard: {
      borderRadius: radius.md,
      borderWidth: HAIR,
      padding: space.lg,
      marginBottom: space.md,
    },
    technicalSummaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    technicalSummaryItem: { alignItems: 'center', flex: 1 },
    technicalSummaryLabel: { ...type.legend, color: c.inkFaint, marginBottom: space.xxs },
    technicalSummaryValue: { ...type.title1, ...numeric },
    technicalSummaryDivider: { width: HAIR, height: 40, backgroundColor: c.rule },
    technicalSignalBadge: {
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
      borderRadius: radius.xs,
      borderWidth: HAIR,
    },
    technicalSignalText: { ...type.caption, fontWeight: '700', letterSpacing: 0.5 },
    trendIndicator: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
    trendText: { ...type.caption, fontWeight: '600' },
    crossAlert: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginTop: space.md,
      padding: space.sm,
      borderRadius: radius.xs,
      borderWidth: HAIR,
    },
    crossAlertText: { ...type.caption, fontWeight: '500', flex: 1 },
    technicalCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      marginBottom: space.md,
      overflow: 'hidden',
    },
    technicalCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: space.lg,
      minHeight: 52,
    },
    technicalCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    technicalCardTitle: { ...type.title3, color: c.ink },
    technicalCardContent: { borderTopWidth: HAIR, borderTopColor: c.rule, padding: space.lg },

    fibonacciInfo: {
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.xs,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.md,
      marginBottom: space.md,
    },
    fibonacciInfoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: space.xxs,
    },
    fibonacciInfoLabel: { ...type.caption, color: c.inkMuted },
    fibonacciInfoValue: { ...type.label, ...numeric, color: c.ink, fontWeight: '600' },

    /* Caja de interpretación: la marca de índice va como elemento, no como
       borde lateral grueso — ese es el tell que el suelo de calidad prohíbe. */
    interpretationBox: {
      flexDirection: 'row',
      gap: space.md,
      backgroundColor: c.accentWash,
      borderRadius: radius.xs,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.md,
      marginBottom: space.md,
    },
    interpretationMark: { width: 3, alignSelf: 'stretch', backgroundColor: c.accent },
    interpretationText: { ...type.caption, color: c.ink, lineHeight: 18, flex: 1 },

    levelsTable: {
      borderRadius: radius.xs,
      overflow: 'hidden',
      borderWidth: HAIR,
      borderColor: c.rule,
    },
    levelsTableHeader: {
      flexDirection: 'row',
      backgroundColor: c.surfaceSunken,
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
    },
    levelsTableHeaderText: { ...type.legend, color: c.inkFaint },
    levelsTableRow: {
      flexDirection: 'row',
      paddingVertical: space.sm,
      paddingHorizontal: space.md,
      borderBottomWidth: HAIR,
      borderBottomColor: c.rule,
    },
    levelsTableRowHighlight: { backgroundColor: c.accentWash },
    levelsTableCell: { ...type.caption, ...numeric, color: c.ink },

    maSignalBadge: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    maSignalText: { ...type.label, fontWeight: '700' },
    maCardsContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
    maCard: {
      flex: 1,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.xs,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.md,
    },
    maCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: space.sm,
    },
    maCardTitle: { ...type.label, ...numeric, color: c.ink, fontWeight: '700' },
    maCardSignal: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: space.xs,
      paddingVertical: 2,
      borderRadius: radius.xs,
    },
    maCardSignalText: { ...type.legend, fontWeight: '700', letterSpacing: 0.4 },
    maCardValue: { ...type.title3, ...numeric, color: c.ink, marginBottom: space.xxs },
    maCardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    maCardPosition: { ...type.legend, color: c.inkFaint, letterSpacing: 0 },
    maCardDistance: { ...type.legend, ...numeric, fontWeight: '700', letterSpacing: 0 },

    camarillaContainer: { marginTop: space.xxs },
    camarillaGroupTitle: {
      ...type.legend,
      color: c.inkFaint,
      marginTop: space.sm,
      marginBottom: space.sm,
      paddingLeft: space.xxs,
    },
    camarillaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: space.sm,
      paddingHorizontal: space.sm,
      borderBottomWidth: HAIR,
      borderBottomColor: c.rule,
      gap: space.md,
    },
    camarillaRowImportant: {
      backgroundColor: c.downWash,
      borderRadius: radius.xs,
      borderBottomWidth: 0,
      marginBottom: space.xxs,
    },
    camarillaRowImportantSupport: {
      backgroundColor: c.upWash,
      borderRadius: radius.xs,
      borderBottomWidth: 0,
      marginBottom: space.xxs,
    },
    camarillaLevelBadge: { width: 36, alignItems: 'center' },
    camarillaLevelText: { ...type.label, ...numeric, fontWeight: '700' },
    camarillaPrice: { ...type.label, ...numeric, color: c.ink, fontWeight: '600', width: 80 },
    camarillaSignificance: { flex: 1, ...type.legend, color: c.inkMuted, letterSpacing: 0 },

    pivotPointContainer: { marginVertical: space.md },
    pivotPointRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.accentWash,
      borderRadius: radius.xs,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.md,
      gap: space.md,
    },
    pivotPointBadge: {
      backgroundColor: c.accent,
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
      borderRadius: radius.xs,
    },
    pivotPointText: { ...type.caption, color: c.inkOnAccent, fontWeight: '700', letterSpacing: 0.5 },
    pivotPointPrice: { ...type.title3, ...numeric, color: c.ink },
    pivotPointLabel: { flex: 1, ...type.legend, color: c.inkMuted, letterSpacing: 0 },

    keyLevelsCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.lg,
    },
    keyLevelsTitle: { ...type.title3, color: c.ink, marginBottom: space.md },
    keyLevelsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    keyLevelItem: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.xs,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.md,
    },
    keyLevelLabel: { ...type.legend, color: c.inkFaint, marginBottom: space.xxs },
    keyLevelValue: { ...type.title3, ...numeric, color: c.ink },

    /* ── Noticias ── */
    newsSection: { margin: space.lg },
    newsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: space.md,
      gap: space.sm,
    },
    newsLoadingContainer: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.h1,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
    },
    newsLoadingText: { ...type.caption, color: c.inkMuted, marginLeft: space.sm },
    noNewsContainer: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.h1,
      alignItems: 'center',
    },
    noNewsText: { ...type.caption, color: c.inkFaint, marginTop: space.sm },
    newsCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      marginBottom: space.sm,
      padding: space.md,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
    },
    newsCardContent: { flex: 1, flexDirection: 'row' },
    newsThumbnail: {
      width: 60,
      height: 60,
      borderRadius: radius.xs,
      marginRight: space.sm,
      backgroundColor: c.surfaceSunken,
    },
    newsTextContainer: { flex: 1, justifyContent: 'center' },
    newsTextContainerFull: { paddingRight: space.sm },
    newsTitle: { ...type.caption, color: c.ink, fontWeight: '700', lineHeight: 17, marginBottom: space.xxs },
    newsSummary: { ...type.legend, color: c.inkMuted, fontWeight: '400', letterSpacing: 0, lineHeight: 15, marginBottom: space.xxs },
    newsMetaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    newsPublisher: { ...type.legend, color: c.inkMuted, letterSpacing: 0 },
    newsDate: { ...type.legend, color: c.inkFaint, letterSpacing: 0 },
    newsChevron: { marginLeft: space.sm },

    /* ── Bloque del veredicto ── */
    verdictWord: { ...type.display, fontSize: 28, letterSpacing: 0.4 },
    verdictRisk: { ...type.caption, color: c.inkMuted },
    tallyRow: {
      flexDirection: 'row',
      borderWidth: HAIR,
      borderColor: c.rule,
      borderRadius: radius.sm,
      backgroundColor: c.surfaceSunken,
      overflow: 'hidden',
    },
    tallyCell: { flex: 1, alignItems: 'center', paddingVertical: space.sm, gap: 1 },
    tallyNum: { ...type.title2, ...numeric },
    tallyLabel: { ...type.legend, color: c.inkFaint, letterSpacing: 0.4 },

    bandLegendRow: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
    bandLegendCell: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    bandLegendText: { ...type.legend, ...numeric, letterSpacing: 0 },
    bandLegendVerdict: { ...type.legend, color: c.inkFaint, letterSpacing: 0.4 },

    pctPill: {
      minWidth: 50,
      alignItems: 'center',
      paddingVertical: 2,
      borderRadius: radius.xs,
      borderWidth: HAIR,
    },
    pctPillText: { ...type.legend, ...numeric, letterSpacing: 0 },

    categoryFootnote: { ...type.caption, color: c.inkFaint, paddingTop: space.md },

    /* ── Lectura rápida: fila de paneles que se apila sola en móvil ── */
    quickReadRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.md,
      marginHorizontal: space.lg,
      marginBottom: space.lg,
    },

    /* ── Métricas clave ── */
    keyMetricsSection: { margin: space.lg },
    keyMetricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.md,
      gap: space.sm,
    },
    keyMetricItem: {
      width: '30%',
      alignItems: 'flex-start',
      padding: space.md,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.xs,
      borderWidth: HAIR,
      borderColor: c.rule,
    },
    keyMetricLabel: { ...type.legend, color: c.inkFaint, marginBottom: space.xxs },
    keyMetricValue: { ...type.title3, ...numeric, color: c.ink },

    /* ── Perfil ── */
    profileSection: { margin: space.lg },
    profileCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.lg,
    },
    profileInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: space.sm,
      gap: space.sm,
    },
    profileInfoLabel: { ...type.caption, color: c.inkFaint, width: 78 },
    profileInfoValue: { ...type.label, color: c.ink, flex: 1 },
    profileSummary: {
      ...type.caption,
      color: c.inkMuted,
      lineHeight: 20,
      marginTop: space.sm,
      paddingTop: space.sm,
      borderTopWidth: HAIR,
      borderTopColor: c.rule,
    },

    /* ── Analistas ── */
    analystsSection: { margin: space.lg },
    analystsCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.lg,
    },
    analystsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
    analystBox: {
      flex: 1,
      alignItems: 'center',
      padding: space.sm,
      borderRadius: radius.xs,
      borderWidth: HAIR,
    },
    analystCount: { ...type.title2, ...numeric },
    analystLabel: { ...type.legend, color: c.inkFaint, marginTop: 2, textAlign: 'center', letterSpacing: 0.4 },

    /* ── Accionariado ── */
    holdersSection: { margin: space.lg },
    holdersCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.lg,
    },
    holdersBarContainer: {
      flexDirection: 'row',
      height: 18,
      borderRadius: radius.none,
      borderWidth: HAIR,
      borderColor: c.ruleStrong,
      overflow: 'hidden',
      marginBottom: space.lg,
    },
    holdersBar: { height: '100%' },
    holdersLegend: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: space.sm },
    holderLegendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
    holderDot: { width: 3, height: 12 },
    holderLabel: { ...type.caption, color: c.inkMuted },
    holderPercent: { ...type.caption, ...numeric, color: c.ink, fontWeight: '700' },

    /* ── Institucionales ── */
    institutionalSection: { margin: space.lg },
    institutionalCard: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: HAIR,
      borderColor: c.rule,
      padding: space.lg,
    },
    institutionalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: space.sm,
      borderBottomWidth: HAIR,
      borderBottomColor: c.rule,
    },
    institutionalRank: {
      width: 26,
      height: 26,
      borderRadius: radius.xs,
      backgroundColor: c.surfaceSunken,
      borderWidth: HAIR,
      borderColor: c.rule,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space.md,
    },
    institutionalRankText: { ...type.legend, ...numeric, color: c.inkMuted, letterSpacing: 0 },
    institutionalInfo: { flex: 1 },
    institutionalName: { ...type.label, color: c.ink, fontWeight: '600' },
    institutionalShares: { ...type.legend, ...numeric, color: c.inkFaint, letterSpacing: 0 },
    institutionalPercent: { ...type.title3, ...numeric, color: c.ink },
  });
}

export type ResultsStyles = ReturnType<typeof makeResultsStyles>;
