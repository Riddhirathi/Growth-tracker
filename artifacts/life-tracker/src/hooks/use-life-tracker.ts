import { useEffect, useState } from 'react';

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
const daysAgo = (amount: number) => dateKey(new Date(Date.now() - amount * 86400000));

const seededTask = (task: Omit<Task, 'createdAt' | 'completedDates' | 'currentStreak' | 'longestStreak'> & Partial<Pick<Task, 'completedDates' | 'currentStreak' | 'longestStreak'>>): Task => ({
  ...task,
  createdAt: today,
  completedDates: task.completedDates ?? (task.completed ? [today] : []),
  currentStreak: task.currentStreak ?? (task.completed ? 1 : 0),
  longestStreak: task.longestStreak ?? (task.completed ? 1 : 0),
});

const initialData: LifeData = {
  tasks: [
    seededTask({ id: 't1', title: 'Morning walk', due: 'Today', completed: true, priority: 'low', recurrence: 'daily', completedDates: [today, daysAgo(1), daysAgo(2)], currentStreak: 3, longestStreak: 12 }),
    seededTask({ id: 't2', title: 'Review monthly budget', due: 'Today', completed: false, priority: 'high', recurrence: 'monthly', recurrenceValue: 1 }),
    seededTask({ id: 't3', title: 'Call Mum', due: 'Today', completed: false, priority: 'medium', recurrence: 'weekly', recurrenceValue: new Date().getDay() }),
    seededTask({ id: 't4', title: 'Pick up dry cleaning', due: 'Today', completed: false, priority: 'low', recurrence: 'none' }),
    seededTask({ id: 't5', title: 'Plan next week', due: 'Tomorrow', completed: false, priority: 'medium', recurrence: 'weekly', recurrenceValue: new Date().getDay() }),
  ],
  expenses: [
    { id: 'e1', label: 'Groceries', category: 'Food', amount: 36.45, date: today },
    { id: 'e2', label: 'Train to city', category: 'Travel', amount: 8.6, date: today },
    { id: 'e3', label: 'Ceramic studio', category: 'Leisure', amount: 24, date: daysAgo(1) },
  ],
  foods: [
    { id: 'f1', label: 'Greek yoghurt & berries', calories: 280, protein: 19, carbs: 31, fat: 8, fibre: 6, time: '08:30', date: today },
    { id: 'f2', label: 'Sourdough avocado toast', calories: 410, protein: 11, carbs: 44, fat: 22, fibre: 9, time: '12:15', date: today },
  ],
  foodDatabase: [
    { label: 'Roti', quantity: 1, unit: 'piece', calories: 110, protein: 3, carbs: 22, fat: 1, fibre: 2 },
    { label: 'Paneer', quantity: 100, unit: 'g', calories: 265, protein: 18, carbs: 2, fat: 20, fibre: 0 },
    { label: 'Dal', quantity: 1, unit: 'piece', calories: 230, protein: 14, carbs: 32, fat: 5, fibre: 9 },
    { label: 'Greek yoghurt', quantity: 100, unit: 'g', calories: 97, protein: 9, carbs: 4, fat: 5, fibre: 0 },
  ],
  weight: 68.4,
  weightEntries: [
    { id: 'w1', date: daysAgo(28), weight: 69.2 },
    { id: 'w2', date: daysAgo(21), weight: 69 },
    { id: 'w3', date: daysAgo(14), weight: 68.8 },
    { id: 'w4', date: daysAgo(7), weight: 68.6 },
    { id: 'w5', date: today, weight: 68.4 },
  ],
  habits: [{ name: 'Movement', days: 12, color: '#d87958' }, { name: 'Read', days: 8, color: '#4b8981' }, { name: 'Early night', days: 5, color: '#87739b' }],
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
      expenses: (stored.expenses ?? initialData.expenses).map((expense) => ({ ...expense, date: expense.date.startsWith('Today') ? today : expense.date.startsWith('Yesterday') ? daysAgo(1) : expense.date })),
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
  useEffect(() => {
    localStorage.setItem('life-tracker-data', JSON.stringify(data));
  }, [data]);

  const update = (change: (current: LifeData) => LifeData) => setData((current) => change(current));
  return {
    data,
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