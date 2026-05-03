import json
from pathlib import Path
from datetime import datetime

QUEUE_PATH = Path("agent/state/autopost-queue.json")

def main():
    if not QUEUE_PATH.exists():
        print("Queue file missing. Nothing to do.")
        return

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    items = queue.get("items", [])
    if not items:
        print("No queued items. Nothing to do.")
        return

    daily_limit = int(queue.get("dailyLimit", 10))
    published_today = int(queue.get("publishedToday", 0))

    if published_today >= daily_limit:
        print(f"Daily limit reached: {published_today}/{daily_limit}")
        return

    item = items.pop(0)
    staged_path = Path(item["stagedPath"])
    final_path = Path(item["path"])

    if not staged_path.exists():
        print(f"Staged file missing: {staged_path}")
        queue["items"] = items
        QUEUE_PATH.write_text(json.dumps(queue, indent=2, ensure_ascii=False), encoding="utf-8")
        return

    final_path.parent.mkdir(parents=True, exist_ok=True)
    final_path.write_text(staged_path.read_text(encoding="utf-8"), encoding="utf-8")
    staged_path.unlink()

    queue["items"] = items
    queue["publishedToday"] = published_today + 1
    queue["lastPublishedAt"] = datetime.utcnow().isoformat() + "Z"
    QUEUE_PATH.write_text(json.dumps(queue, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Published from queue: {final_path}")

if __name__ == "__main__":
    main()
