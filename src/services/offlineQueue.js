import * as SecureStore from 'expo-secure-store';
import { submitAction } from './farangisApi';

const KEY = 'farangis_offline_action_queue';

async function readQueue() {
  try { return JSON.parse((await SecureStore.getItemAsync(KEY)) || '[]'); }
  catch { return []; }
}

async function writeQueue(items) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(items.slice(-50)));
}

export async function enqueueAction(action) {
  const items = await readQueue();
  items.push({ ...action, queuedAt: Date.now(), attempts: 0 });
  await writeQueue(items);
  return items.length;
}

export async function flushActionQueue() {
  const items = await readQueue();
  if (!items.length) return { sent: 0, remaining: 0 };
  const remaining = [];
  let sent = 0;
  for (const item of items) {
    try {
      await submitAction({ tool: item.tool, args: item.args, confirmed: item.confirmed === true });
      sent += 1;
    } catch {
      remaining.push({ ...item, attempts: (item.attempts || 0) + 1 });
    }
  }
  await writeQueue(remaining);
  return { sent, remaining: remaining.length };
}

export async function getQueuedActionCount() {
  return (await readQueue()).length;
}
