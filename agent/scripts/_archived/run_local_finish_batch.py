import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENT_DIR = ROOT / "agent"
STATE_DIR = AGENT_DIR / "state"

TARGET_PAGES = [
    "entruempelung-bad-herrenalb.html",
    "entruempelung-steinmauern.html",
    "entruempelung-gaggenau.html",
]

MAX_ROUNDS = 4


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


def score_guard(guard: dict) -> int:
    status = guard.get("status", "BLOCK")
    reasons = guard.get("reasons", [])

    base = {
        "PASS": 0,
        "REVIEW": 100,
        "BLOCK": 200,
    }.get(status, 300)

    penalty = 0
    for reason in reasons:
        if "too few sections" in reason.lower():
            penalty += 30
        elif "faq too weak" in reason.lower():
            penalty += 25
        elif "faq similarity too high" in reason.lower():
            penalty += 20
        elif "cta similarity too high" in reason.lower():
            penalty += 15
        elif "structure similarity too high" in reason.lower():
            penalty += 15
        else:
            penalty += 10

    return base + penalty


def classify_action(final_guard: dict) -> str:
    reasons = final_guard.get("reasons", [])
    if final_guard.get("status") == "PASS":
        return "No action needed"
    if final_guard.get("status") == "REVIEW":
        return "Quick manual review"
    if "FAQ similarity too high" in reasons or "FAQ too weak" in reasons:
        return "Manual FAQ rewrite"
    if "CTA similarity too high" in reasons:
        return "Manual CTA rewrite"
    if "Too few sections" in reasons:
        return "Add section(s)"
    if "Too few internal links" in reasons:
        return "Add internal links"
    return "Manual check"


def main():
    guard_script = AGENT_DIR / "scripts" / "run_local_guard.py"
    structural_script = AGENT_DIR / "scripts" / "run_local_structural_repair.py"
    repair_v2_script = AGENT_DIR / "scripts" / "run_local_repair_v2.py"

    summary = {
        "total_pages": len(TARGET_PAGES),
        "max_rounds": MAX_ROUNDS,
        "processed": [],
        "pass": [],
        "review": [],
        "block": [],
        "errors": [],
    }

    for file_name in TARGET_PAGES:
        item = {
            "page": file_name,
            "rounds": [],
            "final_guard": None,
            "next_action": None,
            "status": None,
        }

        best_guard = None
        best_score = 10**9
        last_score = None

        for round_no in range(1, MAX_ROUNDS + 1):
            round_info = {
                "round": round_no,
                "initial_guard": None,
                "structural_attempted": False,
                "repair_v2_attempted": False,
                "final_guard": None,
                "score_after_round": None,
            }

            # guard before changes
            code, stdout, stderr = run_python_script(guard_script, file_name)
            if code != 0:
                summary["errors"].append({
                    "page": file_name,
                    "step": f"round_{round_no}_initial_guard",
                    "stdout": stdout,
                    "stderr": stderr,
                })
                item["status"] = "ERROR"
                item["rounds"].append(round_info)
                break

            initial_guard = load_json(STATE_DIR / "publish-guard-report.json")
            round_info["initial_guard"] = initial_guard

            initial_score = score_guard(initial_guard)
            if initial_score < best_score:
                best_score = initial_score
                best_guard = initial_guard

            if initial_guard.get("status") == "PASS":
                round_info["final_guard"] = initial_guard
                round_info["score_after_round"] = initial_score
                item["rounds"].append(round_info)
                item["final_guard"] = initial_guard
                item["status"] = "PASS"
                summary["pass"].append(file_name)
                break

            # structural repair
            round_info["structural_attempted"] = True
            code, stdout, stderr = run_python_script(structural_script, file_name)
            if code != 0:
                summary["errors"].append({
                    "page": file_name,
                    "step": f"round_{round_no}_structural_repair",
                    "stdout": stdout,
                    "stderr": stderr,
                })
                item["status"] = "ERROR"
                item["rounds"].append(round_info)
                break

            # repair v2
            round_info["repair_v2_attempted"] = True
            code, stdout, stderr = run_python_script(repair_v2_script, file_name)
            if code != 0:
                summary["errors"].append({
                    "page": file_name,
                    "step": f"round_{round_no}_repair_v2",
                    "stdout": stdout,
                    "stderr": stderr,
                })
                item["status"] = "ERROR"
                item["rounds"].append(round_info)
                break

            # guard after changes
            code, stdout, stderr = run_python_script(guard_script, file_name)
            if code != 0:
                summary["errors"].append({
                    "page": file_name,
                    "step": f"round_{round_no}_final_guard",
                    "stdout": stdout,
                    "stderr": stderr,
                })
                item["status"] = "ERROR"
                item["rounds"].append(round_info)
                break

            final_guard = load_json(STATE_DIR / "publish-guard-report.json")
            final_score = score_guard(final_guard)
            round_info["final_guard"] = final_guard
            round_info["score_after_round"] = final_score
            item["rounds"].append(round_info)

            if final_score < best_score:
                best_score = final_score
                best_guard = final_guard

            if final_guard.get("status") == "PASS":
                item["final_guard"] = final_guard
                item["status"] = "PASS"
                summary["pass"].append(file_name)
                break

            # stop if no improvement
            if last_score is not None and final_score >= last_score:
                item["final_guard"] = best_guard if best_guard else final_guard
                item["status"] = item["final_guard"].get("status", "BLOCK")
                break

            last_score = final_score

        if item["status"] is None and best_guard is not None:
            item["final_guard"] = best_guard
            item["status"] = best_guard.get("status", "BLOCK")

        if item["status"] == "REVIEW":
            summary["review"].append(file_name)
        elif item["status"] == "BLOCK":
            summary["block"].append(file_name)

        if item["final_guard"]:
            item["next_action"] = classify_action(item["final_guard"])

        summary["processed"].append(item)

    summary["counts"] = {
        "pass": len(summary["pass"]),
        "review": len(summary["review"]),
        "block": len(summary["block"]),
        "errors": len(summary["errors"]),
    }

    save_json(STATE_DIR / "finish-batch-summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
