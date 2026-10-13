import { useEffect, useRef, useState } from 'react';
import { pullFromSheets, pushToSheets, SheetsSyncError, type SheetsConfig, type SheetsSnapshot } from '@/lib/sheetsClient';

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export type Recurrence = Weekday[];
export type Task = {
  id: string;
  title: string;
  notes?: string;
  icon?: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  recurrence: Recurrence;
  recurrenceValue?: number;
  completedDates: string[];
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
  /** Last date (inclusive) this task is still active. Set when a recurring task is "stopped" —
   *  everything before and including it stays untouched (history, streaks, reports); the task
   *  simply stops being scheduled from the day after. Undefined/null = still active indefinitely. */
  endDate?: string | null;
};

const WEEKDAY_BY_INDEX: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const weekdayOf = (date: string): Weekday => WEEKDAY_BY_INDEX[new Date(`${date}T12:00:00`).getDay()];
export const addDays = (date: string, days: number) => dateKey(new Date(new Date(`${date}T12:00:00`).getTime() + days * 86400000));
export const isTaskStopped = (task: Task, asOf = dateKey()) => Boolean(task.endDate && task.endDate < asOf);

/** Pure recurrence+range check: was this task actually *due* on this date, independent of history. */
function isDueOn(task: Task, date: string): boolean {
  if (date < task.createdAt) return false;
  if (task.endDate && date > task.endDate) return false;
  return task.recurrence.length ? task.recurrence.includes(weekdayOf(date)) : task.createdAt === date;
}
export { isDueOn };

/**
 * Should this task appear on this date? True if it was due (current recurrence/range), OR if it
 * was actually completed that day in the past. The completedDates fallback matters: editing a
 * task's repeat days, or stopping it, must never make a day that was already checked off vanish
 * from history, day views, or reports.
 */
export function isTaskScheduledOn(task: Task, date: string): boolean {
  return isDueOn(task, date) || task.completedDates.includes(date);
}
export type Expense = { id: string; label: string; category: string; amount: number; date: string };
export type Food = { id: string; label: string; calories: number; protein: number; carbs: number; fat: number; fibre: number; time: string; date: string; quantity?: number; unit?: 'g' | 'ml' | 'piece' };
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

