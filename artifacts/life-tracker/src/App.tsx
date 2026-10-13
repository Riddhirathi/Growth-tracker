import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight,
  CircleDollarSign, ClipboardList, Coffee, CookingPot, Download, Flame, Goal,
  LayoutDashboard, MoreHorizontal, Pencil, Plus, RotateCcw, Scale, Settings, Sparkles,
  Trash2, Utensils, Wallet, X,
} from 'lucide-react';
import {
  addDays,
  dateKey,
  isDueOn,
  isTaskScheduledOn,
  isTaskStopped,
  useLifeTracker,
  WEEKDAYS,
  type Expense,
  type Food,
  type FoodDatabaseEntry,
  type Goals,
  type Recurrence,
  type StoredSheetsConfig,
  type SyncStatus,
  type Task,
  type Weekday,
} from '@/hooks/use-life-tracker';
import { pullFromSheets, type SheetsConfig } from '@/lib/sheetsClient';

const queryClient = new QueryClient();
type View = 'dashboard' | 'tasks' | 'expenses' | 'nutrition' | 'analytics' | 'settings';
type Modal = 'task' | 'expense' | 'food' | 'quickfood' | 'weight' | 'goals' | 'sheets' | null;
type LifecycleAction = { task: Task; kind: 'stop' | 'delete' } | null;
const today = dateKey();
const todayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const formatDate = (value: string) => value === today ? 'Today' : value === dateKey(new Date(Date.now() - 86400000)) ? 'Yesterday' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
const weekdayShort = (day: Weekday) => day[0].toUpperCase() + day.slice(1, 3);
const recurrenceLabel = (value: Recurrence) => value.length === 7 ? 'Every day' : value.length ? `Every ${value.map(weekdayShort).join(', ')}` : 'One-time';
const hasHistory = (task: Task) => task.completedDates.length > 0 || task.currentStreak > 0 || task.longestStreak > 0;

// Cosmetic per-habit color, hashed from the task id so it stays stable across renders/sorts.
// Hues sampled from the reference habit-tracker screenshots' row colors.
const HABIT_COLORS = [
  { bg: '#cdeaf8', fg: '#2f8fc7' }, // sky blue (Drink water)
  { bg: '#f8d7e0', fg: '#d85f82' }, // rose (Yoga)
  { bg: '#c7cfe8', fg: '#4a5699' }, // slate blue (Drink Less Beverage)
  { bg: '#ecdbe9', fg: '#96529a' }, // lavender (Eat Breakfast)
  { bg: '#c3ecb8', fg: '#3f9e4f' }, // green (Walk)
  { bg: '#f6e2b8', fg: '#c98a35' }, // peach/tan (Run)
  { bg: '#cde9f2', fg: '#2f8fae' }, // powder blue (Meditation)
];
function habitColor(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return HABIT_COLORS[hash % HABIT_COLORS.length];
}

const ICON_CHOICES = ['✅', '💧', '🏃', '🧘', '🏋️', '📚', '🧹', '🥗', '😴', '🚶', '✍️', '🎯', '💊', '🧑‍🍳', '🎸', '🙏'];
const ICON_GUESSES: [RegExp, string][] = [
  [/water|hydrat/i, '💧'], [/run/i, '🏃'], [/walk|step/i, '🚶'], [/yoga|meditat|breath/i, '🧘'],
  [/gym|workout|exercise|lift/i, '🏋️'], [/read|book/i, '📚'], [/clean|tidy/i, '🧹'],
  [/eat|diet|meal|food|veg/i, '🥗'], [/sleep|rest/i, '😴'], [/write|journal/i, '✍️'],
  [/medic|pill|vitamin/i, '💊'], [/cook/i, '🧑‍🍳'], [/pray|gratitude/i, '🙏'], [/music|guitar|piano/i, '🎸'],
];
const guessIcon = (title: string) => ICON_GUESSES.find(([pattern]) => pattern.test(title))?.[1] ?? '🎯';

// ---- Habit Reports date-range helpers ----
const formatMonthDay = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
function mondayOf(date: string) {
  const dow = new Date(`${date}T12:00:00`).getDay();
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}
function weekRange(offset: number) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(mondayOf(today), offset * 7 + index));
  return { start: days[0], end: days[6], days };
}
function monthRange(offset: number) {
  const base = new Date(`${today}T12:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth() + offset;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => dateKey(new Date(year, month, index + 1)));
  return { year: new Date(year, month, 1).getFullYear(), month: new Date(year, month, 1).getMonth(), days };
}
function yearRange(offset: number) {
  const year = new Date(`${today}T12:00:00`).getFullYear() + offset;
  const months = Array.from({ length: 12 }, (_, month) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, index) => dateKey(new Date(year, month, index + 1)));
    return { month, label: new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(year, month, 1)), days };
  });
  return { year, months };
}
type CellStatus = 'done' | 'missed' | 'pending' | 'future' | 'na';
function cellStatus(task: Task, date: string): CellStatus {
  if (task.completedDates.includes(date)) return 'done';
  if (!isDueOn(task, date)) return 'na';
  if (date > today) return 'future';
  if (date === today) return 'pending';
  return 'missed';
}
function reportStats(tasks: Task[], days: string[]) {
  let dueCount = 0, doneCount = 0, perfectDays = 0, bestStreak = 0, run = 0;
  days.filter((day) => day <= today).forEach((day) => {
    const dueTasks = tasks.filter((task) => isDueOn(task, day) || task.completedDates.includes(day));
    if (!dueTasks.length) { run = 0; return; }
    const doneTasks = dueTasks.filter((task) => task.completedDates.includes(day));
    dueCount += dueTasks.length;
    doneCount += doneTasks.length;
    if (doneTasks.length === dueTasks.length) { perfectDays += 1; run += 1; bestStreak = Math.max(bestStreak, run); } else run = 0;
  });
  return { met: dueCount ? Math.round((doneCount / dueCount) * 100) : 0, perfectDays, doneCount, bestStreak };
}
function monthMatrix(year: number, month: number) {
  const firstDow = new Date(year, month, 1).getDay();
  const leadBlanks = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(leadBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => dateKey(new Date(year, month, index + 1)))];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

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

function Panel({ title, note, children, action, style }: { title: string; note?: string; children: React.ReactNode; action?: React.ReactNode; style?: React.CSSProperties }) {
  return <section className="panel" style={style}><div className="panel-head"><div><div className="panel-title">{title}</div>{note && <p className="panel-note">{note}</p>}</div>{action}</div>{children}</section>;
}

function RowMenu({ task, editTask, onLifecycle, reactivateTask }: { task: Task; editTask: (task: Task) => void; onLifecycle: (task: Task, kind: 'stop' | 'delete') => void; reactivateTask: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const stopped = isTaskStopped(task);
  return <div className="row-menu">
    <button type="button" className="row-action" onClick={() => setOpen((value) => !value)} aria-label={`More actions for ${task.title}`} data-testid={`button-menu-task-${task.id}`}><MoreHorizontal size={15} /></button>
    {open && <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 14 }} onClick={() => setOpen(false)} />
      <div className="row-menu-pop" role="menu">
        <button type="button" className="row-menu-item" onClick={() => { setOpen(false); editTask(task); }} data-testid={`button-edit-task-${task.id}`}><Pencil size={14} /> Edit</button>
        {!stopped && task.recurrence.length > 0 && <button type="button" className="row-menu-item" onClick={() => { setOpen(false); onLifecycle(task, 'stop'); }} data-testid={`button-stop-task-${task.id}`}><Archive size={14} /> Stop repeating</button>}
        {stopped && <button type="button" className="row-menu-item" onClick={() => { setOpen(false); reactivateTask(task.id); }} data-testid={`button-reactivate-task-${task.id}`}><RotateCcw size={14} /> Reactivate</button>}
        <button type="button" className="row-menu-item danger" onClick={() => { setOpen(false); onLifecycle(task, 'delete'); }} data-testid={`button-delete-task-${task.id}`}><Trash2 size={14} /> Delete forever</button>
      </div>
    </>}
  </div>;
}

function TaskRows({ tasks, toggleTask, editTask, onLifecycle, reactivateTask, limit, date }: { tasks: Task[]; toggleTask: (id: string) => void; editTask?: (task: Task) => void; onLifecycle?: (task: Task, kind: 'stop' | 'delete') => void; reactivateTask?: (id: string) => void; limit?: number; date?: string }) {
  const visible = limit ? tasks.slice(0, limit) : tasks;
  return <div className="task-list">{visible.map((task) => {
    const done = date ? task.completedDates.includes(date) : task.completed;
    const stopped = isTaskStopped(task);
    const color = habitColor(task.id);
    return <div className={`task-row ${done ? 'completed' : ''} ${stopped ? 'stopped' : ''}`} key={task.id} data-testid={`row-task-${task.id}`}>
      {stopped ? <span className="task-icon" style={{ background: color.bg, color: color.fg }}>{task.icon || guessIcon(task.title)}</span> :
        <button type="button" className={`check ${done ? 'done' : ''}`} onClick={() => toggleTask(task.id)} aria-label={`Mark ${task.title} ${done ? 'incomplete' : 'complete'}`} data-testid={`button-complete-task-${task.id}`}>{done && <Check size={13} strokeWidth={3} />}</button>}
      <div className="task-copy"><div className="task-name">{task.title}</div><div className="task-meta">
        {stopped ? `Stopped ${formatDate(task.endDate!)}` : task.recurrence.length ? recurrenceLabel(task.recurrence) : formatDate(task.createdAt)}
        {!stopped && ` · ${done ? 'Done' : 'Open'}`}
        {task.currentStreak > 0 && !stopped && <span className="flame-badge"><Flame size={11} strokeWidth={2.5} /> {task.currentStreak}</span>}
      </div></div>
      <span className={`priority-dot ${task.priority}`} />
      {editTask && onLifecycle && reactivateTask && <RowMenu task={task} editTask={editTask} onLifecycle={onLifecycle} reactivateTask={reactivateTask} />}
    </div>;
  })}</div>;
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
  const todayTasks = data.tasks.filter((task) => isTaskScheduledOn(task, today));
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
        <Panel title="Habit momentum" note="The quiet power of showing up"><div className="streak-list">{data.tasks.filter((task) => task.recurrence.length).slice(0, 3).map((task) => <div className="streak" key={task.id}><span className="streak-name">{task.title}</span><div className="streak-bar"><span style={{ width: `${Math.min(100, task.currentStreak * 8)}%` }} /></div><span className="streak-count">{task.currentStreak} days</span></div>)}</div></Panel>
        <Panel title="Latest weigh-in" action={<button className="text-link" onClick={() => openModal('weight')} data-testid="button-log-weight">Log <Plus size={13} style={{ verticalAlign: 'middle' }} /></button>}><div className="weight-snapshot"><div className="food-dot weight-dot"><Scale size={21} /></div><div><strong>{latestWeight ? `${latestWeight.weight} kg` : '–'}</strong><p className="panel-note">{latestWeight ? formatDate(latestWeight.date) : 'No entries yet'}{data.weightEntries.length > 1 ? ` · ${(latestWeight.weight - data.weightEntries[data.weightEntries.length - 2].weight).toFixed(1)} kg since last entry` : ''}</p></div></div></Panel>
      </div>
    </div>
  </div>;
}

function DateStrip({ selected, onSelect, hasActivity }: { selected: string; onSelect: (date: string) => void; hasActivity: (date: string) => boolean }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(selected, index - 3));
  return <div className="date-strip" role="group" aria-label="Choose a day">{days.map((day) => {
    const dayNum = new Date(`${day}T12:00:00`).getDate();
    const label = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${day}T12:00:00`));
    return <button type="button" key={day} className={`date-pill ${day === today ? 'today' : ''} ${day === selected ? 'selected' : ''} ${hasActivity(day) ? 'has-activity' : ''}`} onClick={() => onSelect(day)} aria-pressed={day === selected} data-testid={`button-date-${day}`}>
      <span className="date-pill-label">{label}</span><span className="date-pill-ring">{dayNum}</span><span className="date-pill-dot" />
    </button>;
  })}</div>;
}

