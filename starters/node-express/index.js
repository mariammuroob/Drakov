const express = require("express");

const app = express();
app.use(express.json());

function decide(gameState) {
  // Your decision logic goes here. For example, inspect:
  // gameState.agent.cash or gameState.available_offers.jobs.
  return {
    action: "save_cash",
    reason: "Preserving cash while I evaluate the current market.",
  };
}

app.post("/", (request, response) => {
  if (!request.body || Array.isArray(request.body) || typeof request.body !== "object") {
    return response.status(400).json({ error: "Expected a JSON object." });
  }
  return response.json(decide(request.body));
});

app.get("/", (_request, response) => {
  response.json({ ok: true, agent: "blackstone-node-starter" });
});

if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => {
    console.log("Blackstone agent listening on http://localhost:3000");
  });
}

module.exports = app;
