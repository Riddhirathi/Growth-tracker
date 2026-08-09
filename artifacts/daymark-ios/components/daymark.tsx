import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type { FoodDatabaseEntry, Goals, Priority, Recurrence, Task } from '@/hooks/use-daymark';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const body = <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: topInset }]}>{children}</View>;
  return scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{body}</ScrollView> : body;
}

export function Header({ eyebrow = 'A LITTLE MORE PRESENT', title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  const colors = useColors();
  return <View style={styles.header}><View style={styles.headerTop}><View style={styles.brand}><View style={[styles.mark, { backgroundColor: colors.primary }]}><Feather name="sunrise" size={16} color={colors.primaryForeground} /></View><Text style={[styles.brandText, { color: colors.foreground }]}>Daymark</Text></View>{action}</View><Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{eyebrow}</Text><Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>{subtitle && <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}
export function SectionTitle({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  const colors = useColors();
  return <View style={styles.sectionHead}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>{note && <Text style={[styles.note, { color: colors.mutedForeground }]}>{note}</Text>}</View>{action}</View>;
}
export function PrimaryButton({ label, icon = 'plus', onPress }: { label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? .82 : 1 }]}><Feather name={icon} size={16} color={colors.primaryForeground} /><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{label}</Text></Pressable>;
}
export function Progress({ value, goal, color }: { value: number; goal: number; color?: string }) {
  const colors = useColors();
  return <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}><View style={[styles.progressFill, { width: `${Math.min(100, goal ? value / goal * 100 : 0)}%`, backgroundColor: color ?? colors.accent }]} /></View>;
}
export function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete?: () => void }) {
  const colors = useColors();
  return <View style={[styles.taskRow, { borderBottomColor: colors.border }]}><Pressable onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onToggle(); }} style={[styles.check, { borderColor: task.completed ? colors.primary : colors.border, backgroundColor: task.completed ? colors.primary : 'transparent' }]}>{task.completed && <Feather name="check" size={13} color={colors.primaryForeground} />}</Pressable><View style={styles.taskCopy}><Text style={[styles.taskText, { color: colors.foreground, textDecorationLine: task.completed ? 'line-through' : 'none' }]}>{task.title}</Text><Text style={[styles.note, { color: colors.mutedForeground }]}>{task.due} · {task.recurrence === 'none' ? 'One-time' : task.recurrence[0].toUpperCase() + task.recurrence.slice(1)}{task.currentStreak ? ` · ${task.currentStreak} day streak` : ''}</Text></View><View style={[styles.priority, { backgroundColor: task.priority === 'high' ? colors.destructive : task.priority === 'medium' ? colors.primary : colors.secondaryForeground }]} />{onDelete && <Pressable onPress={onDelete} hitSlop={12}><Feather name="trash-2" size={15} color={colors.mutedForeground} /></Pressable>}</View>;
}
export function Empty({ icon = 'inbox', title, body }: { icon?: keyof typeof Feather.glyphMap; title: string; body: string }) {
  const colors = useColors();
  return <View style={styles.empty}><Feather name={icon} size={28} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.note, { color: colors.mutedForeground }]}>{body}</Text></View>;
}

