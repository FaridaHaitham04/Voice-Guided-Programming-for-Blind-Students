"""
benchmark_llm.py – BlindCode LLM Benchmark
===========================================
Streams responses from multiple local Ollama models using the app's own
lesson questions and records:
  • Time-to-first-token (TTFT) – how fast the model starts talking
  • Total elapsed time       – full response duration
  • Tokens per second        – throughput

A warm-up call is excluded from every model's stats.
Qwen3 models have <think> tags disabled via options={"think": False}.

Outputs (all written to the same directory as this script):
  benchmark_results.csv  – raw data, one row per (model, question)
  benchmark_answers.md   – answers side-by-side with empty 1-5 score columns
  A formatted table is also printed to the terminal.

Configuration via environment variables (or just edit the lists below):
  BENCHMARK_MODELS   comma-separated model names to override MODELS list
  OLLAMA_HOST        Ollama server URL (default: http://localhost:11434)
"""

import csv
import os
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration – override via env vars without touching this file
# ---------------------------------------------------------------------------

MODELS: list[str] = [
    m.strip()
    for m in os.getenv(
        "BENCHMARK_MODELS",
        "qwen3:8b,qwen3:4b,gemma3:4b,qwen2.5-coder:7b,qwen2.5-coder:1.5b",
    ).split(",")
]

# 8 questions grounded in the app's three lessons (variables, for-loop, while-loop)
QUESTIONS: list[str] = [
    # Lesson 1 – variables
    "What is a variable in Python? Give me a simple example.",
    # Lesson 2 – for loop with range(1, 6)
    "Show me a for loop that prints the numbers 1 to 5 using range(1, 6).",
    # Lesson 3 – while loop countdown
    "How does a while loop countdown work in Python? Walk me through it step by step.",
    # Indentation concept that appears in lesson 2 and 3
    "Why is print(number) indented inside a for loop? What happens if it isn't?",
    # Debugging question voiced by beginners
    "My loop prints nothing. What could be wrong? Give me three common reasons.",
    # range() explanation from lesson 2
    "What does range(1, 6) give me? List every number it produces.",
    # Read-aloud request (simulates the voice tutor use case)
    (
        "Read line 3 to me from this code:\n"
        "  count = 3\n"
        "  while count > 0:\n"
        "      print(count)\n"
        "      count = count - 1\n"
        "Tell me what that line does in plain English."
    ),
    # Error-message explanation
    'I got this error: NameError: name "number" is not defined. What does it mean and how do I fix it?',
]

# System prompt: short, friendly, voice-first (matches the app's tutor persona)
SYSTEM_PROMPT = (
    "You are BlindCode Tutor, a friendly Python teacher for blind students. "
    "Keep answers short, clear, and easy to understand when read aloud. "
    "Avoid ASCII art, tables, and anything that only makes sense visually."
)

# Where to write the output files (same directory as this script)
OUT_DIR = Path(__file__).parent

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def is_qwen3(model_name: str) -> bool:
    """Return True for any model that supports (and should disable) <think> mode."""
    return model_name.lower().startswith("qwen3")


def stream_and_measure(client, model: str, question: str) -> dict:
    """
    Stream one question to `model` and return timing + content.

    Returns a dict with keys:
      model, question, ttft_s, total_s, tokens_per_sec, answer
    """
    options = {}
    if is_qwen3(model):
        # Disable chain-of-thought thinking tokens so we measure actual output
        options["think"] = False

    start = time.perf_counter()
    first_token_time: float | None = None
    chunks: list[str] = []

    stream = client.chat(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
        ],
        stream=True,
        options=options if options else None,
    )

    for chunk in stream:
        token = chunk.message.content or ""
        if token and first_token_time is None:
            first_token_time = time.perf_counter()
        chunks.append(token)

    end = time.perf_counter()
    answer = "".join(chunks).strip()

    # Rough token count: Ollama doesn't expose a token counter in the streaming
    # iterator, so we approximate with whitespace splitting (good enough for
    # comparative benchmarking).
    approx_tokens = len(answer.split())
    total_s = end - start
    ttft_s = (first_token_time - start) if first_token_time else total_s
    tok_per_sec = approx_tokens / total_s if total_s > 0 else 0.0

    return {
        "model": model,
        "question": question[:60] + ("…" if len(question) > 60 else ""),
        "question_full": question,
        "ttft_s": round(ttft_s, 3),
        "total_s": round(total_s, 3),
        "tokens_per_sec": round(tok_per_sec, 1),
        "answer": answer,
    }