function TasksView({ data, toggleTask, editTask, deleteTask, stopTask, reactivateTask, openModal, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; toggleTask: (id: string, date?: string) => void; editTask: (task: Task) => void; deleteTask: (id: string) => void; stopTask: (id: string, endDate: string) => void; reactivateTask: (id: string) => void; openModal: (modal: Modal) => void; profileName: string }) {
  const [viewDate, setViewDate] = useState(today);
  const [showJump, setShowJump] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleAction>(null);
  const [showStopped, setShowStopped] = useState(false);
  const dayTasks = data.tasks.filter((task) => isTaskScheduledOn(task, viewDate));
  const openCount = dayTasks.filter((task) => !task.completedDates.includes(viewDate)).length;
  const activeHabits = data.tasks.filter((task) => task.recurrence.length && !isTaskStopped(task));
  const stoppedTasks = data.tasks.filter((task) => isTaskStopped(task));
  const handleLifecycle = (task: Task, kind: 'stop' | 'delete') => setLifecycle({ task, kind });
  const confirmStop = (task: Task, endDate: string) => { stopTask(task.id, endDate); setLifecycle(null); };
  const confirmDelete = (task: Task) => { deleteTask(task.id); setLifecycle(null); };
  return <div className="content"><PageHeading title="Tasks" description="A softer way to hold everything you mean to do." action={<button className="primary-button" onClick={() => openModal('task')} data-testid="button-add-task"><Plus size={15} /> Add task</button>} name={profileName} />
    <div className="dashboard-grid">
      <div className="view-card">
        <Panel title={viewDate === today ? "Today's tasks" : `Tasks for ${formatDate(viewDate)}`} note={`${openCount} open`} action={<button type="button" className="icon-button" onClick={() => setShowJump((value) => !value)} aria-label="Jump to a date" data-testid="button-toggle-date-jump"><CalendarDays size={16} /></button>}>
          <DateStrip selected={viewDate} onSelect={setViewDate} hasActivity={(day) => data.tasks.some((task) => task.completedDates.includes(day))} />
          {showJump && <div className="toolbar" style={{ marginBottom: 14 }}><input type="date" className="search-input" value={viewDate} onChange={(event) => setViewDate(event.target.value)} aria-label="Date to view" data-testid="input-task-view-date" />{viewDate !== today && <button type="button" className="text-link" onClick={() => setViewDate(today)} data-testid="button-task-today">Back to today</button>}</div>}
          {dayTasks.length ? <TaskRows tasks={dayTasks} toggleTask={(id) => toggleTask(id, viewDate)} editTask={editTask} onLifecycle={handleLifecycle} reactivateTask={reactivateTask} date={viewDate} /> : <div className="empty-state"><Check size={27} /><h3>Nothing scheduled for this day.</h3><p>Add a task, or set one to repeat on this weekday.</p><button className="primary-button" onClick={() => openModal('task')} data-testid="button-empty-add-task"><Plus size={15} /> Add a task</button></div>}
        </Panel>
        {stoppedTasks.length > 0 && <Panel title="Stopped" note={`${stoppedTasks.length} no longer repeating — their history is safe`} action={<button type="button" className="text-link" onClick={() => setShowStopped((value) => !value)} data-testid="button-toggle-stopped">{showStopped ? 'Hide' : 'Show'}</button>} style={{ marginTop: 18 }}>
          {showStopped && <TaskRows tasks={stoppedTasks} toggleTask={() => {}} editTask={editTask} onLifecycle={handleLifecycle} reactivateTask={reactivateTask} />}
        </Panel>}
      </div>
      <Panel title="Streaks" note="Recurring tasks keep their history">{activeHabits.length ? <div className="streak-list">{activeHabits.map((task) => <div className="streak-detail" key={task.id}><div><strong>{task.title}</strong><small>{recurrenceLabel(task.recurrence)} · current {task.currentStreak} days</small></div><b>{task.longestStreak}<small>longest</small></b></div>)}</div> : <p className="panel-note">Make a task recurring to start a streak.</p>}</Panel>
    </div>
    {lifecycle && <TaskLifecycleDialog action={lifecycle} close={() => setLifecycle(null)} confirmStop={confirmStop} confirmDelete={confirmDelete} />}
  </div>;
}