// Typical per-serving estimates for common Indian foods, used to seed the local
// food database so nutrition lookup works out of the box, offline, with no Sheets
// connection required. Users can overwrite or add to any of these from the app.
const defaultFoodDatabase: FoodDatabaseEntry[] = [
  { label: 'Roti', quantity: 1, unit: 'piece', calories: 104, protein: 3, carbs: 18, fat: 2.5, fibre: 2 },
  { label: 'Rice (cooked)', quantity: 100, unit: 'g', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4 },
  { label: 'Brown Rice (cooked)', quantity: 100, unit: 'g', calories: 123, protein: 2.7, carbs: 26, fat: 1, fibre: 1.8 },
  { label: 'Dal Tadka', quantity: 150, unit: 'g', calories: 150, protein: 9, carbs: 20, fat: 4, fibre: 5 },
  { label: 'Moong Dal', quantity: 150, unit: 'g', calories: 140, protein: 10, carbs: 22, fat: 1.5, fibre: 6 },
  { label: 'Curd', quantity: 100, unit: 'g', calories: 60, protein: 3.5, carbs: 4.7, fat: 3.3, fibre: 0 },
  { label: 'Milk', quantity: 100, unit: 'ml', calories: 58, protein: 3.1, carbs: 4.7, fat: 3, fibre: 0 },
  { label: 'Buttermilk', quantity: 200, unit: 'ml', calories: 40, protein: 2, carbs: 4, fat: 1, fibre: 0 },
  { label: 'Ghee', quantity: 10, unit: 'g', calories: 90, protein: 0, carbs: 0, fat: 10, fibre: 0 },
  { label: 'Butter', quantity: 10, unit: 'g', calories: 72, protein: 0.1, carbs: 0.1, fat: 8.1, fibre: 0 },
  { label: 'Paneer', quantity: 100, unit: 'g', calories: 265, protein: 18, carbs: 1.2, fat: 20.8, fibre: 0 },
  { label: 'Chana (boiled)', quantity: 100, unit: 'g', calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fibre: 7.6 },
  { label: 'Rajma (cooked)', quantity: 100, unit: 'g', calories: 127, protein: 8.7, carbs: 22.8, fat: 0.5, fibre: 6.4 },
  { label: 'Poha', quantity: 150, unit: 'g', calories: 250, protein: 5, carbs: 45, fat: 6, fibre: 2 },
  { label: 'Upma', quantity: 150, unit: 'g', calories: 220, protein: 5, carbs: 35, fat: 7, fibre: 2.5 },
  { label: 'Idli', quantity: 1, unit: 'piece', calories: 58, protein: 2, carbs: 12, fat: 0.2, fibre: 0.5 },
  { label: 'Dosa (plain)', quantity: 1, unit: 'piece', calories: 133, protein: 2.7, carbs: 22, fat: 3.7, fibre: 0.6 },
  { label: 'Sambar', quantity: 150, unit: 'g', calories: 120, protein: 5, carbs: 18, fat: 3, fibre: 4 },
  { label: 'Bread (white slice)', quantity: 1, unit: 'piece', calories: 66, protein: 2.3, carbs: 12.6, fat: 0.8, fibre: 0.6 },
  { label: 'Egg (boiled)', quantity: 1, unit: 'piece', calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fibre: 0 },
  { label: 'Aloo Gobi', quantity: 150, unit: 'g', calories: 180, protein: 4, carbs: 20, fat: 9, fibre: 4 },
  { label: 'Aloo Paratha', quantity: 1, unit: 'piece', calories: 260, protein: 6, carbs: 36, fat: 10, fibre: 3 },
  { label: 'Palak Paneer', quantity: 150, unit: 'g', calories: 280, protein: 12, carbs: 10, fat: 21, fibre: 4 },
  { label: 'Chole', quantity: 150, unit: 'g', calories: 250, protein: 10, carbs: 30, fat: 10, fibre: 8 },
  { label: 'Baingan Bharta', quantity: 150, unit: 'g', calories: 160, protein: 3, carbs: 14, fat: 10, fibre: 5 },
  { label: 'Bhindi Masala', quantity: 150, unit: 'g', calories: 150, protein: 3, carbs: 13, fat: 9, fibre: 4 },
  { label: 'Mixed Veg Curry', quantity: 150, unit: 'g', calories: 170, protein: 4, carbs: 18, fat: 9, fibre: 4 },
  { label: 'Paneer Butter Masala', quantity: 150, unit: 'g', calories: 320, protein: 13, carbs: 12, fat: 25, fibre: 2 },
  { label: 'Dal Makhani', quantity: 150, unit: 'g', calories: 280, protein: 10, carbs: 25, fat: 16, fibre: 6 },
  { label: 'Kadhi', quantity: 150, unit: 'g', calories: 150, protein: 5, carbs: 12, fat: 9, fibre: 1 },
  { label: 'Vegetable Pulao', quantity: 150, unit: 'g', calories: 250, protein: 5, carbs: 42, fat: 7, fibre: 3 },
  { label: 'Gobi Manchurian', quantity: 150, unit: 'g', calories: 260, protein: 6, carbs: 28, fat: 13, fibre: 3 },
  { label: 'Samosa', quantity: 1, unit: 'piece', calories: 150, protein: 3, carbs: 17, fat: 8, fibre: 1.5 },
  { label: 'Pakora', quantity: 100, unit: 'g', calories: 250, protein: 6, carbs: 24, fat: 15, fibre: 3 },
  { label: 'Chicken Curry', quantity: 150, unit: 'g', calories: 280, protein: 22, carbs: 8, fat: 18, fibre: 1.5 },
  { label: 'Butter Chicken', quantity: 150, unit: 'g', calories: 350, protein: 20, carbs: 10, fat: 25, fibre: 1 },
  { label: 'Chicken Biryani', quantity: 200, unit: 'g', calories: 400, protein: 18, carbs: 48, fat: 15, fibre: 2 },
  { label: 'Mutton Curry', quantity: 150, unit: 'g', calories: 320, protein: 22, carbs: 6, fat: 22, fibre: 1 },
  { label: 'Fish Curry', quantity: 150, unit: 'g', calories: 220, protein: 20, carbs: 6, fat: 13, fibre: 1 },
  { label: 'Egg Curry', quantity: 150, unit: 'g', calories: 220, protein: 12, carbs: 8, fat: 16, fibre: 1.5 },
  { label: 'Chicken Tikka', quantity: 100, unit: 'g', calories: 190, protein: 24, carbs: 3, fat: 9, fibre: 0.5 },
  { label: 'Tandoori Chicken', quantity: 100, unit: 'g', calories: 180, protein: 25, carbs: 2, fat: 8, fibre: 0 },
  { label: 'Keema', quantity: 150, unit: 'g', calories: 300, protein: 20, carbs: 8, fat: 21, fibre: 1 },
  { label: 'Prawn Curry', quantity: 150, unit: 'g', calories: 210, protein: 18, carbs: 7, fat: 12, fibre: 1 },
  { label: 'Vada Pav', quantity: 1, unit: 'piece', calories: 290, protein: 6, carbs: 40, fat: 12, fibre: 3 },
  { label: 'Pav Bhaji', quantity: 200, unit: 'g', calories: 400, protein: 8, carbs: 55, fat: 16, fibre: 6 },
  { label: 'Gulab Jamun', quantity: 1, unit: 'piece', calories: 150, protein: 2, carbs: 20, fat: 7, fibre: 0.2 },
  { label: 'Besan Ladoo', quantity: 1, unit: 'piece', calories: 140, protein: 3, carbs: 15, fat: 8, fibre: 1 },
];

