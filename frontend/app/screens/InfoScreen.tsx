import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export default function InfoScreen() {
  const { colors, isDark } = useTheme();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="information-circle" size={60} color="#007AFF" />
        <Text style={styles.title}>Análisis Financiero</Text>
        <Text style={styles.subtitle}>Tu asistente para decisiones de inversión</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 ¿Qué hace esta app?</Text>
        <Text style={styles.sectionText}>
          Esta aplicación analiza acciones que cotizan en bolsa utilizando más de 25 ratios financieros clave.
          Proporciona una recomendación clara (Comprar, Mantener o Vender) basada en métricas fundamentales.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎯 Categorías de Análisis</Text>
        <View style={styles.categoryList}>
          <CategoryItem icon="trending-up" title="Rentabilidad" description="ROE, ROA, ROIC, Márgenes" />
          <CategoryItem icon="water" title="Liquidez" description="Ratios corrientes, rápidos y de efectivo" />
          <CategoryItem icon="shield-checkmark" title="Apalancamiento" description="Deuda/Capital, Ratio de deuda" />
          <CategoryItem icon="pricetag" title="Valoración" description="P/E, EV/EBIT, Earning Yield" />
          <CategoryItem icon="cash" title="Flujo de Caja" description="FCF, Márgenes de efectivo" />
          <CategoryItem icon="fitness" title="Salud Financiera" description="Altman Z-Score, Piotroski F-Score" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📈 Cómo usar</Text>
        <View style={styles.stepsList}>
          <StepItem number="1" text="Ingresa el ticker de una acción (ej: AAPL, MSFT, GOOGL)" />
          <StepItem number="2" text="La app extrae datos financieros usando Yahoo Finance" />
          <StepItem number="3" text="Se calculan automáticamente todos los ratios" />
          <StepItem number="4" text="Recibe una recomendación basada en el análisis" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✅ Interpretación</Text>
        <View style={styles.interpretationList}>
          <InterpretationItem color="#34C759" label="COMPRAR" description="≥60% métricas favorables" />
          <InterpretationItem color="#FF9500" label="MANTENER" description="40-60% métricas favorables" />
          <InterpretationItem color="#FF3B30" label="VENDER" description="<40% métricas favorables" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚠️ Advertencia</Text>
        <Text style={styles.warningText}>
          Esta aplicación proporciona análisis automatizado basado en ratios financieros históricos.
          No constituye asesoramiento financiero. Siempre consulta con un profesional antes de tomar
          decisiones de inversión.
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by Yahoo Finance</Text>
        <Text style={styles.versionText}>Versión 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

function CategoryItem({ icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <View style={styles.categoryItem}>
      <View style={styles.categoryIcon}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.categoryContent}>
        <Text style={styles.categoryTitle}>{title}</Text>
        <Text style={styles.categoryDescription}>{description}</Text>
      </View>
    </View>
  );
}

function StepItem({ number, text }: { number: string; text: string }) {
  return (
    <View style={styles.stepItem}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function InterpretationItem({ color, label, description }: { color: string; label: string; description: string }) {
  return (
    <View style={styles.interpretationItem}>
      <View style={[styles.interpretationBadge, { backgroundColor: color }]}>
        <Text style={styles.interpretationLabel}>{label}</Text>
      </View>
      <Text style={styles.interpretationDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
  },
  categoryList: {
    gap: 12,
  },
  categoryItem: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + '25',
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
    color: colors.text,
    marginBottom: 2,
  },
  categoryDescription: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  stepsList: {
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
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
    color: colors.text,
    lineHeight: 20,
    paddingTop: 4,
  },
  interpretationList: {
    gap: 12,
  },
  interpretationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
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
    color: colors.textSecondary,
  },
  warningText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    backgroundColor: isDark ? '#3D3000' : '#FFF3CD',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
