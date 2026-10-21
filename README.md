
# ClearChoice AI (Python + HTML + CSS + JavaScript)

A real conversational decision assistant. The browser sends messages to a Flask backend, and the backend calls the Groq API. The API key is read by Python from a private `.env` file; it is never placed in HTML or JavaScript.

## What it does

- Free-text conversational interface with follow-up questions
- Decision DNA (goals, constraints, priorities, uncertainties) when enough information is available
- 3–5 relevant strategies with benefits, drawbacks, risks, and estimated trade-offs
- Explainable recommendations and a three-step action plan
- What-if analysis by sending changed constraints in chat
- Downloadable text report
- Chats are temporary by default; **Save this chat** stores only the selected conversation in this browser's local storage
- Open/delete individual saved chats and delete all saved chats
- Forget the current session without deleting explicitly saved chats

## 1. Install Python

Install Python 3.10 or newer from https://www.python.org/downloads/ . During Windows installation, select **Add Python to PATH**.

## 2. Open a terminal in this folder

Create and activate a virtual environment (optional but recommended):

**Windows PowerShell**
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

**macOS / Linux**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## 3. Add your API key privately

Open `.env` in a text editor and replace the sample value:

```env
OPENAI_API_KEY=your_real_key_here
OPENAI_MODEL=gpt-4o-mini
PORT=5000
```

Do not commit or upload `.env`. The included `.gitignore` excludes it. Never put the key in `static/app.js` or `templates/index.html`.

## 4. Run the chatbot

```bash
python app.py
```

Open http://127.0.0.1:5000 in your browser. Keep the terminal running while you chat. If the server says the API is not configured, check `.env` and restart Python.

## Privacy notes

- The app does not write active chat messages to a database or browser storage automatically.
- When you explicitly save a chat, it is stored in local storage in that browser on that device. It is not encrypted, synced, or protected from other people who use the same browser profile. Delete saved chats if needed.
- To produce an AI response, the current conversation context is sent to the configured AI API provider. Do not enter passwords or highly sensitive personal information.
- `Forget this session` clears the in-memory conversation displayed by this page. It does not erase a conversation you intentionally saved; delete that separately.

## Deployment

GitHub Pages alone cannot run Python/Flask. For a simple all-in-one deployment, deploy this folder to a Python web host that supports Flask (for example Render), set `OPENAI_API_KEY` as a secret environment variable in the host dashboard, and use `gunicorn app:app` as the start command. Add `gunicorn` to `requirements.txt` before deploying if your host needs it. Do not publish `.env`.

## Troubleshooting

- **AI backend not configured:** `.env` must be in the project root beside `app.py`, and Python must be restarted after editing it.
- **API request failed:** check API key validity, provider account billing, and model access.
- **Port already in use:** change `PORT` in `.env`, then visit that port in your browser.
=======
# clearchoice-chatbot-
>>>>>>> ee9e076b49eb3866cc838e3394e0819bafeda0c3