const initialData: LifeData = {
  tasks: [],
  expenses: [],
  foods: [],
  foodDatabase: defaultFoodDatabase,
  weight: 0,
  weightEntries: [],
  habits: [],
  categories: ['Food', 'Shopping', 'Rent', 'Fuel', 'Entertainment', 'Bills', 'Health', 'Travel', 'Miscellaneous'],
  goals: { calories: 2100, protein: 120, carbs: 250, fat: 70, fibre: 30, dailySpend: 60 },
};

function mergeFoodDatabase(stored: FoodDatabaseEntry[], defaults: FoodDatabaseEntry[]): FoodDatabaseEntry[] {
  const existingLabels = new Set(stored.map((item) => item.label.toLowerCase()));
  const missing = defaults.filter((item) => !existingLabels.has(item.label.toLowerCase()));
  return [...stored, ...missing];
}

function normalizeRecurrence(value: unknown): Recurrence {
  const raw = Array.isArray(value) ? value : typeof value === 'string' && value && value !== 'none' ? [value] : [];
  return raw.filter((day): day is Weekday => WEEKDAYS.includes(day as Weekday));
}

function normalizeTask(task: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  const completed = Boolean(task.completed);
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    icon: task.icon || undefined,
    completed,
    priority: task.priority ?? 'medium',
    recurrence: normalizeRecurrence(task.recurrence),
    recurrenceValue: task.recurrenceValue,
    completedDates: task.completedDates ?? (completed ? [today] : []),
    currentStreak: task.currentStreak ?? (completed ? 1 : 0),
    longestStreak: task.longestStreak ?? (completed ? 1 : 0),
    createdAt: task.createdAt ?? today,
    endDate: task.endDate || undefined,
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
      foodDatabase: mergeFoodDatabase(stored.foodDatabase ?? [], defaultFoodDatabase),
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

/**
 * Streaks count consecutive *due* occurrences (per the task's own recurrence), not raw calendar
 * days — a Mon/Wed/Fri habit shouldn't look "broken" on a Tuesday. Today only breaks a streak once
 * it's past and still undone; a due-but-not-yet-done today is simply not counted yet.
 */
function calculateStreak(task: Task, completedDates: string[]) {
  const completed = new Set(completedDates);
  const boundary = task.endDate && task.endDate < today ? task.endDate : today;

  let current = 0;
  let cursor = boundary;
  if (isDueOn(task, cursor) && !completed.has(cursor)) cursor = addDays(cursor, -1);
  while (cursor >= task.createdAt) {
    if (!isDueOn(task, cursor)) { cursor = addDays(cursor, -1); continue; }
    if (!completed.has(cursor)) break;
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const lastCompleted = [...completed].sort().at(-1);
  const scanEnd = lastCompleted && lastCompleted > boundary ? lastCompleted : boundary;
  let longest = 0;
  let run = 0;
  for (let date = task.createdAt; date <= scanEnd; date = addDays(date, 1)) {
    if (!isDueOn(task, date)) continue;
    run = completed.has(date) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
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
    toggleTask: (id: string, date = today) => update((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;
        const completedDates = task.completedDates.includes(date) ? task.completedDates.filter((entry) => entry !== date) : [...task.completedDates, date];
        const streak = calculateStreak(task, completedDates);
        return { ...task, completed: completedDates.includes(today), completedDates, currentStreak: streak.current, longestStreak: Math.max(task.longestStreak, streak.longest) };
      }),
    })),
    addTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt' | 'completedDates' | 'currentStreak' | 'longestStreak'>) => update((current) => ({ ...current, tasks: [...current.tasks, normalizeTask({ ...task, id: `t${Date.now()}`, completed: false })] })),
    updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'icon' | 'priority' | 'recurrence' | 'recurrenceValue'>>) => update((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== id) return task;
        const next = { ...task, ...patch };
        const streak = calculateStreak(next, next.completedDates);
        return { ...next, currentStreak: streak.current, longestStreak: Math.max(task.longestStreak, streak.longest) };
      }),
    })),
    /** Stops a recurring task from `endDate` onward. All history (completedDates, streaks) is
     *  left exactly as-is — it keeps showing in reports and in the Stopped list. Pass the task's
     *  own createdAt-or-later date; anything before it is unaffected. */
    stopTask: (id: string, endDate: string) => update((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, endDate } : task) })),
    /** Clears a task's stop date so it resumes being scheduled going forward. History is untouched. */
    reactivateTask: (id: string) => update((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, endDate: undefined } : task) })),
    /** Permanently removes the task AND every bit of its history (completions, streaks). Unlike
     *  stopTask, this cannot be undone and the task will no longer appear anywhere, including past reports. */
    deleteTask: (id: string) => update((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) })),
    addExpense: (expense: Omit<Expense, 'id' | 'date'>, date = today) => update((current) => ({ ...current, expenses: [{ ...expense, id: `e${Date.now()}`, date }, ...current.expenses], categories: current.categories.includes(expense.category) ? current.categories : [...current.categories, expense.category] })),
    updateExpense: (id: string, patch: Partial<Pick<Expense, 'label' | 'category' | 'amount' | 'date'>>) => update((current) => ({ ...current, expenses: current.expenses.map((expense) => expense.id === id ? { ...expense, ...patch } : expense), categories: patch.category && !current.categories.includes(patch.category) ? [...current.categories, patch.category] : current.categories })),
    deleteExpense: (id: string) => update((current) => ({ ...current, expenses: current.expenses.filter((expense) => expense.id !== id) })),
    addFood: (food: Omit<Food, 'id' | 'time' | 'date'>, date = today) => update((current) => ({ ...current, foods: [...current.foods, { ...food, id: `f${Date.now()}`, time: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()), date }] })),
    updateFood: (id: string, patch: Partial<Omit<Food, 'id' | 'time'>>) => update((current) => ({ ...current, foods: current.foods.map((food) => food.id === id ? { ...food, ...patch } : food) })),
    deleteFood: (id: string) => update((current) => ({ ...current, foods: current.foods.filter((food) => food.id !== id) })),
    addFoodDatabase: (food: FoodDatabaseEntry) => update((current) => ({ ...current, foodDatabase: [...current.foodDatabase.filter((item) => item.label.toLowerCase() !== food.label.toLowerCase()), food] })),
    addWeight: (weight: number, date = today) => update((current) => ({ ...current, weight, weightEntries: [...current.weightEntries.filter((entry) => entry.date !== date), { id: `w${Date.now()}`, date, weight }].sort((a, b) => a.date.localeCompare(b.date)) })),
    updateGoals: (goals: Goals) => update((current) => ({ ...current, goals })),
    resetData: () => setData(initialData),
  };
}