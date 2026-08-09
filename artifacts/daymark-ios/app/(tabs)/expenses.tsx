import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AddSheet, Card, Header, Progress, Screen, SectionTitle, styles } from '@/components/daymark';
import { useColors } from '@/hooks/useColors';
import { useDaymark } from '@/hooks/use-daymark';

export default function ExpensesScreen() {
  const colors = useColors();
  const { data, addTask, addExpense, addFood, addWeight, updateGoals } = useDaymark();
  const [sheet, setSheet] = useState<'task' | 'expense' | 'food' | 'weight' | 'goals' | null>(null);
  const [query, setQuery] = useState('');
  const expenses = useMemo(() => data.expenses.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [data.expenses, query]);
  const total = data.expenses.reduce((sum, item) => sum + item.amount, 0);
  const categories = data.categories.map((category) => ({ category, value: data.expenses.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0) })).filter((item) => item.value > 0);
  return <Screen><Header title="Expenses" subtitle="See where your money is going, without making it a moral issue." action={<Pressable onPress={() => setSheet('expense')} style={[styles.headerAction, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>+ Add</Text></Pressable>} /><Card><TextInput value={query} onChangeText={setQuery} placeholder="Search expenses" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border, marginBottom: 15 }]} /><SectionTitle title="Recent entries" note={`${expenses.length} entries`} />{expenses.map((expense) => <View key={expense.id} style={[styles.line, { borderBottomColor: colors.border }]}><View><Text style={[styles.taskText, { color: colors.foreground }]}>{expense.label}</Text><Text style={[styles.note, { color: colors.mutedForeground }]}>{expense.category} · {expense.date}</Text></View><Text style={[styles.taskText, { color: colors.foreground }]}>${expense.amount.toFixed(2)}</Text></View>)}</Card><Card><SectionTitle title="This ledger" note="All recorded spending" /><Text style={[styles.spend, { color: colors.foreground }]}>${total.toFixed(2)}</Text><View style={{ marginTop: 17, gap: 12 }}>{categories.map((item) => <View key={item.category}><View style={styles.line}><Text style={[styles.note, { color: colors.foreground }]}>{item.category}</Text><Text style={[styles.note, { color: colors.foreground }]}>${item.value.toFixed(2)}</Text></View><Progress value={item.value} goal={total} /></View>)}</View></Card><AddSheet kind={sheet} onClose={() => setSheet(null)} addTask={addTask} addExpense={addExpense} addFood={addFood} addWeight={addWeight} updateGoals={updateGoals} goals={data.goals} foodDatabase={data.foodDatabase} /></Screen>;
}