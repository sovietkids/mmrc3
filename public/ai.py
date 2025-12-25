from flask import Flask, request, jsonify, send_from_directory, session
import requests

app = Flask(__name__)
app.secret_key = "dev-secret-key"

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen2.5:3b"

NORMAL_PROMPT = """
あなたの名前はまんまるAIです。
親切で丁寧、否定しない話し方をします。
"""

TRAINING_PROMPT = """
あなたは愚痴トレーニングAIです。

ルール:
- 最初に日常的な愚痴を1つ話す
- ユーザーは聞き手
- 会話は3往復
- 最後に評価を行う

評価項目（各10点）:
1. 共感
2. 否定しない姿勢
3. 言葉の丁寧さ

合計点と短い講評を必ず出す
"""

@app.route("/")
def index():
    return send_from_directory(".", "ai.html")

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    text = data["message"]
    mode = data.get("mode", "normal")
    system = data.get("system", False)

    if "messages" not in session:
        session["messages"] = []

    messages = session["messages"]

    if system:
        messages.clear()
        if mode == "training":
            messages.append({"role":"system","content":TRAINING_PROMPT})
        else:
            messages.append({"role":"system","content":NORMAL_PROMPT})
        session["messages"] = messages
        return jsonify({"reply": ""})

    messages.append({"role":"user","content":text})

    res = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "messages": messages,
            "stream": False
        }
    )

    reply = res.json()["message"]["content"]
    messages.append({"role":"assistant","content":reply})

    session["messages"] = messages[-20:]
    return jsonify({"reply": reply})

if __name__ == "__main__":
    app.run(debug=True)
