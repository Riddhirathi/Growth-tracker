import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useMemo, useState } from 'react';
import {
  Activity, BarChart3, Check, ChevronRight, CircleDollarSign, CircleHelp, ClipboardList,
  Coffee, CookingPot, Dumbbell, Goal, LayoutDashboard, Menu, Plus, Scale, Settings,
  ShoppingBag, Sparkles, Target, Trash2, Utensils, Wallet, X, Zap,
} from 'lucide-react';
import { useLifeTracker, type Expense, type Food, type Task } from '@/hooks/use-life-tracker';

const queryClient = new QueryClient();

type View = 'dashboard' | 'tasks' | 'expenses' | 'nutrition' | 'analytics' | 'settings';
type Modal = 'task' | 'expense' | 'food' | null;

const nav = [
  { id: 'dashboard' as View, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tasks' as View, label: 'Tasks', icon: ClipboardList },
  { id: 'expenses' as View, label: 'Expenses', icon: Wallet },
  { id: 'nutrition' as View, label: 'Nutrition', icon: Utensils },
  { id: 'analytics' as View, label: 'Analytics', icon: BarChart3 },
  { id: 'settings' as View, label: 'Settings', icon: Settings },
];

const todayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
const money = (value: number) => `$${value.toFixed(2)}`;

function Shell({ view, setView, children }: { view: View; setView: (view: View) => void; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Sparkles size={17} /></span><span className="brand-name">Daymark</span></div>
        <p className="side-label">Your ritual</p>
        <nav className="nav-list" aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)} data-testid={`nav-${id}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>)}
        </nav>
        <div className="sidebar-footer">
          <div className="profile"><div className="avatar">AM</div><div><b>Alex Morgan</b><small>Personal space</small></div></div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Sparkles size={14} /></span><span>Daymark</span></div>
          <span className="eyebrow">A little more present</span>
          <div className="top-actions"><button className="ghost-button" onClick={() => setView('settings')} data-testid="button-open-settings"><Settings size={15} /> Preferences</button><button className="icon-button" onClick={() => setView('analytics')} aria-label="Open analytics" data-testid="button-open-analytics"><BarChart3 size={17} /></button></div>
        </header>
        {children}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)} data-testid={`mobile-nav-${id}`}><Icon /><span>{label}</span></button>)}
      </nav>
    </div>
  );
}

function PageHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">Good morning, Alex</span><h1>{title}</h1><p>{description}</p></div><div>{action}</div></div>;
}

function Panel({ title, note, children, action }: { title: string; note?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="panel"><div className="panel-head"><div><div className="panel-title">{title}</div>{note && <p className="panel-note">{note}</p>}</div>{action}</div>{children}</section>;
}

function TaskRows({ tasks, toggleTask, limit }: { tasks: Task[]; toggleTask: (id: string) => void; limit?: number }) {
  const visible = limit ? tasks.slice(0, limit) : tasks;
  return <div className="task-list">{visible.map((task) => <div className={`task-row ${task.completed ? 'completed' : ''}`} key={task.id} data-testid={`row-task-${task.id}`}><button type="button" className={`check ${task.completed ? 'done' : ''}`} onClick={() => toggleTask(task.id)} aria-label={`Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`} data-testid={`button-complete-task-${task.id}`}>{task.completed && <Check size={13} strokeWidth={3} />}</button><div className="task-copy"><div className="task-name">{task.title}</div><div className="task-meta">{task.due} · {task.completed ? 'Done' : 'Open'}</div></div><span className={`priority-dot ${task.priority}`} /></div>)}</div>;
}

function Dashboard({ data, toggleTask, openModal, setView }: { data: ReturnType<typeof useLifeTracker>['data']; toggleTask: (id: string) => void; openModal: (modal: Modal) => void; setView: (view: View) => void }) {
  const todayTasks = data.tasks.filter((task) => task.due === 'Today');
  const complete = todayTasks.filter((task) => task.completed).length;
  const progress = todayTasks.length ? Math.round((complete / todayTasks.length) * 100) : 0;
  const totals = data.foods.reduce((acc, item) => ({ calories: acc.calories + item.calories, protein: acc.protein + item.protein, carbs: acc.carbs + item.carbs, fat: acc.fat + item.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const spend = data.expenses.filter((entry) => entry.date.startsWith('Today')).reduce((sum, entry) => sum + entry.amount, 0);
  return <div className="content">
    <PageHeading title="Make space for today." description="A clear view of what matters, one small step at a time." />
    <div className="date-stamp" data-testid="text-current-date">{todayLabel} <span>·</span> week 24</div>
    <div className="dashboard-grid" style={{ marginTop: 23 }}>
      <div className="stack">
        <section className="panel progress-panel" data-testid="card-task-progress">
          <div className="progress-ring" style={{ '--progress': progress } as React.CSSProperties}><span>{progress}%</span></div>
          <div className="progress-copy"><h2>{complete === todayTasks.length ? 'Day well met.' : `${todayTasks.length - complete} things to tend to`}</h2><p>{complete === todayTasks.length ? 'You made room for everything on your list.' : 'Keep the promise small. Start with the next one.'}</p></div>
        </section>
        <Panel title="Today’s rhythm" note={`${complete} of ${todayTasks.length} responsibilities complete`} action={<button className="text-link" onClick={() => setView('tasks')} data-testid="link-view-all-tasks">View all <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></button>}>
          <TaskRows tasks={todayTasks} toggleTask={toggleTask} limit={4} />
        </Panel>
        <Panel title="Quick add" note="Capture it before it slips away">
          <div className="quick-grid">
            <button className="quick" onClick={() => openModal('task')} data-testid="button-quick-add-task"><ClipboardList size={18} /><span>Task</span></button>
            <button className="quick" onClick={() => openModal('expense')} data-testid="button-quick-add-expense"><CircleDollarSign size={18} /><span>Expense</span></button>
            <button className="quick" onClick={() => openModal('food')} data-testid="button-quick-add-food"><CookingPot size={18} /><span>Food</span></button>
          </div>
        </Panel>
      </div>
      <div className="stack">
        <Panel title="Fuel for the day" note="A gentle snapshot of your intake" action={<button className="text-link" onClick={() => setView('nutrition')} data-testid="link-view-nutrition">Details <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></button>}>
          <div className="metric-grid">
            <div className="metric"><span className="metric-label">Calories</span><strong className="metric-value">{totals.calories}</strong><span className="metric-sub">of 2,100 kcal</span><div className="bar"><span style={{ width: `${Math.min(100, totals.calories / 21)}%` }} /></div></div>
            <div className="metric"><span className="metric-label">Protein</span><strong className="metric-value">{totals.protein}g</strong><span className="metric-sub">of 120g</span><div className="bar"><span style={{ width: `${Math.min(100, totals.protein / 1.2)}%` }} /></div></div>
            <div className="metric"><span className="metric-label">Carbs</span><strong className="metric-value">{totals.carbs}g</strong><span className="metric-sub">of 250g</span><div className="bar"><span style={{ width: `${Math.min(100, totals.carbs / 2.5)}%` }} /></div></div>
            <div className="metric"><span className="metric-label">Fibre</span><strong className="metric-value">{data.foods.reduce((sum, food) => sum + food.fibre, 0)}g</strong><span className="metric-sub">of 30g</span><div className="bar"><span style={{ width: `${Math.min(100, data.foods.reduce((sum, food) => sum + food.fibre, 0) / .3)}%` }} /></div></div>
          </div>
        </Panel>
        <Panel title="In the ledger" note="Today’s spending">
          <div className="spend-total">{money(spend)} <small>of $60 daily guide</small></div>
          <div style={{ marginTop: 12 }}>{data.expenses.filter((entry) => entry.date.startsWith('Today')).slice(0, 3).map((entry) => <div className="expense-line" key={entry.id}><span>{entry.label}</span><span>{money(entry.amount)}</span></div>)}</div>
          {spend === 0 && <p className="panel-note">No spending logged yet. That is worth knowing too.</p>}
        </Panel>
        <Panel title="Habit momentum" note="The quiet power of showing up">
          <div className="streak-list">{data.habits.map((habit) => <div className="streak" key={habit.name}><span className="streak-name">{habit.name}</span><div className="streak-bar"><span style={{ width: `${Math.min(100, habit.days * 4.5)}%`, background: habit.color }} /></div><span className="streak-count">{habit.days} days</span></div>)}</div>
        </Panel>
        <Panel title="Latest weigh-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}><div className="food-dot" style={{ width: 45, height: 45 }}><Scale size={21} /></div><div><strong style={{ fontFamily: 'var(--app-font-serif)', fontSize: 30 }}>{data.weight} kg</strong><p className="panel-note">Monday · trending steady</p></div></div>
        </Panel>
      </div>
    </div>
  </div>;
}

function TasksView({ data, toggleTask, openModal }: { data: ReturnType<typeof useLifeTracker>['data']; toggleTask: (id: string) => void; openModal: (modal: Modal) => void }) {
  const [filter, setFilter] = useState<'today' | 'upcoming' | 'completed'>('today');
  const filtered = data.tasks.filter((task) => filter === 'today' ? task.due === 'Today' && !task.completed : filter === 'upcoming' ? task.due !== 'Today' : task.completed);
  return <div className="content"><PageHeading title="Tasks" description="A softer way to hold everything you mean to do." action={<button className="primary-button" onClick={() => openModal('task')} data-testid="button-add-task"><Plus size={15} /> Add task</button>} /><div className="view-card"><Panel title="Your list" note={`${data.tasks.filter((task) => !task.completed).length} open tasks`}><div className="toolbar"><div className="filter-tabs">{(['today', 'upcoming', 'completed'] as const).map((item) => <button key={item} className={`filter-tab ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)} data-testid={`button-filter-${item}`}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>{filtered.length ? <TaskRows tasks={filtered} toggleTask={toggleTask} /> : <div className="empty-state"><Check size={27} /><h3>Nothing asking for you here.</h3><p>Use the empty space to notice what is going well.</p><button className="primary-button" onClick={() => openModal('task')} data-testid="button-empty-add-task"><Plus size={15} /> Add a task</button></div>}</Panel></div></div>;
}

