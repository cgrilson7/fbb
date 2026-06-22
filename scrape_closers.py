#!/usr/bin/env python3
"""Scrape closer depth charts from closermonkey.com into a CSV."""

import csv
import re
import urllib.request
import sys
import os

URL = 'https://www.closermonkey.com/'

# Map abbreviations the site uses to our standard codes
TEAM_ALIASES = {
    'OAK': 'ATH',
}

VALID_TEAMS = {
    'BAL', 'BOS', 'NYY', 'TB', 'TOR',
    'CHW', 'CLE', 'DET', 'KC', 'MIN',
    'HOU', 'LAA', 'SEA', 'TEX', 'ATH', 'OAK',
    'ATL', 'MIA', 'NYM', 'PHI', 'WAS',
    'CHC', 'CIN', 'MIL', 'PIT', 'STL',
    'ARI', 'COL', 'LAD', 'SD', 'SF',
}


def scrape():
    req = urllib.request.Request(URL, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    })
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8')

    strip = lambda s: re.sub(r'<[^>]*>', '', s).strip()

    tr_pattern = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL)
    td_pattern = re.compile(r'<td[^>]*>(.*?)</td>', re.DOTALL)

    entries = []
    seen_teams = set()
    for tr_match in tr_pattern.finditer(html):
        tr_html = tr_match.group(1)
        tds = [strip(m.group(1)) for m in td_pattern.finditer(tr_html)]

        if len(tds) < 5:
            continue

        # Each row has either 5 tds (one team) or 10 tds (two teams)
        # Format: Team, Closer, 1st, 2nd, Updated [, Team, Closer, 1st, 2nd, Updated]
        for offset in range(0, len(tds), 5):
            if offset + 4 >= len(tds):
                break
            team = tds[offset]
            team = TEAM_ALIASES.get(team, team)
            if team not in VALID_TEAMS:
                continue
            # Only keep first occurrence of each team (skip standings/stats tables)
            if team in seen_teams:
                continue
            # Validate: "Updated" column should look like a date (M/DD/YY)
            updated = tds[offset + 4]
            if not re.match(r'\d{1,2}/\d{1,2}/\d{2,4}', updated):
                continue
            seen_teams.add(team)
            entries.append({
                'Team': team,
                'Closer': tds[offset + 1],
                '1st in Line': tds[offset + 2],
                '2nd in Line': tds[offset + 3],
                'Updated': updated,
            })

    if not entries:
        print('WARNING: No entries scraped. The page structure may have changed.', file=sys.stderr)
        sys.exit(1)

    out_path = os.path.join(os.path.dirname(__file__), 'app', 'public', 'data', 'closers.csv')
    with open(out_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Team', 'Closer', '1st in Line', '2nd in Line', 'Updated'])
        writer.writeheader()
        writer.writerows(entries)

    print(f'Scraped {len(entries)} teams → {out_path}')


if __name__ == '__main__':
    scrape()
