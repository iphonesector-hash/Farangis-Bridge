import * as SecureStore from 'expo-secure-store';

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

export async function flushActionQueue(sender) {
  const items = await readQueue();
  if (!items.length || typeof sender !== 'function') return { sent: 0, remaining: items.length };
  const remaining = [];
  let sent = 0;
  for (const item of items) {
    try {
      await sender({ tool: item.tool, args: item.args, confirmed: item.confirmed === true }, { allowQueue: false });
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
