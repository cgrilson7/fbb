#!/usr/bin/env python3
"""Pull the set of FanGraphs player ids with ANY MLB appearance (2000-present).

Companion to scrape_fangraphs.py: hits the major-league leaderboard endpoint
(qual=0, aggregated across seasons) for batters and pitchers. Anyone appearing
here has made their MLB debut, so the app's Prospects page can exclude them by
exact PlayerId match against the minors CSVs (same FanGraphs id space).

Setup: same FG_COOKIE in .env as scrape_fangraphs.py.

Usage:
    python scrape_mlb_debuts.py           # writes mlb_debuted.csv (both dirs)
"""
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from scrape_fangraphs import HEADERS, OUT_DIRS, load_cookie

API = "https://www.fangraphs.com/api/leaders/major-league/data"
FIRST_SEASON = 2000
LAST_SEASON = 2026
PAGE_ITEMS = 5000


def fetch(stats: str, cookie: str) -> list[dict]:
    rows: list[dict] = []
    page = 1
    while True:
        params = {
            "age": "", "pos": "all", "stats": stats, "lg": "all",
            "qual": "0", "ind": "0", "month": "0", "team": "0", "type": "8",
            "season1": str(FIRST_SEASON), "season": str(LAST_SEASON),
            "pageitems": str(PAGE_ITEMS), "pagenum": str(page),
        }
        url = f"{API}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={**HEADERS, "Cookie": cookie})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
        batch = data["data"] if isinstance(data, dict) else data
        if not batch:
            break
        rows.extend(batch)
        total = data.get("totalCount", len(rows)) if isinstance(data, dict) else len(rows)
        print(f"  {stats}: page {page}, {len(rows)}/{total}")
        if len(rows) >= total:
            break
        page += 1
        time.sleep(1.5)
    if not rows:
        sys.exit(f"No rows returned for stats={stats}. Cookie expired?")
    return rows


def main() -> None:
    cookie = load_cookie()
    print(f"FanGraphs MLB debut pull, seasons {FIRST_SEASON}-{LAST_SEASON}")

    seen: dict[str, str] = {}
    for stats in ("bat", "pit"):
        for r in fetch(stats, cookie):
            pid = str(r.get("playerid") or r.get("playerids") or "")
            if pid and pid not in seen:
                seen[pid] = r.get("PlayerName", "")
        time.sleep(1.5)

    for d in OUT_DIRS:
        path = d / "mlb_debuted.csv"
        with open(path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["PlayerId", "Name"])
            for pid, name in sorted(seen.items(), key=lambda kv: kv[1]):
                w.writerow([pid, name])
        print(f"  wrote {len(seen):5d} ids -> {path}")

    print("done.")


if __name__ == "__main__":
    main()
