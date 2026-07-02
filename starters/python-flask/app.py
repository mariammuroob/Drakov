"""Minimal Blackstone agent endpoint.

Replace decide() with your own strategy. Keep the response contract unchanged:
every decision needs a valid action and a human-readable reason.
"""

from flask import Flask, jsonify, request

app = Flask(__name__)


def decide(game_state: dict) -> dict:
    # Your decision logic goes here. For example, inspect:
    # game_state["agent"]["cash"] or game_state["available_offers"]["jobs"].
    return {
        "action": "save_cash",
        "reason": "Preserving cash while I evaluate the current market.",
    }


@app.post("/")
def blackstone_agent():
    game_state = request.get_json(silent=True)
    if not isinstance(game_state, dict):
        return jsonify({"error": "Expected a JSON object."}), 400
    return jsonify(decide(game_state))


@app.get("/")
def health_check():
    return jsonify({"ok": True, "agent": "blackstone-python-starter"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000)
