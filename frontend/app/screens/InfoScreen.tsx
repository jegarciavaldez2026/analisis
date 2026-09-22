import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export default function InfoScreen() {
  const { colors, isDark } = useTheme();
  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="information-circle" size={60} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>An\u00e1lisis Financiero</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Tu asistente para decisiones de inversi\u00f3n</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>\U0001f4ca \u00bfQu\u00e9 hace esta app?</Text>
        <Text style={[styles.sectionText, { color: colors.text, backgroundColor: colors.card }]}>
          Esta aplicaci\u00f3n analiza acciones que cotizan en bolsa utilizando m\u00e1s de 50 ratios financieros clave.
          Proporciona una recomendaci\u00f3n clara (Comprar, Mantener o Vender) basada en m\u00e9tricas fundamentales.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>\U0001f3af Categor\u00edas de An\u00e1lisis</Text>
        <View style={styles.categoryList}>
          <CategoryItem icon="trending-up" title="Rentabilidad" description="ROE, ROA, ROIC, M\u00e1rgenes" />
          <CategoryItem icon="water" title="Liquidez" description="Ratios corrientes, r\u00e1pidos y de efectivo" />
          <CategoryItem icon="shield-checkmark" title="Apalancamiento" description="Deuda/Capital, Ratio de deuda" />
          <CategoryItem icon="pricetag" title="Valoraci\u00f3n" description="P/E, EV/EBIT, Earning Yield" />
          <CategoryItem icon="cash" title="Flujo de Caja" description="FCF, M\u00e1rgenes de efectivo" />
          <CategoryItem icon="fitness" title="Salud Financiera" description="Altman Z-Score, Piotroski F-Score" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>\U0001f4c8 C\u00f3mo usar</Text>
        <View style={styles.stepsList}>
          <StepItem number="1" text="Ingresa el ticker de una acci\u00f3n (ej: AAPL, MSFT, GOOGL)" />
          <StepItem number="2" text="La app extrae datos financieros usando Yahoo Finance" />
          <StepItem number="3" text="Se calculan autom\u00e1ticamente todos los ratios" />
          <StepItem number="4" text="Recibe una recomendaci\u00f3n basada en el an\u00e1lisis" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>\u2705 Interpretaci\u00f3n</Text>
        <View style={styles.interpretationList}>
          <InterpretationItem color="#34C759" label="COMPRAR" description="\u226560% m\u00e9tricas favorables" />
          <InterpretationItem color="#FF9500" label="MANTENER" description="40-60% m\u00e9tricas favorables" />
          <InterpretationItem color="#FF3B30" label="VENDER" description="<40% m\u00e9tricas favorables" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>\u26a0\ufe0f Advertencia</Text>
        <Text style={[styles.warningText, { color: colors.text, backgroundColor: isDark ? '#3D3000' : '#FFF3CD', borderLeftColor: colors.warning }]}>
          Esta aplicaci\u00f3n proporciona an\u00e1lisis automatizado basado en ratios financieros hist\u00f3ricos.
          No constituye asesoramiento financiero. Siempre consulta con un profesional antes de tomar
          decisiones de inversi\u00f3n.
        </Text>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>Powered by Yahoo Finance</Text>
        <Text style={[styles.versionText, { color: colors.textSecondary }]}>Versi\u00f3n 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

function CategoryItem({ icon, title, description }: { icon: any; title: string; description: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.categoryItem, { backgroundColor: colors.card }]}>
      <View style={[styles.categoryIcon, { backgroundColor: colors.primary + '25' }]}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <View style={styles.categoryContent}>
        <Text style={[styles.categoryTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.categoryDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
    </View>
  );
}

function StepItem({ number, text }: { number: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stepItem, { backgroundColor: colors.card }]}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={[styles.stepText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function InterpretationItem({ color, label, description }: { color: string; label: string; description: string }) {
  const { colors } = useTheme();
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
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 32, paddingTop: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginTop: 12 },
  subtitle: { fontSize: 16, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  sectionText: { fontSize: 15, lineHeight: 22, padding: 16, borderRadius: 12 },
  categoryList: { gap: 12 },
  categoryItem: { flexDirection: 'row', padding: 16, borderRadius: 12, alignItems: 'center' },
  categoryIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  categoryContent: { flex: 1 },
  categoryTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  categoryDescription: { fontSize: 13 },
  stepsList: { gap: 12 },
  stepItem: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderRadius: 12 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  stepNumberText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20, paddingTop: 4 },
  interpretationList: { gap: 12 },
  interpretationItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12 },
  interpretationBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 12, minWidth: 90, alignItems: 'center' },
  interpretationLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  interpretationDescription: { flex: 1, fontSize: 14 },
  warningText: { fontSize: 14, lineHeight: 20, padding: 16, borderRadius: 12, borderLeftWidth: 4 },
  footer: { alignItems: 'center', marginTop: 24, paddingTop: 24, borderTopWidth: 1 },
  footerText: { fontSize: 14, marginBottom: 4 },
  versionText: { fontSize: 12 },
});
