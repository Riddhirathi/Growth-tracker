import { useEffect, useState } from 'react';

export type Task = { id: string; title: string; due: 'Today' | 'Tomorrow' | 'This week'; completed: boolean; priority: 'high' | 'medium' | 'low' };
export type Expense = { id: string; label: string; category: string; amount: number; date: string };
export type Food = { id: string; label: string; calories: number; protein: number; carbs: number; fat: number; fibre: number; time: string };
export type LifeData = { tasks: Task[]; expenses: Expense[]; foods: Food[]; weight: number; habits: { name: string; days: number; color: string }[] };

const initialData: LifeData = {
  tasks: [
    { id: 't1', title: 'Morning walk', due: 'Today', completed: true, priority: 'low' },
    { id: 't2', title: 'Review monthly budget', due: 'Today', completed: false, priority: 'high' },
    { id: 't3', title: 'Call Mum', due: 'Today', completed: false, priority: 'medium' },
    { id: 't4', title: 'Pick up dry cleaning', due: 'Today', completed: false, priority: 'low' },
    { id: 't5', title: 'Plan next week', due: 'Tomorrow', completed: false, priority: 'medium' },
  ],
  expenses: [
    { id: 'e1', label: 'Groceries', category: 'Food', amount: 36.45, date: 'Today · 09:12' },
    { id: 'e2', label: 'Train to city', category: 'Travel', amount: 8.6, date: 'Today · 08:05' },
    { id: 'e3', label: 'Ceramic studio', category: 'Leisure', amount: 24, date: 'Yesterday' },
  ],
  foods: [
    { id: 'f1', label: 'Greek yoghurt & berries', calories: 280, protein: 19, carbs: 31, fat: 8, fibre: 6, time: '08:30' },
    { id: 'f2', label: 'Sourdough avocado toast', calories: 410, protein: 11, carbs: 44, fat: 22, fibre: 9, time: '12:15' },
  ],
  weight: 68.4,
  habits: [{ name: 'Movement', days: 12, color: '#d87958' }, { name: 'Read', days: 8, color: '#4b8981' }, { name: 'Early night', days: 5, color: '#87739b' }],
};

function readStored(): LifeData {
  try {
    const raw = localStorage.getItem('life-tracker-data');
    return raw ? { ...initialData, ...JSON.parse(raw) } : initialData;
  } catch {
    return initialData;
  }
}

export function useLifeTracker() {
  const [data, setData] = useState<LifeData>(readStored);
  useEffect(() => {
    localStorage.setItem('life-tracker-data', JSON.stringify(data));
  }, [data]);

  const update = (change: (current: LifeData) => LifeData) => setData((current) => change(current));
  return {
    data,
    toggleTask: (id: string) => update((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task) })),
    addTask: (task: Omit<Task, 'id' | 'completed'>) => update((current) => ({ ...current, tasks: [...current.tasks, { ...task, id: `t${Date.now()}`, completed: false }] })),
    addExpense: (expense: Omit<Expense, 'id' | 'date'>) => update((current) => ({ ...current, expenses: [{ ...expense, id: `e${Date.now()}`, date: 'Today · now' }, ...current.expenses] })),
    addFood: (food: Omit<Food, 'id' | 'time'>) => update((current) => ({ ...current, foods: [...current.foods, { ...food, id: `f${Date.now()}`, time: 'now' }] })),
    resetData: () => setData(initialData),
  };
}