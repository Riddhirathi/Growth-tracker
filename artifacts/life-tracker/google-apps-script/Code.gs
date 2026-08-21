/**
 * Personal Tracker — Google Sheets sync backend.
 *
 * Deploy this as a Google Apps Script Web App bound to your Google Sheet.
 * Full setup steps: see ../GOOGLE_SHEETS_SETUP.md
 *
 * Before deploying, set a script property named SYNC_TOKEN
 * (Project Settings > Script Properties) — this is the secret the app
 * uses to authenticate. Pick any long random string.
 *
 * API shape (token is passed inside the request, never as a header,
 * so requests stay CORS-"simple" and Apps Script's automatic
 * Access-Control-Allow-Origin: * applies without a preflight):
 *
 *   GET  ?token=...&action=pull        -> { ok: true, data: {...} }
 *   POST { token, action: 'push', data: {...} }  (Content-Type: text/plain)
 *                                       -> { ok: true }
 */

const TOKEN = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');

const SHEETS = {
  tasks: { name: 'Tasks', headers: ['id', 'title', 'notes', 'due', 'completed', 'priority', 'recurrence', 'recurrenceValue', 'completedDates', 'currentStreak', 'longestStreak', 'createdAt'] },
  expenses: { name: 'Expenses', headers: ['id', 'label', 'category', 'amount', 'date'] },
  foods: { name: 'Foods', headers: ['id', 'label', 'calories', 'protein', 'carbs', 'fat', 'fibre', 'time', 'date'] },
  foodDatabase: { name: 'FoodDatabase', headers: ['label', 'quantity', 'unit', 'calories', 'protein', 'carbs', 'fat', 'fibre'] },
  weightEntries: { name: 'Weight', headers: ['id', 'date', 'weight'] },
  settings: { name: 'Settings', headers: ['key', 'value'] },
};

const FIELD_TYPES = {
  id: 'string', title: 'string', notes: 'string', due: 'string', completed: 'boolean',
  priority: 'string', recurrence: 'json', recurrenceValue: 'number', completedDates: 'json',
  currentStreak: 'number', longestStreak: 'number', createdAt: 'text',
  label: 'string', category: 'string', amount: 'number', date: 'text',
  calories: 'number', protein: 'number', carbs: 'number', fat: 'number', fibre: 'number', time: 'text',
  quantity: 'number', unit: 'string', weight: 'number',
  key: 'string', value: 'json',
};

function doGet(e) {
  return handle(e.parameter || {});
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'Invalid JSON body' });
  }
  return handle(body);
}

function doOptions() {
  return ContentService.createTextOutput('');
}

function handle(input) {
  if (!TOKEN) return json({ ok: false, error: 'Server not configured: set the SYNC_TOKEN script property' });
  if (input.token !== TOKEN) return json({ ok: false, error: 'Unauthorized' });
  var action = input.action || 'pull';
  try {
    if (action === 'pull') return json({ ok: true, data: pullAll() });
    if (action === 'push') {
      pushAll(input.data || {});
      return json({ ok: true });
    }
    return json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function pullAll() {
  var settingsMap = {};
  readRows('settings').forEach(function (row) { settingsMap[row.key] = row.value; });
  return {
    tasks: readRows('tasks'),
    expenses: readRows('expenses'),
    foods: readRows('foods'),
    foodDatabase: readRows('foodDatabase'),
    weightEntries: readRows('weightEntries'),
    weight: settingsMap.weight != null ? settingsMap.weight : null,
    categories: settingsMap.categories || [],
    habits: settingsMap.habits || [],
    goals: settingsMap.goals || null,
  };
}

function pushAll(data) {
  writeRows('tasks', data.tasks || []);
  writeRows('expenses', data.expenses || []);
  writeRows('foods', data.foods || []);
  writeRows('foodDatabase', data.foodDatabase || []);
  writeRows('weightEntries', data.weightEntries || []);
  writeRows('settings', [
    { key: 'weight', value: data.weight != null ? data.weight : null },
    { key: 'categories', value: data.categories || [] },
    { key: 'habits', value: data.habits || [] },
    { key: 'goals', value: data.goals || {} },
  ]);
}

function getSheet(defKey) {
  var def = SHEETS[defKey];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(def.name);
  var isNew = false;
  if (!sheet) {
    sheet = ss.insertSheet(def.name);
    isNew = true;
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(def.headers);
    isNew = true;
  }
  if (isNew) {
    def.headers.forEach(function (header, index) {
      if (FIELD_TYPES[header] !== 'number' && FIELD_TYPES[header] !== 'boolean') {
        sheet.getRange(1, index + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
      }
    });
  }
  return sheet;
}

function readRows(defKey) {
  var def = SHEETS[defKey];
  var sheet = getSheet(defKey);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, def.headers.length).getValues();
  return values
    .filter(function (row) { return row.some(function (cell) { return cell !== '' && cell !== null; }); })
    .map(function (row) {
      var obj = {};
      def.headers.forEach(function (header, index) { obj[header] = coerceIn(row[index], FIELD_TYPES[header]); });
      return obj;
    });
}

function writeRows(defKey, rows) {
  var def = SHEETS[defKey];
  var sheet = getSheet(defKey);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, def.headers.length).clearContent();
  if (!rows || !rows.length) return;
  var values = rows.map(function (row) {
    return def.headers.map(function (header) { return coerceOut(row[header], FIELD_TYPES[header]); });
  });
  sheet.getRange(2, 1, values.length, def.headers.length).setValues(values);
}

function coerceOut(value, type) {
  if (value === undefined || value === null) return '';
  if (type === 'json') return JSON.stringify(value);
  if (type === 'boolean') return Boolean(value);
  if (type === 'number') return typeof value === 'number' ? value : Number(value) || 0;
  return String(value);
}

function coerceIn(value, type) {
  if (type === 'json') {
    if (value === '' || value === null || value === undefined) return null;
    try { return JSON.parse(value); } catch (err) { return null; }
  }
  if (type === 'boolean') return value === true || value === 'TRUE' || value === 'true';
  if (type === 'number') return value === '' || value === null || value === undefined ? 0 : Number(value);
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value === null || value === undefined ? '' : String(value);
}