def warm_up(client, model: str) -> None:
    """
    Send a single throwaway question to prime the model in memory.
    Results are discarded – this run is NOT included in benchmarks.
    """
    print(f"  [warm-up] {model} …", end=" ", flush=True)
    t0 = time.perf_counter()
    for _ in client.chat(
        model=model,
        messages=[{"role": "user", "content": "Say hello in one word."}],
        stream=True,
    ):
        pass
    print(f"done ({time.perf_counter() - t0:.1f}s)")


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------


def write_csv(rows: list[dict], path: Path) -> None:
    """Write raw benchmark metrics to a CSV file."""
    fields = ["model", "question", "ttft_s", "total_s", "tokens_per_sec"]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row[k] for k in fields})
    print(f"\n📄 CSV saved → {path}")


def write_markdown(rows: list[dict], questions: list[str], models: list[str], path: Path) -> None:
    """
    Write benchmark_answers.md.

    Layout: one section per question, one column per model, plus empty
    Clarity and Friendliness score columns (1–5) for manual review.
    """
    # Build a lookup: (model, question_full) → answer
    lookup: dict[tuple[str, str], str] = {
        (r["model"], r["question_full"]): r["answer"] for r in rows
    }

    lines: list[str] = [
        "# BlindCode – LLM Benchmark Answers",
        "",
        "> Score each answer **1–5** in the Clarity and Friendliness columns.",
        "> 5 = excellent for a blind beginner heard aloud; 1 = confusing or unsuitable.",
        "",
    ]

    for q_index, question in enumerate(questions, start=1):
        lines.append(f"## Q{q_index}: {question[:80]}{'…' if len(question) > 80 else ''}")
        lines.append("")

        # Table header
        header = "| Model | Answer | Clarity (1-5) | Friendliness (1-5) |"
        sep = "|-------|--------|:---:|:---:|"
        lines.append(header)
        lines.append(sep)

        for model in models:
            answer = lookup.get((model, question), "*(not run)*")
            # Escape pipe characters so they don't break the markdown table
            answer_cell = answer.replace("|", "\\|").replace("\n", " ↵ ")
            lines.append(f"| `{model}` | {answer_cell} | | |")

        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"📝 Answers saved → {path}")


def print_summary(rows: list[dict], models: list[str]) -> None:
    """Print a human-readable summary table to the terminal."""
    # Average metrics per model
    from collections import defaultdict

    totals: dict[str, dict] = defaultdict(lambda: {"ttft": 0.0, "total": 0.0, "tps": 0.0, "n": 0})
    for row in rows:
        m = row["model"]
        totals[m]["ttft"] += row["ttft_s"]
        totals[m]["total"] += row["total_s"]
        totals[m]["tps"] += row["tokens_per_sec"]
        totals[m]["n"] += 1

    col_w = 24  # model column width
    print("\n" + "=" * 72)
    print("BlindCode LLM Benchmark – Summary (averages across 8 questions)")
    print("=" * 72)
    print(f"{'Model':<{col_w}} {'Avg TTFT (s)':>13} {'Avg Total (s)':>14} {'Avg tok/s':>10}")
    print("-" * 72)
    for model in models:
        t = totals[model]
        n = t["n"] or 1
        print(
            f"{model:<{col_w}} "
            f"{t['ttft']/n:>13.2f} "
            f"{t['total']/n:>14.2f} "
            f"{t['tps']/n:>10.1f}"
        )
    print("=" * 72)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    # Import here so the file is importable even if ollama isn't installed yet
    try:
        import ollama
    except ImportError:
        sys.exit(
            "ERROR: `ollama` package not found.\n"
            "Activate the venv and run: pip install ollama"
        )

    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    client = ollama.Client(host=host)

    print(f"BlindCode LLM Benchmark")
    print(f"Ollama host : {host}")
    print(f"Models      : {', '.join(MODELS)}")
    print(f"Questions   : {len(QUESTIONS)}")
    print()

    all_rows: list[dict] = []

    for model in MODELS:
        print(f"\n{'─' * 60}")
        print(f"Model: {model}")

        # Warm-up run (excluded from results)
        warm_up(client, model)

        # Benchmark each question
        for q_index, question in enumerate(QUESTIONS, start=1):
            short_q = question[:55] + ("…" if len(question) > 55 else "")
            print(f"  Q{q_index:>1}/8  {short_q}", end="  ", flush=True)
            result = stream_and_measure(client, model, question)
            all_rows.append(result)
            print(
                f"TTFT={result['ttft_s']:.2f}s  "
                f"total={result['total_s']:.2f}s  "
                f"tok/s={result['tokens_per_sec']}"
            )

    # --- Write outputs ---
    csv_path = OUT_DIR / "benchmark_results.csv"
    md_path = OUT_DIR / "benchmark_answers.md"

    write_csv(all_rows, csv_path)
    write_markdown(all_rows, QUESTIONS, MODELS, md_path)
    print_summary(all_rows, MODELS)


if __name__ == "__main__":
    main()

