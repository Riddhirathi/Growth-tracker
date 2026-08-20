import { useEffect, useRef, useState } from 'react';
import { pullFromSheets, pushToSheets, SheetsSyncError, type SheetsConfig, type SheetsSnapshot } from '@/lib/sheetsClient';

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type Task = {
  id: string;
  title: string;
  notes?: string;
  due: 'Today' | 'Tomorrow' | 'This week';
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  recurrence: Recurrence;
  recurrenceValue?: number;
  completedDates: string[];
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
};
export type Expense = { id: string; label: string; category: string; amount: number; date: string };
export type Food = { id: string; label: string; calories: number; protein: number; carbs: number; fat: number; fibre: number; time: string; date: string };
export type FoodDatabaseEntry = Omit<Food, 'id' | 'time' | 'date'> & { quantity: number; unit: 'g' | 'ml' | 'piece' };
export type WeightEntry = { id: string; date: string; weight: number };
export type Goals = { calories: number; protein: number; carbs: number; fat: number; fibre: number; dailySpend: number };
export type LifeData = {
  tasks: Task[];
  expenses: Expense[];
  foods: Food[];
  foodDatabase: FoodDatabaseEntry[];
  weight: number;
  weightEntries: WeightEntry[];
  habits: { name: string; days: number; color: string }[];
  categories: string[];
  goals: Goals;
};

export const dateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const today = dateKey();

const initialData: LifeData = {
  tasks: [],
  expenses: [],
  foods: [],
  foodDatabase: [],
  weight: 0,
  weightEntries: [],
  habits: [],
  categories: ['Food', 'Shopping', 'Rent', 'Fuel', 'Entertainment', 'Bills', 'Health', 'Travel', 'Miscellaneous'],
  goals: { calories: 2100, protein: 120, carbs: 250, fat: 70, fibre: 30, dailySpend: 60 },
};

function normalizeTask(task: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  const completed = Boolean(task.completed);
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    due: task.due ?? 'Today',
    completed,
    priority: task.priority ?? 'medium',
    recurrence: task.recurrence ?? 'none',
    recurrenceValue: task.recurrenceValue,
    completedDates: task.completedDates ?? (completed ? [today] : []),
    currentStreak: task.currentStreak ?? (completed ? 1 : 0),
    longestStreak: task.longestStreak ?? (completed ? 1 : 0),
    createdAt: task.createdAt ?? today,
  };
}

function readStored(): LifeData {
  try {
    const raw = localStorage.getItem('life-tracker-data');
    if (!raw) return initialData;
    const stored = JSON.parse(raw) as Partial<LifeData>;
    return {
      ...initialData,
      ...stored,
      tasks: (stored.tasks ?? initialData.tasks).map(normalizeTask),
      expenses: (stored.expenses ?? initialData.expenses).map((expense) => ({ ...expense, date: expense.date.startsWith('Today') ? today : expense.date.startsWith('Yesterday') ? dateKey(new Date(Date.now() - 86400000)) : expense.date })),
      foods: (stored.foods ?? initialData.foods).map((food) => ({ ...food, date: food.date ?? today })),
      foodDatabase: stored.foodDatabase ?? initialData.foodDatabase,
      weightEntries: stored.weightEntries ?? initialData.weightEntries,
      categories: stored.categories ?? initialData.categories,
      goals: { ...initialData.goals, ...(stored.goals ?? {}) },
    };
  } catch {
    return initialData;
  }
}

const SHEETS_CONFIG_KEY = 'life-tracker-sheets-config';
export type StoredSheetsConfig = SheetsConfig & { lastSyncedAt?: string };
export type SyncStatus = 'disconnected' | 'idle' | 'syncing' | 'error';

function readSheetsConfig(): StoredSheetsConfig | null {
  try {
    const raw = localStorage.getItem(SHEETS_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as StoredSheetsConfig) : null;
  } catch {
    return null;
  }
}

function writeSheetsConfig(config: StoredSheetsConfig) {
  localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify(config));
}

function toSnapshot(data: LifeData): SheetsSnapshot {
  return {
    tasks: data.tasks,
    expenses: data.expenses,
    foods: data.foods,
    foodDatabase: data.foodDatabase,
    weightEntries: data.weightEntries,
    weight: data.weight,
    categories: data.categories,
    habits: data.habits,
    goals: data.goals,
  };
}

function applySnapshot(current: LifeData, snapshot: SheetsSnapshot): LifeData {
  return {
    ...current,
    tasks: (snapshot.tasks ?? []).map(normalizeTask),
    expenses: snapshot.expenses ?? [],
    foods: snapshot.foods ?? [],
    foodDatabase: snapshot.foodDatabase ?? [],
    weightEntries: snapshot.weightEntries ?? [],
    weight: snapshot.weight ?? current.weight,
    categories: snapshot.categories?.length ? snapshot.categories : current.categories,
    habits: snapshot.habits ?? current.habits,
    goals: { ...current.goals, ...(snapshot.goals ?? {}) },
  };
}

