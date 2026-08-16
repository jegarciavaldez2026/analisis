import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { PieChart, LineChart } from 'react-native-gifted-charts';
import { useTheme } from '../contexts/ThemeContext';
import { makeAccountStyles } from '../app/screens/accountStyles';
import type { ThemeColors } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';
/**
 * Rampa de los gráficos de composición (cartera por sector, por activo).
 * Es una composición, no un veredicto: por eso arranca en el acento y sigue
 * por la rampa neutra en lugar de repartir verdes y rojos, que aquí no
 * significarían «sube» ni «baja».
 */
const chartRamp = (c: ThemeColors) => [
  c.accent,
  c.inkMuted,
  c.ruleStrong,
  c.caution,
  c.accentPressed,
  c.inkFaint,
  c.up,
  c.down,
];
const screenWidth = Dimensions.get('window').width;

interface WatchlistItem {
  id: string;
  ticker: string;
  company_name: string;
  target_buy_price: number | null;
  target_sell_price: number | null;
  notify_on_price_change: boolean;
  price_change_threshold: number;
  current_price: number | null;
  notes: string | null;
}

interface PortfolioTransaction {
  id: string;
  ticker: string;
  company_name: string;
  transaction_type: string;
  shares: number;
  price_per_share: number;
  total_amount: number;
  commission: number;
  transaction_date: string;
  notes: string | null;
}

interface PortfolioHolding {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  total_shares: number;
  average_cost: number;
  total_invested: number;
  current_price: number;
  current_value: number;
  profit_loss: number;
  profit_loss_percent: number;
  weight_percent: number;
  transactions: PortfolioTransaction[];
}

interface SectorAllocation {
  sector: string;
  value: number;
  percentage: number;
  holdings_count: number;
}

interface PortfolioMetrics {
  portfolio_beta: number;
  portfolio_alpha: number;
  sharpe_ratio: number;
  average_return: number;
  volatility: number;
  gain_loss_ratio: number;
  calmar_ratio: number;
  treynor_ratio: number;
  information_ratio: number;
  max_drawdown: number;
}

interface PortfolioSummary {
  total_invested: number;
  current_value: number;
  total_profit_loss: number;
  total_profit_loss_percent: number;
  holdings: PortfolioHolding[];
  metrics: PortfolioMetrics | null;
  sector_allocation: SectorAllocation[];
  cash_balance: number;
  cash_available: number;
  total_deposits: number;
  total_withdrawals: number;
  realized_gains: number;
  unrealized_gains: number;
  total_portfolio_value: number;
}

interface AlertInfo {
  ticker: string;
  company_name: string;
  current_price: number;
  alerts: { type: string; message: string }[];
}

interface CashMovement {
  id: string;
  movement_type: 'deposit' | 'withdrawal';
  amount: number;
  description: string | null;
  movement_date: string;
}

interface PortfolioHistoryPoint {
  date: string;
  total_value: number;
  invested_value: number;
  cash_balance: number;
  profit_loss: number;
  profit_loss_percent: number;
}

interface PortfolioEvolution {
  history: PortfolioHistoryPoint[];
  current_value: number;
  total_change: number;
  total_change_percent: number;
}

interface BenchmarkComparison {
  portfolio_return: number;
  benchmark_return: number;
  alpha: number;
  tracking_error: number;
  sharpe_portfolio: number;
  sharpe_benchmark: number;
  portfolio_volatility: number;
  benchmark_volatility: number;
  correlation: number;
  period: string;
}

export type SeccionCuenta = 'watchlist' | 'portfolio';

/**
 * Favoritos y Portafolio comparten pantalla porque comparten casi todo: el
 * mismo buscador de tickers, los mismos modales, la misma forma de leer un
 * precio. Lo que cambia es qué se está mirando, y eso lo decide ahora la
 * navegación —dos entradas en el menú— en lugar de un selector interno.
 *
 * Vivía en `app/(tabs)/account.tsx`. Al dejar de ser una sección con ruta
 * propia tuvo que salir de la carpeta de rutas: en expo-router, un archivo
 * dentro de `app/` ES una pestaña, la declares o no.
 */
