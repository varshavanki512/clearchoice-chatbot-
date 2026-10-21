import os
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

SYSTEM_PROMPT = """You are ClearChoice, a thoughtful, privacy-first decision-making assistant. Help users understand a problem and choose a practical next step. Be warm, concise, non-judgmental, and transparent about uncertainty.

Conversation behavior:
- If the user's situation is unclear or important constraints are missing, ask 1-3 focused follow-up questions before giving a final recommendation. Do not ask questions that have already been answered.
- When there is enough information, summarize Decision DNA with: Goal, Constraints, Priorities, and Uncertainties.
- Generate 3-5 meaningfully different, feasible strategies (not just two options). For each, give a short description, benefits, drawbacks, risks, effort/time, and who it suits.
- Compare strategies against the user's priorities. Explain the criteria and weights in plain language. Any numeric scores are estimates, not objective facts; state assumptions and uncertainty.
- Give a recommendation with clear reasoning, why it fits the stated priorities, what could change the recommendation, and a practical three-step action plan.
- Ask what-if questions or adapt the analysis when constraints change.
- Never claim that you have considered literally every possible solution. Offer a useful range of relevant alternatives.
- For medical, legal, financial, safety-critical, or crisis topics, be appropriately cautious and encourage qualified professional or emergency help where warranted.
- Do not claim that messages are never processed by a provider: the user message is sent to the configured AI API to generate a reply. Do not claim to save chat history yourself.
- Format answers in readable Markdown with headings and bullets. Avoid overwhelming users; if this is the first message about a problem, begin by understanding it and ask useful follow-up questions where needed."""


def get_client():
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    return OpenAI(
        api_key=api_key,
        base_url="https://api.groq.com/openai/v1"
    )


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify({"ok": True, "api_key_configured": bool(os.getenv("GROQ_API_KEY", "").strip())})

@app.post("/api/chat")
def chat():
    data = request.get_json(silent=True) or {}
    messages = data.get("messages", [])
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "Please type a message to begin."}), 400
    if len(messages) > 30:
        messages = messages[-30:]

    clean_messages = []
    for item in messages:
        if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
            continue
        content = item.get("content", "")
        if not isinstance(content, str):
            continue
        content = content.strip()
        if content:
            clean_messages.append({"role": item["role"], "content": content[:10000]})
    if not clean_messages or clean_messages[-1]["role"] != "user":
        return jsonify({"error": "Your latest message must be from you. Please try again."}), 400

    client = get_client()
    if client is None:
        return jsonify({"error": "The AI backend is not configured yet. Add GROQ_API_KEY to your private .env file, then restart the Python server."}), 503

    # Use a valid Groq model as the default
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, *clean_messages],
            temperature=0.6,
            max_tokens=1800,
        )
        answer = response.choices[0].message.content or "I couldn't form a response just now. Please try again."
        return jsonify({"reply": answer, "model": model})
    except Exception as exc:
        app.logger.exception("AI request failed")
        return jsonify({"error": "The AI service could not complete that request. Check your API key, model access, and account billing, then try again."}), 502


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
