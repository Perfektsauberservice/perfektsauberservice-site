import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT_DIR = ROOT / "agent"
STATE_DIR = AGENT_DIR / "state"


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
    repair_script = AGENT_DIR / "scripts" / "run_local_repair.py"

    html_files = sorted(
        [
            p.name
            for p in ROOT.glob("entruempelung-*.html")
            if p.is_file()
        ]
    )

    batch_summary = {
        "total_pages": len(html_files),
        "processed": [],
        "pass": [],
        "review": [],
        "block": [],
        "errors": [],
    }

    for file_name in html_files:
        page_result = {
            "page": file_name,
            "initial_guard": None,
            "repair_attempted": False,
            "final_guard": None,
            "status": None,
        }

        # first guard
        code, stdout, stderr = run_python_script(guard_script, file_name)
        if code != 0:
            batch_summary["errors"].append(
                {
                    "page": file_name,
                    "step": "initial_guard",
                    "stderr": stderr,
                    "stdout": stdout,
                }
            )
            page_result["status"] = "ERROR"
            batch_summary["processed"].append(page_result)
            continue

        similarity_report = load_json(STATE_DIR / "page-similarity-report.json")
        guard_report = load_json(STATE_DIR / "publish-guard-report.json")
        page_result["initial_guard"] = guard_report

        if guard_report.get("status") == "PASS":
            page_result["final_guard"] = guard_report
            page_result["status"] = "PASS"
            batch_summary["pass"].append(file_name)
            batch_summary["processed"].append(page_result)
            continue

        # repair
        page_result["repair_attempted"] = True
        code, stdout, stderr = run_python_script(repair_script, file_name)
        if code != 0:
            batch_summary["errors"].append(
                {
                    "page": file_name,
                    "step": "repair",
                    "stderr": stderr,
                    "stdout": stdout,
                }
            )
            page_result["status"] = "ERROR"
            batch_summary["processed"].append(page_result)
            continue

        # second guard
        code, stdout, stderr = run_python_script(guard_script, file_name)
        if code != 0:
            batch_summary["errors"].append(
                {
                    "page": file_name,
                    "step": "final_guard",
                    "stderr": stderr,
                    "stdout": stdout,
                }
            )
            page_result["status"] = "ERROR"
            batch_summary["processed"].append(page_result)
            continue

        final_guard_report = load_json(STATE_DIR / "publish-guard-report.json")
        page_result["final_guard"] = final_guard_report
        page_result["status"] = final_guard_report.get("status", "UNKNOWN")

        if page_result["status"] == "PASS":
            batch_summary["pass"].append(file_name)
        elif page_result["status"] == "REVIEW":
            batch_summary["review"].append(file_name)
        elif page_result["status"] == "BLOCK":
            batch_summary["block"].append(file_name)
        else:
            batch_summary["errors"].append(
                {
                    "page": file_name,
                    "step": "classification",
                    "stderr": "",
                    "stdout": json.dumps(final_guard_report, ensure_ascii=False),
                }
            )

        batch_summary["processed"].append(page_result)

    batch_summary["counts"] = {
        "pass": len(batch_summary["pass"]),
        "review": len(batch_summary["review"]),
        "block": len(batch_summary["block"]),
        "errors": len(batch_summary["errors"]),
    }

    save_json(STATE_DIR / "batch-summary.json", batch_summary)

    print(json.dumps(batch_summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
