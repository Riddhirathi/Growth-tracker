import type { LifeData } from '@/hooks/use-life-tracker';

export type SheetsConfig = { url: string; token: string };

export type SheetsSnapshot = Pick<LifeData, 'tasks' | 'expenses' | 'foods' | 'foodDatabase' | 'weightEntries' | 'weight' | 'categories' | 'habits' | 'goals'>;

class SheetsSyncError extends Error {}

async function call(config: SheetsConfig, action: 'pull' | 'push', data?: SheetsSnapshot): Promise<{ ok: true; data?: SheetsSnapshot } | never> {
  const url = new URL(config.url);
  let response: Response;
  try {
    if (action === 'pull') {
      url.searchParams.set('token', config.token);
      url.searchParams.set('action', 'pull');
      response = await fetch(url.toString(), { method: 'GET' });
    } else {
      response = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: config.token, action: 'push', data }),
      });
    }
  } catch {
    throw new SheetsSyncError('Could not reach the Google Sheets script. Check the Web app URL and your connection.');
  }
  if (!response.ok) throw new SheetsSyncError(`Google Sheets script returned HTTP ${response.status}.`);
  let payload: { ok: boolean; error?: string; data?: SheetsSnapshot };
  try {
    payload = await response.json();
  } catch {
    throw new SheetsSyncError('Unexpected response from the Google Sheets script — is the URL correct and the deployment "Anyone" access?');
  }
  if (!payload.ok) throw new SheetsSyncError(payload.error || 'The Google Sheets script rejected the request.');
  return payload as { ok: true; data?: SheetsSnapshot };
}

export async function pullFromSheets(config: SheetsConfig): Promise<SheetsSnapshot> {
  const result = await call(config, 'pull');
  if (!result.data) throw new SheetsSyncError('The Google Sheets script returned no data.');
  return result.data;
}

export async function pushToSheets(config: SheetsConfig, data: SheetsSnapshot): Promise<void> {
  await call(config, 'push', data);
}

export { SheetsSyncError };
