import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, CalendarDays, Check, ChevronRight, CircleDollarSign, ClipboardList,
  Coffee, CookingPot, Download, Goal, LayoutDashboard, MoreHorizontal, Plus, Scale,
  Settings, Sparkles, Trash2, Utensils, Wallet, X,
} from 'lucide-react';
import {
  dateKey,
  useLifeTracker,
  type Expense,
  type Food,
  type FoodDatabaseEntry,
  type Goals,
  type Recurrence,
  type StoredSheetsConfig,
  type SyncStatus,
  type Task,
} from '@/hooks/use-life-tracker';
import { pullFromSheets, type SheetsConfig } from '@/lib/sheetsClient';

const queryClient = new QueryClient();
type View = 'dashboard' | 'tasks' | 'expenses' | 'nutrition' | 'analytics' | 'settings';
type Modal = 'task' | 'expense' | 'food' | 'weight' | 'goals' | 'sheets' | null;
const today = dateKey();
const todayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const formatDate = (value: string) => value === today ? 'Today' : value === dateKey(new Date(Date.now() - 86400000)) ? 'Yesterday' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
const recurrenceLabel = (value: Recurrence) => value === 'none' ? 'One-time' : value[0].toUpperCase() + value.slice(1);

const nav = [
  { id: 'dashboard' as View, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks' as View, label: 'Tasks', icon: ClipboardList },
  { id: 'expenses' as View, label: 'Expenses', icon: Wallet },
  { id: 'nutrition' as View, label: 'Nutrition', icon: Utensils },
  { id: 'analytics' as View, label: 'Analytics', icon: BarChart3 },
  { id: 'settings' as View, label: 'Settings', icon: Settings },
];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Shell({ view, setView, profileName, children }: { view: View; setView: (view: View) => void; profileName: string; children: React.ReactNode }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Sparkles size={17} /></span><span className="brand-name">Personal Tracker</span></div>
      <p className="side-label">Your ritual</p>
      <nav className="nav-list" aria-label="Main navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)} data-testid={`nav-${id}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-footer"><div className="profile"><div className="avatar">{getInitials(profileName)}</div><div><b>{profileName}</b><small>Personal space</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Sparkles size={14} /></span><span>Personal Tracker</span></div><span className="eyebrow">A little more present</span><div className="top-actions"><button className="ghost-button" onClick={() => setView('settings')} data-testid="button-open-settings"><Settings size={15} /> Preferences</button><button className="icon-button" onClick={() => setView('analytics')} aria-label="Open analytics" data-testid="button-open-analytics"><BarChart3 size={17} /></button></div></header>
      {children}
    </main>
    <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)} data-testid={`mobile-nav-${id}`}><Icon /><span>{label}</span></button>)}</nav>
  </div>;
}

function PageHeading({ title, description, action, name }: { title: string; description: string; action?: React.ReactNode; name: string }) {
  return <div className="page-heading"><div><span className="eyebrow">Good morning, {name}</span><h1>{title}</h1><p>{description}</p></div><div>{action}</div></div>;
}

