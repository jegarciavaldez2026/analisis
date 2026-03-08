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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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

interface PortfolioHolding {
  ticker: string;
  company_name: string;
  total_shares: number;
  average_cost: number;
  total_invested: number;
  current_price: number;
  current_value: number;
  profit_loss: number;
  profit_loss_percent: number;
}

interface PortfolioSummary {
  total_invested: number;
  current_value: number;
  total_profit_loss: number;
  total_profit_loss_percent: number;
  holdings: PortfolioHolding[];
}

interface AlertInfo {
  ticker: string;
  company_name: string;
  current_price: number;
  alerts: { type: string; message: string }[];
}

export default function AccountScreen() {
  const [activeTab, setActiveTab] = useState<'watchlist' | 'portfolio'>('watchlist');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<AlertInfo[]>([]);
  
  // Modal states
  const [showAddWatchlist, setShowAddWatchlist] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  
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
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      if (activeTab === 'watchlist') {
        const response = await axios.get(`${BACKEND_URL}/api/watchlist`);
        setWatchlist(response.data);
        // Check alerts
        const alertsResponse = await axios.get(`${BACKEND_URL}/api/watchlist/alerts`);
        if (alertsResponse.data.alerts && alertsResponse.data.alerts.length > 0) {
          setAlerts(alertsResponse.data.alerts);
        }
      } else {
        const response = await axios.get(`${BACKEND_URL}/api/portfolio`);
        setPortfolio(response.data);
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
        transaction_date: new Date().toISOString(),
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
  };

  const renderWatchlistItem = (item: WatchlistItem) => (
    <View key={item.id} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.tickerContainer}>
          <Text style={styles.ticker}>{item.ticker}</Text>
          <Text style={styles.companyName} numberOfLines={1}>{item.company_name}</Text>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.currentPrice}>
            ${item.current_price?.toFixed(2) || '---'}
          </Text>
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
      
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => removeFromWatchlist(item.id, item.ticker)}
      >
        <Ionicons name="trash-outline" size={18} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  const renderPortfolioHolding = (holding: PortfolioHolding) => (
    <View key={holding.ticker} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.tickerContainer}>
          <Text style={styles.ticker}>{holding.ticker}</Text>
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
          <Text style={styles.detailLabel}>G/P:</Text>
          <Text style={[
            styles.detailValue,
            { color: holding.profit_loss >= 0 ? '#34C759' : '#FF3B30' }
          ]}>
            {holding.profit_loss >= 0 ? '+' : ''}${holding.profit_loss.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
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
                  {/* Portfolio Summary */}
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Resumen del Portafolio</Text>
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>Invertido</Text>
                        <Text style={styles.summaryValue}>
                          ${portfolio.total_invested.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.summaryItem}>
                        <Text style={styles.summaryLabel}>Valor Actual</Text>
                        <Text style={styles.summaryValue}>
                          ${portfolio.current_value.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                    <View style={[
                      styles.totalPLContainer,
                      { backgroundColor: portfolio.total_profit_loss >= 0 ? '#34C75915' : '#FF3B3015' }
                    ]}>
                      <Text style={styles.totalPLLabel}>Ganancia/Pérdida Total</Text>
                      <Text style={[
                        styles.totalPLValue,
                        { color: portfolio.total_profit_loss >= 0 ? '#34C759' : '#FF3B30' }
                      ]}>
                        {portfolio.total_profit_loss >= 0 ? '+' : ''}${portfolio.total_profit_loss.toFixed(2)}
                        ({portfolio.total_profit_loss_percent >= 0 ? '+' : ''}{portfolio.total_profit_loss_percent.toFixed(2)}%)
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={styles.sectionTitle}>Posiciones</Text>
                  {portfolio.holdings.map(renderPortfolioHolding)}
                </>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="briefcase-outline" size={60} color="#C7C7CC" />
                  <Text style={styles.emptyTitle}>Portafolio vacío</Text>
                  <Text style={styles.emptySubtitle}>
                    Registra tus compras para llevar control
                  </Text>
                </View>
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
    position: 'relative',
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
  priceContainer: {
    alignItems: 'flex-end',
  },
  currentPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D1D1F',
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
  deleteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
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
    maxHeight: '85%',
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
    maxHeight: 400,
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
});
