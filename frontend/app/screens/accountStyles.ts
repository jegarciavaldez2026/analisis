/**
 * Estilos de la pantalla Mi Cuenta.
 *
 * Antes eran un `StyleSheet.create` de módulo con 214 literales de color de la
 * piel iOS anterior, así que la pantalla no cambiaba con la apariencia de la
 * app. Ahora recibe la paleta y el módulo no conoce ni un solo color.
 */

import { Platform, StyleSheet } from 'react-native';

import type { ThemeColors } from '../../contexts/ThemeContext';

export function makeAccountStyles(c: ThemeColors) {
  return StyleSheet.create({
    /** Capa de los diálogos. Faltaba, y tres sitios la referenciaban: eran
     *  tres de los ocho errores de tipos que arrastraba el proyecto. */
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    container: {
      flex: 1,
      backgroundColor: c.canvas,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 16,
      marginBottom: 8,
      paddingVertical: 10,
      borderRadius: 5,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    logoutButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    /* El selector interno de Favoritos/Portafolio se retiró: ahora son dos
       secciones del menú, así que `tabSelector`, `tab`, `activeTab`, `tabText`
       y `activeTabText` ya no tienen a quién vestir. */
    alertsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.caution,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingVertical: 10,
      borderRadius: 5,
      gap: 8,
    },
    alertsButtonText: {
      color: c.inkOnAccent,
      fontWeight: '600',
      fontSize: 14,
    },
    historyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentWash,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingVertical: 10,
      borderRadius: 5,
      gap: 8,
    },
    historyButtonText: {
      color: c.accent,
      fontWeight: '600',
      fontSize: 14,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingTop: 8,
      paddingBottom: 100,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: c.ink,
      marginTop: 16,
    },
    emptySubtitle: {
      fontSize: 14,
      color: c.inkMuted,
      marginTop: 8,
      textAlign: 'center',
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    tickerContainer: {
      flex: 1,
    },
    ticker: {
      fontSize: 18,
      fontWeight: 'bold',
      color: c.accent,
    },
    companyName: {
      fontSize: 13,
      color: c.inkMuted,
      marginTop: 2,
      maxWidth: 180,
    },
    watchlistPriceActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    priceContainer: {
      alignItems: 'flex-end',
    },
    currentPrice: {
      fontSize: 20,
      fontWeight: 'bold',
      color: c.ink,
    },
    deleteButtonSmall: {
      padding: 8,
      backgroundColor: c.downWash,
      borderRadius: 5,
    },
    targetsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 12,
      gap: 8,
    },
    targetBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      gap: 4,
    },
    buyBadge: {
      backgroundColor: c.upWash,
    },
    sellBadge: {
      backgroundColor: c.downWash,
    },
    notifyBadge: {
      backgroundColor: c.cautionWash,
    },
    targetText: {
      fontSize: 12,
      fontWeight: '600',
    },
    notes: {
      fontSize: 12,
      color: c.inkFaint,
      marginTop: 10,
      fontStyle: 'italic',
    },
    plBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 5,
      marginTop: 4,
      gap: 4,
    },
    plText: {
      fontSize: 12,
      fontWeight: '600',
    },
    holdingDetails: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    detailLabel: {
      fontSize: 13,
      color: c.inkMuted,
    },
    detailValue: {
      fontSize: 13,
      fontWeight: '600',
      color: c.ink,
    },
    viewTransactionsHint: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
      gap: 6,
    },
    viewTransactionsText: {
      fontSize: 13,
      color: c.accent,
      fontWeight: '500',
    },
    sectorBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 5,
    },
    sectorText: {
      fontSize: 10,
      fontWeight: '600',
    },
    summaryCard: {
      backgroundColor: c.surface,
      borderRadius: 8,
      padding: 20,
      marginBottom: 16,
    },
    summaryTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: c.ink,
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    summaryItem: {
      flex: 1,
    },
    summaryLabel: {
      fontSize: 12,
      color: c.inkMuted,
      marginBottom: 4,
    },
    summaryValue: {
      fontSize: 20,
      fontWeight: 'bold',
      color: c.ink,
    },
    totalPLContainer: {
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
    },
    totalPLLabel: {
      fontSize: 12,
      color: c.inkMuted,
      marginBottom: 4,
    },
    totalPLValue: {
      fontSize: 24,
      fontWeight: 'bold',
    },
    metricsCard: {
      backgroundColor: c.surface,
      borderRadius: 8,
      padding: 20,
      marginBottom: 16,
    },
    metricsTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: c.ink,
      marginBottom: 16,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    metricItem: {
      width: '50%',
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    metricLabel: {
      fontSize: 12,
      color: c.inkMuted,
      marginBottom: 4,
    },
    metricValue: {
      fontSize: 22,
      fontWeight: 'bold',
    },
    metricHint: {
      fontSize: 10,
      color: c.inkFaint,
      marginTop: 2,
    },
    pieChartCard: {
      backgroundColor: c.surface,
      borderRadius: 8,
      padding: 20,
      marginBottom: 16,
    },
    pieChartContainer: {
      alignItems: 'center',
      marginVertical: 16,
    },
    pieChartCenter: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    pieChartCenterText: {
      fontSize: 24,
      fontWeight: 'bold',
    },
    pieChartCenterLabel: {
      fontSize: 11,
    },
    pieLegend: {
      marginTop: 12,
    },
    pieLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.rule,
    },
    pieLegendDot: {
      width: 12,
      height: 12,
      borderRadius: 3,
      marginRight: 10,
    },
    pieLegendText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
    },
    pieLegendValue: {
      fontSize: 14,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: c.ink,
      marginBottom: 12,
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.accent,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 4,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
      maxHeight: '90%',
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.rule,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: c.ink,
    },
    modalScroll: {
      padding: 20,
      maxHeight: 450,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.ink,
      marginBottom: 8,
      marginTop: 12,
    },
    input: {
      backgroundColor: c.surfaceSunken,
      borderRadius: 5,
      padding: 14,
      fontSize: 16,
      color: c.ink,
    },
    textArea: {
      height: 80,
      textAlignVertical: 'top',
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 16,
    },
    submitButton: {
      backgroundColor: c.accent,
      marginHorizontal: 20,
      marginTop: 20,
      paddingVertical: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: c.inkOnAccent,
      fontSize: 16,
      fontWeight: '600',
    },
    txTypeSelector: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 8,
    },
    txTypeButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: c.rule,
      gap: 8,
    },
    txTypeBuy: {
      backgroundColor: c.up,
      borderColor: c.up,
    },
    txTypeSell: {
      backgroundColor: c.down,
      borderColor: c.down,
    },
    txTypeText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.ink,
    },
    txTypeTextActive: {
      color: c.inkOnAccent,
    },
    totalContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.surfaceSunken,
      padding: 16,
      borderRadius: 8,
      marginTop: 16,
    },
    totalLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: c.inkMuted,
    },
    totalValue: {
      fontSize: 24,
      fontWeight: 'bold',
      color: c.ink,
    },
    transactionCard: {
      backgroundColor: c.surfaceSunken,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
    },
    transactionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    transactionInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    txTypeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 5,
      gap: 4,
    },
    txTypeBadgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    transactionTicker: {
      fontSize: 16,
      fontWeight: 'bold',
      color: c.accent,
    },
    deleteTransactionBtn: {
      padding: 8,
      backgroundColor: c.downWash,
      borderRadius: 5,
    },
    transactionDetails: {
      gap: 6,
    },
    transactionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    transactionLabel: {
      fontSize: 13,
      color: c.inkMuted,
    },
    transactionValue: {
      fontSize: 13,
      fontWeight: '500',
      color: c.ink,
    },
    transactionTotal: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
    transactionTotalLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.ink,
    },
    transactionTotalValue: {
      fontSize: 16,
      fontWeight: 'bold',
      color: c.ink,
    },
    transactionNotes: {
      fontSize: 12,
      color: c.inkFaint,
      fontStyle: 'italic',
      marginTop: 10,
    },
    emptyTransactions: {
      padding: 40,
      alignItems: 'center',
    },
    emptyTransactionsText: {
      fontSize: 14,
      color: c.inkFaint,
    },
    alertCard: {
      backgroundColor: c.surfaceSunken,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
    },
    alertHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    alertTicker: {
      fontSize: 18,
      fontWeight: 'bold',
      color: c.accent,
    },
    alertPrice: {
      fontSize: 18,
      fontWeight: 'bold',
      color: c.ink,
    },
    alertCompany: {
      fontSize: 13,
      color: c.inkMuted,
      marginBottom: 12,
    },
    alertMessage: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 5,
      marginTop: 8,
      gap: 10,
    },
    alertMessageText: {
      flex: 1,
      fontSize: 13,
      color: c.ink,
    },
    // New styles for hide toggle, cash, and evolution
    summaryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    hideToggle: {
      padding: 8,
      borderRadius: 5,
    },
    cashCard: {
      borderRadius: 8,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
    },
    cashHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    addCashButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cashSummary: {
      gap: 8,
    },
    cashItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
    },
    cashLabel: {
      fontSize: 14,
    },
    cashValue: {
      fontSize: 16,
      fontWeight: '600',
    },
    cashBalanceItem: {
      borderTopWidth: StyleSheet.hairlineWidth,
      marginTop: 8,
      paddingTop: 12,
    },
    cashBalance: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    cashHistory: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
    cashHistoryTitle: {
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 12,
      textTransform: 'uppercase',
    },
    cashMovementItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    cashMovementInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    cashMovementDetails: {
      gap: 2,
    },
    cashMovementType: {
      fontSize: 14,
      fontWeight: '500',
    },
    cashMovementDate: {
      fontSize: 11,
    },
    cashMovementActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    cashMovementAmount: {
      fontSize: 15,
      fontWeight: '600',
    },
    cashTypeSelector: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
    },
    cashTypeButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    cashTypeText: {
      fontSize: 14,
      fontWeight: '600',
    },
    evolutionCard: {
      borderRadius: 8,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
    },
    evolutionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    evolutionChange: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 5,
      gap: 4,
    },
    evolutionChartContainer: {
      alignItems: 'center',
      overflow: 'hidden',
    },
    // Cash modal improved styles
    cashModalContent: {
      backgroundColor: c.surface,
      borderRadius: 10,
      padding: 24,
      marginHorizontal: 20,
      maxHeight: '80%',
    },
    cashModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.rule,
    },
    cashModalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    cashModalCloseBtn: {
      padding: 4,
    },
    cashInputGroup: {
      marginBottom: 16,
    },
    cashInputLabel: {
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 8,
      marginLeft: 4,
    },
    cashInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
    },
    cashSubmitButton: {
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    cashSubmitButtonText: {
      color: c.inkOnAccent,
      fontSize: 16,
      fontWeight: '600',
    },
    // Gains section styles
    cashSection: {
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    cashSectionTitle: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    gainsSection: {
      gap: 10,
    },
    gainsGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    gainCard: {
      flex: 1,
      borderRadius: 8,
      padding: 14,
      alignItems: 'center',
    },
    gainLabel: {
      fontSize: 12,
      fontWeight: '500',
      marginBottom: 4,
    },
    gainValue: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    gainHint: {
      fontSize: 10,
    },
    totalPortfolioValue: {
      borderTopWidth: StyleSheet.hairlineWidth,
      marginTop: 16,
      paddingTop: 16,
      alignItems: 'center',
    },
    totalPortfolioLabel: {
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 4,
    },
    totalPortfolioAmount: {
      fontSize: 28,
      fontWeight: 'bold',
    },
    totalPortfolioHint: {
      fontSize: 11,
      marginTop: 2,
    },
    // Benchmark styles
    benchmarkCard: {
      borderRadius: 8,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
    },
    benchmarkHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    benchmarkPeriod: {
      fontSize: 12,
      fontWeight: '500',
    },
    benchmarkComparison: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      marginBottom: 16,
    },
    benchmarkItem: {
      alignItems: 'center',
      flex: 1,
    },
    benchmarkDivider: {
      width: 1,
      height: 40,
    },
    benchmarkLabel: {
      fontSize: 12,
      marginBottom: 4,
    },
    benchmarkValue: {
      fontSize: 24,
      fontWeight: 'bold',
    },
    alphaContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      borderRadius: 5,
      marginBottom: 16,
    },
    alphaLabel: {
      fontSize: 13,
      fontWeight: '500',
    },
    alphaValue: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    benchmarkMetrics: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    benchmarkMetricItem: {
      alignItems: 'center',
    },
    benchmarkMetricLabel: {
      fontSize: 11,
      marginBottom: 4,
    },
    benchmarkMetricValue: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
}

export type AccountStyles = ReturnType<typeof makeAccountStyles>;