function TaskLifecycleDialog({ action, close, confirmStop, confirmDelete }: { action: NonNullable<LifecycleAction>; close: () => void; confirmStop: (task: Task, endDate: string) => void; confirmDelete: (task: Task) => void }) {
  const { task, kind } = action;
  const [mode, setMode] = useState<'stop' | 'delete'>(kind);
  const [when, setWhen] = useState<'after' | 'now'>('after');
  const history = hasHistory(task);
  const canOfferStop = task.recurrence.length > 0 && !isTaskStopped(task);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal warning">
      <div className="modal-head"><div><h2>{mode === 'stop' ? 'Stop repeating?' : 'Delete forever?'}</h2><p>{task.title}</p></div><button type="button" className="icon-button" onClick={close} aria-label="Close dialog" data-testid="button-close-lifecycle"><X size={17} /></button></div>
      {mode === 'stop' ? <>
        <p className="modal-copy">This removes <strong>{task.title}</strong> from future days only. {history ? <>Your {task.completedDates.length} logged day{task.completedDates.length === 1 ? '' : 's'} and {task.longestStreak}-day best streak stay exactly as they are, visible in Reports.</> : 'It has no history yet, so nothing is lost either way.'}</p>
        <div className="choice-row" role="radiogroup" aria-label="When should it stop">
          <label className={`choice-option ${when === 'after' ? 'selected' : ''}`}><input type="radio" name="when" checked={when === 'after'} onChange={() => setWhen('after')} /><div><strong>Stop after today</strong><span>Today still counts if you complete it. Gone from tomorrow.</span></div></label>
          <label className={`choice-option ${when === 'now' ? 'selected' : ''}`}><input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} /><div><strong>Stop right now</strong><span>Removed from today too. Everything before today is untouched.</span></div></label>
        </div>
        <div className="modal-actions"><button type="button" className="cancel-button" onClick={close} data-testid="button-cancel-lifecycle">Cancel</button><button type="button" className="primary-button" onClick={() => confirmStop(task, when === 'after' ? today : addDays(today, -1))} data-testid="button-confirm-stop"><Archive size={15} /> Stop repeating</button></div>
      </> : <>
        {history ? <div className="warning-box"><AlertTriangle size={16} style={{ flex: '0 0 auto' }} /><span>This permanently erases <strong>{task.title}</strong> and all {task.completedDates.length} day{task.completedDates.length === 1 ? '' : 's'} of its history{task.recurrence.length > 0 ? `, including its ${task.longestStreak}-day best streak` : ''}. It will disappear from Reports too — not just future days. This can't be undone.</span></div> : <p className="modal-copy">This task has no history yet — deleting it is safe and can't be undone either way.</p>}
        {canOfferStop && history && <button type="button" className="text-link" style={{ marginTop: 12 }} onClick={() => setMode('stop')} data-testid="button-switch-to-stop">Stop repeating instead — keeps your history →</button>}
        <div className="modal-actions"><button type="button" className="cancel-button" onClick={close} data-testid="button-cancel-lifecycle">Cancel</button><button type="button" className="danger-button" onClick={() => confirmDelete(task)} data-testid="button-confirm-delete"><Trash2 size={15} /> Delete forever</button></div>
      </>}
    </div>
  </div>;
}

function expensesInRange(expenses: Expense[], start: string, end: string) {
  return expenses.filter((item) => item.date >= start && item.date <= end);
}

function categoryBreakdown(expenses: Expense[]) {
  const map = new Map<string, number>();
  expenses.forEach((item) => map.set(item.category, (map.get(item.category) ?? 0) + item.amount));
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  return [...map.entries()].map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value);
}

