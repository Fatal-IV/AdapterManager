const { listAdapters, toggleAdapter } = require('./services/adapters');

const POLL_INTERVAL_MS = 3000;
let timer = null;

function decideAutoModeActions(adapters) {
  const ethernetUp = adapters.some((a) => a.type === 'ethernet' && a.status === 'up');
  const wifiEnabled = adapters.some((a) => a.type === 'wifi' && a.status !== 'down');
  const actions = [];
  if (ethernetUp && wifiEnabled) actions.push({ type: 'wifi', enable: false });
  if (!ethernetUp && !wifiEnabled) actions.push({ type: 'wifi', enable: true });
  return actions;
}

async function tick() {
  const adapters = await listAdapters();
  const actions = decideAutoModeActions(adapters);
  for (const action of actions) {
    const target = adapters.find((a) => a.type === action.type);
    if (target) await toggleAdapter(target.id, action.enable);
  }
}

function startAutoMode() {
  if (timer) return;
  timer = setInterval(() => { tick().catch(() => {}); }, POLL_INTERVAL_MS);
  tick().catch(() => {});
}

function stopAutoMode() {
  if (timer) clearInterval(timer);
  timer = null;
}

function isAutoModeRunning() {
  return timer !== null;
}

module.exports = { decideAutoModeActions, startAutoMode, stopAutoMode, isAutoModeRunning };