function ExpensesView({ data, openModal }: { data: ReturnType<typeof useLifeTracker>['data']; openModal: (modal: Modal) => void }) {
  const total = data.expenses.reduce((sum, item) => sum + item.amount, 0);
  const categories = [...new Set(data.expenses.map((item) => item.category))].map((category) => ({ category, total: data.expenses.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0) }));
  return <div className="content"><PageHeading title="Expenses" description="See where your money is going, without making it a moral issue." action={<button className="primary-button" onClick={() => openModal('expense')} data-testid="button-add-expense"><Plus size={15} /> Add expense</button>} /><div className="dashboard-grid"><Panel title="Recent entries" note={`${data.expenses.length} entries in your ledger`}><div className="table-wrap"><table className="data-table"><thead><tr><th>Entry</th><th>Category</th><th>Date</th><th>Amount</th></tr></thead><tbody>{data.expenses.map((entry) => <tr key={entry.id} data-testid={`row-expense-${entry.id}`}><td><b>{entry.label}</b></td><td><span className="pill">{entry.category}</span></td><td style={{ color: '#9b8883', fontSize: 11 }}>{entry.date}</td><td><b>{money(entry.amount)}</b></td></tr>)}</tbody></table></div></Panel><Panel title="This ledger" note="All time in this first milestone"><div className="spend-total">{money(total)}</div><div className="streak-list" style={{ marginTop: 22 }}>{categories.map((item) => <div className="streak" key={item.category}><span className="streak-name">{item.category}</span><div className="streak-bar"><span style={{ width: `${total ? item.total / total * 100 : 0}%` }} /></div><span className="streak-count">{money(item.total)}</span></div>)}</div></Panel></div></div>;
}