function ExpenseReports({ data }: { data: ReturnType<typeof useLifeTracker>['data'] }) {
  const [mode, setMode] = useState<'monthly' | 'yearly' | 'all'>('monthly');
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [mode]);

  const month = mode === 'monthly' ? monthRange(offset) : null;
  const year = mode === 'yearly' ? yearRange(offset) : null;
  const earliest = data.expenses.reduce((min, item) => (item.date < min ? item.date : min), data.expenses[0]?.date ?? today);
  const start = month ? month.days[0] : year ? `${year.year}-01-01` : earliest;
  const end = month ? month.days[month.days.length - 1] : year ? `${year.year}-12-31` : today;
  const periodExpenses = expensesInRange(data.expenses, start, end);
  const total = periodExpenses.reduce((sum, item) => sum + item.amount, 0);
  const elapsedEnd = end > today ? today : end;
  const elapsedDays = start > today ? 0 : Math.round((new Date(`${elapsedEnd}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000) + 1;
  const avgPerDay = elapsedDays > 0 ? total / elapsedDays : 0;
  const breakdown = categoryBreakdown(periodExpenses);
  const rangeLabel = month ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(month.year, month.month, 1)) : year ? String(year.year) : 'Everything recorded';

  let trendLabels: string[] = [];
  let trendValues: number[] = [];
  let currentIndex = -1;
  if (month) {
    trendLabels = month.days.map((day) => String(Number(day.slice(-2))));
    trendValues = month.days.map((day) => periodExpenses.filter((item) => item.date === day).reduce((sum, item) => sum + item.amount, 0));
    if (offset === 0) currentIndex = Number(today.slice(-2)) - 1;
  } else if (year) {
    trendLabels = year.months.map((entry) => entry.label);
    trendValues = year.months.map((entry) => {
      const prefix = `${year.year}-${String(entry.month + 1).padStart(2, '0')}`;
      return periodExpenses.filter((item) => item.date.startsWith(prefix)).reduce((sum, item) => sum + item.amount, 0);
    });
    if (offset === 0) currentIndex = new Date(`${today}T12:00:00`).getMonth();
  } else {
    const years = [...new Set(data.expenses.map((item) => item.date.slice(0, 4)))].sort();
    trendLabels = years;
    trendValues = years.map((year4) => data.expenses.filter((item) => item.date.startsWith(year4)).reduce((sum, item) => sum + item.amount, 0));
    currentIndex = years.indexOf(today.slice(0, 4));
  }
  const maxTrend = Math.max(1, ...trendValues);

  return <Panel title="Expense Reports" note="Where your money actually goes">
    <div className="toolbar" style={{ marginBottom: 14 }}>
      <div className="filter-tabs" role="tablist" aria-label="Report range">{(['monthly', 'yearly', 'all'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={`filter-tab ${mode === value ? 'active' : ''}`} onClick={() => setMode(value)} data-testid={`button-expense-report-${value}`}>{value === 'all' ? 'All-time' : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      {mode !== 'all' && <div className="report-range">
        <button type="button" className="report-nav" onClick={() => setOffset((value) => value - 1)} aria-label="Previous period" data-testid="button-expense-report-prev"><ChevronLeft size={15} /></button>
        <span className="report-range-label">{rangeLabel}</span>
        <button type="button" className="report-nav" onClick={() => setOffset((value) => Math.min(0, value + 1))} disabled={offset >= 0} aria-label="Next period" data-testid="button-expense-report-next"><ChevronRight size={15} /></button>
      </div>}
    </div>
    {!periodExpenses.length ? <div className="empty-state"><Wallet size={27} /><h3>Nothing logged{mode === 'all' ? '' : ' in this period'}.</h3><p>Add an expense to see it broken down here.</p></div> : <>
      <div className="nutrition-total" style={{ marginBottom: 4 }}><strong>{money(total)}</strong><span>spent{mode !== 'all' ? ` · ${money(avgPerDay)}/day avg` : ` across ${trendLabels.length} year${trendLabels.length === 1 ? '' : 's'}`}</span></div>
      <div className="chart">{trendValues.map((value, index) => <div className={`chart-col ${index === currentIndex ? 'current' : ''}`} key={index}><div className="chart-bar" style={{ height: `${value ? Math.max(6, Math.round((value / maxTrend) * 100)) : 2}%` }} /><label>{trendLabels[index]}</label></div>)}</div>
      <p className="panel-note" style={{ margin: '20px 0 10px' }}>By category</p>
      <div className="streak-list">{breakdown.map((item) => <div className="streak" key={item.name}><span className="streak-name">{item.name}</span><div className="streak-bar"><span style={{ width: `${item.pct}%` }} /></div><span className="streak-count">{money(item.value)}</span></div>)}</div>
    </>}
  </Panel>;
}

function ExpensesView({ data, openModal, editExpense, deleteExpense, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; openModal: (modal: Modal) => void; editExpense: (expense: Expense) => void; deleteExpense: (id: string) => void; profileName: string }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const filtered = data.expenses.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) && (category === 'All' || item.category === category));
  const exportCsv = () => { const csv = ['date,category,description,amount', ...data.expenses.map((item) => `${item.date},${item.category},"${item.label.replaceAll('"', '""')}",${item.amount.toFixed(2)}`)].join('\n'); const link = document.createElement('a'); link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`; link.download = 'personal-tracker-expenses.csv'; link.click(); };
  return <div className="content"><PageHeading title="Expenses" description="See where your money is going, without making it a moral issue." action={<div className="heading-actions"><button className="ghost-button" onClick={exportCsv} data-testid="button-export-expenses"><Download size={14} /> CSV</button><button className="primary-button" onClick={() => openModal('expense')} data-testid="button-add-expense"><Plus size={15} /> Add expense</button></div>} name={profileName} />
    <div className="view-card" style={{ marginBottom: 18 }}><ExpenseReports data={data} /></div>
    <div className="view-card"><Panel title="Recent entries" note={`${filtered.length} of ${data.expenses.length} entries`}><div className="toolbar"><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" aria-label="Search expenses" data-testid="input-search-expenses" /><select className="filter-select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter expense category" data-testid="select-filter-expense">{['All', ...data.categories].map((name) => <option key={name}>{name}</option>)}</select></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Entry</th><th>Category</th><th>Date</th><th>Amount</th><th></th></tr></thead><tbody>{filtered.map((entry) => <tr key={entry.id} data-testid={`row-expense-${entry.id}`}><td><b>{entry.label}</b></td><td><span className="pill">{entry.category}</span></td><td style={{ color: '#9b8883', fontSize: 11 }}>{formatDate(entry.date)}</td><td><b>{money(entry.amount)}</b></td><td><button type="button" className="row-action" onClick={() => editExpense(entry)} aria-label={`Edit ${entry.label}`} data-testid={`button-edit-expense-${entry.id}`}><Pencil size={14} /></button><button type="button" className="row-action" onClick={() => deleteExpense(entry.id)} aria-label={`Delete ${entry.label}`} data-testid={`button-delete-expense-${entry.id}`}><Trash2 size={14} /></button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty-state"><Wallet size={27} /><h3>No matching entries.</h3><p>Try another search or log something new.</p></div>}</div></Panel></div>
  </div>;
}

const MACRO_ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
type MacroTotals = typeof MACRO_ZERO;
const sumFoods = (foods: Food[]): MacroTotals => foods.reduce((acc, item) => ({ calories: acc.calories + item.calories, protein: acc.protein + item.protein, carbs: acc.carbs + item.carbs, fat: acc.fat + item.fat, fibre: acc.fibre + item.fibre }), MACRO_ZERO);
const round1 = (value: number) => Math.round(value * 10) / 10;

function formatQty(food: Food) {
  if (!food.quantity) return '';
  if (food.unit === 'piece') return `${food.quantity} ${food.quantity === 1 ? 'piece' : 'pieces'}`;
  return `${food.quantity}${food.unit ?? ''}`;
}

function NutritionBars({ days, values, goal, unit, tone, labelOf, showValues = true }: { days: string[]; values: number[]; goal: number; unit: string; tone: 'protein' | 'calories'; labelOf: (day: string) => string; showValues?: boolean }) {
  const max = Math.max(goal, ...values) * 1.18 || 1;
  return <div className={`nbars ${tone} ${showValues ? '' : 'dense'}`}>
    <div className="nbars-plot">
      {goal > 0 && <div className="nbars-goal" style={{ bottom: `${(goal / max) * 100}%` }}><span>goal {goal}{unit}</span></div>}
      {days.map((day, index) => {
        const value = values[index];
        return <div key={day} className={`nbars-col ${day === today ? 'current' : ''} ${goal > 0 && value >= goal ? 'hit' : ''} ${day > today ? 'future' : ''}`} title={`${formatDate(day)} · ${Math.round(value)}${unit}`}>
          {showValues && <span className="nbars-val">{value ? Math.round(value) : ''}</span>}
          <div className="nbars-bar" style={{ height: value ? `${Math.max(3, (value / max) * 100)}%` : '3px' }} />
        </div>;
      })}
    </div>
    <div className="nbars-axis">{days.map((day) => <span key={day} className={day === today ? 'current' : ''}>{labelOf(day)}</span>)}</div>
  </div>;
}

function WeeklyProtein({ foods, goal }: { foods: Food[]; goal: number }) {
  const { days } = weekRange(0);
  const values = days.map((day) => sumFoods(foods.filter((food) => food.date === day)).protein);
  const total = values.reduce((sum, value) => sum + value, 0);
  const elapsed = days.filter((day) => day <= today);
  const hits = elapsed.filter((_, index) => goal > 0 && values[index] >= goal).length;
  return <Panel title="This week's protein" note={`${Math.round(total)}g so far · ${hits} of ${elapsed.length} day${elapsed.length === 1 ? '' : 's'} on goal`}>
    <NutritionBars days={days} values={values} goal={goal} unit="g" tone="protein" labelOf={(day) => new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${day}T12:00:00`))} />
  </Panel>;
}

function loggingStreak(foods: Food[]) {
  const logged = new Set(foods.map((food) => food.date));
  let cursor = logged.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (logged.has(cursor)) { streak += 1; cursor = addDays(cursor, -1); }
  return streak;
}

function NutritionAnalytics({ foods, goals }: { foods: Food[]; goals: Goals }) {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [mode]);
  const isWeek = mode === 'week';
  const week = weekRange(offset);
  const month = monthRange(offset);
  const days = isWeek ? week.days : month.days;
  const rangeLabel = isWeek ? `${formatMonthDay(week.start)} – ${formatMonthDay(week.end)}` : new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(month.year, month.month, 1));
  const perDay = days.map((day) => sumFoods(foods.filter((food) => food.date === day)));
  const loggedIdx = days.map((_, index) => index).filter((index) => days[index] <= today && foods.some((food) => food.date === days[index]));
  const logged = loggedIdx.map((index) => perDay[index]);
  const avg = (key: keyof MacroTotals) => (logged.length ? logged.reduce((sum, item) => sum + item[key], 0) / logged.length : 0);
  const proteinHits = logged.filter((item) => item.protein >= goals.protein).length;
  const energy = { protein: avg('protein') * 4, carbs: avg('carbs') * 4, fat: avg('fat') * 9 };
  const energyTotal = energy.protein + energy.carbs + energy.fat;
  const share = (value: number) => (energyTotal ? (value / energyTotal) * 100 : 0);
  const proteinEnd = share(energy.protein);
  const carbsEnd = proteinEnd + share(energy.carbs);
  const donut = energyTotal ? `conic-gradient(#3fa884 0 ${proteinEnd}%, #e2972f ${proteinEnd}% ${carbsEnd}%, #8a68c9 ${carbsEnd}% 100%)` : 'conic-gradient(hsl(var(--border)) 0 100%)';
  const bestIdx = loggedIdx.reduce<number>((best, index) => (best < 0 || perDay[index].protein > perDay[best].protein ? index : best), -1);
  const streak = loggingStreak(foods);
  const goalRows = [
    { key: 'calories', label: 'Calories', value: avg('calories'), goal: goals.calories, unit: ' kcal' },
    { key: 'protein', label: 'Protein', value: avg('protein'), goal: goals.protein, unit: 'g' },
    { key: 'carbs', label: 'Carbs', value: avg('carbs'), goal: goals.carbs, unit: 'g' },
    { key: 'fat', label: 'Fat', value: avg('fat'), goal: goals.fat, unit: 'g' },
    { key: 'fibre', label: 'Fibre', value: avg('fibre'), goal: goals.fibre, unit: 'g' },
  ];
  return <Panel title="Nutrition analytics" note="Gentle patterns, not report cards">
    <div className="toolbar" style={{ marginBottom: 14 }}>
      <div className="filter-tabs" role="tablist" aria-label="Analytics range">{(['week', 'month'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={`filter-tab ${mode === value ? 'active' : ''}`} onClick={() => setMode(value)} data-testid={`button-nutrition-analytics-${value}`}>{value === 'week' ? 'Weekly' : 'Monthly'}</button>)}</div>
      <div className="report-range">
        <button type="button" className="report-nav" onClick={() => setOffset((value) => value - 1)} aria-label="Previous period" data-testid="button-nutrition-analytics-prev"><ChevronLeft size={15} /></button>
        <span className="report-range-label">{rangeLabel}</span>
        <button type="button" className="report-nav" onClick={() => setOffset((value) => Math.min(0, value + 1))} disabled={offset >= 0} aria-label="Next period" data-testid="button-nutrition-analytics-next"><ChevronRight size={15} /></button>
      </div>
    </div>
    {!logged.length ? <div className="empty-state"><Sparkles size={27} /><h3>Nothing logged {offset === 0 ? (isWeek ? 'this week' : 'this month') : 'in this period'}.</h3><p>Log a meal and your patterns will bloom here.</p></div> : <>
      <div className="report-stats" style={{ marginTop: 0 }}>
        <div className="report-stat"><strong>{Math.round(avg('calories'))}</strong><span>Avg kcal / day</span></div>
        <div className="report-stat"><strong>{round1(avg('protein'))}g</strong><span>Avg protein</span></div>
        <div className="report-stat"><strong>{proteinHits}/{logged.length}</strong><span>Protein goal days</span></div>
        <div className="report-stat"><strong>{round1(avg('fibre'))}g</strong><span>Avg fibre</span></div>
      </div>
      <div className="na-grid">
        <div>
          <p className="panel-note" style={{ margin: '0 0 6px' }}>Calories per day</p>
          <NutritionBars days={days} values={perDay.map((item) => item.calories)} goal={goals.calories} unit=" kcal" tone="calories" showValues={isWeek} labelOf={isWeek ? (day) => new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(new Date(`${day}T12:00:00`)) : (day) => String(Number(day.slice(-2)))} />
        </div>
        <div>
          <p className="panel-note" style={{ margin: '0 0 10px' }}>Where your energy comes from</p>
          <div className="na-donut-wrap">
            <div className="na-donut" style={{ background: donut }}><b>{Math.round(share(energy.protein))}%<small>protein</small></b></div>
            <div className="na-legend">
              <span><i style={{ background: '#3fa884' }} />Protein<em>{Math.round(share(energy.protein))}%</em></span>
              <span><i style={{ background: '#e2972f' }} />Carbs<em>{Math.round(share(energy.carbs))}%</em></span>
              <span><i style={{ background: '#8a68c9' }} />Fat<em>{Math.round(share(energy.fat))}%</em></span>
            </div>
          </div>
        </div>
      </div>
      <p className="panel-note" style={{ margin: '22px 0 10px' }}>Daily average vs your guide</p>
      <div className="macro-list">{goalRows.map((row) => <div key={row.key}><div className="macro-head"><span>{row.label}</span><b>{Math.round(row.value)}{row.unit} / {row.goal}{row.unit}</b></div><div className={`macro-bar ${row.key}`}><span style={{ width: `${Math.min(100, row.goal ? (row.value / row.goal) * 100 : 0)}%` }} /></div></div>)}</div>
      <div className="na-chips">
        {streak > 0 && <span className="na-chip"><Flame size={14} /> {streak}-day logging streak</span>}
        {bestIdx >= 0 && perDay[bestIdx].protein > 0 && <span className="na-chip"><Sparkles size={14} /> Best protein day: {formatDate(days[bestIdx])} · {Math.round(perDay[bestIdx].protein)}g</span>}
        <span className="na-chip"><Utensils size={14} /> {logged.length} day{logged.length === 1 ? '' : 's'} logged</span>
      </div>
    </>}
  </Panel>;
}

function NutritionView({ data, openModal, editFood, deleteFood, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; openModal: (modal: Modal) => void; editFood: (food: Food) => void; deleteFood: (id: string) => void; profileName: string }) {
  const [viewDate, setViewDate] = useState(today);
  const dayFoods = data.foods.filter((food) => food.date === viewDate);
  const totals = sumFoods(dayFoods);
  const macros = [{ key: 'calories', label: 'Calories', value: totals.calories, goal: data.goals.calories, unit: 'kcal' }, { key: 'protein', label: 'Protein', value: totals.protein, goal: data.goals.protein, unit: 'g' }, { key: 'carbs', label: 'Carbohydrates', value: totals.carbs, goal: data.goals.carbs, unit: 'g' }, { key: 'fat', label: 'Fat', value: totals.fat, goal: data.goals.fat, unit: 'g' }, { key: 'fibre', label: 'Fibre', value: totals.fibre, goal: data.goals.fibre, unit: 'g' }];
  return <div className="content"><PageHeading title="Nutrition" description="Notice what gives you energy. No numbers need to be perfect." action={<div className="heading-actions"><button className="ghost-button" onClick={() => openModal('quickfood')} data-testid="button-quick-log-meal"><Flame size={14} /> Quick log</button><button className="primary-button" onClick={() => openModal('food')} data-testid="button-add-food"><Plus size={15} /> Add food</button></div>} name={profileName} /><div className="toolbar" style={{ marginBottom: 16 }}><input type="date" className="search-input" max={today} value={viewDate} onChange={(event) => setViewDate(event.target.value)} aria-label="Date to view" data-testid="input-nutrition-view-date" />{viewDate !== today && <button type="button" className="text-link" onClick={() => setViewDate(today)} data-testid="button-nutrition-today">Back to today</button>}</div>
    <div className="nutrition-layout">
      <Panel title={viewDate === today ? 'Today at a glance' : `${formatDate(viewDate)} at a glance`} note="Targets are guides, not grades" action={<button className="text-link" onClick={() => openModal('goals')} data-testid="button-edit-nutrition-goals">Edit goals <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></button>}>
        <div className="nutrition-total"><strong>{Math.round(totals.calories)}</strong><span>of {data.goals.calories} kcal</span></div>
        <div className="macro-list">{macros.map((macro) => <div key={macro.key}><div className="macro-head"><span>{macro.label}</span><b>{Math.round(macro.value)}{macro.unit} / {macro.goal}{macro.unit}</b></div><div className={`macro-bar ${macro.key}`}><span style={{ width: `${Math.min(100, macro.value / macro.goal * 100)}%` }} /></div></div>)}</div>
      </Panel>
      <Panel title="Food log" note={`${dayFoods.length} moments recorded${viewDate === today ? ' today' : ''}`}>
        {dayFoods.length ? dayFoods.map((food) => <div className="food-entry" key={food.id} data-testid={`row-food-${food.id}`}>
          <div className="food-dot"><Utensils size={15} /></div>
          <div className="food-copy"><strong>{food.label}</strong><p>{[formatQty(food), `${round1(food.calories)} kcal`, `${round1(food.protein)}g protein`].filter(Boolean).join(' · ')}</p></div>
          <button type="button" className="row-action" onClick={() => editFood(food)} aria-label={`Edit ${food.label}`} data-testid={`button-edit-food-${food.id}`}><Pencil size={14} /></button>
          <button type="button" className="row-action" onClick={() => deleteFood(food.id)} aria-label={`Delete ${food.label}`} data-testid={`button-delete-food-${food.id}`}><Trash2 size={14} /></button>
        </div>) : <div className="empty-state"><Coffee size={27} /><h3>A blank plate</h3><p>Add a meal for this day when you are ready.</p></div>}
      </Panel>
    </div>
    <div className="view-card" style={{ marginTop: 18 }}><WeeklyProtein foods={data.foods} goal={data.goals.protein} /></div>
    <div className="view-card" style={{ marginTop: 18 }}><NutritionAnalytics foods={data.foods} goals={data.goals} /></div>
  </div>;
}

function WeightChart({ data }: { data: ReturnType<typeof useLifeTracker>['data'] }) {
  const entries = data.weightEntries.slice(-8);
  const values = entries.map((entry) => entry.weight);
  const min = Math.min(...values, data.weight) - .3;
  const max = Math.max(...values, data.weight) + .3;
  return <div className="weight-chart">{entries.map((entry) => <div className="weight-col" key={entry.id}><div className="weight-bar" style={{ height: `${Math.max(8, (entry.weight - min) / (max - min) * 100)}%` }} /><span>{entry.weight}</span><small>{new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(`${entry.date}T12:00:00`))}</small></div>)}</div>;
}

function HabitGrid({ tasks, days, dayLabel }: { tasks: Task[]; days: string[]; dayLabel: (date: string) => string }) {
  const counts = days.map((day) => tasks.filter((task) => task.completedDates.includes(day)).length);
  const maxCount = Math.max(0, ...counts);
  return <div className="report-grid-wrap"><table className="report-grid">
    <thead><tr><th></th>{days.map((day, index) => <th key={day} className={maxCount > 0 && counts[index] === maxCount ? 'best-day' : ''}>{dayLabel(day)}</th>)}</tr></thead>
    <tbody>{tasks.map((task) => {
      const color = habitColor(task.id);
      return <tr key={task.id}>
        <td className="habit-name" data-testid={`report-habit-${task.id}`}>{task.icon || guessIcon(task.title)} {task.title}</td>
        {days.map((day) => {
          const status = cellStatus(task, day);
          return <td key={day}><span className={`report-cell ${status}`} style={status === 'done' ? { background: color.fg } : undefined}>{status === 'done' && <Check size={14} strokeWidth={3} />}</span></td>;
        })}
      </tr>;
    })}</tbody>
  </table></div>;
}

function YearlyGrid({ year, tasks }: { year: { year: number; months: { month: number; label: string; days: string[] }[] }; tasks: Task[] }) {
  // Two-level scroll container: the outer div scrolls (and must stay free to shrink to the
  // viewport), the inner one carries the real minimum width. Putting minWidth on the scrolling
  // element itself would force the *page* to widen instead of scrolling internally.
  return <div className="report-grid-wrap"><div style={{ minWidth: 560 }}>
    <div className="yearly-header-row"><span /> {year.months.map((month) => <span key={month.month}>{month.label}</span>)}</div>
    {tasks.map((task) => {
      const color = habitColor(task.id);
      return <div className="yearly-month-row" key={task.id}>
        <span className="yearly-month-name" data-testid={`report-habit-${task.id}`}>{task.icon || guessIcon(task.title)} {task.title}</span>
        {year.months.map((month) => {
          const dueDays = month.days.filter((day) => day <= today && (isDueOn(task, day) || task.completedDates.includes(day)));
          const doneDays = dueDays.filter((day) => task.completedDates.includes(day));
          const pct = dueDays.length ? doneDays.length / dueDays.length : 0;
          return <span key={month.month} className="yearly-month-cell" title={dueDays.length ? `${doneDays.length}/${dueDays.length} in ${month.label}` : 'No days tracked'} style={dueDays.length ? { background: color.fg, opacity: .18 + pct * .82 } : undefined} />;
        })}
      </div>;
    })}
  </div></div>;
}

function HabitDetailModal({ task, close }: { task: Task; close: () => void }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date(`${today}T12:00:00`);
  const viewDate = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = monthMatrix(year, month);
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(viewDate);
  const successThisMonth = cells.filter((cell): cell is string => cell !== null && task.completedDates.includes(cell)).length;
  const color = habitColor(task.id);
  const heatStart = mondayOf(addDays(today, -370));
  const heatSpan = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${heatStart}T12:00:00`).getTime()) / 86400000) + 1;
  const heatDays = Array.from({ length: heatSpan }, (_, index) => addDays(heatStart, index));
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal" style={{ maxWidth: 560 }}>
      <div className="modal-head">
        <div className="habit-detail-head"><span className="habit-detail-icon" style={{ background: color.bg, color: color.fg }}>{task.icon || guessIcon(task.title)}</span><div><h2>{task.title}</h2><p>{recurrenceLabel(task.recurrence)}{isTaskStopped(task) ? ` · stopped ${formatDate(task.endDate!)}` : ''}</p></div></div>
        <button type="button" className="icon-button" onClick={close} aria-label="Close habit detail" data-testid="button-close-habit-detail"><X size={17} /></button>
      </div>
      <div className="cal-nav">
        <button type="button" className="report-nav" onClick={() => setMonthOffset((value) => value - 1)} aria-label="Previous month" data-testid="button-habit-detail-prev-month"><ChevronLeft size={15} /></button>
        <strong>{monthLabel}</strong>
        <button type="button" className="report-nav" onClick={() => setMonthOffset((value) => Math.min(0, value + 1))} disabled={monthOffset >= 0} aria-label="Next month" data-testid="button-habit-detail-next-month"><ChevronRight size={15} /></button>
      </div>
      <div className="cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span className="cal-weekday" key={index}>{label}</span>)}
        {cells.map((cell, index) => cell === null ? <span className="cal-day empty" key={index} /> : <span key={index} className={`cal-day ${task.completedDates.includes(cell) ? 'done' : cell > today ? 'future' : isDueOn(task, cell) ? 'missed' : ''} ${cell === today ? 'today' : ''}`}>{Number(cell.slice(-2))}</span>)}
      </div>
      <div className="habit-detail-stats">
        <div className="report-stat"><strong>{successThisMonth}</strong><span>Success in {new Intl.DateTimeFormat('en', { month: 'long' }).format(viewDate)}</span></div>
        <div className="report-stat"><strong>{task.completedDates.length}</strong><span>Total success</span></div>
      </div>
      <p className="panel-note" style={{ marginBottom: 8 }}>Last 12 months</p>
      <div className="heatmap">{heatDays.map((day) => <span key={day} className={`heatmap-cell ${day > today ? 'future' : task.completedDates.includes(day) ? 'done' : ''}`} title={`${day}${task.completedDates.includes(day) ? ' · done' : ''}`} />)}</div>
      <div className="modal-actions"><button type="button" className="cancel-button" onClick={close} data-testid="button-close-habit-detail-footer">Close</button></div>
    </div>
  </div>;
}

function HabitReports({ data }: { data: ReturnType<typeof useLifeTracker>['data'] }) {
  const [mode, setMode] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Task | null>(null);
  useEffect(() => setOffset(0), [mode]);
  const week = mode === 'weekly' ? weekRange(offset) : null;
  const month = mode === 'monthly' ? monthRange(offset) : null;
  const year = mode === 'yearly' ? yearRange(offset) : null;
  const days = week ? week.days : month ? month.days : year!.months.flatMap((entry) => entry.days);
  const tasks = data.tasks.filter((task) => days.some((day) => isTaskScheduledOn(task, day)));
  const stats = reportStats(tasks, days);
  const rangeLabel = week ? `${formatMonthDay(week.start)} – ${formatMonthDay(week.end)}` : month ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(month.year, month.month, 1)) : String(year!.year);
  return <Panel title="Habit Reports" note="How consistently you're showing up">
    <div className="toolbar" style={{ marginBottom: 14 }}>
      <div className="filter-tabs" role="tablist" aria-label="Report range">{(['weekly', 'monthly', 'yearly'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={`filter-tab ${mode === value ? 'active' : ''}`} onClick={() => setMode(value)} data-testid={`button-report-${value}`}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <div className="report-range">
        <button type="button" className="report-nav" onClick={() => setOffset((value) => value - 1)} aria-label="Previous period" data-testid="button-report-prev"><ChevronLeft size={15} /></button>
        <span className="report-range-label">{rangeLabel}</span>
        <button type="button" className="report-nav" onClick={() => setOffset((value) => Math.min(0, value + 1))} disabled={offset >= 0} aria-label="Next period" data-testid="button-report-next"><ChevronRight size={15} /></button>
      </div>
    </div>
    {!tasks.length ? <div className="empty-state"><ClipboardList size={27} /><h3>Nothing tracked in this period.</h3><p>Add a recurring task to start building a history.</p></div> : <>
      <div onClick={(event) => { const row = (event.target as HTMLElement).closest('[data-testid^="report-habit-"]'); if (!row) return; const id = row.getAttribute('data-testid')!.replace('report-habit-', ''); const task = tasks.find((entry) => entry.id === id); if (task) setSelected(task); }}>
        {mode === 'yearly' ? <YearlyGrid year={year!} tasks={tasks} /> : <HabitGrid tasks={tasks} days={days} dayLabel={mode === 'weekly' ? (day) => new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(new Date(`${day}T12:00:00`)) : (day) => String(Number(day.slice(-2)))} />}
      </div>
      <div className="report-stats">
        <div className="report-stat"><strong>{stats.met}%</strong><span>Met</span></div>
        <div className="report-stat"><strong>{stats.perfectDays}</strong><span>Perfect days</span></div>
        <div className="report-stat"><strong>{stats.doneCount}</strong><span>Total done</span></div>
        <div className="report-stat"><strong>{stats.bestStreak}</strong><span>Best streak</span></div>
      </div>
    </>}
    {selected && <HabitDetailModal task={selected} close={() => setSelected(null)} />}
  </Panel>;
}

function AnalyticsView({ data, openModal, profileName }: { data: ReturnType<typeof useLifeTracker>['data']; openModal: (modal: Modal) => void; profileName: string }) {
  const completed = data.tasks.filter((task) => task.completed).length;
  const totals = data.foods.filter((food) => food.date === today).reduce((sum, food) => sum + food.calories, 0);
  const averageDailySpend = data.expenses.length ? data.expenses.reduce((sum, item) => sum + item.amount, 0) / Math.max(1, new Set(data.expenses.map((item) => item.date)).size) : 0;
  return <div className="content"><PageHeading title="Analytics" description="Patterns to help you be on your own side." name={profileName} /><div className="view-card" style={{ marginBottom: 18 }}><HabitReports data={data} /></div><div className="view-card" style={{ marginBottom: 18 }}><Panel title="A few signals"><div className="metric-grid"><div className="metric"><span className="metric-label">Follow-through</span><strong className="metric-value">{data.tasks.length ? Math.round(completed / data.tasks.length * 100) : 0}%</strong><span className="metric-sub">across your list</span></div><div className="metric"><span className="metric-label">Daily expense</span><strong className="metric-value">{money(averageDailySpend)}</strong><span className="metric-sub">average recorded</span></div><div className="metric"><span className="metric-label">Calories today</span><strong className="metric-value">{totals}</strong><span className="metric-sub">of {data.goals.calories} kcal</span></div><div className="metric"><span className="metric-label">Longest streak</span><strong className="metric-value">{Math.max(0, ...data.tasks.map((task) => task.longestStreak))}</strong><span className="metric-sub">days showing up</span></div></div></Panel></div><div className="dashboard-grid analytics-lower"><Panel title="Weight trend" note="Your latest eight weigh-ins" action={<button className="text-link" onClick={() => openModal('weight')} data-testid="button-analytics-log-weight">Add entry <Plus size={13} /></button>}>{data.weightEntries.length ? <WeightChart data={data} /> : <div className="empty-state"><Scale size={27} /><h3>Start a trend</h3><p>Log your first weigh-in to see change over time.</p></div>}</Panel><Panel title="Food consistency" note="Today's nutrition against your guide"><div className="streak-list">{[['Calories', totals, data.goals.calories], ['Protein', data.foods.filter((food) => food.date === today).reduce((sum, food) => sum + food.protein, 0), data.goals.protein], ['Fibre', data.foods.filter((food) => food.date === today).reduce((sum, food) => sum + food.fibre, 0), data.goals.fibre]].map(([label, value, goal]) => <div className="streak" key={label as string}><span className="streak-name">{label as string}</span><div className="streak-bar"><span style={{ width: `${Math.min(100, Number(value) / Number(goal) * 100)}%` }} /></div><span className="streak-count">{Math.round(Number(value) / Number(goal) * 100)}%</span></div>)}</div></Panel></div></div>;
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

function ModalForm({ modal, close, editingTask, editingExpense, editingFood, addTask, updateTask, addExpense, updateExpense, addFood, updateFood, addFoodDatabase, addWeight, updateGoals, connectSheets, goals, foodDatabase, categories }: { modal: Modal; close: () => void; editingTask: Task | null; editingExpense: Expense | null; editingFood: Food | null; addTask: (task: Omit<Task, 'id' | 'completed' | 'createdAt' | 'completedDates' | 'currentStreak' | 'longestStreak'>) => void; updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'icon' | 'priority' | 'recurrence' | 'recurrenceValue'>>) => void; addExpense: (expense: Omit<Expense, 'id' | 'date'>, date?: string) => void; updateExpense: (id: string, patch: Partial<Pick<Expense, 'label' | 'category' | 'amount' | 'date'>>) => void; addFood: (food: Omit<Food, 'id' | 'time' | 'date'>, date?: string) => void; updateFood: (id: string, patch: Partial<Omit<Food, 'id' | 'time'>>) => void; addFoodDatabase: (food: FoodDatabaseEntry) => void; addWeight: (weight: number, date?: string) => void; updateGoals: (goals: Goals) => void; connectSheets: (config: SheetsConfig, mode: 'import' | 'push') => Promise<void>; goals: Goals; foodDatabase: FoodDatabaseEntry[]; categories: string[] }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [foodMatch, setFoodMatch] = useState<FoodDatabaseEntry | null>(null);
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    setFoodMatch(null);
    setConnecting(false);
    if (modal === 'task' && editingTask) setForm({ title: editingTask.title, priority: editingTask.priority, recurrence: editingTask.recurrence.join(','), icon: editingTask.icon || '' });
    else if (modal === 'expense' && editingExpense) setForm({ label: editingExpense.label, amount: String(editingExpense.amount), category: editingExpense.category, date: editingExpense.date });
    else if (modal === 'food' && editingFood) setForm({ label: editingFood.label, quantity: editingFood.quantity ? String(editingFood.quantity) : '', unit: editingFood.unit || 'piece', date: editingFood.date, calories: String(editingFood.calories), protein: String(editingFood.protein), carbs: String(editingFood.carbs), fat: String(editingFood.fat), fibre: String(editingFood.fibre) });
    else setForm({});
  }, [modal, editingTask, editingExpense, editingFood]);
  if (!modal) return null;
  const title = modal === 'task' ? (editingTask ? 'Edit task' : 'Add a task') : modal === 'expense' ? (editingExpense ? 'Edit expense' : 'Log an expense') : modal === 'food' ? (editingFood ? 'Edit food' : 'Add a food moment') : modal === 'quickfood' ? 'Quick log a meal' : modal === 'weight' ? 'Log weight' : modal === 'sheets' ? 'Connect Google Sheets' : 'Nutrition goals';
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const findFood = (value: string) => {
    if (editingFood) { update('label', value); return; }
    const match = foodDatabase.find((food) => food.label.toLowerCase() === value.trim().toLowerCase());
    setFoodMatch(match ?? null);
    setForm((current) => ({
      ...current,
      label: value,
      ...(match ? { calories: String(match.calories), protein: String(match.protein), carbs: String(match.carbs), fat: String(match.fat), fibre: String(match.fibre), unit: match.unit, quantity: String(match.quantity) } : {}),
    }));
  };
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
    if (modal === 'task' && form.title?.trim()) {
      const recurrence = (form.recurrence ? form.recurrence.split(',').filter(Boolean) : []) as Recurrence;
      const payload = { title: form.title.trim(), priority: (form.priority as Task['priority']) || 'medium', recurrence, icon: form.icon || undefined };
      if (editingTask) updateTask(editingTask.id, payload); else addTask(payload);
    }
    if (modal === 'expense' && form.label?.trim() && form.amount) {
      const date = form.date || today;
      const payload = { label: form.label.trim(), amount: Number(form.amount), category: form.category || categories[0] || 'Miscellaneous' };
      if (editingExpense) updateExpense(editingExpense.id, { ...payload, date }); else addExpense(payload, date);
    }
    if (modal === 'food' && form.label?.trim() && form.calories) {
      const unit = (form.unit as FoodDatabaseEntry['unit']) || 'piece';
      const food = { label: form.label.trim(), calories: Number(form.calories), protein: Number(form.protein || 0), carbs: Number(form.carbs || 0), fat: Number(form.fat || 0), fibre: Number(form.fibre || 0) };
      if (editingFood) updateFood(editingFood.id, { ...food, quantity: form.quantity ? Number(form.quantity) : undefined, unit: form.quantity ? unit : undefined, date: form.date || today });
      else { const quantity = Number(form.quantity || 1); addFood({ ...food, quantity, unit }, form.date || today); addFoodDatabase({ ...food, quantity, unit }); }
    }
    if (modal === 'quickfood' && (form.calories || form.protein || form.fibre)) addFood({ label: form.label?.trim() || 'Quick log', calories: Number(form.calories || 0), protein: Number(form.protein || 0), carbs: 0, fat: 0, fibre: Number(form.fibre || 0) }, form.date || today);
    if (modal === 'weight' && form.weight) addWeight(Number(form.weight), form.date || today);
    if (modal === 'goals') updateGoals({ calories: Number(form.calories || goals.calories), protein: Number(form.protein || goals.protein), carbs: Number(form.carbs || goals.carbs), fat: Number(form.fat || goals.fat), fibre: Number(form.fibre || goals.fibre), dailySpend: Number(form.dailySpend || goals.dailySpend) });
    close();
  };
  const selectedDays = (form.recurrence ? form.recurrence.split(',').filter(Boolean) : []) as Weekday[];
  const toggleDay = (day: Weekday) => update('recurrence', (selectedDays.includes(day) ? selectedDays.filter((entry) => entry !== day) : [...selectedDays, day]).join(','));
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><form className="modal" onSubmit={submit}><div className="modal-head"><div><h2>{title}</h2><p>{modal === 'sheets' ? 'Paste the Web app URL and token from your Apps Script deployment.' : 'Keep it simple. You can always add detail later.'}</p></div><button type="button" className="icon-button" onClick={close} aria-label="Close dialog" data-testid="button-close-dialog"><X size={17} /></button></div><div className="form-grid">
    {modal === 'sheets' && <><div className="field"><label htmlFor="sheets-url">Web app URL</label><input id="sheets-url" autoFocus value={form.url || ''} onChange={(event) => update('url', event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" data-testid="input-sheets-url" /></div><div className="field"><label htmlFor="sheets-token">Sync token</label><input id="sheets-token" type="password" value={form.token || ''} onChange={(event) => update('token', event.target.value)} placeholder="Your SYNC_TOKEN value" data-testid="input-sheets-token" /></div><p className="field-hint">See GOOGLE_SHEETS_SETUP.md in the project for step-by-step setup instructions.</p></>}
    {modal === 'task' && <><div className="field"><label htmlFor="task-title">What needs doing?</label><input id="task-title" autoFocus value={form.title || ''} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Water the plants" data-testid="input-task-title" /></div><div className="field"><label>Icon</label><div className="icon-picker" role="group" aria-label="Choose an icon">{ICON_CHOICES.map((icon) => <button key={icon} type="button" className={`icon-chip ${(form.icon || guessIcon(form.title || '')) === icon ? 'active' : ''}`} onClick={() => update('icon', icon)} aria-label={`Use ${icon} icon`} data-testid={`button-icon-${icon}`}>{icon}</button>)}</div></div><div className="field"><label htmlFor="task-priority">Energy needed</label><select id="task-priority" value={form.priority || 'medium'} onChange={(event) => update('priority', event.target.value)} data-testid="select-task-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div><div className="field"><label>Repeat</label><div className="weekday-picker" role="group" aria-label="Repeat on days">{WEEKDAYS.map((day) => <button key={day} type="button" className={`weekday-chip ${selectedDays.includes(day) ? 'active' : ''}`} onClick={() => toggleDay(day)} aria-pressed={selectedDays.includes(day)} data-testid={`button-recurrence-${day}`}>{weekdayShort(day)}</button>)}</div><p className="field-hint">{selectedDays.length === 7 ? 'Repeats every day' : selectedDays.length ? `Repeats every ${selectedDays.map(weekdayShort).join(', ')}` : `One-time — only shows on ${editingTask ? formatDate(editingTask.createdAt) : 'today'}`}</p></div></>}
    {modal === 'expense' && <><div className="field"><label htmlFor="expense-label">What was it?</label><input id="expense-label" autoFocus value={form.label || ''} onChange={(event) => update('label', event.target.value)} placeholder="e.g. Friday lunch" data-testid="input-expense-label" /></div><div className="form-grid form-two"><div className="field"><label htmlFor="expense-amount">Amount</label><input id="expense-amount" type="number" min="0" step=".01" value={form.amount || ''} onChange={(event) => update('amount', event.target.value)} placeholder="0.00" data-testid="input-expense-amount" /></div><div className="field"><label htmlFor="expense-category">Category</label><select id="expense-category" value={form.category || categories[0]} onChange={(event) => update('category', event.target.value)} data-testid="select-expense-category">{categories.map((category) => <option key={category}>{category}</option>)}</select></div></div><div className="field"><label htmlFor="expense-date">Date</label><input id="expense-date" type="date" max={today} value={form.date || today} onChange={(event) => update('date', event.target.value)} data-testid="input-expense-date" /></div></>}
    {modal === 'food' && <><div className="field"><label htmlFor="food-label">Food or natural language</label><input id="food-label" autoFocus value={form.label || ''} onChange={(event) => findFood(event.target.value)} placeholder="Try “2 roti” or “Paneer”" data-testid="input-food-label" />{form.label && foodMatch && <p className="field-hint">Found in your food database. Nutrition has been filled in below.</p>}{form.label && !foodMatch && form.label.length > 2 && <p className="field-hint">Food not found. Enter the values once and it will be remembered.</p>}</div><div className="form-grid form-two"><div className="field"><label htmlFor="food-quantity">Quantity</label><input id="food-quantity" type="number" min="0" step=".1" value={form.quantity ?? '1'} onChange={(event) => update('quantity', event.target.value)} /></div><div className="field"><label htmlFor="food-unit">Unit</label><select id="food-unit" value={form.unit || 'piece'} onChange={(event) => update('unit', event.target.value)}><option value="piece">piece</option><option value="g">g</option><option value="ml">ml</option></select></div></div><div className="field"><label htmlFor="food-date">Date</label><input id="food-date" type="date" max={today} value={form.date || today} onChange={(event) => update('date', event.target.value)} data-testid="input-food-date" /></div><div className="form-grid form-two">{[['calories', 'Calories (kcal)'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)'], ['fibre', 'Fibre (g)']].map(([key, label]) => <div className="field" key={key}><label htmlFor={`food-${key}`}>{label}</label><input id={`food-${key}`} type="number" min="0" step=".1" value={form[key] ?? (foodMatch ? String(foodMatch[key as keyof FoodDatabaseEntry] ?? 0) : '')} onChange={(event) => update(key, event.target.value)} placeholder="0" data-testid={`input-food-${key}`} /></div>)}</div></>}
    {modal === 'quickfood' && <><div className="field"><label htmlFor="quick-label">Name <span style={{ fontWeight: 500 }}>(optional)</span></label><input id="quick-label" autoFocus value={form.label || ''} onChange={(event) => update('label', event.target.value)} placeholder="e.g. Swiggy dinner" data-testid="input-quick-label" /></div><div className="form-grid form-two">{[['calories', 'Calories (kcal)'], ['protein', 'Protein (g)'], ['fibre', 'Fibre (g)']].map(([key, label]) => <div className="field" key={key}><label htmlFor={`quick-${key}`}>{label}</label><input id={`quick-${key}`} type="number" min="0" step=".1" value={form[key] ?? ''} onChange={(event) => update(key, event.target.value)} placeholder="0" data-testid={`input-quick-${key}`} /></div>)}<div className="field"><label htmlFor="quick-date">Date</label><input id="quick-date" type="date" max={today} value={form.date || today} onChange={(event) => update('date', event.target.value)} data-testid="input-quick-date" /></div></div><p className="field-hint">For when you already know the totals for the whole meal. Nothing is added to your food database.</p></>}
    {modal === 'weight' && <div className="form-grid form-two"><div className="field"><label htmlFor="weight-value">Weight (kg)</label><input id="weight-value" autoFocus type="number" min="0" step=".1" value={form.weight || ''} onChange={(event) => update('weight', event.target.value)} placeholder="68.4" data-testid="input-weight" /></div><div className="field"><label htmlFor="weight-date">Date</label><input id="weight-date" type="date" value={form.date || today} onChange={(event) => update('date', event.target.value)} data-testid="input-weight-date" /></div></div>}
    {modal === 'goals' && <div className="form-grid form-two">{[['calories', 'Calories (kcal)', goals.calories], ['protein', 'Protein (g)', goals.protein], ['carbs', 'Carbs (g)', goals.carbs], ['fat', 'Fat (g)', goals.fat], ['fibre', 'Fibre (g)', goals.fibre], ['dailySpend', 'Daily spend guide', goals.dailySpend]].map(([key, label, value]) => <div className="field" key={key as string}><label htmlFor={`goal-${key}`}>{label as string}</label><input id={`goal-${key}`} type="number" min="0" step=".1" value={form[key as string] ?? String(value)} onChange={(event) => update(key as string, event.target.value)} data-testid={`input-goal-${key}`} /></div>)}</div>}
  </div><div className="modal-actions"><button type="button" className="cancel-button" onClick={close} data-testid="button-cancel-dialog">Cancel</button><button type="submit" className="primary-button" disabled={connecting} data-testid="button-save-dialog"><Check size={15} /> {modal === 'sheets' ? (connecting ? 'Connecting…' : 'Test & connect') : (editingTask || editingExpense || (modal === 'food' && editingFood)) ? 'Save changes' : 'Save entry'}</button></div></form></div>;
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
  const { data, toggleTask, deleteTask, stopTask, reactivateTask, addTask, updateTask, addExpense, updateExpense, deleteExpense, addFood, updateFood, deleteFood, addFoodDatabase, addWeight, updateGoals, resetData, sheets, connectSheets, disconnectSheets, pullSheetsNow, pushSheetsNow } = tracker;
  const [view, setView] = useState<View>('dashboard');
  const [modal, setModal] = useState<Modal>(null);
  const [profileName, setProfileName] = useState<string | null>(readProfileName);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const editTask = (task: Task) => { setEditingTask(task); setModal('task'); };
  const editExpense = (expense: Expense) => { setEditingExpense(expense); setModal('expense'); };
  const editFood = (food: Food) => { setEditingFood(food); setModal('food'); };
  const closeModal = () => { setModal(null); setEditingTask(null); setEditingExpense(null); setEditingFood(null); };
  const content = useMemo(() => {
    if (view === 'dashboard') return <Dashboard data={data} toggleTask={toggleTask} openModal={setModal} setView={setView} profileName={profileName ?? ''} />;
    if (view === 'tasks') return <TasksView data={data} toggleTask={toggleTask} editTask={editTask} deleteTask={deleteTask} stopTask={stopTask} reactivateTask={reactivateTask} openModal={setModal} profileName={profileName ?? ''} />;
    if (view === 'expenses') return <ExpensesView data={data} openModal={setModal} editExpense={editExpense} deleteExpense={deleteExpense} profileName={profileName ?? ''} />;
    if (view === 'nutrition') return <NutritionView data={data} openModal={setModal} editFood={editFood} deleteFood={deleteFood} profileName={profileName ?? ''} />;
    if (view === 'analytics') return <AnalyticsView data={data} openModal={setModal} profileName={profileName ?? ''} />;
    return <SettingsView data={data} resetData={resetData} openModal={setModal} sheets={sheets} disconnectSheets={disconnectSheets} pullSheetsNow={pullSheetsNow} pushSheetsNow={pushSheetsNow} profileName={profileName ?? ''} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, deleteExpense, deleteTask, stopTask, reactivateTask, disconnectSheets, profileName, pullSheetsNow, pushSheetsNow, resetData, sheets, toggleTask, view]);
  if (!profileName) return <Onboarding onComplete={(name) => { try { localStorage.setItem(PROFILE_NAME_KEY, name); } catch { /* ignore */ } setProfileName(name); }} />;
  return <QueryClientProvider client={queryClient}><TooltipProvider><Shell view={view} setView={setView} profileName={profileName}>{content}</Shell><ModalForm modal={modal} close={closeModal} editingTask={editingTask} editingExpense={editingExpense} editingFood={editingFood} addTask={addTask} updateTask={updateTask} addExpense={addExpense} updateExpense={updateExpense} addFood={addFood} updateFood={updateFood} addFoodDatabase={addFoodDatabase} addWeight={addWeight} updateGoals={updateGoals} connectSheets={connectSheets} goals={data.goals} foodDatabase={data.foodDatabase} categories={data.categories} /></TooltipProvider></QueryClientProvider>;
}

export default App;