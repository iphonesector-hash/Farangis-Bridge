const registry = {
  aquagold: {
    enabled: () => Boolean(process.env.AQUAGOLD_API_URL),
    capabilities: ['customer_payment', 'customer_history'],
  },
  gmail: {
    enabled: () => Boolean(process.env.FARANGIS_GMAIL_WEBHOOK_URL),
    capabilities: ['future_webhook'],
  },
  calendar: {
    enabled: () => false,
    capabilities: ['client_native'],
  },
  github: {
    enabled: () => Boolean(process.env.FARANGIS_GITHUB_WEBHOOK_URL),
    capabilities: ['future_webhook'],
  },
  telegram: {
    enabled: () => Boolean(process.env.FARANGIS_TELEGRAM_WEBHOOK_URL),
    capabilities: ['future_webhook'],
  },
};

function connectorStatus() {
  return Object.fromEntries(Object.entries(registry).map(([name, item]) => [name, {
    enabled: item.enabled(),
    capabilities: item.capabilities,
  }]));
}

module.exports = { registry, connectorStatus };
