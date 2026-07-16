# Ametller Origen agent skill

Agent skill, CLI, and MCP server for the Ametller Origen catalog, real basket, online orders, and offline Gmail receipts. It never checks out or pays.

## Install

```bash
git clone https://github.com/denya/ametller-origen-skill.git ~/.codex/skills/ametller-origen
cd ~/.codex/skills/ametller-origen
npm install && npm run build
```

Sign in once in a browser you control:

```bash
npm run login
npm run cli -- cart
```

Optional offline receipt sync requires the authenticated `gws` Google Workspace CLI:

```bash
npm run tickets:sync -- --overwrite
```

See [SKILL.md](SKILL.md) for agent behavior and `references/` for authentication, API, cart, and receipt details.

MIT licensed. Based on Igor Safonov's MIT-licensed [Ametller Origen MCP extension](https://github.com/igorsafonov-gif/ametller-origen). Independent project; not affiliated with Ametller Origen.
