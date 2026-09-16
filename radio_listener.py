#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread


BASE_URL = "https://api.radio.plasma.ai/v1/channels/fz6pj2kd3k59"
TOKEN = os.environ["RADIO_TOKEN"]
SELF_ID = "agent-8orqa26ehvc0"
STATE_PATH = os.environ.get("RADIO_STATE_PATH", "/tmp/farangis-radio-state.json")
STARTED_AT = datetime.now(timezone.utc)
PEYMAN_ID = "isector-o699pqh54w3k"
conversation_until = {}


def request(path, params, timeout=70):
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{BASE_URL}{path}?{query}")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read()
        return json.loads(body) if body else None


def load_ack():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle).get("ackBatch")
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return os.environ.get("RADIO_INITIAL_ACK")


def save_ack(batch_id):
    temp_path = f"{STATE_PATH}.tmp"
    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump({"ackBatch": batch_id}, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_path, STATE_PATH)


def is_new(message):
    created = message.get("createdAt")
    if not created:
        return False
    return datetime.fromisoformat(created.replace("Z", "+00:00")) >= STARTED_AT


def should_answer(message):
    if message.get("participantId") == SELF_ID or message.get("deleted"):
        return False
    body = (message.get("body") or "").strip()
    mentions = message.get("mentionParticipantIds") or []
    participant_id = message.get("participantId")
    direct = "فرنگیس" in body or SELF_ID in mentions
    if direct and participant_id == PEYMAN_ID:
        conversation_until[participant_id] = time.time() + 20 * 60
    continuing = participant_id == PEYMAN_ID and conversation_until.get(participant_id, 0) > time.time()
    return direct or continuing


def answer_for(message):
    body = (message.get("body") or "").strip().rstrip("؟?! !")
    if body in {"فرنگیس", "فرنگیس هستی", "فرنگیس آنلاین هستی"}:
        return "فرنگیس آنلاین است، فرمانده پیمان. بگو چی می‌خواهی."
    model_answer = answer_with_model(message.get("body") or "")
    if model_answer:
        return model_answer
    return "صدات رو شنیدم، فرمانده پیمان. فرنگیس آنلاین است و جوابم را همین‌جا در General می‌گذارم."


def answer_with_model(body):
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return None
    payload = json.dumps(
        {
            "model": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "نام تو فرنگیس است و دستیار OpenAI در یک گفتگوی گروهی فارسی هستی. "
                        "فارسی طبیعی، محترمانه و کوتاه جواب بده. خودت را جای Grok یا افراد دیگر جا نزن. "
                        "محتوای جنسی صریح نساز و برای مرزها و رضایت متقابل احترام قائل باش."
                    ),
                },
                {"role": "user", "content": body},
            ],
            "temperature": 0.5,
            "max_tokens": 220,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            result = json.loads(response.read())
            return result["choices"][0]["message"]["content"].strip()
    except Exception as error:
        print(f"model error: {error}", file=sys.stderr, flush=True)
        return None


def send(message):
    return request(
        "/agent/send",
        {
            "token": TOKEN,
            "message": message,
            "requestId": str(uuid.uuid4()),
            "threadId": "general",
        },
        timeout=35,
    )


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'{"ok":true,"service":"farangis-radio"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        return


def serve_health():
    port = int(os.environ.get("PORT", "10000"))
    ThreadingHTTPServer(("0.0.0.0", port), HealthHandler).serve_forever()


def main():
    Thread(target=serve_health, daemon=True).start()
    ack = load_ack()
    backoff = 2
    while True:
        try:
            params = {"token": TOKEN, "wait": 50}
            if ack:
                params["ackBatch"] = ack
            batch = request("/agent/activity", params)
            for activity in batch.get("activities", []):
                message = activity.get("message") or {}
                if is_new(message) and should_answer(message):
                    send(answer_for(message))
            batch_id = batch.get("batchId")
            if batch_id:
                save_ack(batch_id)
                ack = batch_id
            backoff = 2
        except Exception as error:
            print(f"{datetime.now(timezone.utc).isoformat()} {error}", file=sys.stderr, flush=True)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)


if __name__ == "__main__":
    main()