function calculateStreak(dates: string[]) {
  const completed = new Set(dates);
  let current = 0;
  for (let index = 0; completed.has(dateKey(new Date(Date.now() - index * 86400000))); index += 1) current += 1;
  let longest = 0;
  let run = 0;
  [...completed].sort().forEach((date, index, all) => {
    run = index > 0 && (new Date(`${date}T00:00:00`).getTime() - new Date(`${all[index - 1]}T00:00:00`).getTime()) === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return { current, longest };
}

export function useLifeTracker() {
  const [data, setData] = useState<LifeData>(readStored);
  const [sheetsConfig, setSheetsConfig] = useState<StoredSheetsConfig | null>(readSheetsConfig);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => (readSheetsConfig() ? 'idle' : 'disconnected'));
  const [syncError, setSyncError] = useState<string | null>(null);
  const pushTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipNextPush = useRef(false);

  useEffect(() => {
    localStorage.setItem('life-tracker-data', JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (!sheetsConfig) return undefined;
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return undefined;
    }
    pushTimeout.current = setTimeout(() => {
      setSyncStatus('syncing');
      pushToSheets(sheetsConfig, toSnapshot(data))
        .then(() => {
          const synced: StoredSheetsConfig = { ...sheetsConfig, lastSyncedAt: new Date().toISOString() };
          writeSheetsConfig(synced);
          setSheetsConfig(synced);
          setSyncStatus('idle');
          setSyncError(null);
        })
        .catch((error) => {
          setSyncStatus('error');
          setSyncError(error instanceof SheetsSyncError ? error.message : 'Sync failed.');
        });
    }, 2000);
    return () => clearTimeout(pushTimeout.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const update = (change: (current: LifeData) => LifeData) => setData((current) => change(current));

  const connectSheets = async (config: SheetsConfig, mode: 'import' | 'push') => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      if (mode === 'import') {
        const snapshot = await pullFromSheets(config);
        skipNextPush.current = true;
        setData((current) => applySnapshot(current, snapshot));
      } else {
        await pushToSheets(config, toSnapshot(data));
      }
      const stored: StoredSheetsConfig = { ...config, lastSyncedAt: new Date().toISOString() };
      writeSheetsConfig(stored);
      setSheetsConfig(stored);
      setSyncStatus('idle');
    } catch (error) {
      setSyncStatus('error');
      setSyncError(error instanceof SheetsSyncError ? error.message : 'Could not connect.');
      throw error;
    }
  };

  const disconnectSheets = () => {
    localStorage.removeItem(SHEETS_CONFIG_KEY);
    setSheetsConfig(null);
    setSyncStatus('disconnected');
    setSyncError(null);
  };

  const pullSheetsNow = async () => {
    if (!sheetsConfig) return;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const snapshot = await pullFromSheets(sheetsConfig);
      skipNextPush.current = true;
      setData((current) => applySnapshot(current, snapshot));
      const stored: StoredSheetsConfig = { ...sheetsConfig, lastSyncedAt: new Date().toISOString() };
      writeSheetsConfig(stored);
      setSheetsConfig(stored);
      setSyncStatus('idle');
    } catch (error) {
      setSyncStatus('error');
      setSyncError(error instanceof SheetsSyncError ? error.message : 'Pull failed.');
    }
  };

  const pushSheetsNow = async () => {
    if (!sheetsConfig) return;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      await pushToSheets(sheetsConfig, toSnapshot(data));
      const stored: StoredSheetsConfig = { ...sheetsConfig, lastSyncedAt: new Date().toISOString() };
      writeSheetsConfig(stored);
      setSheetsConfig(stored);
      setSyncStatus('idle');
    } catch (error) {
      setSyncStatus('error');
      setSyncError(error instanceof SheetsSyncError ? error.message : 'Push failed.');
    }
  };

  return {
    data,
    sheets: { config: sheetsConfig, status: syncStatus, error: syncError },
    connectSheets,
    disconnectSheets,
    pullSheetsNow,
    pushSheetsNow,
    toggleTask: (id: string) => update((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;
        const completedDates = task.completedDates.includes(today) ? task.completedDates.filter((date) => date !== today) : [...task.completedDates, today];
        const streak = calculateStreak(completedDates);
        return { ...task, completed: completedDates.includes(today), completedDates, currentStreak: streak.current, longestStreak: Math.max(task.longestStreak, streak.longest) };
      }),
    })),
    addTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt' | 'completedDates' | 'currentStreak' | 'longestStreak'>) => update((current) => ({ ...current, tasks: [...current.tasks, normalizeTask({ ...task, id: `t${Date.now()}`, completed: false })] })),
    deleteTask: (id: string) => update((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) })),
    addExpense: (expense: Omit<Expense, 'id' | 'date'>) => update((current) => ({ ...current, expenses: [{ ...expense, id: `e${Date.now()}`, date: today }, ...current.expenses], categories: current.categories.includes(expense.category) ? current.categories : [...current.categories, expense.category] })),
    addFood: (food: Omit<Food, 'id' | 'time' | 'date'>) => update((current) => ({ ...current, foods: [...current.foods, { ...food, id: `f${Date.now()}`, time: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()), date: today }] })),
    addFoodDatabase: (food: FoodDatabaseEntry) => update((current) => ({ ...current, foodDatabase: [...current.foodDatabase.filter((item) => item.label.toLowerCase() !== food.label.toLowerCase()), food] })),
    addWeight: (weight: number, date = today) => update((current) => ({ ...current, weight, weightEntries: [...current.weightEntries.filter((entry) => entry.date !== date), { id: `w${Date.now()}`, date, weight }].sort((a, b) => a.date.localeCompare(b.date)) })),
    updateGoals: (goals: Goals) => update((current) => ({ ...current, goals })),
    resetData: () => setData(initialData),
  };
}