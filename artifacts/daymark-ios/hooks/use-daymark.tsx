import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type Priority = 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  title: string;
  due: 'Today' | 'Tomorrow' | 'This week';
  priority: Priority;
  recurrence: Recurrence;
  completed: boolean;
  completedDates: string[];
  currentStreak: number;
  longestStreak: number;
};

export type Expense = { id: string; label: string; amount: number; category: string; date: string };
export type Food = { id: string; label: string; calories: number; protein: number; carbs: number; fat: number; fibre: number; date: string; time: string };
export type FoodDatabaseEntry = Omit<Food, 'id' | 'date' | 'time'> & { quantity: number; unit: 'piece' | 'g' | 'ml' };
export type WeightEntry = { id: string; weight: number; date: string };
export type Goals = { calories: number; protein: number; carbs: number; fat: number; fibre: number; dailySpend: number };
export type LifeData = { tasks: Task[]; expenses: Expense[]; foods: Food[]; foodDatabase: FoodDatabaseEntry[]; weightEntries: WeightEntry[]; goals: Goals; categories: string[] };

const key = '@daymark/data-v1';
const localDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ago = (days: number) => localDate(new Date(Date.now() - days * 86400000));
const streak = (dates: string[]) => {
  let count = 0;
  const set = new Set(dates);
  const cursor = new Date();
  while (set.has(localDate(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
};

const seed: LifeData = {
  tasks: [
    { id: 'walk', title: 'Morning walk', due: 'Today', priority: 'low', recurrence: 'daily', completed: true, completedDates: [localDate(), ago(1)], currentStreak: 2, longestStreak: 5 },
    { id: 'budget', title: 'Review monthly budget', due: 'Today', priority: 'high', recurrence: 'none', completed: false, completedDates: [], currentStreak: 0, longestStreak: 0 },
    { id: 'mum', title: 'Call Mum', due: 'Today', priority: 'medium', recurrence: 'weekly', completed: false, completedDates: [ago(7)], currentStreak: 0, longestStreak: 2 },
    { id: 'dry-cleaning', title: 'Pick up dry cleaning', due: 'Today', priority: 'low', recurrence: 'none', completed: false, completedDates: [], currentStreak: 0, longestStreak: 0 },
    { id: 'water', title: 'Water the plants', due: 'Tomorrow', priority: 'low', recurrence: 'weekly', completed: false, completedDates: [ago(7), ago(14)], currentStreak: 0, longestStreak: 3 },
  ],
  expenses: [
    { id: 'groceries', label: 'Groceries', amount: 36.45, category: 'Food', date: localDate() },
    { id: 'train', label: 'Train to city', amount: 8.6, category: 'Transport', date: localDate() },
    { id: 'coffee', label: 'Coffee with Sam', amount: 4.8, category: 'Social', date: ago(1) },
  ],
  foods: [
    { id: 'breakfast', label: 'Greek yoghurt & berries', calories: 320, protein: 22, carbs: 35, fat: 9, fibre: 7, date: localDate(), time: '08:15' },
    { id: 'lunch', label: 'Paneer bowl', calories: 370, protein: 8, carbs: 40, fat: 13, fibre: 8, date: localDate(), time: '12:45' },
  ],
  foodDatabase: [
    { label: 'Roti', calories: 120, protein: 3, carbs: 18, fat: 4, fibre: 3, quantity: 1, unit: 'piece' },
    { label: 'Paneer', calories: 265, protein: 18, carbs: 6, fat: 20, fibre: 0, quantity: 100, unit: 'g' },
    { label: 'Greek yoghurt', calories: 130, protein: 12, carbs: 5, fat: 5, fibre: 0, quantity: 100, unit: 'g' },
  ],
  weightEntries: [{ id: 'w1', weight: 69.4, date: ago(14) }, { id: 'w2', weight: 69.1, date: ago(7) }, { id: 'w3', weight: 68.7, date: localDate() }],
  goals: { calories: 2100, protein: 120, carbs: 250, fat: 70, fibre: 30, dailySpend: 60 },
  categories: ['Food', 'Transport', 'Home', 'Health', 'Social', 'Miscellaneous'],
};

type Store = {
  data: LifeData;
  ready: boolean;
  toggleTask: (id: string) => void;
  addTask: (task: Omit<Task, 'id' | 'completed' | 'completedDates' | 'currentStreak' | 'longestStreak'>) => void;
  deleteTask: (id: string) => void;
  addExpense: (expense: Omit<Expense, 'id' | 'date'>) => void;
  addFood: (food: Omit<Food, 'id' | 'date' | 'time'>) => void;
  addWeight: (weight: number, date?: string) => void;
  updateGoals: (goals: Partial<Goals>) => void;
  reset: () => void;
};
const Context = createContext<Store | null>(null);

export function DaymarkProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LifeData>(seed);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(key).then((value) => {
      if (value) {
        try { setData({ ...seed, ...JSON.parse(value) }); } catch { /* use seed when storage is malformed */ }
      }
      setReady(true);
    });
  }, []);
  useEffect(() => { if (ready) AsyncStorage.setItem(key, JSON.stringify(data)); }, [data, ready]);
  const actions = useMemo<Store>(() => ({
    data, ready,
    toggleTask: (id) => setData((current) => {
      const date = localDate();
      return { ...current, tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;
        const completed = !task.completed;
        const completedDates = completed ? Array.from(new Set([...task.completedDates, date])) : task.completedDates.filter((item) => item !== date);
        const currentStreak = streak(completedDates);
        return { ...task, completed, completedDates, currentStreak, longestStreak: Math.max(task.longestStreak, currentStreak) };
      }) };
    }),
    addTask: (task) => setData((current) => ({ ...current, tasks: [...current.tasks, { ...task, id: uid(), completed: false, completedDates: [], currentStreak: 0, longestStreak: 0 }] })),
    deleteTask: (id) => setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) })),
    addExpense: (expense) => setData((current) => ({ ...current, expenses: [{ ...expense, id: uid(), date: localDate() }, ...current.expenses] })),
    addFood: (food) => setData((current) => ({ ...current, foods: [{ ...food, id: uid(), date: localDate(), time: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date()) }, ...current.foods] })),
    addWeight: (weight, date = localDate()) => setData((current) => ({ ...current, weightEntries: [...current.weightEntries, { id: uid(), weight, date }].sort((a, b) => a.date.localeCompare(b.date)) })),
    updateGoals: (goals) => setData((current) => ({ ...current, goals: { ...current.goals, ...goals } })),
    reset: () => setData(seed),
  }), [data, ready]);
  return <Context.Provider value={actions}>{children}</Context.Provider>;
}

export function useDaymark() {
  const value = useContext(Context);
  if (!value) throw new Error('useDaymark must be used inside DaymarkProvider');
  return value;
}

export const today = localDate();