function Panel({ title, note, children, action }: { title: string; note?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="panel"><div className="panel-head"><div><div className="panel-title">{title}</div>{note && <p className="panel-note">{note}</p>}</div>{action}</div>{children}</section>;
}

function TaskRows({ tasks, toggleTask, deleteTask, limit }: { tasks: Task[]; toggleTask: (id: string) => void; deleteTask?: (id: string) => void; limit?: number }) {
  const visible = limit ? tasks.slice(0, limit) : tasks;
  return <div className="task-list">{visible.map((task) => <div className={`task-row ${task.completed ? 'completed' : ''}`} key={task.id} data-testid={`row-task-${task.id}`}>
    <button type="button" className={`check ${task.completed ? 'done' : ''}`} onClick={() => toggleTask(task.id)} aria-label={`Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`} data-testid={`button-complete-task-${task.id}`}>{task.completed && <Check size={13} strokeWidth={3} />}</button>
    <div className="task-copy"><div className="task-name">{task.title}</div><div className="task-meta">{task.due} · {task.completed ? 'Done' : 'Open'} · {recurrenceLabel(task.recurrence)}{task.currentStreak > 0 ? ` · ${task.currentStreak} day streak` : ''}</div></div>
    <span className={`priority-dot ${task.priority}`} />
    {deleteTask && <button type="button" className="row-action" onClick={() => deleteTask(task.id)} aria-label={`Delete ${task.title}`} data-testid={`button-delete-task-${task.id}`}><Trash2 size={14} /></button>}
  </div>)}</div>;
}

function MacroMetrics({ totals, goals }: { totals: { calories: number; protein: number; carbs: number; fat: number; fibre: number }; goals: Goals }) {
  const items = [
    ['Calories', totals.calories, goals.calories, 'kcal'],
    ['Protein', totals.protein, goals.protein, 'g'],
    ['Carbs', totals.carbs, goals.carbs, 'g'],
    ['Fibre', totals.fibre, goals.fibre, 'g'],
  ] as const;
  return <div className="metric-grid">{items.map(([label, value, goal, unit]) => <div className="metric" key={label}><span className="metric-label">{label}</span><strong className="metric-value">{Math.round(value)}{unit === 'g' ? 'g' : ''}</strong><span className="metric-sub">of {goal}{unit}</span><div className="bar"><span style={{ width: `${Math.min(100, value / goal * 100)}%` }} /></div></div>)}</div>;
}

function Dashboard({ data, toggleTask, openModal, setView, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; toggleTask: (id: string) => void; openModal: (modal: Modal) => void; setView: (view: View) => void; profileName: string }) {
  const todayTasks = data.tasks.filter((task) => task.due === 'Today');
  const complete = todayTasks.filter((task) => task.completed).length;
  const progress = todayTasks.length ? Math.round((complete / todayTasks.length) * 100) : 0;
  const totals = data.foods.filter((food) => food.date === today).reduce((acc, item) => ({ calories: acc.calories + item.calories, protein: acc.protein + item.protein, carbs: acc.carbs + item.carbs, fat: acc.fat + item.fat, fibre: acc.fibre + item.fibre }), { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  const spend = data.expenses.filter((entry) => entry.date === today).reduce((sum, entry) => sum + entry.amount, 0);
  const latestWeight = data.weightEntries[data.weightEntries.length - 1];
  return <div className="content">
    <PageHeading title="Make space for today." description="A clear view of what matters, one small step at a time." name={profileName} />
    <div className="date-stamp" data-testid="text-current-date">{todayLabel} <span>·</span> {today}</div>
    <div className="dashboard-grid" style={{ marginTop: 23 }}>
      <div className="stack">
        <section className="panel progress-panel" data-testid="card-task-progress"><div className="progress-ring" style={{ '--progress': progress } as React.CSSProperties}><span>{progress}%</span></div><div className="progress-copy"><h2>{complete === todayTasks.length ? 'Day well met.' : `${todayTasks.length - complete} things to tend to`}</h2><p>{complete === todayTasks.length ? 'You made room for everything on your list.' : 'Keep the promise small. Start with the next one.'}</p></div></section>
        <Panel title="Today’s rhythm" note={`${complete} of ${todayTasks.length} responsibilities complete`} action={<button className="text-link" onClick={() => setView('tasks')} data-testid="link-view-all-tasks">View all <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></button>}><TaskRows tasks={todayTasks} toggleTask={toggleTask} limit={4} /></Panel>
        <Panel title="Quick add" note="Capture it before it slips away"><div className="quick-grid"><button className="quick" onClick={() => openModal('task')} data-testid="button-quick-add-task"><ClipboardList size={18} /><span>Task</span></button><button className="quick" onClick={() => openModal('expense')} data-testid="button-quick-add-expense"><CircleDollarSign size={18} /><span>Expense</span></button><button className="quick" onClick={() => openModal('food')} data-testid="button-quick-add-food"><CookingPot size={18} /><span>Food</span></button></div></Panel>
      </div>
      <div className="stack">
        <Panel title="Fuel for the day" note="A gentle snapshot of your intake" action={<button className="text-link" onClick={() => setView('nutrition')} data-testid="link-view-nutrition">Details <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></button>}><MacroMetrics totals={totals} goals={data.goals} /></Panel>
        <Panel title="In the ledger" note="Today’s spending"><div className="spend-total">{money(spend)} <small>of {money(data.goals.dailySpend)} daily guide</small></div>{data.expenses.filter((entry) => entry.date === today).slice(0, 3).map((entry) => <div className="expense-line" key={entry.id}><span>{entry.label}</span><span>{money(entry.amount)}</span></div>)}</Panel>
        <Panel title="Habit momentum" note="The quiet power of showing up"><div className="streak-list">{data.tasks.filter((task) => task.recurrence !== 'none').slice(0, 3).map((task) => <div className="streak" key={task.id}><span className="streak-name">{task.title}</span><div className="streak-bar"><span style={{ width: `${Math.min(100, task.currentStreak * 8)}%` }} /></div><span className="streak-count">{task.currentStreak} days</span></div>)}</div></Panel>
        <Panel title="Latest weigh-in" action={<button className="text-link" onClick={() => openModal('weight')} data-testid="button-log-weight">Log <Plus size={13} style={{ verticalAlign: 'middle' }} /></button>}><div className="weight-snapshot"><div className="food-dot weight-dot"><Scale size={21} /></div><div><strong>{latestWeight ? `${latestWeight.weight} kg` : '–'}</strong><p className="panel-note">{latestWeight ? formatDate(latestWeight.date) : 'No entries yet'}{data.weightEntries.length > 1 ? ` · ${(latestWeight.weight - data.weightEntries[data.weightEntries.length - 2].weight).toFixed(1)} kg since last entry` : ''}</p></div></div></Panel>
      </div>
    </div>
  </div>;
}

function TasksView({ data, toggleTask, deleteTask, openModal, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; toggleTask: (id: string) => void; deleteTask: (id: string) => void; openModal: (modal: Modal) => void; profileName: string }) {
  const [filter, setFilter] = useState<'today' | 'upcoming' | 'completed'>('today');
  const filtered = data.tasks.filter((task) => filter === 'today' ? task.due === 'Today' : filter === 'upcoming' ? task.due !== 'Today' : task.completed);
  const recurring = data.tasks.filter((task) => task.recurrence !== 'none');
  return <div className="content"><PageHeading title="Tasks" description="A softer way to hold everything you mean to do." action={<button className="primary-button" onClick={() => openModal('task')} data-testid="button-add-task"><Plus size={15} /> Add task</button>} name={profileName} /><div className="dashboard-grid"><div className="view-card"><Panel title="Your list" note={`${data.tasks.filter((task) => !task.completed).length} open tasks`}><div className="toolbar"><div className="filter-tabs">{(['today', 'upcoming', 'completed'] as const).map((item) => <button key={item} className={`filter-tab ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)} data-testid={`button-filter-${item}`}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>{filtered.length ? <TaskRows tasks={filtered} toggleTask={toggleTask} deleteTask={deleteTask} /> : <div className="empty-state"><Check size={27} /><h3>Nothing asking for you here.</h3><p>Use the empty space to notice what is going well.</p><button className="primary-button" onClick={() => openModal('task')} data-testid="button-empty-add-task"><Plus size={15} /> Add a task</button></div>}</Panel></div><Panel title="Streaks" note="Recurring tasks keep their history">{recurring.length ? <div className="streak-list">{recurring.map((task) => <div className="streak-detail" key={task.id}><div><strong>{task.title}</strong><small>{recurrenceLabel(task.recurrence)} · current {task.currentStreak} days</small></div><b>{task.longestStreak}<small>longest</small></b></div>)}</div> : <p className="panel-note">Make a task recurring to start a streak.</p>}</Panel></div></div>;
}

function ExpensesView({ data, openModal, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; openModal: (modal: Modal) => void; profileName: string }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const filtered = data.expenses.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) && (category === 'All' || item.category === category));
  const total = data.expenses.reduce((sum, item) => sum + item.amount, 0);
  const byCategory = data.categories.map((name) => ({ name, value: data.expenses.filter((item) => item.category === name).reduce((sum, item) => sum + item.amount, 0) })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const exportCsv = () => { const csv = ['date,category,description,amount', ...data.expenses.map((item) => `${item.date},${item.category},"${item.label.replaceAll('"', '""')}",${item.amount.toFixed(2)}`)].join('\n'); const link = document.createElement('a'); link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`; link.download = 'personal-tracker-expenses.csv'; link.click(); };
  return <div className="content"><PageHeading title="Expenses" description="See where your money is going, without making it a moral issue." action={<div className="heading-actions"><button className="ghost-button" onClick={exportCsv} data-testid="button-export-expenses"><Download size={14} /> CSV</button><button className="primary-button" onClick={() => openModal('expense')} data-testid="button-add-expense"><Plus size={15} /> Add expense</button></div>} name={profileName} /><div className="dashboard-grid"><Panel title="Recent entries" note={`${filtered.length} of ${data.expenses.length} entries`}><div className="toolbar"><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" aria-label="Search expenses" data-testid="input-search-expenses" /><select className="filter-select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter expense category" data-testid="select-filter-expense">{['All', ...data.categories].map((name) => <option key={name}>{name}</option>)}</select></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Entry</th><th>Category</th><th>Date</th><th>Amount</th></tr></thead><tbody>{filtered.map((entry) => <tr key={entry.id} data-testid={`row-expense-${entry.id}`}><td><b>{entry.label}</b></td><td><span className="pill">{entry.category}</span></td><td style={{ color: '#9b8883', fontSize: 11 }}>{formatDate(entry.date)}</td><td><b>{money(entry.amount)}</b></td></tr>)}</tbody></table>{!filtered.length && <div className="empty-state"><Wallet size={27} /><h3>No matching entries.</h3><p>Try another search or log something new.</p></div>}</div></Panel><Panel title="This ledger" note="All recorded spending"><div className="spend-total">{money(total)}</div><div className="streak-list" style={{ marginTop: 22 }}>{byCategory.map((item) => <div className="streak" key={item.name}><span className="streak-name">{item.name}</span><div className="streak-bar"><span style={{ width: `${total ? item.value / total * 100 : 0}%` }} /></div><span className="streak-count">{money(item.value)}</span></div>)}</div></Panel></div></div>;
}

function NutritionView({ data, openModal, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; openModal: (modal: Modal) => void; profileName: string }) {
  const totals = data.foods.filter((food) => food.date === today).reduce((acc, item) => ({ calories: acc.calories + item.calories, protein: acc.protein + item.protein, carbs: acc.carbs + item.carbs, fat: acc.fat + item.fat, fibre: acc.fibre + item.fibre }), { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  const macros = [{ key: 'calories', label: 'Calories', value: totals.calories, goal: data.goals.calories, unit: 'kcal' }, { key: 'protein', label: 'Protein', value: totals.protein, goal: data.goals.protein, unit: 'g' }, { key: 'carbs', label: 'Carbohydrates', value: totals.carbs, goal: data.goals.carbs, unit: 'g' }, { key: 'fat', label: 'Fat', value: totals.fat, goal: data.goals.fat, unit: 'g' }, { key: 'fibre', label: 'Fibre', value: totals.fibre, goal: data.goals.fibre, unit: 'g' }];
  return <div className="content"><PageHeading title="Nutrition" description="Notice what gives you energy. No numbers need to be perfect." action={<button className="primary-button" onClick={() => openModal('food')} data-testid="button-add-food"><Plus size={15} /> Add food</button>} name={profileName} /><div className="nutrition-layout"><Panel title="Today at a glance" note="Targets are guides, not grades"><div className="nutrition-total"><strong>{Math.round(totals.calories)}</strong><span>of {data.goals.calories} kcal</span></div><div className="macro-list">{macros.map((macro) => <div key={macro.key}><div className="macro-head"><span>{macro.label}</span><b>{Math.round(macro.value)}{macro.unit} / {macro.goal}{macro.unit}</b></div><div className={`macro-bar ${macro.key}`}><span style={{ width: `${Math.min(100, macro.value / macro.goal * 100)}%` }} /></div></div>)}</div></Panel><Panel title="Food log" note={`${data.foods.filter((food) => food.date === today).length} moments recorded today`}>{data.foods.filter((food) => food.date === today).length ? data.foods.filter((food) => food.date === today).map((food) => <div className="food-entry" key={food.id} data-testid={`row-food-${food.id}`}><div className="food-dot"><Utensils size={15} /></div><div><strong>{food.label}</strong><p>{food.time} · {food.calories} kcal · {food.protein}g protein</p></div></div>) : <div className="empty-state"><Coffee size={27} /><h3>A blank plate</h3><p>Add your first meal when you are ready.</p></div>}</Panel></div></div>;
}

function WeightChart({ data }: { data: ReturnType<typeof useLifeTracker>['data'] }) {
  const entries = data.weightEntries.slice(-8);
  const values = entries.map((entry) => entry.weight);
  const min = Math.min(...values, data.weight) - .3;
  const max = Math.max(...values, data.weight) + .3;
  return <div className="weight-chart">{entries.map((entry) => <div className="weight-col" key={entry.id}><div className="weight-bar" style={{ height: `${Math.max(8, (entry.weight - min) / (max - min) * 100)}%` }} /><span>{entry.weight}</span><small>{new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(`${entry.date}T12:00:00`))}</small></div>)}</div>;
}

function AnalyticsView({ data, openModal, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; openModal: (modal: Modal) => void; profileName: string }) {
  const completed = data.tasks.filter((task) => task.completed).length;
  const totals = data.foods.filter((food) => food.date === today).reduce((sum, food) => sum + food.calories, 0);
  const averageDailySpend = data.expenses.length ? data.expenses.reduce((sum, item) => sum + item.amount, 0) / Math.max(1, new Set(data.expenses.map((item) => item.date)).size) : 0;
  const last7Days = Array.from({ length: 7 }, (_, index) => dateKey(new Date(Date.now() - (6 - index) * 86400000)));
  const dailyCompletions = last7Days.map((day) => data.tasks.filter((task) => task.completedDates.includes(day)).length);
  const maxCompletions = Math.max(1, ...dailyCompletions);
  const heights = dailyCompletions.map((count) => count ? Math.max(10, Math.round((count / maxCompletions) * 100)) : 4);
  return <div className="content"><PageHeading title="Analytics" description="Patterns to help you be on your own side." name={profileName} /><div className="dashboard-grid"><Panel title="Task rhythm" note="Completed responsibilities across the last seven days"><div className="chart">{heights.map((height, index) => <div className={`chart-col ${index === 6 ? 'current' : ''}`} key={index}><div className="chart-bar" style={{ height: `${height}%` }} /><label>{index === 6 ? 'Today' : new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(new Date(`${last7Days[index]}T12:00:00`))}</label></div>)}</div></Panel><Panel title="A few signals"><div className="metric-grid"><div className="metric"><span className="metric-label">Follow-through</span><strong className="metric-value">{data.tasks.length ? Math.round(completed / data.tasks.length * 100) : 0}%</strong><span className="metric-sub">across your list</span></div><div className="metric"><span className="metric-label">Daily expense</span><strong className="metric-value">{money(averageDailySpend)}</strong><span className="metric-sub">average recorded</span></div><div className="metric"><span className="metric-label">Calories today</span><strong className="metric-value">{totals}</strong><span className="metric-sub">of {data.goals.calories} kcal</span></div><div className="metric"><span className="metric-label">Longest streak</span><strong className="metric-value">{Math.max(0, ...data.tasks.map((task) => task.longestStreak))}</strong><span className="metric-sub">days showing up</span></div></div></Panel></div><div className="dashboard-grid analytics-lower"><Panel title="Weight trend" note="Your latest eight weigh-ins" action={<button className="text-link" onClick={() => openModal('weight')} data-testid="button-analytics-log-weight">Add entry <Plus size={13} /></button>}>{data.weightEntries.length ? <WeightChart data={data} /> : <div className="empty-state"><Scale size={27} /><h3>Start a trend</h3><p>Log your first weigh-in to see change over time.</p></div>}</Panel><Panel title="Food consistency" note="Today's nutrition against your guide"><div className="streak-list">{[['Calories', totals, data.goals.calories], ['Protein', data.foods.filter((food) => food.date === today).reduce((sum, food) => sum + food.protein, 0), data.goals.protein], ['Fibre', data.foods.filter((food) => food.date === today).reduce((sum, food) => sum + food.fibre, 0), data.goals.fibre]].map(([label, value, goal]) => <div className="streak" key={label as string}><span className="streak-name">{label as string}</span><div className="streak-bar"><span style={{ width: `${Math.min(100, Number(value) / Number(goal) * 100)}%` }} /></div><span className="streak-count">{Math.round(Number(value) / Number(goal) * 100)}%</span></div>)}</div></Panel></div></div>;
}

function sheetsStatusLabel(status: SyncStatus, config: StoredSheetsConfig | null) {
  if (status === 'syncing') return 'Syncing…';
  if (status === 'error') return 'Sync error';
  if (config) return 'Connected';
  return 'Not connected';
}

function SettingsView({ data, resetData, openModal, sheets, disconnectSheets, pullSheetsNow, pushSheetsNow, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; resetData: () => void; openModal: (modal: Modal) => void; sheets: ReturnType<typeof useLifeTracker>['sheets']; disconnectSheets: () => void; pullSheetsNow: () => void; pushSheetsNow: () => void; profileName: string }) {
  const [weekly, setWeekly] = useState(true);
  const [compact, setCompact] = useState(false);
  const busy = sheets.status === 'syncing';
  return <div className="content"><PageHeading title="Settings" description="Keep Personal Tracker feeling like yours." name={profileName} /><div className="view-card"><Panel title="Preferences" note="Small choices for a better daily ritual"><div className="settings-list"><div className="setting-row"><div><strong>Weekly reflection</strong><p>A quiet nudge on Sunday evening.</p></div><button className={`switch ${weekly ? 'on' : ''}`} onClick={() => setWeekly(!weekly)} aria-label="Toggle weekly reflection" data-testid="button-toggle-weekly"><span /></button></div><div className="setting-row"><div><strong>Compact task list</strong><p>Show more of your day at once.</p></div><button className={`switch ${compact ? 'on' : ''}`} onClick={() => setCompact(!compact)} aria-label="Toggle compact task list" data-testid="button-toggle-compact"><span /></button></div><div className="setting-row"><div><strong>Nutrition goals</strong><p>{data.goals.calories} kcal · {data.goals.protein}g protein · {data.goals.fibre}g fibre</p></div><button className="ghost-button" onClick={() => openModal('goals')} data-testid="button-edit-goals">Edit goals <ChevronRight size={14} /></button></div><div className="setting-row"><div><strong>Google Sheets sync</strong><p>{sheets.config ? `Backed up to your Sheet${sheets.config.lastSyncedAt ? ` · last synced ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(sheets.config.lastSyncedAt))}` : ''}` : 'Not connected — your data stays in this browser.'}</p>{sheets.status === 'error' && sheets.error && <p className="sync-error">{sheets.error}</p>}</div><div className="setting-actions"><span className={`sync-status ${sheets.config ? 'connected' : ''} ${sheets.status}`}><span /> {sheetsStatusLabel(sheets.status, sheets.config)}</span>{sheets.config ? <>
    <button className="ghost-button" onClick={pullSheetsNow} disabled={busy} data-testid="button-pull-sheets">Pull latest</button>
    <button className="ghost-button" onClick={pushSheetsNow} disabled={busy} data-testid="button-push-sheets">Push now</button>
    <button className="cancel-button" onClick={() => { if (window.confirm('Disconnect Google Sheets sync? Your local data stays right where it is.')) disconnectSheets(); }} data-testid="button-disconnect-sheets"><Trash2 size={14} /> Disconnect</button>
  </> : <button className="ghost-button" onClick={() => openModal('sheets')} data-testid="button-connect-sheets">Connect <ChevronRight size={14} /></button>}</div></div><div className="setting-row"><div><strong>Data & privacy</strong><p>Your entries stay in this browser, plus your own Google Sheet once connected.</p></div><button className="ghost-button" onClick={() => window.alert('Personal Tracker stores your data locally. Google Sheets sync is optional and only talks to the sheet you connect.')} data-testid="button-view-privacy">Read note <ChevronRight size={14} /></button></div><div className="setting-row"><div><strong>Start fresh</strong><p>Clear everything in this browser and return to the beginning.</p></div><button className="cancel-button" onClick={() => { if (window.confirm('Reset all data?')) resetData(); }} data-testid="button-reset-data"><Trash2 size={14} /> Reset</button></div></div></Panel></div></div>;
}

function ModalForm({ modal, close, addTask, addExpense, addFood, addFoodDatabase, addWeight, updateGoals, connectSheets, goals, foodDatabase, categories }: { modal: Modal; close: () => void; addTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt' | 'completedDates' | 'currentStreak' | 'longestStreak'>) => void; addExpense: (expense: Omit<Expense, 'id' | 'date'>) => void; addFood: (food: Omit<Food, 'id' | 'time' | 'date'>) => void; addFoodDatabase: (food: FoodDatabaseEntry) => void; addWeight: (weight: number, date?: string) => void; updateGoals: (goals: Goals) => void; connectSheets: (config: SheetsConfig, mode: 'import' | 'push') => Promise<void>; goals: Goals; foodDatabase: FoodDatabaseEntry[]; categories: string[] }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [foodMatch, setFoodMatch] = useState<FoodDatabaseEntry | null>(null);
  const [connecting, setConnecting] = useState(false);
  useEffect(() => { setForm({}); setFoodMatch(null); setConnecting(false); }, [modal]);
  if (!modal) return null;
  const title = modal === 'task' ? 'Add a task' : modal === 'expense' ? 'Log an expense' : modal === 'food' ? 'Add a food moment' : modal === 'weight' ? 'Log weight' : modal === 'sheets' ? 'Connect Google Sheets' : 'Nutrition goals';
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const findFood = (value: string) => { update('label', value); const match = foodDatabase.find((food) => food.label.toLowerCase() === value.trim().toLowerCase()); setFoodMatch(match ?? null); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (modal === 'sheets') {
      const url = form.url?.trim();
      const token = form.token?.trim();
      if (!url || !token) return;
      setConnecting(true);
      try {
        const preview = await pullFromSheets({ url, token });
        const hasRemoteData = Boolean(preview.tasks.length || preview.expenses.length || preview.foods.length || preview.foodDatabase.length || preview.weightEntries.length);
        const importRemote = hasRemoteData && window.confirm('This sheet already has data in it. Import it and replace what you have now?\n\nChoose Cancel to keep your local data and push it to the sheet instead.');
        await connectSheets({ url, token }, importRemote ? 'import' : 'push');
        close();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not connect to Google Sheets.');
      } finally {
        setConnecting(false);
      }
      return;
    }
    if (modal === 'task' && form.title?.trim()) addTask({ title: form.title.trim(), due: (form.due as Task['due']) || 'Today', priority: (form.priority as Task['priority']) || 'medium', recurrence: (form.recurrence as Recurrence) || 'none', recurrenceValue: form.recurrenceValue ? Number(form.recurrenceValue) : undefined });
    if (modal === 'expense' && form.label?.trim() && form.amount) addExpense({ label: form.label.trim(), amount: Number(form.amount), category: form.category || categories[0] || 'Miscellaneous' });
    if (modal === 'food' && form.label?.trim() && form.calories) { const food = { label: form.label.trim(), calories: Number(form.calories), protein: Number(form.protein || 0), carbs: Number(form.carbs || 0), fat: Number(form.fat || 0), fibre: Number(form.fibre || 0) }; addFood(food); addFoodDatabase({ ...food, quantity: Number(form.quantity || 1), unit: (form.unit as FoodDatabaseEntry['unit']) || 'piece' }); }
    if (modal === 'weight' && form.weight) addWeight(Number(form.weight), form.date || today);
    if (modal === 'goals') updateGoals({ calories: Number(form.calories || goals.calories), protein: Number(form.protein || goals.protein), carbs: Number(form.carbs || goals.carbs), fat: Number(form.fat || goals.fat), fibre: Number(form.fibre || goals.fibre), dailySpend: Number(form.dailySpend || goals.dailySpend) });
    close();
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><form className="modal" onSubmit={submit}><div className="modal-head"><div><h2>{title}</h2><p>{modal === 'sheets' ? 'Paste the Web app URL and token from your Apps Script deployment.' : 'Keep it simple. You can always add detail later.'}</p></div><button type="button" className="icon-button" onClick={close} aria-label="Close dialog" data-testid="button-close-dialog"><X size={17} /></button></div><div className="form-grid">
    {modal === 'sheets' && <><div className="field"><label htmlFor="sheets-url">Web app URL</label><input id="sheets-url" autoFocus value={form.url || ''} onChange={(event) => update('url', event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" data-testid="input-sheets-url" /></div><div className="field"><label htmlFor="sheets-token">Sync token</label><input id="sheets-token" type="password" value={form.token || ''} onChange={(event) => update('token', event.target.value)} placeholder="Your SYNC_TOKEN value" data-testid="input-sheets-token" /></div><p className="field-hint">See GOOGLE_SHEETS_SETUP.md in the project for step-by-step setup instructions.</p></>}
    {modal === 'task' && <><div className="field"><label htmlFor="task-title">What needs doing?</label><input id="task-title" autoFocus value={form.title || ''} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Water the plants" data-testid="input-task-title" /></div><div className="form-grid form-two"><div className="field"><label htmlFor="task-due">When</label><select id="task-due" value={form.due || 'Today'} onChange={(event) => update('due', event.target.value)} data-testid="select-task-due"><option>Today</option><option>Tomorrow</option><option>This week</option></select></div><div className="field"><label htmlFor="task-priority">Energy needed</label><select id="task-priority" value={form.priority || 'medium'} onChange={(event) => update('priority', event.target.value)} data-testid="select-task-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div></div><div className="form-grid form-two"><div className="field"><label htmlFor="task-recurrence">Repeat</label><select id="task-recurrence" value={form.recurrence || 'none'} onChange={(event) => update('recurrence', event.target.value)} data-testid="select-task-recurrence"><option value="none">One-time</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></div><div className="field"><label htmlFor="task-recurrence-value">Schedule day</label><input id="task-recurrence-value" type="number" min="1" max="31" value={form.recurrenceValue || ''} onChange={(event) => update('recurrenceValue', event.target.value)} placeholder="Optional" /></div></div></>}
    {modal === 'expense' && <><div className="field"><label htmlFor="expense-label">What was it?</label><input id="expense-label" autoFocus value={form.label || ''} onChange={(event) => update('label', event.target.value)} placeholder="e.g. Friday lunch" data-testid="input-expense-label" /></div><div className="form-grid form-two"><div className="field"><label htmlFor="expense-amount">Amount</label><input id="expense-amount" type="number" min="0" step=".01" value={form.amount || ''} onChange={(event) => update('amount', event.target.value)} placeholder="0.00" data-testid="input-expense-amount" /></div><div className="field"><label htmlFor="expense-category">Category</label><select id="expense-category" value={form.category || categories[0]} onChange={(event) => update('category', event.target.value)} data-testid="select-expense-category">{categories.map((category) => <option key={category}>{category}</option>)}</select></div></div></>}
    {modal === 'food' && <><div className="field"><label htmlFor="food-label">Food or natural language</label><input id="food-label" autoFocus value={form.label || ''} onChange={(event) => findFood(event.target.value)} placeholder="Try “2 roti” or “Paneer”" data-testid="input-food-label" />{form.label && foodMatch && <p className="field-hint">Found in your food database. Nutrition has been filled in below.</p>}{form.label && !foodMatch && form.label.length > 2 && <p className="field-hint">Food not found. Enter the values once and it will be remembered.</p>}</div><div className="form-grid form-two"><div className="field"><label htmlFor="food-quantity">Quantity</label><input id="food-quantity" type="number" min="0" step=".1" value={form.quantity || '1'} onChange={(event) => update('quantity', event.target.value)} /></div><div className="field"><label htmlFor="food-unit">Unit</label><select id="food-unit" value={form.unit || 'piece'} onChange={(event) => update('unit', event.target.value)}><option value="piece">piece</option><option value="g">g</option><option value="ml">ml</option></select></div></div><div className="form-grid form-two">{[['calories', 'Calories (kcal)'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)'], ['fibre', 'Fibre (g)']].map(([key, label]) => <div className="field" key={key}><label htmlFor={`food-${key}`}>{label}</label><input id={`food-${key}`} type="number" min="0" step=".1" value={form[key] ?? (foodMatch ? String(foodMatch[key as keyof FoodDatabaseEntry] ?? 0) : '')} onChange={(event) => update(key, event.target.value)} placeholder="0" data-testid={`input-food-${key}`} /></div>)}</div></>}
    {modal === 'weight' && <div className="form-grid form-two"><div className="field"><label htmlFor="weight-value">Weight (kg)</label><input id="weight-value" autoFocus type="number" min="0" step=".1" value={form.weight || ''} onChange={(event) => update('weight', event.target.value)} placeholder="68.4" data-testid="input-weight" /></div><div className="field"><label htmlFor="weight-date">Date</label><input id="weight-date" type="date" value={form.date || today} onChange={(event) => update('date', event.target.value)} data-testid="input-weight-date" /></div></div>}
    {modal === 'goals' && <div className="form-grid form-two">{[['calories', 'Calories (kcal)', goals.calories], ['protein', 'Protein (g)', goals.protein], ['carbs', 'Carbs (g)', goals.carbs], ['fat', 'Fat (g)', goals.fat], ['fibre', 'Fibre (g)', goals.fibre], ['dailySpend', 'Daily spend guide', goals.dailySpend]].map(([key, label, value]) => <div className="field" key={key as string}><label htmlFor={`goal-${key}`}>{label as string}</label><input id={`goal-${key}`} type="number" min="0" step=".1" value={form[key as string] ?? String(value)} onChange={(event) => update(key as string, event.target.value)} data-testid={`input-goal-${key}`} /></div>)}</div>}
  </div><div className="modal-actions"><button type="button" className="cancel-button" onClick={close} data-testid="button-cancel-dialog">Cancel</button><button type="submit" className="primary-button" disabled={connecting} data-testid="button-save-dialog"><Check size={15} /> {modal === 'sheets' ? (connecting ? 'Connecting…' : 'Test & connect') : 'Save entry'}</button></div></form></div>;
}

const PROFILE_NAME_KEY = 'life-tracker-profile-name';

function readProfileName(): string | null {
  try {
    return localStorage.getItem(PROFILE_NAME_KEY);
  } catch {
    return null;
  }
}

function Onboarding({ onComplete }: { onComplete: (name: string) => void }) {
  const [name, setName] = useState('');
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onComplete(trimmed);
  };
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><h2>Welcome</h2><p>What should we call you?</p></div></div><div className="form-grid"><div className="field"><label htmlFor="onboarding-name">Your name</label><input id="onboarding-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Jordan" data-testid="input-onboarding-name" /></div></div><div className="modal-actions"><button type="submit" className="primary-button" disabled={!name.trim()} data-testid="button-onboarding-continue"><Check size={15} /> Continue</button></div></form></div>;
}

function App() {
  const tracker = useLifeTracker();
  const { data, toggleTask, deleteTask, addTask, addExpense, addFood, addFoodDatabase, addWeight, updateGoals, resetData, sheets, connectSheets, disconnectSheets, pullSheetsNow, pushSheetsNow } = tracker;
  const [view, setView] = useState<View>('dashboard');
  const [modal, setModal] = useState<Modal>(null);
  const [profileName, setProfileName] = useState<string | null>(readProfileName);
  const content = useMemo(() => {
    if (view === 'dashboard') return <Dashboard data={data} toggleTask={toggleTask} openModal={setModal} setView={setView} profileName={profileName ?? ''} />;
    if (view === 'tasks') return <TasksView data={data} toggleTask={toggleTask} deleteTask={deleteTask} openModal={setModal} profileName={profileName ?? ''} />;
    if (view === 'expenses') return <ExpensesView data={data} openModal={setModal} profileName={profileName ?? ''} />;
    if (view === 'nutrition') return <NutritionView data={data} openModal={setModal} profileName={profileName ?? ''} />;
    if (view === 'analytics') return <AnalyticsView data={data} openModal={setModal} profileName={profileName ?? ''} />;
    return <SettingsView data={data} resetData={resetData} openModal={setModal} sheets={sheets} disconnectSheets={disconnectSheets} pullSheetsNow={pullSheetsNow} pushSheetsNow={pushSheetsNow} profileName={profileName ?? ''} />;
  }, [data, deleteTask, disconnectSheets, profileName, pullSheetsNow, pushSheetsNow, resetData, sheets, toggleTask, view]);
  if (!profileName) return <Onboarding onComplete={(name) => { try { localStorage.setItem(PROFILE_NAME_KEY, name); } catch { /* ignore */ } setProfileName(name); }} />;
  return <QueryClientProvider client={queryClient}><TooltipProvider><Shell view={view} setView={setView} profileName={profileName}>{content}</Shell><ModalForm modal={modal} close={() => setModal(null)} addTask={addTask} addExpense={addExpense} addFood={addFood} addFoodDatabase={addFoodDatabase} addWeight={addWeight} updateGoals={updateGoals} connectSheets={connectSheets} goals={data.goals} foodDatabase={data.foodDatabase} categories={data.categories} /></TooltipProvider></QueryClientProvider>;
}

export default App;