type SheetKind = 'task' | 'expense' | 'food' | 'weight' | 'goals';
type AddSheetProps = { kind: SheetKind | null; onClose: () => void; addTask: (value: Omit<Task, 'id' | 'completed' | 'completedDates' | 'currentStreak' | 'longestStreak'>) => void; addExpense: (value: { label: string; amount: number; category: string }) => void; addFood: (value: { label: string; calories: number; protein: number; carbs: number; fat: number; fibre: number }) => void; addWeight: (value: number, date?: string) => void; updateGoals: (value: Partial<Goals>) => void; goals: Goals; foodDatabase: FoodDatabaseEntry[] };
export function AddSheet({ kind, onClose, addTask, addExpense, addFood, addWeight, updateGoals, goals, foodDatabase }: AddSheetProps) {
  const colors = useColors();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => { if (kind) setValues(kind === 'goals' ? Object.fromEntries(Object.entries(goals).map(([key, value]) => [key, String(value)])) : {}); }, [kind]);
  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  const match = useMemo(() => foodDatabase.find((item) => item.label.toLowerCase() === values.label?.trim().toLowerCase()), [foodDatabase, values.label]);
  useEffect(() => { if (match) setValues((current) => ({ ...current, calories: String(match.calories), protein: String(match.protein), carbs: String(match.carbs), fat: String(match.fat), fibre: String(match.fibre) })); }, [match]);
  if (!kind) return null;
  const field = (name: string, placeholder: string, numeric = false) => <TextInput value={values[name] ?? ''} onChangeText={(value) => set(name, value)} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} keyboardType={numeric ? 'decimal-pad' : 'default'} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />;
  const submit = () => {
    if (kind === 'task' && values.title?.trim()) addTask({ title: values.title.trim(), due: (values.due as Task['due']) || 'Today', priority: (values.priority as Priority) || 'medium', recurrence: (values.recurrence as Recurrence) || 'none' });
    if (kind === 'expense' && values.label?.trim() && values.amount) addExpense({ label: values.label.trim(), amount: Number(values.amount), category: values.category || 'Miscellaneous' });
    if (kind === 'food' && values.label?.trim() && values.calories) addFood({ label: values.label.trim(), calories: Number(values.calories), protein: Number(values.protein || 0), carbs: Number(values.carbs || 0), fat: Number(values.fat || 0), fibre: Number(values.fibre || 0) });
    if (kind === 'weight' && values.weight) addWeight(Number(values.weight), values.date);
    if (kind === 'goals') updateGoals(Object.fromEntries(Object.entries(goals).map(([key]) => [key, Number(values[key] || goals[key as keyof Goals])])) as Partial<Goals>);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onClose();
  };
  const labels: Record<SheetKind, string> = { task: 'Add a task', expense: 'Log an expense', food: 'Add food', weight: 'Log weight', goals: 'Nutrition goals' };
  return <Modal visible animationType="slide" transparent onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.card }]}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>{labels[kind]}</Text><Text style={[styles.note, { color: colors.mutedForeground }]}>Keep it simple. You can add detail later.</Text></View><Pressable onPress={onClose} hitSlop={12}><Feather name="x" size={20} color={colors.mutedForeground} /></Pressable></View><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
    {kind === 'task' && <><Text style={[styles.label, { color: colors.foreground }]}>What needs doing?</Text>{field('title', 'Water the plants')}<Text style={[styles.label, { color: colors.foreground }]}>When</Text>{field('due', 'Today · Tomorrow · This week')}<Text style={[styles.label, { color: colors.foreground }]}>Repeat</Text>{field('recurrence', 'none · daily · weekly · monthly')}</>}
    {kind === 'expense' && <><Text style={[styles.label, { color: colors.foreground }]}>What was it?</Text>{field('label', 'Friday lunch')}<Text style={[styles.label, { color: colors.foreground }]}>Amount</Text>{field('amount', '0.00', true)}<Text style={[styles.label, { color: colors.foreground }]}>Category</Text>{field('category', 'Food, Home, Social...')}</>}
    {kind === 'food' && <><Text style={[styles.label, { color: colors.foreground }]}>Food or quantity</Text>{field('label', 'Try “2 roti” or “Paneer”')}<Text style={[styles.label, { color: colors.foreground }]}>Calories (kcal)</Text>{field('calories', match ? String(match.calories) : '0', true)}<View style={styles.twoFields}><View style={styles.half}><Text style={[styles.label, { color: colors.foreground }]}>Protein</Text>{field('protein', '0 g', true)}</View><View style={styles.half}><Text style={[styles.label, { color: colors.foreground }]}>Fibre</Text>{field('fibre', '0 g', true)}</View></View></>}
    {kind === 'weight' && <><Text style={[styles.label, { color: colors.foreground }]}>Weight (kg)</Text>{field('weight', '68.4', true)}<Text style={[styles.label, { color: colors.foreground }]}>Date (YYYY-MM-DD)</Text>{field('date', new Date().toISOString().slice(0, 10))}</>}
    {kind === 'goals' && <><Text style={[styles.label, { color: colors.foreground }]}>Daily calories</Text>{field('calories', String(goals.calories), true)}<View style={styles.twoFields}><View style={styles.half}><Text style={[styles.label, { color: colors.foreground }]}>Protein (g)</Text>{field('protein', String(goals.protein), true)}</View><View style={styles.half}><Text style={[styles.label, { color: colors.foreground }]}>Fibre (g)</Text>{field('fibre', String(goals.fibre), true)}</View></View><Text style={[styles.label, { color: colors.foreground }]}>Daily spending guide</Text>{field('dailySpend', String(goals.dailySpend), true)}</>}
    <PrimaryButton label="Save entry" icon="check" onPress={submit} />
  </ScrollView></View></KeyboardAvoidingView></Modal>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18 },
  scroll: { paddingBottom: 112 },
  header: { paddingTop: 10, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 19, fontWeight: '700', letterSpacing: -.5 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.7, marginBottom: 7 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -1, lineHeight: 35 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 18, padding: 17, marginBottom: 14 },
  cardTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -.4 },
  progressRing: { width: 66, height: 66, borderRadius: 33, borderWidth: 8, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: 15, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  note: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  primary: { borderRadius: 12, minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 7, borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 8 },
  taskRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  taskCopy: { flex: 1, paddingVertical: 10 },
  taskText: { fontSize: 14, fontWeight: '600' },
  priority: { width: 7, height: 7, borderRadius: 4 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metric: { width: '47%', padding: 13, borderRadius: 12 },
  metricLabel: { fontSize: 10, fontWeight: '700', letterSpacing: .8, textTransform: 'uppercase' },
  metricValue: { fontSize: 24, fontWeight: '700', marginTop: 8 },
  metricSub: { fontSize: 11, marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: 9 },
  quickButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 7 },
  quickText: { fontSize: 11, fontWeight: '700' },
  spend: { fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1 },
  weight: { fontSize: 31, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 7 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 3 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(41,33,59,.28)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: Platform.OS === 'web' ? 34 : 24 },
  sheetHandle: { width: 42, height: 4, borderRadius: 4, backgroundColor: '#dfd1c4', alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  sheetTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -.5 },
  form: { paddingBottom: 8, gap: 9 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 },
  twoFields: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  headerAction: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11 },
  tabs: { flexDirection: 'row', backgroundColor: '#e9dfd4', borderRadius: 10, padding: 3, marginBottom: 18 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8 },
  streakRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#dfd1c4' },
  streakNumber: { fontSize: 20, fontWeight: '700' },
  nutritionTotal: { fontSize: 35, fontWeight: '700', letterSpacing: -1 },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1 },
  foodIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#dfd1c4' },
  switch: { width: 47, height: 28, borderRadius: 16, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 22, height: 22, borderRadius: 11 },
  resetButton: { borderWidth: 1, borderRadius: 11, paddingVertical: 12, alignItems: 'center', marginTop: 17 },
});