import React, { useState, useEffect, useCallback } from 'react';
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
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const CHART_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#FF2D55', '#00C7BE'];
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

export default function AccountScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'watchlist' | 'portfolio'>('watchlist');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [allTransactions, setAllTransactions] = useState<PortfolioTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  
  // New states for cash movements and evolution
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [portfolioEvolution, setPortfolioEvolution] = useState<PortfolioEvolution | null>(null);
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
  const [targetBuyPrice, setTargetBuyPrice] = useState('');
  const [targetSellPrice, setTargetSellPrice] = useState('');
  const [notifyOnChange, setNotifyOnChange] = useState(false);
  const [priceThreshold, setPriceThreshold] = useState('5');
  const [watchlistNotes, setWatchlistNotes] = useState('');
  
  // Transaction form
  const [txTicker, setTxTicker] = useState('');
  const [txType, setTxType] = useState<'buy' | 'sell'>('buy');
  const [txShares, setTxShares] = useState('');
  const [txPrice, setTxPrice] = useState('');
  const [txCommission, setTxCommission] = useState('0');
  const [txNotes, setTxNotes] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

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
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [activeTab]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [activeTab]);

  const addToWatchlist = async () => {
    if (!newTicker.trim()) {
      Alert.alert('Error', 'Ingresa un ticker válido');
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
      Alert.alert('Éxito', 'Acción agregada a watchlist');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'No se pudo agregar a watchlist');
    } finally {
      setSubmitting(false);
    }
  };

  const removeFromWatchlist = async (id: string, ticker: string) => {
    Alert.alert(
      'Eliminar de Watchlist',
      `¿Eliminar ${ticker} de tu watchlist?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/watchlist/${id}`);
              fetchData();
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar');
            }
          },
        },
      ]
    );
  };

  const addTransaction = async () => {
    if (!txTicker.trim() || !txShares || !txPrice) {
      Alert.alert('Error', 'Completa todos los campos requeridos');
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
      Alert.alert('Éxito', 'Transacción registrada');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'No se pudo registrar la transacción');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    Alert.alert(
      'Eliminar Transacción',
      '¿Eliminar esta transacción?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/portfolio/${id}`);
              fetchData();
              setShowTransactionHistory(false);
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar');
            }
          },
        },
      ]
    );
  };

  const resetWatchlistForm = () => {
    setNewTicker('');
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
      Alert.alert('Error', 'Ingresa un monto válido');
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
      Alert.alert('Éxito', cashType === 'deposit' ? 'Depósito registrado' : 'Retiro registrado');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'No se pudo registrar el movimiento');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteCashMovement = async (id: string) => {
    Alert.alert(
      'Eliminar Movimiento',
      '¿Eliminar este movimiento de efectivo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/portfolio/cash/${id}`);
              fetchData();
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar');
            }
          },
        },
      ]
    );
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
            style={styles.deleteButtonSmall}
            onPress={() => removeFromWatchlist(item.id, item.ticker)}
          >
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.targetsContainer}>
        {item.target_buy_price && (
          <View style={[styles.targetBadge, styles.buyBadge]}>
            <Ionicons name="arrow-down" size={12} color="#34C759" />
            <Text style={[styles.targetText, { color: '#34C759' }]}>
              Compra: ${item.target_buy_price.toFixed(2)}
            </Text>
          </View>
        )}
        {item.target_sell_price && (
          <View style={[styles.targetBadge, styles.sellBadge]}>
            <Ionicons name="arrow-up" size={12} color="#FF3B30" />
            <Text style={[styles.targetText, { color: '#FF3B30' }]}>
              Venta: ${item.target_sell_price.toFixed(2)}
            </Text>
          </View>
        )}
        {item.notify_on_price_change && (
          <View style={[styles.targetBadge, styles.notifyBadge]}>
            <Ionicons name="notifications" size={12} color="#FF9500" />
            <Text style={[styles.targetText, { color: '#FF9500' }]}>
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
            { backgroundColor: holding.profit_loss >= 0 ? '#34C75915' : '#FF3B3015' }
          ]}>
            <Ionicons
              name={holding.profit_loss >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={holding.profit_loss >= 0 ? '#34C759' : '#FF3B30'}
            />
            <Text style={[
              styles.plText,
              { color: holding.profit_loss >= 0 ? '#34C759' : '#FF3B30' }
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
            { color: holding.profit_loss >= 0 ? '#34C759' : '#FF3B30' }
          ]}>
            {holding.profit_loss >= 0 ? '+' : ''}${holding.profit_loss.toFixed(2)}
          </Text>
        </View>
      </View>
      
      <View style={styles.viewTransactionsHint}>
        <Ionicons name="document-text-outline" size={14} color="#007AFF" />
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
            { backgroundColor: portfolioEvolution.total_change >= 0 ? '#34C75915' : '#FF3B3015' }
          ]}>
            <Ionicons
              name={portfolioEvolution.total_change >= 0 ? 'trending-up' : 'trending-down'}
              size={14}
              color={portfolioEvolution.total_change >= 0 ? '#34C759' : '#FF3B30'}
            />
            <Text style={{
              color: portfolioEvolution.total_change >= 0 ? '#34C759' : '#FF3B30',
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
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        
        {/* Cash Section */}
        <View style={[styles.cashSection, { borderBottomColor: colors.border }]}>
          <Text style={[styles.cashSectionTitle, { color: colors.textSecondary }]}>EFECTIVO</Text>
          <View style={styles.cashSummary}>
            <View style={styles.cashItem}>
              <Text style={[styles.cashLabel, { color: colors.textSecondary }]}>Depósitos</Text>
              <Text style={[styles.cashValue, { color: '#34C759' }]}>
                {hideValues ? '••••••' : `+$${totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
            </View>
            <View style={styles.cashItem}>
              <Text style={[styles.cashLabel, { color: colors.textSecondary }]}>Retiros</Text>
              <Text style={[styles.cashValue, { color: '#FF3B30' }]}>
                {hideValues ? '••••••' : `-$${totalWithdrawals.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
            </View>
            <View style={[styles.cashItem, styles.cashBalanceItem, { borderTopColor: colors.border }]}>
              <Text style={[styles.cashLabel, { color: colors.text, fontWeight: '600' }]}>Cash Disponible</Text>
              <Text style={[styles.cashBalance, { color: cashAvailable >= 0 ? colors.primary : '#FF3B30' }]}>
                {hideValues ? '••••••' : `$${cashAvailable.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Gains Section */}
        <View style={[styles.gainsSection, { marginTop: 16 }]}>
          <Text style={[styles.cashSectionTitle, { color: colors.textSecondary }]}>GANANCIAS / PÉRDIDAS</Text>
          <View style={styles.gainsGrid}>
            <View style={[styles.gainCard, { backgroundColor: isDark ? '#1C1C1E' : '#F5F5F7' }]}>
              <Text style={[styles.gainLabel, { color: colors.textSecondary }]}>Realizadas</Text>
              <Text style={[styles.gainValue, { color: realizedGains >= 0 ? '#34C759' : '#FF3B30' }]}>
                {hideValues ? '••••••' : `${realizedGains >= 0 ? '+' : ''}$${realizedGains.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </Text>
              <Text style={[styles.gainHint, { color: colors.textSecondary }]}>Ventas cerradas</Text>
            </View>
            <View style={[styles.gainCard, { backgroundColor: isDark ? '#1C1C1E' : '#F5F5F7' }]}>
              <Text style={[styles.gainLabel, { color: colors.textSecondary }]}>No Realizadas</Text>
              <Text style={[styles.gainValue, { color: unrealizedGains >= 0 ? '#34C759' : '#FF3B30' }]}>
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
                    color={movement.movement_type === 'deposit' ? '#34C759' : '#FF3B30'}
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
                    { color: movement.movement_type === 'deposit' ? '#34C759' : '#FF3B30' }
                  ]}>
                    {movement.movement_type === 'deposit' ? '+' : '-'}
                    {hideValues ? '••••' : `$${movement.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </Text>
                  <TouchableOpacity onPress={() => deleteCashMovement(movement.id)}>
                    <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

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
                cashType === 'deposit' && { backgroundColor: '#34C75920', borderColor: '#34C759' }
              ]}
              onPress={() => setCashType('deposit')}
            >
              <Ionicons name="arrow-down-circle" size={20} color={cashType === 'deposit' ? '#34C759' : colors.textSecondary} />
              <Text style={[styles.cashTypeText, { color: cashType === 'deposit' ? '#34C759' : colors.textSecondary }]}>
                Depósito
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.cashTypeButton,
                { borderColor: colors.border },
                cashType === 'withdrawal' && { backgroundColor: '#FF3B3020', borderColor: '#FF3B30' }
              ]}
              onPress={() => setCashType('withdrawal')}
            >
              <Ionicons name="arrow-up-circle" size={20} color={cashType === 'withdrawal' ? '#FF3B30' : colors.textSecondary} />
              <Text style={[styles.cashTypeText, { color: cashType === 'withdrawal' ? '#FF3B30' : colors.textSecondary }]}>
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
              { backgroundColor: cashType === 'deposit' ? '#34C759' : '#FF3B30' },
              submitting && styles.submitButtonDisabled
            ]}
            onPress={addCashMovement}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
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
      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'watchlist' && styles.activeTab]}
          onPress={() => setActiveTab('watchlist')}
        >
          <Ionicons
            name={activeTab === 'watchlist' ? 'eye' : 'eye-outline'}
            size={20}
            color={activeTab === 'watchlist' ? '#007AFF' : '#8E8E93'}
          />
          <Text style={[styles.tabText, activeTab === 'watchlist' && styles.activeTabText]}>
            Watchlist
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'portfolio' && styles.activeTab]}
          onPress={() => setActiveTab('portfolio')}
        >
          <Ionicons
            name={activeTab === 'portfolio' ? 'briefcase' : 'briefcase-outline'}
            size={20}
            color={activeTab === 'portfolio' ? '#007AFF' : '#8E8E93'}
          />
          <Text style={[styles.tabText, activeTab === 'portfolio' && styles.activeTabText]}>
            Portafolio
          </Text>
        </TouchableOpacity>
      </View>

      {/* Alerts Button */}
      {activeTab === 'watchlist' && alerts.length > 0 && (
        <TouchableOpacity
          style={styles.alertsButton}
          onPress={() => setShowAlerts(true)}
        >
          <Ionicons name="notifications" size={20} color="#FFFFFF" />
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
          <Ionicons name="list" size={20} color="#007AFF" />
          <Text style={styles.historyButtonText}>
            Ver historial de compras ({allTransactions.length})
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
          }
        >
          {activeTab === 'watchlist' ? (
            <>
              {watchlist.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="eye-off-outline" size={60} color="#C7C7CC" />
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
                      { backgroundColor: portfolio.total_profit_loss >= 0 ? '#34C75915' : '#FF3B3015' }
                    ]}>
                      <Text style={[styles.totalPLLabel, { color: colors.text }]}>Ganancia/Pérdida Total</Text>
                      <Text style={[
                        styles.totalPLValue,
                        { color: portfolio.total_profit_loss >= 0 ? '#34C759' : '#FF3B30' }
                      ]}>
                        {hideValues ? '••••••' : `${portfolio.total_profit_loss >= 0 ? '+' : ''}$${portfolio.total_profit_loss.toFixed(2)} (${portfolio.total_profit_loss_percent >= 0 ? '+' : ''}${portfolio.total_profit_loss_percent.toFixed(2)}%)`}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Cash Movements */}
                  {renderCashMovements()}
                  
                  {/* Evolution Chart */}
                  {renderEvolutionChart()}
                  
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
        <Ionicons name="add" size={28} color="#FFFFFF" />
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
                <Ionicons name="close" size={24} color="#1D1D1F" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Ticker *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: AAPL, GOOGL"
                value={newTicker}
                onChangeText={setNewTicker}
                autoCapitalize="characters"
              />
              
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
                  trackColor={{ false: '#E0E0E0', true: '#007AFF' }}
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
                <ActivityIndicator color="#FFFFFF" />
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
                <Ionicons name="close" size={24} color="#1D1D1F" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              <View style={styles.txTypeSelector}>
                <TouchableOpacity
                  style={[styles.txTypeButton, txType === 'buy' && styles.txTypeBuy]}
                  onPress={() => setTxType('buy')}
                >
                  <Ionicons name="arrow-down" size={20} color={txType === 'buy' ? '#FFFFFF' : '#34C759'} />
                  <Text style={[styles.txTypeText, txType === 'buy' && styles.txTypeTextActive]}>Compra</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.txTypeButton, txType === 'sell' && styles.txTypeSell]}
                  onPress={() => setTxType('sell')}
                >
                  <Ionicons name="arrow-up" size={20} color={txType === 'sell' ? '#FFFFFF' : '#FF3B30'} />
                  <Text style={[styles.txTypeText, txType === 'sell' && styles.txTypeTextActive]}>Venta</Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles.inputLabel}>Ticker *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: AAPL"
                value={txTicker}
                onChangeText={setTxTicker}
                autoCapitalize="characters"
              />
              
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
                { backgroundColor: txType === 'buy' ? '#34C759' : '#FF3B30' }
              ]}
              onPress={addTransaction}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
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
                <Ionicons name="close" size={24} color="#1D1D1F" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              {(selectedHolding ? selectedHolding.transactions : allTransactions).map((tx) => (
                <View key={tx.id} style={styles.transactionCard}>
                  <View style={styles.transactionHeader}>
                    <View style={styles.transactionInfo}>
                      <View style={[
                        styles.txTypeBadge,
                        { backgroundColor: tx.transaction_type === 'buy' ? '#34C75915' : '#FF3B3015' }
                      ]}>
                        <Ionicons
                          name={tx.transaction_type === 'buy' ? 'arrow-down' : 'arrow-up'}
                          size={14}
                          color={tx.transaction_type === 'buy' ? '#34C759' : '#FF3B30'}
                        />
                        <Text style={[
                          styles.txTypeBadgeText,
                          { color: tx.transaction_type === 'buy' ? '#34C759' : '#FF3B30' }
                        ]}>
                          {tx.transaction_type === 'buy' ? 'Compra' : 'Venta'}
                        </Text>
                      </View>
                      {!selectedHolding && (
                        <Text style={styles.transactionTicker}>{tx.ticker}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteTransactionBtn}
                      onPress={() => deleteTransaction(tx.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                    </TouchableOpacity>
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
                <Ionicons name="close" size={24} color="#1D1D1F" />
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
                      { backgroundColor: a.type === 'buy' ? '#34C75915' : a.type === 'sell' ? '#FF3B3015' : '#FF950015' }
                    ]}>
                      <Ionicons
                        name={a.type === 'buy' ? 'arrow-down-circle' : a.type === 'sell' ? 'arrow-up-circle' : 'sync-circle'}
                        size={20}
                        color={a.type === 'buy' ? '#34C759' : a.type === 'sell' ? '#FF3B30' : '#FF9500'}
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
      {renderCashModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 8,
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#007AFF15',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#007AFF',
  },
  alertsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF9500',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  alertsButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF15',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  historyButtonText: {
    color: '#007AFF',
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
    color: '#1D1D1F',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6E6E73',
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
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
    color: '#007AFF',
  },
  companyName: {
    fontSize: 13,
    color: '#6E6E73',
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
    color: '#1D1D1F',
  },
  deleteButtonSmall: {
    padding: 8,
    backgroundColor: '#FF3B3010',
    borderRadius: 8,
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
    borderRadius: 12,
    gap: 4,
  },
  buyBadge: {
    backgroundColor: '#34C75915',
  },
  sellBadge: {
    backgroundColor: '#FF3B3015',
  },
  notifyBadge: {
    backgroundColor: '#FF950015',
  },
  targetText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notes: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 10,
    fontStyle: 'italic',
  },
  plBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
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
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6E6E73',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  viewTransactionsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 6,
  },
  viewTransactionsText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  sectorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sectorText: {
    fontSize: 10,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D1D1F',
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
    color: '#6E6E73',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D1D1F',
  },
  totalPLContainer: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  totalPLLabel: {
    fontSize: 12,
    color: '#6E6E73',
    marginBottom: 4,
  },
  totalPLValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  metricsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  metricsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1D1D1F',
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
    color: '#6E6E73',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  metricHint: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 2,
  },
  pieChartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
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
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  pieLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
    color: '#1D1D1F',
    marginBottom: 12,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D1D1F',
  },
  modalScroll: {
    padding: 20,
    maxHeight: 450,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F5F5F7',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1D1D1F',
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
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
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
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    gap: 8,
  },
  txTypeBuy: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  txTypeSell: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
  },
  txTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  txTypeTextActive: {
    color: '#FFFFFF',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6E6E73',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D1D1F',
  },
  transactionCard: {
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
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
    borderRadius: 8,
    gap: 4,
  },
  txTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  transactionTicker: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  deleteTransactionBtn: {
    padding: 8,
    backgroundColor: '#FF3B3015',
    borderRadius: 8,
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
    color: '#6E6E73',
  },
  transactionValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1D1D1F',
  },
  transactionTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  transactionTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  transactionTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1D1D1F',
  },
  transactionNotes: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginTop: 10,
  },
  emptyTransactions: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTransactionsText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  alertCard: {
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
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
    color: '#007AFF',
  },
  alertPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D1D1F',
  },
  alertCompany: {
    fontSize: 13,
    color: '#6E6E73',
    marginBottom: 12,
  },
  alertMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 10,
  },
  alertMessageText: {
    flex: 1,
    fontSize: 13,
    color: '#1D1D1F',
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
    borderRadius: 8,
  },
  cashCard: {
    borderRadius: 16,
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
    borderRadius: 16,
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
    borderTopWidth: 1,
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
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
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
    borderBottomWidth: 1,
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
    borderRadius: 12,
    borderWidth: 1,
  },
  cashTypeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  evolutionCard: {
    borderRadius: 16,
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
    borderRadius: 8,
    gap: 4,
  },
  evolutionChartContainer: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  // Cash modal improved styles
  cashModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
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
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
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
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  cashSubmitButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  cashSubmitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Gains section styles
  cashSection: {
    paddingBottom: 12,
    borderBottomWidth: 1,
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
    borderRadius: 12,
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
    borderTopWidth: 1,
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
});
