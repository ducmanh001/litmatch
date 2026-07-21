import json
import urllib.request
from pathlib import Path
from datetime import datetime

auth = json.loads(Path.home().joinpath(".codex/auth.json").read_text())

token = auth["tokens"]["access_token"]
account = auth["tokens"]["account_id"]

req = urllib.request.Request(
    "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
    headers={
        "Authorization": f"Bearer {token}",
        "ChatGPT-Account-ID": account,
        "originator": "Codex Desktop",
    },
)

data = json.loads(urllib.request.urlopen(req).read())

print(f"Available resets: {data.get('available_count', 0)}\n")

for i, c in enumerate(data.get("credits", []), 1):
    granted = c.get("granted_at")
    expires = c.get("expires_at")

    print(f"Reset #{i}")
    print(f"Status   : {c.get('status')}")
    print(f"Title    : {c.get('title')}")

    if granted:
        print("Granted  :", datetime.fromisoformat(granted.replace("Z", "+00:00")).astimezone())

    if expires:
        print("Expires  :", datetime.fromisoformat(expires.replace("Z", "+00:00")).astimezone())

    print()
