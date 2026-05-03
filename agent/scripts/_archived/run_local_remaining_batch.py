import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT_DIR = ROOT / "agent"
STATE_DIR = AGENT_DIR / "state"

TARGET_PAGES = [
    "entruempelung-bad-herrenalb.html",
    "entruempelung-weisenbach.html",
    "entruempelung-steinmauern.html",
    "entruempelung-stutensee.html",
    "entruempelung-gaggenau.html",
]


def run_python_script(script_path: Path, target_file: str) -> tuple[int, str, str]:
    process = subprocess.run(
        [sys.executable, str(script_path)],
        input=f"{target_file}\n",
        text=True,
        capture_output=True,
        cwd=ROOT,
    )
    return process.returncode, process.stdout, process.stderr


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    guard_script = AGENT_DIR / "scripts" / "run_local_guard.py"
    structural_script = AGENT_DIR / "scripts" / "run_local_structural_repair.py"
    repair_v2_script = AGENT_DIR / "scripts" / "run_local_repair_v2.py"

    summary = {
        "total_pages": len(TARGET_PAGES),
        "processed": [],
        "pass": [],
        "review": [],
        "block": [],
        "errors": [],
    }

    for file_name in TARGET_PAGES:
        item = {
            "page": file_name,
            "initial_guard": None,
            "structural_attempted": False,
            "repair_v2_attempted": False,
            "final_guard": None,
            "status": None,
        }

        # initial guard
        code, stdout, stderr = run_python_script(guard_script, file_name)
        if code != 0:
            summary["errors"].append({
                "page": file_name,
                "step": "initial_guard",
                "stdout": stdout,
                "stderr": stderr,
            })
            item["status"] = "ERROR"
            summary["processed"].append(item)
            continue

        initial_guard = load_json(STATE_DIR / "publish-guard-report.json")
        item["initial_guard"] = initial_guard

        if initial_guard.get("status") == "PASS":
            item["final_guard"] = initial_guard
            item["status"] = "PASS"
            summary["pass"].append(file_name)
            summary["processed"].append(item)
            continue

        # structural repair first
        item["structural_attempted"] = True
        code, stdout, stderr = run_python_script(structural_script, file_name)
        if code != 0:
            summary["errors"].append({
                "page": file_name,
                "step": "structural_repair",
                "stdout": stdout,
                "stderr": stderr,
            })
            item["status"] = "ERROR"
            summary["processed"].append(item)
            continue

        # then repair v2
        item["repair_v2_attempted"] = True
        code, stdout, stderr = run_python_script(repair_v2_script, file_name)
        if code != 0:
            summary["errors"].append({
                "page": file_name,
                "step": "repair_v2",
                "stdout": stdout,
                "stderr": stderr,
            })
            item["status"] = "ERROR"
            summary["processed"].append(item)
            continue

        # final guard
        code, stdout, stderr = run_python_script(guard_script, file_name)
        if code != 0:
            summary["errors"].append({
                "page": file_name,
                "step": "final_guard",
                "stdout": stdout,
                "stderr": stderr,
            })
            item["status"] = "ERROR"
            summary["processed"].append(item)
            continue

        final_guard = load_json(STATE_DIR / "publish-guard-report.json")
        item["final_guard"] = final_guard
        item["status"] = final_guard.get("status", "UNKNOWN")

        if item["status"] == "PASS":
            summary["pass"].append(file_name)
        elif item["status"] == "REVIEW":
            summary["review"].append(file_name)
        elif item["status"] == "BLOCK":
            summary["block"].append(file_name)
        else:
            summary["errors"].append({
                "page": file_name,
                "step": "classification",
                "stdout": json.dumps(final_guard, ensure_ascii=False),
                "stderr": "",
            })

        summary["processed"].append(item)

    summary["counts"] = {
        "pass": len(summary["pass"]),
        "review": len(summary["review"]),
        "block": len(summary["block"]),
        "errors": len(summary["errors"]),
    }

    save_json(STATE_DIR / "remaining-batch-summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
