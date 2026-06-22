#!/usr/bin/env python3
"""Pull FanGraphs minor-league leaderboards via the site's internal JSON API.

FanGraphs has no official API. This hits the same undocumented endpoint the
website uses, authenticated with your paid-member session cookie so you get
full member access. Output CSVs match the existing schema exactly, so they
drop straight into the app pipeline.

Setup: put your logged-in FanGraphs cookie in .env (gitignored) as:
    FG_COOKIE="fg_is_member=true; fg_uuid=...; wordpress_logged_in_...=..."

Usage:
    python scrape_fangraphs.py            # current season -> both CSVs
    python scrape_fangraphs.py 2024       # a specific season
"""
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Two locations, mirroring the all.csv convention (app reads from public/data).
OUT_DIRS = [ROOT, ROOT / "app" / "public" / "data"]

API = "https://www.fangraphs.com/api/leaders/minor-league/data"
# All minor leagues (AAA down through complex/foreign rookie leagues).
LEAGUES = "2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,30,32"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.fangraphs.com/prospects/stats",
}

# Output column header -> API field. Headers reproduce the existing CSV schema.
BAT_MAP = [
    ("Name", "PlayerName"), ("Team", "AffAbbName"), ("Level", "aLevel"),
    ("Age", "Age"), ("PA", "PA"), ("BB%", "BB%"), ("K%", "K%"),
    ("BB/K", "BB/K"), ("AVG", "AVG"), ("OBP", "OBP"), ("SLG", "SLG"),
    ("OPS", "OPS"), ("ISO", "ISO"), ("Spd", "Spd"), ("BABIP", "BABIP"),
    ("wSB", None),  # not returned by this endpoint; unused by the app
    ("wRC", "wRC"), ("wRAA", "wRAA"), ("wOBA", "wOBA"), ("wRC+", "wRC+"),
    ("PlayerId", "playerids"),
]
PIT_MAP = [
    ("Name", "PlayerName"), ("Team", "AffAbbName"), ("Level", "aLevel"),
    ("Age", "Age"), ("IP", "IP"), ("K/9", "K/9"), ("BB/9", "BB/9"),
    ("K/BB", "K/BB"), ("HR/9", "HR/9"), ("K%", "K%"), ("BB%", "BB%"),
    ("K-BB%", "K-BB%"), ("AVG", "AVG"), ("WHIP", "WHIP"), ("BABIP", "BABIP"),
    ("LOB%", "LOB%"), ("ERA", "ERA"), ("FIP", "FIP"), ("E-F", "E-F"),
    ("xFIP", "xFIP"), ("PlayerId", "playerids"),
]


def load_cookie() -> str:
    cookie = os.environ.get("FG_COOKIE")
    if not cookie:
        env = ROOT / ".env"
        if env.exists():
            for line in env.read_text().splitlines():
                line = line.strip()
                if line.startswith("FG_COOKIE="):
                    cookie = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not cookie:
        sys.exit("FG_COOKIE not set (env or .env). See script docstring.")
    return cookie


def fetch(stats: str, season: int, cookie: str) -> list[dict]:
    params = {
        "pos": "all", "level": "0", "lg": LEAGUES, "stats": stats,
        "qual": "0", "type": "1", "team": "0",
        "season": str(season), "seasonEnd": str(season),
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={**HEADERS, "Cookie": cookie})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    rows = data["data"] if isinstance(data, dict) else data
    if not rows:
        sys.exit(f"No rows returned for stats={stats}. Cookie expired?")
    return rows


def write_csv(rows: list[dict], colmap, basename: str) -> None:
    headers = [h for h, _ in colmap]
    out_rows = []
    for r in rows:
        out_rows.append({
            h: ("" if src is None else r.get(src, "")) for h, src in colmap
        })
    for d in OUT_DIRS:
        path = d / basename
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=headers)
            w.writeheader()
            w.writerows(out_rows)
        print(f"  wrote {len(out_rows):5d} rows -> {path}")


def main() -> None:
    season = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    cookie = load_cookie()
    print(f"FanGraphs minors pull, season {season}")

    print("batters...")
    bat = fetch("bat", season, cookie)
    write_csv(bat, BAT_MAP, "fangraphs_minors_batters.csv")

    time.sleep(1.5)  # be polite

    print("pitchers...")
    pit = fetch("pit", season, cookie)
    write_csv(pit, PIT_MAP, "fangraphs_minors_pitchers.csv")

    print("done.")


if __name__ == "__main__":
    main()