export default function AccountWorkspace({ seccion }: { seccion: SeccionCuenta }) {
  const { colors, isDark } = useTheme();
  // Los estilos se derivan de la paleta activa: la pantalla cambia con la
  // apariencia en lugar de quedarse en el blanco iOS de siempre.
  const styles = useMemo(() => makeAccountStyles(colors), [colors]);
  const CHART_COLORS = useMemo(() => chartRamp(colors), [colors]);
  const { logout } = useAuth();
  const { token, user } = useAuth();
  const activeTab = seccion;
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [allTransactions, setAllTransactions] = useState<PortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  
  // New states for cash movements and evolution
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [portfolioEvolution, setPortfolioEvolution] = useState<PortfolioEvolution | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkComparison | null>(null);
  const [hideValues, setHideValues] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  
  // Cash form states
  const [cashType, setCashType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDescription, setCashDescription] = useState('');
  const [cashDate, setCashDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Modal states
  const [showAddWatchlist, setShowAddWatchlist] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<PortfolioHolding | null>(null);
  
  // Form states
  const [newTicker, setNewTicker] = useState('');
  const [newTickerCurrentPrice, setNewTickerCurrentPrice] = useState<number | null>(null);
  const [watchlistSuggestions, setWatchlistSuggestions] = useState<any[]>([]);
  const [showWatchlistSuggestions, setShowWatchlistSuggestions] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([]);
  const [editingWatchlistItem, setEditingWatchlistItem] = useState<WatchlistItem | null>(null);
  const [showEditWatchlistModal, setShowEditWatchlistModal] = useState(false);
  const [editBuyPrice, setEditBuyPrice] = useState('');
  const [editSellPrice, setEditSellPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editThreshold, setEditThreshold] = useState('5');
  const [targetBuyPrice, setTargetBuyPrice] = useState('');
  const [targetSellPrice, setTargetSellPrice] = useState('');
  const [notifyOnChange, setNotifyOnChange] = useState(false);
  const [priceThreshold, setPriceThreshold] = useState('5');
  const [watchlistNotes, setWatchlistNotes] = useState('');
  
  // Transaction form
  const [txTicker, setTxTicker] = useState('');
  const [editingTx, setEditingTx] = useState<any>(null);
  const [showEditTxModal, setShowEditTxModal] = useState(false);
  const [editTxShares, setEditTxShares] = useState('');
  const [editTxPrice, setEditTxPrice] = useState('');
  const [editTxDate, setEditTxDate] = useState('');
  const [editTxCommission, setEditTxCommission] = useState('0');
  const [editTxNotes, setEditTxNotes] = useState('');
  const [editTxType, setEditTxType] = useState<'buy' | 'sell'>('buy');
  const [txSuggestions, setTxSuggestions] = useState<any[]>([]);
  const [showTxSuggestions, setShowTxSuggestions] = useState(false);
  const [txCurrentPrice, setTxCurrentPrice] = useState<number | null>(null);
  const [txType, setTxType] = useState<'buy' | 'sell'>('buy');
  const [txShares, setTxShares] = useState('');
  const [txPrice, setTxPrice] = useState('');
  const [txCommission, setTxCommission] = useState('0');
  const [txNotes, setTxNotes] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  const fetchAnalysisHistory = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/history`, { timeout: 10000 });
      const seen = new Set();
      const unique = res.data.filter((item: any) => {
        if (seen.has(item.ticker)) return false;
        seen.add(item.ticker);
        return true;
      });
      setAnalysisHistory(unique);
    } catch (e) {}
  };

  const fetchData = async () => {
    try {
      const timeout = 15000; // 15 seconds timeout
      
      if (activeTab === 'watchlist') {
        const [watchlistRes, alertsRes] = await Promise.all([
          axios.get(`${BACKEND_URL}/api/watchlist`, { timeout }),
          axios.get(`${BACKEND_URL}/api/watchlist/alerts`, { timeout })
        ]);
        setWatchlist(watchlistRes.data);
        if (alertsRes.data.alerts && alertsRes.data.alerts.length > 0) {
          setAlerts(alertsRes.data.alerts);
        }
      } else {
        // Fetch in parallel with timeout
        const [portfolioRes, transactionsRes, cashRes] = await Promise.all([
          axios.get(`${BACKEND_URL}/api/portfolio`, { timeout }),
          axios.get(`${BACKEND_URL}/api/portfolio/transactions`, { timeout }),
          axios.get(`${BACKEND_URL}/api/portfolio/cash`, { timeout })
        ]);
        
        setPortfolio(portfolioRes.data);
        setAllTransactions(transactionsRes.data);
        setCashMovements(cashRes.data);
        
        // Fetch evolution separately (can be slow)
        try {
          const evolutionRes = await axios.get(`${BACKEND_URL}/api/portfolio/evolution`, { timeout: 30000 });
          setPortfolioEvolution(evolutionRes.data);
        } catch (e) {
          console.log('Evolution fetch failed, skipping');
        }
        
        // Fetch benchmark comparison
        try {
          const benchmarkRes = await axios.get(`${BACKEND_URL}/api/portfolio/benchmark`, { timeout: 30000 });
          setBenchmark(benchmarkRes.data);
        } catch (e) {
          console.log('Benchmark fetch failed, skipping');
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchData();
    fetchAnalysisHistory();
  }, [activeTab, token]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [activeTab]);
  const handleLogout = () => {
    logout();
  };

  const handleWatchlistTickerChange = (text: string) => {
    setNewTicker(text);
    if (text.trim().length > 0) {
      const seen = new Set();
      const filtered = analysisHistory.filter((item: any) => {
        if (seen.has(item.ticker)) return false;
        seen.add(item.ticker);
        return item.ticker.toLowerCase().includes(text.toLowerCase()) ||
               item.company_name?.toLowerCase().includes(text.toLowerCase());
      });
      setWatchlistSuggestions(filtered.slice(0, 5));
      setShowWatchlistSuggestions(filtered.length > 0);
    } else {
      setWatchlistSuggestions([]);
      setShowWatchlistSuggestions(false);
    }
  };

  const openEditWatchlist = (item: WatchlistItem) => {
    setEditingWatchlistItem(item);
    setEditBuyPrice(item.target_buy_price?.toFixed(2) || '');
    setEditSellPrice(item.target_sell_price?.toFixed(2) || '');
    setEditNotes(item.notes || '');
    setEditThreshold(item.price_change_threshold?.toString() || '5');
    setShowEditWatchlistModal(true);
  };

  const saveEditWatchlist = async () => {
    if (!editingWatchlistItem) return;
    try {
      await axios.put(`${BACKEND_URL}/api/watchlist/${editingWatchlistItem.id}`, {
        target_buy_price: editBuyPrice ? parseFloat(editBuyPrice) : null,
        target_sell_price: editSellPrice ? parseFloat(editSellPrice) : null,
        notes: editNotes || null,
        price_change_threshold: parseFloat(editThreshold) || 5,
      });
      setShowEditWatchlistModal(false);
      setEditingWatchlistItem(null);
      fetchData();
      Platform.OS === 'web' ? window.alert('Watchlist actualizada') : Alert.alert('Éxito', 'Watchlist actualizada');
    } catch (error: any) {
      if (error.response?.status === 401) return;
      Platform.OS === 'web' ? window.alert('Error: No se pudo actualizar') : Alert.alert('Error', 'No se pudo actualizar');
    }
  };

  const handleSelectWatchlistTicker = async (item: any) => {
    setNewTicker(item.ticker);
    setShowWatchlistSuggestions(false);
    setNewTickerCurrentPrice(null);
    // Obtener precio del análisis completo
    try {
      const res = await axios.get(`${BACKEND_URL}/api/analysis/${item.id}`);
      const data = res.data;
      const price = data.metadata?.current_price || data.current_price;
      const buyTarget = data.valuation_summary?.target_price_conservative;
      const sellTarget = data.valuation_summary?.target_price_moderate;
      if (price) {
        setNewTickerCurrentPrice(price);
        setTargetBuyPrice(buyTarget ? buyTarget.toFixed(2) : price.toFixed(2));
      }
      if (sellTarget) setTargetSellPrice(sellTarget.toFixed(2));
    } catch (e) {
      console.log('No se pudo obtener precio del análisis');
    }
  };

  const addToWatchlist = async () => {
    if (!newTicker.trim()) {
      Platform.OS === 'web' ? window.alert('Error: Ingresa un ticker válido') : Alert.alert('Error', 'Ingresa un ticker válido');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${BACKEND_URL}/api/watchlist`, {
        ticker: newTicker.trim().toUpperCase(),
        target_buy_price: targetBuyPrice ? parseFloat(targetBuyPrice) : null,
        target_sell_price: targetSellPrice ? parseFloat(targetSellPrice) : null,
        notify_on_price_change: notifyOnChange,
        price_change_threshold: parseFloat(priceThreshold) || 5,
        notes: watchlistNotes || null,
      });
      
      setShowAddWatchlist(false);
      resetWatchlistForm();
      fetchData();
      Platform.OS === 'web' ? window.alert('Acción agregada a watchlist') : Alert.alert('Éxito', 'Acción agregada a watchlist');
    } catch (error: any) {
      if (error.response?.status === 401) return;
      Platform.OS === 'web' ? window.alert('Error: ' + (error.response?.data?.detail || 'No se pudo agregar a watchlist')) : Alert.alert('Error', error.response?.data?.detail || 'No se pudo agregar a watchlist');
    } finally {
      setSubmitting(false);
    }
  };

  const removeFromWatchlist = async (id: string, ticker: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`¿Eliminar ${ticker} de tu watchlist?`)
      : await new Promise(resolve => Alert.alert('Eliminar de Watchlist', `¿Eliminar ${ticker} de tu watchlist?`,
          [{ text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
           { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) }]));
    if (!confirmed) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/watchlist/${id}`);
      fetchData();
    } catch (error) {
      Platform.OS === 'web' ? window.alert('Error: No se pudo eliminar') : Alert.alert('Error', 'No se pudo eliminar');
    }
  };

  const openEditTx = (tx: any) => {
    setEditingTx(tx);
    setEditTxShares(tx.shares.toString());
    setEditTxPrice(tx.price_per_share.toFixed(2));
    setEditTxDate(tx.transaction_date?.split('T')[0] || '');
    setEditTxCommission(tx.commission?.toString() || '0');
    setEditTxNotes(tx.notes || '');
    setEditTxType(tx.transaction_type);
    setShowEditTxModal(true);
  };

  const saveEditTx = async () => {
    if (!editingTx) return;
    try {
      await axios.put(`${BACKEND_URL}/api/portfolio/${editingTx.id}`, {
        transaction_type: editTxType,
        shares: parseFloat(editTxShares),
        price_per_share: parseFloat(editTxPrice),
        transaction_date: editTxDate,
        commission: parseFloat(editTxCommission) || 0,
        notes: editTxNotes || null,
      });
      setShowEditTxModal(false);
      setEditingTx(null);
      fetchData();
      Platform.OS === 'web' ? window.alert('Transacción actualizada') : Alert.alert('Éxito', 'Transacción actualizada');
    } catch (error: any) {
      if (error.response?.status === 401) return;
      Platform.OS === 'web' ? window.alert('Error: No se pudo actualizar') : Alert.alert('Error', 'No se pudo actualizar');
    }
  };

  const handleTxTickerChange = (text: string) => {
    setTxTicker(text);
    setTxCurrentPrice(null);
    if (text.trim().length > 0) {
      const seen = new Set();
      const filtered = analysisHistory.filter((item: any) => {
        if (seen.has(item.ticker)) return false;
        seen.add(item.ticker);
        return item.ticker.toLowerCase().includes(text.toLowerCase()) ||
               item.company_name?.toLowerCase().includes(text.toLowerCase());
      });
      setTxSuggestions(filtered.slice(0, 5));
      setShowTxSuggestions(filtered.length > 0);
    } else {
      setTxSuggestions([]);
      setShowTxSuggestions(false);
    }
  };

  const handleSelectTxTicker = async (item: any) => {
    setTxTicker(item.ticker);
    setShowTxSuggestions(false);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/analysis/${item.id}`);
      const data = res.data;
      const price = data.metadata?.current_price || data.current_price;
      if (price) {
        setTxCurrentPrice(price);
        setTxPrice(price.toFixed(2));
      }
    } catch (e) {}
  };

  const addTransaction = async () => {
    if (!txTicker.trim() || !txShares || !txPrice) {
      Platform.OS === 'web' ? window.alert('Error: Completa todos los campos requeridos') : Alert.alert('Error', 'Completa todos los campos requeridos');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${BACKEND_URL}/api/portfolio`, {
        ticker: txTicker.trim().toUpperCase(),
        transaction_type: txType,
        shares: parseFloat(txShares),
        price_per_share: parseFloat(txPrice),
        commission: parseFloat(txCommission) || 0,
        transaction_date: new Date(txDate).toISOString(),
        notes: txNotes || null,
      });
      
      setShowAddTransaction(false);
      resetTransactionForm();
      fetchData();
      Platform.OS === 'web' ? window.alert('Transacción registrada') : Alert.alert('Éxito', 'Transacción registrada');
    } catch (error: any) {
      if (error.response?.status === 401) return;
      Platform.OS === 'web' ? window.alert('Error: ' + (error.response?.data?.detail || 'No se pudo registrar la transacción')) : Alert.alert('Error', error.response?.data?.detail || 'No se pudo registrar la transacción');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('¿Eliminar esta transacción?')
      : await new Promise(resolve => Alert.alert('Eliminar Transacción', '¿Eliminar esta transacción?',
          [{ text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
           { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) }]));
    if (!confirmed) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/portfolio/${id}`);
      fetchData();
      setShowTransactionHistory(false);
    } catch (error) {
      Platform.OS === 'web' ? window.alert('Error: No se pudo eliminar') : Alert.alert('Error', 'No se pudo eliminar');
    }
  };

  const resetWatchlistForm = () => {
    setNewTicker('');
    setNewTickerCurrentPrice(null);
    setTargetBuyPrice('');
    setTargetSellPrice('');
    setNotifyOnChange(false);
    setPriceThreshold('5');
    setWatchlistNotes('');
  };

  const resetTransactionForm = () => {
    setTxTicker('');
    setTxType('buy');
    setTxShares('');
    setTxPrice('');
    setTxCommission('0');
    setTxNotes('');
    setTxDate(new Date().toISOString().split('T')[0]);
  };

  const resetCashForm = () => {
    setCashType('deposit');
    setCashAmount('');
    setCashDescription('');
    setCashDate(new Date().toISOString().split('T')[0]);
  };

  const addCashMovement = async () => {
    if (!cashAmount || parseFloat(cashAmount) <= 0) {
      Platform.OS === 'web' ? window.alert('Error: Ingresa un monto válido') : Alert.alert('Error', 'Ingresa un monto válido');
      return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${BACKEND_URL}/api/portfolio/cash`, {
        movement_type: cashType,
        amount: parseFloat(cashAmount),
        description: cashDescription || null,
        movement_date: new Date(cashDate).toISOString(),
      });
      
      setShowCashModal(false);
      resetCashForm();
      fetchData();
      Platform.OS === 'web' ? window.alert('' + (cashType === 'deposit' ? 'Depósito registrado' : 'Retiro registrado')) : Alert.alert('Éxito', cashType === 'deposit' ? 'Depósito registrado' : 'Retiro registrado');
    } catch (error: any) {
      if (error.response?.status === 401) return;
      Platform.OS === 'web' ? window.alert('Error: ' + (error.response?.data?.detail || 'No se pudo registrar el movimiento')) : Alert.alert('Error', error.response?.data?.detail || 'No se pudo registrar el movimiento');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCashMovement = async (id: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('¿Eliminar este movimiento de efectivo?')
      : await new Promise(resolve => Alert.alert('Eliminar Movimiento', '¿Eliminar este movimiento?',
          [{ text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
           { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) }]));
    if (!confirmed) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/portfolio/cash/${id}`);
      fetchData();
    } catch (error) {
      Platform.OS === 'web' ? window.alert('Error: No se pudo eliminar') : Alert.alert('Error', 'No se pudo eliminar');
    }
  };

  const formatCurrency = (value: number) => {
    if (hideValues) return '••••••';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderWatchlistItem = (item: WatchlistItem) => (
    <View key={item.id} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.tickerContainer}>
          <Text style={styles.ticker}>{item.ticker}</Text>
          <Text style={styles.companyName} numberOfLines={1}>{item.company_name}</Text>
        </View>
        <View style={styles.watchlistPriceActions}>
          <Text style={styles.currentPrice}>
            ${item.current_price?.toFixed(2) || '---'}
          </Text>
          <TouchableOpacity
            style={[styles.deleteButtonSmall, { backgroundColor: colors.accentWash, marginRight: 6 }]}
            onPress={() => openEditWatchlist(item)}
          >
            <Ionicons name="create-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButtonSmall}
            onPress={() => removeFromWatchlist(item.id, item.ticker)}
          >
            <Ionicons name="trash-outline" size={18} color={colors.down} />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.targetsContainer}>
        {item.target_buy_price && (
          <View style={[styles.targetBadge, styles.buyBadge]}>
            <Ionicons name="arrow-down" size={12} color={colors.up} />
            <Text style={[styles.targetText, { color: colors.up }]}>
              Compra: ${item.target_buy_price.toFixed(2)}
            </Text>
          </View>
        )}
        {item.target_sell_price && (
          <View style={[styles.targetBadge, styles.sellBadge]}>
            <Ionicons name="arrow-up" size={12} color={colors.down} />
            <Text style={[styles.targetText, { color: colors.down }]}>
              Venta: ${item.target_sell_price.toFixed(2)}
            </Text>
          </View>
        )}
        {item.notify_on_price_change && (
          <View style={[styles.targetBadge, styles.notifyBadge]}>
            <Ionicons name="notifications" size={12} color={colors.caution} />
            <Text style={[styles.targetText, { color: colors.caution }]}>
              ±{item.price_change_threshold}%
            </Text>
          </View>
        )}
      </View>
      
      {item.notes && (
        <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
      )}
    </View>
  );

  const renderPortfolioHolding = (holding: PortfolioHolding) => (
    <TouchableOpacity 
      key={holding.ticker} 
      style={styles.card}
      onPress={() => {
        setSelectedHolding(holding);
        setShowTransactionHistory(true);
      }}
    >
      <View style={styles.cardHeader}>
        <View style={styles.tickerContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.ticker}>{holding.ticker}</Text>
            <View style={[styles.sectorBadge, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.sectorText, { color: colors.primary }]}>
                {holding.sector.length > 12 ? holding.sector.substring(0, 12) + '...' : holding.sector}
              </Text>
            </View>
          </View>
          <Text style={styles.companyName} numberOfLines={1}>{holding.company_name}</Text>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.currentPrice}>${holding.current_value.toFixed(2)}</Text>
          <View style={[
            styles.plBadge,
            { backgroundColor: holding.profit_loss >= 0 ? colors.upWash : colors.downWash }
          ]}>
            <Ionicons
              name={holding.profit_loss >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={holding.profit_loss >= 0 ? colors.up : colors.down}
            />
            <Text style={[
              styles.plText,
              { color: holding.profit_loss >= 0 ? colors.up : colors.down }
            ]}>
              {holding.profit_loss >= 0 ? '+' : ''}{holding.profit_loss_percent.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.holdingDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Acciones:</Text>
          <Text style={styles.detailValue}>{holding.total_shares.toFixed(4)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Costo promedio:</Text>
          <Text style={styles.detailValue}>${holding.average_cost.toFixed(2)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Precio actual:</Text>
          <Text style={styles.detailValue}>${holding.current_price.toFixed(2)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Peso en cartera:</Text>
          <Text style={[styles.detailValue, { color: colors.primary }]}>
            {holding.weight_percent.toFixed(1)}%
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>G/P:</Text>
          <Text style={[
            styles.detailValue,
            { color: holding.profit_loss >= 0 ? colors.up : colors.down }
          ]}>
            {holding.profit_loss >= 0 ? '+' : ''}${holding.profit_loss.toFixed(2)}
          </Text>
        </View>
      </View>
      
      <View style={styles.viewTransactionsHint}>
        <Ionicons name="document-text-outline" size={14} color={colors.accent} />
        <Text style={styles.viewTransactionsText}>
          {holding.transactions.length} transacción{holding.transactions.length !== 1 ? 'es' : ''} - Toca para ver
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderMetricsCard = () => {
    if (!portfolio?.metrics) return null;
    const m = portfolio.metrics;
    
    return (
      <View style={[styles.metricsCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.metricsTitle, { color: colors.text }]}>Métricas del Portafolio</Text>
        
        {/* Primary Metrics Row */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Beta</Text>
            <Text style={[
              styles.metricValue,
              { color: m.portfolio_beta <= 1 ? colors.success : colors.warning }
            ]}>
              {m.portfolio_beta.toFixed(2)}
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>
              {m.portfolio_beta < 0.8 ? 'Defensivo' : m.portfolio_beta > 1.2 ? 'Agresivo' : 'Moderado'}
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Alpha</Text>
            <Text style={[
              styles.metricValue,
              { color: m.portfolio_alpha >= 0 ? colors.success : colors.danger }
            ]}>
              {m.portfolio_alpha >= 0 ? '+' : ''}{m.portfolio_alpha.toFixed(2)}%
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>
              {m.portfolio_alpha > 0 ? 'Supera mercado' : 'Bajo mercado'}
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Sharpe</Text>
            <Text style={[
              styles.metricValue,
              { color: m.sharpe_ratio >= 1 ? colors.success : m.sharpe_ratio >= 0 ? colors.warning : colors.danger }
            ]}>
              {m.sharpe_ratio.toFixed(2)}
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>
              {m.sharpe_ratio >= 2 ? 'Excelente' : m.sharpe_ratio >= 1 ? 'Bueno' : 'Bajo'}
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Retorno</Text>
            <Text style={[
              styles.metricValue,
              { color: m.average_return >= 0 ? colors.success : colors.danger }
            ]}>
              {m.average_return >= 0 ? '+' : ''}{m.average_return.toFixed(1)}%
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>Anual</Text>
          </View>
        </View>
        
        {/* Secondary Metrics Row */}
        <View style={[styles.metricsGrid, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }]}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Gain/Loss</Text>
            <Text style={[
              styles.metricValue,
              { color: m.gain_loss_ratio >= 1 ? colors.success : colors.danger }
            ]}>
              {m.gain_loss_ratio.toFixed(2)}
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>
              {m.gain_loss_ratio >= 1.5 ? 'Muy bueno' : m.gain_loss_ratio >= 1 ? 'Positivo' : 'Negativo'}
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Calmar</Text>
            <Text style={[
              styles.metricValue,
              { color: m.calmar_ratio >= 1 ? colors.success : m.calmar_ratio >= 0.5 ? colors.warning : colors.danger }
            ]}>
              {m.calmar_ratio.toFixed(2)}
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>
              {m.calmar_ratio >= 3 ? 'Excelente' : m.calmar_ratio >= 1 ? 'Bueno' : 'Bajo'}
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Treynor</Text>
            <Text style={[
              styles.metricValue,
              { color: m.treynor_ratio >= 0 ? colors.success : colors.danger }
            ]}>
              {m.treynor_ratio.toFixed(2)}
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>
              {m.treynor_ratio > 10 ? 'Superior' : m.treynor_ratio > 0 ? 'Aceptable' : 'Bajo'}
            </Text>
          </View>
          
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Info Ratio</Text>
            <Text style={[
              styles.metricValue,
              { color: m.information_ratio >= 0.5 ? colors.success : m.information_ratio >= 0 ? colors.warning : colors.danger }
            ]}>
              {m.information_ratio.toFixed(2)}
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>
              {m.information_ratio >= 1 ? 'Excelente' : m.information_ratio >= 0.5 ? 'Bueno' : 'Normal'}
            </Text>
          </View>
        </View>
        
        {/* Max Drawdown and Volatility */}
        <View style={[styles.metricsGrid, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }]}>
          <View style={[styles.metricItem, { flex: 1 }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Max Drawdown</Text>
            <Text style={[styles.metricValue, { color: colors.danger }]}>
              {m.max_drawdown.toFixed(1)}%
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>Caída máxima</Text>
          </View>
          
          <View style={[styles.metricItem, { flex: 1 }]}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Volatilidad</Text>
            <Text style={[
              styles.metricValue,
              { color: m.volatility <= 15 ? colors.success : m.volatility <= 25 ? colors.warning : colors.danger }
            ]}>
              {m.volatility.toFixed(1)}%
            </Text>
            <Text style={[styles.metricHint, { color: colors.textSecondary }]}>
              {m.volatility <= 10 ? 'Baja' : m.volatility <= 20 ? 'Media' : 'Alta'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSectorChart = () => {
    if (!portfolio || !portfolio.sector_allocation || portfolio.sector_allocation.length === 0) return null;
    
    const sectorData = portfolio.sector_allocation.map((sector, index) => ({
      value: sector.percentage,
      color: CHART_COLORS[index % CHART_COLORS.length],
      text: `${sector.percentage.toFixed(0)}%`,
      label: sector.sector,
    }));
    
    return (
      <View style={[styles.pieChartCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.metricsTitle, { color: colors.text }]}>Distribución por Sector</Text>
        <View style={styles.pieChartContainer}>
          <PieChart
            data={sectorData}
            donut
            radius={80}
            innerRadius={50}
            innerCircleColor={colors.card}
            centerLabelComponent={() => (
              <View style={styles.pieChartCenter}>
                <Text style={[styles.pieChartCenterText, { color: colors.text }]}>
                  {portfolio.sector_allocation.length}
                </Text>
                <Text style={[styles.pieChartCenterLabel, { color: colors.textSecondary }]}>
                  Sectores
                </Text>
              </View>
            )}
          />
        </View>
        <View style={styles.pieLegend}>
          {portfolio.sector_allocation.map((sector, index) => (
            <View key={sector.sector} style={styles.pieLegendItem}>
              <View style={[styles.pieLegendDot, { backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }]} />
              <Text style={[styles.pieLegendText, { color: colors.text }]} numberOfLines={1}>
                {sector.sector.length > 15 ? sector.sector.substring(0, 15) + '...' : sector.sector}
              </Text>
              <Text style={[styles.pieLegendValue, { color: colors.textSecondary }]}>
                {sector.percentage.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderPieChart = () => {
    if (!portfolio || portfolio.holdings.length === 0) return null;
    
    const pieData = portfolio.holdings.map((holding, index) => ({
      value: holding.current_value,
      color: CHART_COLORS[index % CHART_COLORS.length],
      text: `${((holding.current_value / portfolio.current_value) * 100).toFixed(0)}%`,
      label: holding.ticker,
    }));
    
    return (
      <View style={[styles.pieChartCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.metricsTitle, { color: colors.text }]}>Distribución del Portafolio</Text>
        <View style={styles.pieChartContainer}>
          <PieChart
            data={pieData}
            donut
            radius={80}
            innerRadius={50}
            innerCircleColor={colors.card}
            centerLabelComponent={() => (
              <View style={styles.pieChartCenter}>
                <Text style={[styles.pieChartCenterText, { color: colors.text }]}>
                  {portfolio.holdings.length}
                </Text>
                <Text style={[styles.pieChartCenterLabel, { color: colors.textSecondary }]}>
                  Activos
                </Text>
              </View>
            )}
          />
        </View>
        <View style={styles.pieLegend}>
          {portfolio.holdings.map((holding, index) => (
            <View key={holding.ticker} style={styles.pieLegendItem}>
              <View style={[styles.pieLegendDot, { backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }]} />
              <Text style={[styles.pieLegendText, { color: colors.text }]}>{holding.ticker}</Text>
              <Text style={[styles.pieLegendValue, { color: colors.textSecondary }]}>
                {((holding.current_value / portfolio.current_value) * 100).toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderEvolutionChart = () => {
    if (!portfolioEvolution || portfolioEvolution.history.length === 0) return null;
    
    const lineData = portfolioEvolution.history.map(point => ({
      value: point.total_value,
      label: point.date.slice(5, 7), // Month
      dataPointText: '',
    }));
    
    return (
      <View style={[styles.evolutionCard, { backgroundColor: colors.card }]}>
        <View style={styles.evolutionHeader}>
          <Text style={[styles.metricsTitle, { color: colors.text }]}>Evolución del Portafolio</Text>
          <View style={[
            styles.evolutionChange,
            { backgroundColor: portfolioEvolution.total_change >= 0 ? colors.upWash : colors.downWash }
          ]}>
            <Ionicons
              name={portfolioEvolution.total_change >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={portfolioEvolution.total_change >= 0 ? colors.up : colors.down}
            />
            <Text style={{
              color: portfolioEvolution.total_change >= 0 ? colors.up : colors.down,
              fontSize: 12,
              fontWeight: '600'
            }}>
              {portfolioEvolution.total_change >= 0 ? '+' : ''}{portfolioEvolution.total_change_percent.toFixed(1)}%
            </Text>
          </View>
        </View>
        <View style={styles.evolutionChartContainer}>
          <LineChart
            data={lineData}
            width={screenWidth - 80}
            height={150}
            color={colors.primary}
            thickness={2}
            hideDataPoints
            curved
            startFillColor={colors.primary + '40'}
            endFillColor={colors.primary + '05'}
            startOpacity={0.4}
            endOpacity={0.05}
            areaChart
            yAxisColor={colors.border}
            xAxisColor={colors.border}
            yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 9 }}
            hideRules
            spacing={Math.max((screenWidth - 100) / lineData.length, 20)}
          />
        </View>
      </View>
    );
  };

  const renderBenchmarkCard = () => {
    if (!benchmark) return null;
    
    return (
      <View style={[styles.benchmarkCard, { backgroundColor: colors.card }]}>
        <View style={styles.benchmarkHeader}>
          <Text style={[styles.metricsTitle, { color: colors.text }]}>vs S&P 500</Text>
          <Text style={[styles.benchmarkPeriod, { color: colors.textSecondary }]}>{benchmark.period}</Text>
        </View>
        
        <View style={styles.benchmarkComparison}>
          <View style={styles.benchmarkItem}>
            <Text style={[styles.benchmarkLabel, { color: colors.textSecondary }]}>Tu Portafolio</Text>
            <Text style={[
              styles.benchmarkValue,
              { color: benchmark.portfolio_return >= 0 ? colors.up : colors.down }
            ]}>
              {benchmark.portfolio_return >= 0 ? '+' : ''}{benchmark.portfolio_return.toFixed(1)}%
            </Text>
          </View>
          <View style={[styles.benchmarkDivider, { backgroundColor: colors.border }]} />
          <View style={styles.benchmarkItem}>
            <Text style={[styles.benchmarkLabel, { color: colors.textSecondary }]}>S&P 500</Text>
            <Text style={[
              styles.benchmarkValue,
              { color: benchmark.benchmark_return >= 0 ? colors.up : colors.down }
            ]}>
              {benchmark.benchmark_return >= 0 ? '+' : ''}{benchmark.benchmark_return.toFixed(1)}%
            </Text>
          </View>
        </View>
        
        <View style={[styles.alphaContainer, { backgroundColor: benchmark.alpha >= 0 ? colors.upWash : colors.downWash }]}>
          <Text style={[styles.alphaLabel, { color: colors.text }]}>Alpha (Exceso de retorno)</Text>
          <Text style={[styles.alphaValue, { color: benchmark.alpha >= 0 ? colors.up : colors.down }]}>
            {benchmark.alpha >= 0 ? '+' : ''}{benchmark.alpha.toFixed(2)}%
          </Text>
        </View>
        
        <View style={styles.benchmarkMetrics}>
          <View style={styles.benchmarkMetricItem}>
            <Text style={[styles.benchmarkMetricLabel, { color: colors.textSecondary }]}>Sharpe</Text>
            <Text style={[styles.benchmarkMetricValue, { color: colors.text }]}>{benchmark.sharpe_portfolio.toFixed(2)}</Text>
          </View>
          <View style={styles.benchmarkMetricItem}>
            <Text style={[styles.benchmarkMetricLabel, { color: colors.textSecondary }]}>Volatilidad</Text>
            <Text style={[styles.benchmarkMetricValue, { color: colors.text }]}>{benchmark.portfolio_volatility.toFixed(1)}%</Text>
          </View>
          <View style={styles.benchmarkMetricItem}>
            <Text style={[styles.benchmarkMetricLabel, { color: colors.textSecondary }]}>Correlación</Text>
            <Text style={[styles.benchmarkMetricValue, { color: colors.text }]}>{benchmark.correlation.toFixed(2)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCashMovements = () => {
    // Use portfolio data if available, otherwise calculate locally
    const cashAvailable = portfolio?.cash_available ?? 0;
    const realizedGains = portfolio?.realized_gains ?? 0;
    const unrealizedGains = portfolio?.unrealized_gains ?? 0;
    const totalPortfolioValue = portfolio?.total_portfolio_value ?? 0;
    
    const totalDeposits = cashMovements.filter(m => m.movement_type === 'deposit').reduce((sum, m) => sum + m.amount, 0);
    const totalWithdrawals = cashMovements.filter(m => m.movement_type === 'withdrawal').reduce((sum, m) => sum + m.amount, 0);
    
    return (
      <View style={[styles.cashCard, { backgroundColor: colors.card }]}>
        <View style={styles.cashHeader}>
          <Text style={[styles.metricsTitle, { color: colors.text }]}>Resumen Financiero</Text>
          <TouchableOpacity
            style={[styles.addCashButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowCashModal(true)}
          >
            <Ionicons name="add" size={18} color={colors.inkOnAccent} />
          </TouchableOpacity>
        </View>
        
        {/* Cash Section */}
        <View style={[styles.cashSection, { borderBottomColor: colors.border }]}>
          <Text style={[styles.cashSectionTitle, { color: colors.textSecondary }]}>EFECTIVO</Text>
          <View style={styles.cashSummary}>
            <View style={styles.cashItem}>
              <Text style={[styles.cashLabel, { color: colors.textSecondary }]}>Depósitos</Text>
              <Text style={[styles.cashValue, { color: colors.up }]}>
                {hideValues ? '••••••' : `+$${totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
            </View>
            <View style={styles.cashItem}>
              <Text style={[styles.cashLabel, { color: colors.textSecondary }]}>Retiros</Text>
              <Text style={[styles.cashValue, { color: colors.down }]}>
                {hideValues ? '••••••' : `-$${totalWithdrawals.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
            </View>
            <View style={[styles.cashItem, styles.cashBalanceItem, { borderTopColor: colors.border }]}>
              <Text style={[styles.cashLabel, { color: colors.text, fontWeight: '600' }]}>Cash Disponible</Text>
              <Text style={[styles.cashBalance, { color: cashAvailable >= 0 ? colors.primary : colors.down }]}>
                {hideValues ? '••••••' : `$${cashAvailable.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Gains Section */}
        <View style={[styles.gainsSection, { marginTop: 16 }]}>
          <Text style={[styles.cashSectionTitle, { color: colors.textSecondary }]}>GANANCIAS / PÉRDIDAS</Text>
          <View style={styles.gainsGrid}>
            <View style={[styles.gainCard, { backgroundColor: isDark ? colors.surface : colors.surfaceSunken }]}>
              <Text style={[styles.gainLabel, { color: colors.textSecondary }]}>Realizadas</Text>
              <Text style={[styles.gainValue, { color: realizedGains >= 0 ? colors.up : colors.down }]}>
                {hideValues ? '••••••' : `${realizedGains >= 0 ? '+' : ''}$${realizedGains.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
              <Text style={[styles.gainHint, { color: colors.textSecondary }]}>Ventas cerradas</Text>
            </View>
            <View style={[styles.gainCard, { backgroundColor: isDark ? colors.surface : colors.surfaceSunken }]}>
              <Text style={[styles.gainLabel, { color: colors.textSecondary }]}>No Realizadas</Text>
              <Text style={[styles.gainValue, { color: unrealizedGains >= 0 ? colors.up : colors.down }]}>
                {hideValues ? '••••••' : `${unrealizedGains >= 0 ? '+' : ''}$${unrealizedGains.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
              <Text style={[styles.gainHint, { color: colors.textSecondary }]}>Posiciones abiertas</Text>
            </View>
          </View>
        </View>
        
        {/* Total Portfolio Value */}
        {totalPortfolioValue > 0 && (
          <View style={[styles.totalPortfolioValue, { borderTopColor: colors.border }]}>
            <Text style={[styles.totalPortfolioLabel, { color: colors.text }]}>Valor Total del Portafolio</Text>
            <Text style={[styles.totalPortfolioAmount, { color: colors.primary }]}>
              {hideValues ? '••••••' : `$${totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </Text>
            <Text style={[styles.totalPortfolioHint, { color: colors.textSecondary }]}>
              (Acciones + Cash disponible)
            </Text>
          </View>
        )}
        
        {/* Recent Cash Movements */}
        {cashMovements.length > 0 && (
          <View style={[styles.cashHistory, { borderTopColor: colors.border }]}>
            <Text style={[styles.cashHistoryTitle, { color: colors.textSecondary }]}>Últimos movimientos</Text>
            {cashMovements.slice(0, 3).map((movement) => (
              <View key={movement.id} style={[styles.cashMovementItem, { borderBottomColor: colors.border }]}>
                <View style={styles.cashMovementInfo}>
                  <Ionicons
                    name={movement.movement_type === 'deposit' ? 'arrow-down-circle' : 'arrow-up-circle'}
                    size={20}
                    color={movement.movement_type === 'deposit' ? colors.up : colors.down}
                  />
                  <View style={styles.cashMovementDetails}>
                    <Text style={[styles.cashMovementType, { color: colors.text }]}>
                      {movement.movement_type === 'deposit' ? 'Depósito' : 'Retiro'}
                    </Text>
                    <Text style={[styles.cashMovementDate, { color: colors.textSecondary }]}>
                      {formatDate(movement.movement_date)}
                    </Text>
                  </View>
                </View>
                <View style={styles.cashMovementActions}>
                  <Text style={[
                    styles.cashMovementAmount,
                    { color: movement.movement_type === 'deposit' ? colors.up : colors.down }
                  ]}>
                    {movement.movement_type === 'deposit' ? '+' : '-'}
                    {hideValues ? '••••' : `$${movement.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </Text>
                  <TouchableOpacity onPress={() => deleteCashMovement(movement.id)}>
                    <Ionicons name="trash-outline" size={16} color={colors.down} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderEditWatchlistModal = () => (
    <Modal visible={showEditWatchlistModal} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Editar {editingWatchlistItem?.ticker}
            </Text>
            <TouchableOpacity onPress={() => setShowEditWatchlistModal(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll}>
            {/* Precio actual informativo */}
            {editingWatchlistItem?.current_price && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, padding: 12, backgroundColor: colors.primary + '15', borderRadius: 10 }}>
                <Ionicons name="pricetag" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                  Precio actual: ${editingWatchlistItem.current_price.toFixed(2)}
                </Text>
              </View>
            )}
            <Text style={styles.inputLabel}>Precio objetivo de compra</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 150.00"
              value={editBuyPrice}
              onChangeText={setEditBuyPrice}
              keyboardType="decimal-pad"
            />
            <Text style={styles.inputLabel}>Precio objetivo de venta</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 200.00"
              value={editSellPrice}
              onChangeText={setEditSellPrice}
              keyboardType="decimal-pad"
            />
            <Text style={styles.inputLabel}>Umbral de alerta (%)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 5"
              value={editThreshold}
              onChangeText={setEditThreshold}
              keyboardType="decimal-pad"
            />
            <Text style={styles.inputLabel}>Notas</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Notas sobre esta acción..."
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
            />
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary, marginTop: 8 }]}
              onPress={saveEditWatchlist}
            >
              <Text style={styles.submitButtonText}>Guardar cambios</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderEditTxModal = () => (
    <Modal visible={showEditTxModal} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Editar Transacción — {editingTx?.ticker}
            </Text>
            <TouchableOpacity onPress={() => setShowEditTxModal(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll}>
            <Text style={styles.inputLabel}>Tipo</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {(['buy', 'sell'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={{
                    flex: 1, padding: 12, borderRadius: 10, alignItems: 'center',
                    backgroundColor: editTxType === type ? (type === 'buy' ? colors.up : colors.down) : colors.background,
                    borderWidth: 1, borderColor: type === 'buy' ? colors.up : colors.down,
                  }}
                  onPress={() => setEditTxType(type)}
                >
                  <Text style={{ fontWeight: '700', color: editTxType === type ? colors.inkOnAccent : (type === 'buy' ? colors.up : colors.down) }}>
                    {type === 'buy' ? 'Compra' : 'Venta'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Fecha *</Text>
            <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={editTxDate} onChangeText={setEditTxDate} />
            <Text style={styles.inputLabel}>Acciones *</Text>
            <TextInput style={styles.input} placeholder="Ej: 10" value={editTxShares} onChangeText={setEditTxShares} keyboardType="decimal-pad" />
            <Text style={styles.inputLabel}>Precio por acción *</Text>
            <TextInput style={styles.input} placeholder="Ej: 150.00" value={editTxPrice} onChangeText={setEditTxPrice} keyboardType="decimal-pad" />
            <Text style={styles.inputLabel}>Comisión</Text>
            <TextInput style={styles.input} placeholder="Ej: 0.00" value={editTxCommission} onChangeText={setEditTxCommission} keyboardType="decimal-pad" />
            <Text style={styles.inputLabel}>Notas</Text>
            <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]} placeholder="Notas..." value={editTxNotes} onChangeText={setEditTxNotes} multiline />
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary, marginTop: 8 }]}
              onPress={saveEditTx}
            >
              <Text style={styles.submitButtonText}>Guardar cambios</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderCashModal = () => (
    <Modal
      visible={showCashModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCashModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={[styles.cashModalContent, { backgroundColor: colors.card }]}>
          <View style={styles.cashModalHeader}>
            <Text style={[styles.cashModalTitle, { color: colors.text }]}>
              {cashType === 'deposit' ? 'Registrar Depósito' : 'Registrar Retiro'}
            </Text>
            <TouchableOpacity 
              style={styles.cashModalCloseBtn}
              onPress={() => setShowCashModal(false)}
            >
              <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          
          {/* Type Selector */}
          <View style={styles.cashTypeSelector}>
            <TouchableOpacity
              style={[
                styles.cashTypeButton,
                { borderColor: colors.border },
                cashType === 'deposit' && { backgroundColor: colors.upWash, borderColor: colors.up }
              ]}
              onPress={() => setCashType('deposit')}
            >
              <Ionicons name="arrow-down-circle" size={20} color={cashType === 'deposit' ? colors.up : colors.textSecondary} />
              <Text style={[styles.cashTypeText, { color: cashType === 'deposit' ? colors.up : colors.textSecondary }]}>
                Depósito
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.cashTypeButton,
                { borderColor: colors.border },
                cashType === 'withdrawal' && { backgroundColor: colors.downWash, borderColor: colors.down }
              ]}
              onPress={() => setCashType('withdrawal')}
            >
              <Ionicons name="arrow-up-circle" size={20} color={cashType === 'withdrawal' ? colors.down : colors.textSecondary} />
              <Text style={[styles.cashTypeText, { color: cashType === 'withdrawal' ? colors.down : colors.textSecondary }]}>
                Retiro
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.cashInputGroup}>
            <Text style={[styles.cashInputLabel, { color: colors.textSecondary }]}>Monto *</Text>
            <TextInput
              style={[styles.cashInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              value={cashAmount}
              onChangeText={setCashAmount}
              keyboardType="decimal-pad"
            />
          </View>
          
          <View style={styles.cashInputGroup}>
            <Text style={[styles.cashInputLabel, { color: colors.textSecondary }]}>Descripción</Text>
            <TextInput
              style={[styles.cashInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="Opcional"
              placeholderTextColor={colors.textSecondary}
              value={cashDescription}
              onChangeText={setCashDescription}
            />
          </View>
          
          <View style={styles.cashInputGroup}>
            <Text style={[styles.cashInputLabel, { color: colors.textSecondary }]}>Fecha</Text>
            <TextInput
              style={[styles.cashInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
              value={cashDate}
              onChangeText={setCashDate}
            />
          </View>
          
          <TouchableOpacity
            style={[
              styles.cashSubmitButton,
              { backgroundColor: cashType === 'deposit' ? colors.up : colors.down },
              submitting && styles.submitButtonDisabled
            ]}
            onPress={addCashMovement}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.inkOnAccent} />
            ) : (
              <Text style={styles.cashSubmitButtonText}>
                {cashType === 'deposit' ? 'Registrar Depósito' : 'Registrar Retiro'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* El selector de pestañas se fue al menú: dos maneras de llegar al mismo
          sitio, una encima de la otra, hacían dudar de cuál mandaba. */}

      {/* En escritorio, cerrar sesión vive en la barra lateral. En móvil no hay
          barra lateral y ésta era la única salida, así que aquí se queda. */}
      {Platform.OS !== 'web' && (
        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: colors.border }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={[styles.logoutButtonText, { color: colors.danger }]}>Cerrar sesión</Text>
        </TouchableOpacity>
      )}

      {/* Alerts Button */}
      {activeTab === 'watchlist' && alerts.length > 0 && (
        <TouchableOpacity
          style={styles.alertsButton}
          onPress={() => setShowAlerts(true)}
        >
          <Ionicons name="notifications" size={20} color={colors.inkOnAccent} />
          <Text style={styles.alertsButtonText}>
            {alerts.length} alerta{alerts.length > 1 ? 's' : ''} activa{alerts.length > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* Transaction History Button for Portfolio */}
      {activeTab === 'portfolio' && allTransactions.length > 0 && (
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => {
            setSelectedHolding(null);
            setShowTransactionHistory(true);
          }}
        >
          <Ionicons name="list" size={20} color={colors.accent} />
          <Text style={styles.historyButtonText}>
            Ver historial de compras ({allTransactions.length})
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          {activeTab === 'watchlist' ? (
            <>
              {watchlist.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="eye-off-outline" size={60} color={colors.inkFaint} />
                  <Text style={styles.emptyTitle}>Watchlist vacía</Text>
                  <Text style={styles.emptySubtitle}>
                    Agrega acciones para seguir su precio
                  </Text>
                </View>
              ) : (
                watchlist.map(renderWatchlistItem)
              )}
            </>
          ) : (
            <>
              {portfolio && portfolio.holdings.length > 0 ? (
                <>
                  {/* Portfolio Summary with Hide Toggle */}
                  <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
                    <View style={styles.summaryHeader}>
                      <Text style={[styles.summaryTitle, { color: colors.text }]}>Resumen del Portafolio</Text>
                      <TouchableOpacity
                        style={styles.hideToggle}
                        onPress={() => setHideValues(!hideValues)}
                      >
                        <Ionicons
                          name={hideValues ? 'eye-off' : 'eye'}
                          size={20}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryItem}>
                        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Invertido</Text>
                        <Text style={[styles.summaryValue, { color: colors.text }]}>
                          {formatCurrency(portfolio.total_invested)}
                        </Text>
                      </View>
                      <View style={styles.summaryItem}>
                        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Valor Actual</Text>
                        <Text style={[styles.summaryValue, { color: colors.text }]}>
                          {formatCurrency(portfolio.current_value)}
                        </Text>
                      </View>
                    </View>
                    <View style={[
                      styles.totalPLContainer,
                      { backgroundColor: portfolio.total_profit_loss >= 0 ? colors.upWash : colors.downWash }
                    ]}>
                      <Text style={[styles.totalPLLabel, { color: colors.text }]}>Ganancia/Pérdida Total</Text>
                      <Text style={[
                        styles.totalPLValue,
                        { color: portfolio.total_profit_loss >= 0 ? colors.up : colors.down }
                      ]}>
                        {hideValues ? '••••••' : `${portfolio.total_profit_loss >= 0 ? '+' : ''}$${portfolio.total_profit_loss.toFixed(2)} (${portfolio.total_profit_loss_percent >= 0 ? '+' : ''}${portfolio.total_profit_loss_percent.toFixed(2)}%)`}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Cash Movements */}
                  {renderCashMovements()}
                  
                  {/* Evolution Chart */}
                  {renderEvolutionChart()}
                  
                  {/* Benchmark Comparison */}
                  {renderBenchmarkCard()}
                  
                  {/* Pie Chart */}
                  {renderPieChart()}
                  
                  {/* Sector Chart */}
                  {renderSectorChart()}
                  
                  {/* Portfolio Metrics */}
                  {renderMetricsCard()}
                  
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Posiciones</Text>
                  {portfolio.holdings.map(renderPortfolioHolding)}
                </>
              ) : (
                <>
                  {/* Show cash section even when no holdings */}
                  {renderCashMovements()}
                  
                  <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
                    <Ionicons name="briefcase-outline" size={60} color={colors.textSecondary} />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>Portafolio vacío</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                      Registra tus compras para llevar control
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => activeTab === 'watchlist' ? setShowAddWatchlist(true) : setShowAddTransaction(true)}
      >
        <Ionicons name="add" size={28} color={colors.inkOnAccent} />
      </TouchableOpacity>

      {/* Add to Watchlist Modal */}
      <Modal visible={showAddWatchlist} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar a Watchlist</Text>
              <TouchableOpacity onPress={() => { setShowAddWatchlist(false); resetWatchlistForm(); }}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Ticker *</Text>
              <View style={{ position: 'relative', zIndex: 999 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: AAPL, GOOGL o nombre empresa"
                  value={newTicker}
                  onChangeText={handleWatchlistTickerChange}
                  autoCapitalize="characters"
                />
                {showWatchlistSuggestions && watchlistSuggestions.length > 0 && (
                  <View style={{
                    position: 'absolute', top: 48, left: 0, right: 0,
                    backgroundColor: colors.inkOnAccent, borderRadius: 10, borderWidth: 1,
                    borderColor: colors.rule, zIndex: 9999, elevation: 10,
                    shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 8,
                  }}>
                    {watchlistSuggestions.map((item: any, index: number) => (
                      <TouchableOpacity
                        key={item.id}
                        style={{
                          flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
                          borderBottomWidth: index < watchlistSuggestions.length - 1 ? 1 : 0,
                          borderBottomColor: colors.rule,
                        }}
                        onPress={() => handleSelectWatchlistTicker(item)}
                      >
                        <View style={{
                          paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                          backgroundColor: item.recommendation === 'COMPRAR' ? colors.upWash : item.recommendation === 'VENDER' ? colors.downWash : colors.cautionWash,
                        }}>
                          <Text style={{
                            fontWeight: '700', fontSize: 12,
                            color: item.recommendation === 'COMPRAR' ? colors.up : item.recommendation === 'VENDER' ? colors.down : colors.caution,
                          }}>{item.ticker}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.ink }} numberOfLines={1}>{item.company_name}</Text>
                          <Text style={{ fontSize: 11, color: colors.inkFaint }}>{item.recommendation} · {item.favorable_percentage?.toFixed(1)}%</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: colors.accent }}>→</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              {newTickerCurrentPrice && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, padding: 12, backgroundColor: colors.primary + '15', borderRadius: 10 }}>
                  <Ionicons name="pricetag" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                    Precio actual: ${newTickerCurrentPrice.toFixed(2)}
                  </Text>
                </View>
              )}
              <Text style={styles.inputLabel}>Precio objetivo de compra</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 150.00"
                value={targetBuyPrice}
                onChangeText={setTargetBuyPrice}
                keyboardType="decimal-pad"
              />
              
              <Text style={styles.inputLabel}>Precio objetivo de venta</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 200.00"
                value={targetSellPrice}
                onChangeText={setTargetSellPrice}
                keyboardType="decimal-pad"
              />
              
              <View style={styles.switchRow}>
                <Text style={styles.inputLabel}>Notificar cambios de precio</Text>
                <Switch
                  value={notifyOnChange}
                  onValueChange={setNotifyOnChange}
                  trackColor={{ false: colors.rule, true: colors.accent }}
                />
              </View>
              
              {notifyOnChange && (
                <>
                  <Text style={styles.inputLabel}>Umbral de cambio (%)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: 5"
                    value={priceThreshold}
                    onChangeText={setPriceThreshold}
                    keyboardType="decimal-pad"
                  />
                </>
              )}
              
              <Text style={styles.inputLabel}>Notas</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Notas adicionales..."
                value={watchlistNotes}
                onChangeText={setWatchlistNotes}
                multiline
                numberOfLines={3}
              />
            </ScrollView>
            
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={addToWatchlist}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.inkOnAccent} />
              ) : (
                <Text style={styles.submitButtonText}>Agregar a Watchlist</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Transaction Modal */}
      <Modal visible={showAddTransaction} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registrar Transacción</Text>
              <TouchableOpacity onPress={() => { setShowAddTransaction(false); resetTransactionForm(); }}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              <View style={styles.txTypeSelector}>
                <TouchableOpacity
                  style={[styles.txTypeButton, txType === 'buy' && styles.txTypeBuy]}
                  onPress={() => setTxType('buy')}
                >
                  <Ionicons name="arrow-down" size={20} color={txType === 'buy' ? colors.inkOnAccent : colors.up} />
                  <Text style={[styles.txTypeText, txType === 'buy' && styles.txTypeTextActive]}>Compra</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.txTypeButton, txType === 'sell' && styles.txTypeSell]}
                  onPress={() => setTxType('sell')}
                >
                  <Ionicons name="arrow-up" size={20} color={txType === 'sell' ? colors.inkOnAccent : colors.down} />
                  <Text style={[styles.txTypeText, txType === 'sell' && styles.txTypeTextActive]}>Venta</Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles.inputLabel}>Ticker *</Text>
              <View style={{ position: 'relative', zIndex: 999 }}>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: AAPL o nombre empresa"
                  value={txTicker}
                  onChangeText={handleTxTickerChange}
                  autoCapitalize="characters"
                />
                {showTxSuggestions && txSuggestions.length > 0 && (
                  <View style={{
                    position: 'absolute', top: 48, left: 0, right: 0,
                    backgroundColor: colors.card, borderRadius: 10, borderWidth: 1,
                    borderColor: colors.border, zIndex: 9999, elevation: 10,
                    shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 8,
                  }}>
                    {txSuggestions.map((item: any, index: number) => (
                      <TouchableOpacity
                        key={item.id}
                        style={{
                          flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
                          borderBottomWidth: index < txSuggestions.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border,
                        }}
                        onPress={() => handleSelectTxTicker(item)}
                      >
                        <View style={{
                          paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                          backgroundColor: item.recommendation === 'COMPRAR' ? colors.upWash : item.recommendation === 'VENDER' ? colors.downWash : colors.cautionWash,
                        }}>
                          <Text style={{
                            fontWeight: '700', fontSize: 12,
                            color: item.recommendation === 'COMPRAR' ? colors.up : item.recommendation === 'VENDER' ? colors.down : colors.caution,
                          }}>{item.ticker}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }} numberOfLines={1}>{item.company_name}</Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{item.recommendation} · {item.favorable_percentage?.toFixed(1)}%</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: colors.primary }}>→</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              {txCurrentPrice && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8, padding: 12, backgroundColor: colors.primary + '15', borderRadius: 10 }}>
                  <Ionicons name="pricetag" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                    Precio actual: ${txCurrentPrice.toFixed(2)}
                  </Text>
                </View>
              )}
              
              <Text style={styles.inputLabel}>Fecha de transacción *</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                value={txDate}
                onChangeText={setTxDate}
              />
              
              <Text style={styles.inputLabel}>Cantidad de acciones *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 10"
                value={txShares}
                onChangeText={setTxShares}
                keyboardType="decimal-pad"
              />
              
              <Text style={styles.inputLabel}>Precio por acción *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 150.00"
                value={txPrice}
                onChangeText={setTxPrice}
                keyboardType="decimal-pad"
              />
              
              <Text style={styles.inputLabel}>Comisión</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 1.00"
                value={txCommission}
                onChangeText={setTxCommission}
                keyboardType="decimal-pad"
              />
              
              <Text style={styles.inputLabel}>Notas</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Notas adicionales..."
                value={txNotes}
                onChangeText={setTxNotes}
                multiline
                numberOfLines={3}
              />
              
              {txShares && txPrice && (
                <View style={styles.totalContainer}>
                  <Text style={styles.totalLabel}>Total:</Text>
                  <Text style={styles.totalValue}>
                    ${(parseFloat(txShares || '0') * parseFloat(txPrice || '0') + parseFloat(txCommission || '0')).toFixed(2)}
                  </Text>
                </View>
              )}
            </ScrollView>
            
            <TouchableOpacity
              style={[
                styles.submitButton,
                submitting && styles.submitButtonDisabled,
                { backgroundColor: txType === 'buy' ? colors.up : colors.down }
              ]}
              onPress={addTransaction}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.inkOnAccent} />
              ) : (
                <Text style={styles.submitButtonText}>
                  Registrar {txType === 'buy' ? 'Compra' : 'Venta'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Transaction History Modal */}
      <Modal visible={showTransactionHistory} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedHolding ? `Historial - ${selectedHolding.ticker}` : 'Historial de Compras'}
              </Text>
              <TouchableOpacity onPress={() => setShowTransactionHistory(false)}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              {(selectedHolding ? selectedHolding.transactions : allTransactions).map((tx) => (
                <View key={tx.id} style={styles.transactionCard}>
                  <View style={styles.transactionHeader}>
                    <View style={styles.transactionInfo}>
                      <View style={[
                        styles.txTypeBadge,
                        { backgroundColor: tx.transaction_type === 'buy' ? colors.upWash : colors.downWash }
                      ]}>
                        <Ionicons
                          name={tx.transaction_type === 'buy' ? 'arrow-down' : 'arrow-up'}
                          size={14}
                          color={tx.transaction_type === 'buy' ? colors.up : colors.down}
                        />
                        <Text style={[
                          styles.txTypeBadgeText,
                          { color: tx.transaction_type === 'buy' ? colors.up : colors.down }
                        ]}>
                          {tx.transaction_type === 'buy' ? 'Compra' : 'Venta'}
                        </Text>
                      </View>
                      {!selectedHolding && (
                        <Text style={styles.transactionTicker}>{tx.ticker}</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.deleteTransactionBtn, { backgroundColor: colors.accentWash }]}
                        onPress={() => openEditTx(tx)}
                      >
                        <Ionicons name="create-outline" size={18} color={colors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteTransactionBtn}
                        onPress={() => deleteTransaction(tx.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.down} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.transactionDetails}>
                    <View style={styles.transactionRow}>
                      <Text style={styles.transactionLabel}>Fecha:</Text>
                      <Text style={styles.transactionValue}>{formatDate(tx.transaction_date)}</Text>
                    </View>
                    <View style={styles.transactionRow}>
                      <Text style={styles.transactionLabel}>Acciones:</Text>
                      <Text style={styles.transactionValue}>{tx.shares}</Text>
                    </View>
                    <View style={styles.transactionRow}>
                      <Text style={styles.transactionLabel}>Precio:</Text>
                      <Text style={styles.transactionValue}>${tx.price_per_share.toFixed(2)}</Text>
                    </View>
                    <View style={styles.transactionRow}>
                      <Text style={styles.transactionLabel}>Comisión:</Text>
                      <Text style={styles.transactionValue}>${tx.commission.toFixed(2)}</Text>
                    </View>
                    <View style={[styles.transactionRow, styles.transactionTotal]}>
                      <Text style={styles.transactionTotalLabel}>Total:</Text>
                      <Text style={styles.transactionTotalValue}>
                        ${(tx.total_amount + tx.commission).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  
                  {tx.notes && (
                    <Text style={styles.transactionNotes}>{tx.notes}</Text>
                  )}
                </View>
              ))}
              
              {(selectedHolding ? selectedHolding.transactions : allTransactions).length === 0 && (
                <View style={styles.emptyTransactions}>
                  <Text style={styles.emptyTransactionsText}>No hay transacciones</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Alerts Modal */}
      <Modal visible={showAlerts} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Alertas Activas</Text>
              <TouchableOpacity onPress={() => setShowAlerts(false)}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              {alerts.map((alert, index) => (
                <View key={index} style={styles.alertCard}>
                  <View style={styles.alertHeader}>
                    <Text style={styles.alertTicker}>{alert.ticker}</Text>
                    <Text style={styles.alertPrice}>${alert.current_price.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.alertCompany}>{alert.company_name}</Text>
                  {alert.alerts.map((a, i) => (
                    <View key={i} style={[
                      styles.alertMessage,
                      { backgroundColor: a.type === 'buy' ? colors.upWash : a.type === 'sell' ? colors.downWash : colors.cautionWash }
                    ]}>
                      <Ionicons
                        name={a.type === 'buy' ? 'arrow-down-circle' : a.type === 'sell' ? 'arrow-up-circle' : 'sync-circle'}
                        size={20}
                        color={a.type === 'buy' ? colors.up : a.type === 'sell' ? colors.down : colors.caution}
                      />
                      <Text style={styles.alertMessageText}>{a.message}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cash Movement Modal */}
      {renderEditWatchlistModal()}
      {renderEditTxModal()}
      {renderCashModal()}
    </View>
  );
}
