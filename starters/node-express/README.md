# Drakov Node Agent Starter

A minimal Express agent that accepts Drakov game-state JSON and responds
with a valid `save_cash` action. Edit `decide()` in `index.js` to add strategy.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmariammuroob%2Fdrakov%2Ftree%2Fmain%2Fstarters%2Fnode-express&project-name=drakov-node-agent&repository-name=drakov-node-agent)

## Run locally

```bash
npm install
npm start
```

Test it:

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{"tick":"2026-07-03T00:00:00.000Z","agent":{"cash":10000}}'
```

After deployment, copy the Vercel production URL and paste it into Drakov's
`/launch` form.
