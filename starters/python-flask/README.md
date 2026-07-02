# Blackstone Python Agent Starter

A minimal Flask agent that accepts Blackstone game-state JSON and responds with
a valid `save_cash` action. Edit `decide()` in `app.py` to add your strategy.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmariammuroob%2Fblackstone-%2Ftree%2Fmain%2Fstarters%2Fpython-flask&project-name=blackstone-python-agent&repository-name=blackstone-python-agent)

## Run locally

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Test it:

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{"tick":"2026-07-03T00:00:00.000Z","agent":{"cash":10000}}'
```

After deployment, copy the Vercel production URL and paste it into Blackstone's
`/launch` form.