function NutritionView({ data, openModal }: { data: ReturnType<typeof useLifeTracker>['data']; openModal: (modal: Modal) => void }) {
  const totals = data.foods.reduce((acc, item) => ({ calories: acc.calories + item.calories, protein: acc.protein + item.protein, carbs: acc.carbs + item.carbs, fat: acc.fat + item.fat, fibre: acc.fibre + item.fibre }), { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  const macros = [{ key: 'calories', label: 'Calories', value: totals.calories, goal: 2100, unit: 'kcal' }, { key: 'protein', label: 'Protein', value: totals.protein, goal: 120, unit: 'g' }, { key: 'carbs', label: 'Carbohydrates', value: totals.carbs, goal: 250, unit: 'g' }, { key: 'fat', label: 'Fat', value: totals.fat, goal: 70, unit: 'g' }];
  return <div className="content"><PageHeading title="Nutrition" description="Notice what gives you energy. No numbers need to be perfect." action={<button className="primary-button" onClick={() => openModal('food')} data-testid="button-add-food"><Plus size={15} /> Add food</button>} /><div className="nutrition-layout"><Panel title="Today at a glance" note="Targets are guides, not grades"><div className="nutrition-total"><strong>{totals.calories}</strong><span>of 2,100 kcal</span></div><div className="macro-list">{macros.map((macro) => <div key={macro.key}><div className="macro-head"><span>{macro.label}</span><b>{macro.value}{macro.unit} / {macro.goal}{macro.unit}</b></div><div className={`macro-bar ${macro.key}`}><span style={{ width: `${Math.min(100, macro.value / macro.goal * 100)}%` }} /></div></div>)}</div></Panel><Panel title="Food log" note={`${data.foods.length} moments recorded today`}>{data.foods.length ? data.foods.map((food) => <div className="food-entry" key={food.id} data-testid={`row-food-${food.id}`}><div className="food-dot"><Utensils size={15} /></div><div><strong>{food.label}</strong><p>{food.time} · {food.calories} kcal · {food.protein}g protein</p></div></div>) : <div className="empty-state"><Coffee size={27} /><h3>A blank plate</h3><p>Add your first meal when you are ready.</p></div>}</Panel></div></div>;
}

function AnalyticsView({ data }: { data: ReturnType<typeof useLifeTracker>['data'] }) {
  const completed = data.tasks.filter((task) => task.completed).length;
  const heights = [48, 62, 42, 79, 60, 88, Math.max(20, completed * 20)];
  return <div className="content"><PageHeading title="Analytics" description="Patterns to help you be on your own side." /><div className="dashboard-grid"><Panel title="Task rhythm" note="Completed responsibilities across the last seven days"><div className="chart">{heights.map((height, index) => <div className={`chart-col ${index === 6 ? 'current' : ''}`} key={index}><div className="chart-bar" style={{ height: `${height}%` }} /><label>{['M', 'T', 'W', 'T', 'F', 'S', 'Today'][index]}</label></div>)}</div></Panel><Panel title="A few signals"><div className="metric-grid"><div className="metric"><span className="metric-label">Task follow-through</span><strong className="metric-value">{data.tasks.length ? Math.round(completed / data.tasks.length * 100) : 0}%</strong><span className="metric-sub">across your list</span></div><div className="metric"><span className="metric-label">Food moments</span><strong className="metric-value">{data.foods.length}</strong><span className="metric-sub">logged today</span></div></div></Panel></div><div style={{ marginTop: 18 }} className="view-card"><Panel title="Goals & sync" note="The next layer of your personal rhythm"><div className="empty-state"><Goal size={28} /><h3>Coming into focus</h3><p>Weekly goals, trends, and optional device sync will live here when you are ready for them.</p><button className="ghost-button" onClick={() => window.alert('Your data is already safely stored in this browser.')} data-testid="button-learn-sync">Learn about local storage</button></div></Panel></div></div>;
}

function SettingsView({ resetData }: { resetData: () => void }) {
  const [weekly, setWeekly] = useState(true);
  const [compact, setCompact] = useState(false);
  return <div className="content"><PageHeading title="Settings" description="Keep Daymark feeling like yours." /><div className="view-card"><Panel title="Preferences" note="Small choices for a better daily ritual"><div className="settings-list"><div className="setting-row"><div><strong>Weekly reflection</strong><p>A quiet nudge on Sunday evening.</p></div><button className={`switch ${weekly ? 'on' : ''}`} onClick={() => setWeekly(!weekly)} aria-label="Toggle weekly reflection" data-testid="button-toggle-weekly"><span /></button></div><div className="setting-row"><div><strong>Compact task list</strong><p>Show more of your day at once.</p></div><button className={`switch ${compact ? 'on' : ''}`} onClick={() => setCompact(!compact)} aria-label="Toggle compact task list" data-testid="button-toggle-compact"><span /></button></div><div className="setting-row"><div><strong>Data & privacy</strong><p>Your entries stay in this browser for now.</p></div><button className="ghost-button" onClick={() => window.alert('Daymark stores your data only in this browser.')} data-testid="button-view-privacy">Read note <ChevronRight size={14} /></button></div><div className="setting-row"><div><strong>Start fresh</strong><p>Clear this browser’s demo data and return to the beginning.</p></div><button className="cancel-button" onClick={() => { if (window.confirm('Reset all Daymark data?')) resetData(); }} data-testid="button-reset-data"><Trash2 size={14} /> Reset</button></div></div></Panel></div></div>;
}

function ModalForm({ modal, close, addTask, addExpense, addFood }: { modal: Modal; close: () => void; addTask: (task: Omit<Task, 'id' | 'completed'>) => void; addExpense: (expense: Omit<Expense, 'id' | 'date'>) => void; addFood: (food: Omit<Food, 'id' | 'time'>) => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  if (!modal) return null;
  const title = modal === 'task' ? 'Add a task' : modal === 'expense' ? 'Log an expense' : 'Add a food moment';
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (modal === 'task' && form.title?.trim()) addTask({ title: form.title.trim(), due: (form.due as Task['due']) || 'Today', priority: (form.priority as Task['priority']) || 'medium' });
    if (modal === 'expense' && form.label?.trim() && form.amount) addExpense({ label: form.label.trim(), amount: Number(form.amount), category: form.category || 'Other' });
    if (modal === 'food' && form.label?.trim() && form.calories) addFood({ label: form.label.trim(), calories: Number(form.calories), protein: Number(form.protein || 0), carbs: Number(form.carbs || 0), fat: Number(form.fat || 0), fibre: Number(form.fibre || 0) });
    close();
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><form className="modal" onSubmit={submit}><div className="modal-head"><div><h2>{title}</h2><p>Keep it simple. You can always add detail later.</p></div><button type="button" className="icon-button" onClick={close} aria-label="Close dialog" data-testid="button-close-dialog"><X size={17} /></button></div><div className="form-grid">
    {modal === 'task' && <><div className="field"><label htmlFor="task-title">What needs doing?</label><input id="task-title" autoFocus value={form.title || ''} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Water the plants" data-testid="input-task-title" /></div><div className="form-grid form-two"><div className="field"><label htmlFor="task-due">When</label><select id="task-due" value={form.due || 'Today'} onChange={(event) => update('due', event.target.value)} data-testid="select-task-due"><option>Today</option><option>Tomorrow</option><option>This week</option></select></div><div className="field"><label htmlFor="task-priority">Energy needed</label><select id="task-priority" value={form.priority || 'medium'} onChange={(event) => update('priority', event.target.value)} data-testid="select-task-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div></div></>}
    {modal === 'expense' && <><div className="field"><label htmlFor="expense-label">What was it?</label><input id="expense-label" autoFocus value={form.label || ''} onChange={(event) => update('label', event.target.value)} placeholder="e.g. Friday lunch" data-testid="input-expense-label" /></div><div className="form-grid form-two"><div className="field"><label htmlFor="expense-amount">Amount</label><input id="expense-amount" type="number" min="0" step=".01" value={form.amount || ''} onChange={(event) => update('amount', event.target.value)} placeholder="0.00" data-testid="input-expense-amount" /></div><div className="field"><label htmlFor="expense-category">Category</label><select id="expense-category" value={form.category || 'Food'} onChange={(event) => update('category', event.target.value)} data-testid="select-expense-category"><option>Food</option><option>Travel</option><option>Home</option><option>Leisure</option><option>Other</option></select></div></div></>}
    {modal === 'food' && <><div className="field"><label htmlFor="food-label">What did you have?</label><input id="food-label" autoFocus value={form.label || ''} onChange={(event) => update('label', event.target.value)} placeholder="e.g. Lentil soup" data-testid="input-food-label" /></div><div className="form-grid form-two">{[['calories', 'Calories (kcal)'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)'], ['fibre', 'Fibre (g)']].map(([key, label]) => <div className="field" key={key}><label htmlFor={`food-${key}`}>{label}</label><input id={`food-${key}`} type="number" min="0" step=".1" value={form[key] || ''} onChange={(event) => update(key, event.target.value)} placeholder="0" data-testid={`input-food-${key}`} /></div>)}</div></>}
  </div><div className="modal-actions"><button type="button" className="cancel-button" onClick={close} data-testid="button-cancel-dialog">Cancel</button><button type="submit" className="primary-button" data-testid="button-save-dialog"><Check size={15} /> Save entry</button></div></form></div>;
}

function App() {
  const { data, toggleTask, addTask, addExpense, addFood, resetData } = useLifeTracker();
  const [view, setView] = useState<View>('dashboard');
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const openModal = (next: Modal) => setModal(next);
  const content = useMemo(() => {
    if (view === 'dashboard') return <Dashboard data={data} toggleTask={toggleTask} openModal={openModal} setView={setView} />;
    if (view === 'tasks') return <TasksView data={data} toggleTask={toggleTask} openModal={openModal} />;
    if (view === 'expenses') return <ExpensesView data={data} openModal={openModal} />;
    if (view === 'nutrition') return <NutritionView data={data} openModal={openModal} />;
    if (view === 'analytics') return <AnalyticsView data={data} />;
    return <SettingsView resetData={resetData} />;
  }, [data, resetData, toggleTask, view]);
  return <QueryClientProvider client={queryClient}><TooltipProvider><Shell view={view} setView={setView}>{content}</Shell><ModalForm modal={modal} close={() => setModal(null)} addTask={addTask} addExpense={addExpense} addFood={addFood} />{toast && <div className="toast-note">{toast}</div>}<Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;