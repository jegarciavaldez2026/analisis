import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export default function InfoScreen() {
  const { isDark, toggleTheme, colors } = useTheme();

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      contentContainerStyle={styles.content}
    >
      {/* Dark Mode Toggle */}
      <View style={[styles.settingsCard, { backgroundColor: colors.card }]}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={24} color={colors.primary} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Modo Oscuro</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: '#E0E0E0', true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <View style={styles.header}>
        <Ionicons name="information-circle" size={60} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>Análisis Financiero</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Tu asistente para decisiones de inversión</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>📊 ¿Qué hace esta app?</Text>
        <Text style={[styles.sectionText, { backgroundColor: colors.card, color: colors.text }]}>
          Esta aplicación analiza acciones que cotizan en bolsa utilizando más de 50 ratios financieros clave.
          Proporciona una recomendación clara (Comprar, Mantener o Vender) basada en métricas fundamentales.
          Incluye un asistente de IA para interpretar los resultados.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>🎯 Categorías de Análisis</Text>
        <View style={styles.categoryList}>
          <CategoryItem icon="trending-up" title="Rentabilidad" description="ROE, ROA, ROIC, Márgenes" colors={colors} />
          <CategoryItem icon="water" title="Liquidez" description="Ratios corrientes, rápidos y de efectivo" colors={colors} />
          <CategoryItem icon="shield-checkmark" title="Apalancamiento" description="Deuda/Capital, Ratio de deuda" colors={colors} />
          <CategoryItem icon="pricetag" title="Valoración" description="P/E, EV/EBIT, DCF, Graham" colors={colors} />
          <CategoryItem icon="cash" title="Flujo de Caja" description="FCF, Márgenes de efectivo" colors={colors} />
          <CategoryItem icon="fitness" title="Salud Financiera" description="Altman Z-Score, Piotroski F-Score" colors={colors} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>🤖 Asistente IA</Text>
        <Text style={[styles.sectionText, { backgroundColor: colors.card, color: colors.text }]}>
          Después de analizar una acción, puedes usar el asistente de IA para:
          {'\n'}• Obtener una valoración detallada de las métricas
          {'\n'}• Hacer preguntas sobre la acción
          {'\n'}• Recibir recomendaciones personalizadas
          {'\n'}• Entender el nivel de riesgo
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>📈 Cómo usar</Text>
        <View style={styles.stepsList}>
          <StepItem number="1" text="Ingresa el ticker de una acción (ej: AAPL, MSFT, GOOGL)" colors={colors} />
          <StepItem number="2" text="La app extrae datos financieros usando Yahoo Finance" colors={colors} />
          <StepItem number="3" text="Se calculan automáticamente todos los ratios" colors={colors} />
          <StepItem number="4" text="Usa el asistente IA para interpretar los resultados" colors={colors} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>✅ Interpretación</Text>
        <View style={styles.interpretationList}>
          <InterpretationItem color={colors.success} label="COMPRAR" description="≥60% métricas favorables" colors={colors} />
          <InterpretationItem color={colors.warning} label="MANTENER" description="40-60% métricas favorables" colors={colors} />
          <InterpretationItem color={colors.danger} label="VENDER" description="<40% métricas favorables" colors={colors} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>⚠️ Advertencia</Text>
        <Text style={[styles.warningText, { backgroundColor: isDark ? '#3D2E00' : '#FFF3CD' }]}>
          Esta aplicación proporciona análisis automatizado basado en ratios financieros históricos.
          No constituye asesoramiento financiero. Siempre consulta con un profesional antes de tomar
          decisiones de inversión.
        </Text>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>Powered by Yahoo Finance</Text>
        <Text style={[styles.versionText, { color: colors.textSecondary }]}>Versión 2.0.0</Text>
      </View>
    </ScrollView>
  );
}

function CategoryItem({ icon, title, description, colors }: { icon: any; title: string; description: string; colors: any }) {
  return (
    <View style={[styles.categoryItem, { backgroundColor: colors.card }]}>
      <View style={[styles.categoryIcon, { backgroundColor: colors.primary + '15' }]}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.categoryContent}>
        <Text style={[styles.categoryTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
    </View>
  );
}

function StepItem({ number, text, colors }: { number: string; text: string; colors: any }) {
  return (
    <View style={[styles.stepItem, { backgroundColor: colors.card }]}>
      <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={[styles.stepText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function InterpretationItem({ color, label, description, colors }: { color: string; label: string; description: string; colors: any }) {
  return (
    <View style={[styles.interpretationItem, { backgroundColor: colors.card }]}>
      <View style={[styles.interpretationBadge, { backgroundColor: color }]}>
        <Text style={styles.interpretationLabel}>{label}</Text>
      </View>
      <Text style={[styles.interpretationDescription, { color: colors.textSecondary }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  settingsCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 15,
    lineHeight: 22,
    padding: 16,
    borderRadius: 12,
  },
  categoryList: {
    gap: 12,
  },
  categoryItem: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryContent: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  categoryDescription: {
    fontSize: 13,
  },
  stepsList: {
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 4,
  },
  interpretationList: {
    gap: 12,
  },
  interpretationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  interpretationBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 12,
    minWidth: 90,
    alignItems: 'center',
  },
  interpretationLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  interpretationDescription: {
    flex: 1,
    fontSize: 14,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 14,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
  },
});
