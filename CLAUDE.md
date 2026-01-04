# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fantasy baseball draft analysis tools for a 12-team rotisserie league on Fantrax. The project generates strategy-weighted draft boards using FanGraphs projections, validates strategies against historical league results, and outputs an interactive HTML dashboard.

## Running the Analysis

```bash
# Activate virtual environment
source venv/bin/activate

# Full pipeline (run in order):
python match_players.py              # Generate master player database
python draft_board_analysis.py balanced         # Generate draft board (one strategy)
python draft_board_analysis.py volume_power
python draft_board_analysis.py power_rp
python draft_board_analysis.py speed_rates
python draft_board_analysis.py elite_bullpen
python generate_fbb_page.py          # Generate interactive HTML dashboard

# Standalone analysis (historical league data)
python analyze_fantasy.py
```

## Data Pipeline

```
FanGraphs projections + pitchers.csv + blocked_players.csv + rosters.csv
                              ↓
                    match_players.py
                              ↓
                      all_players.csv (master database, ~9K players)
                              ↓
                  draft_board_analysis.py (× 5 strategies)
                              ↓
                    draft_board_[strategy].csv
                              ↓
                    generate_fbb_page.py
                              ↓
                        index.html
```

## Code Architecture

### match_players.py
Merges FanGraphs projections with blocking/roster data into master database. Normalizes player names for matching, handles duplicates (Ohtani as batter, Edwin Diaz as pitcher), calculates derived metrics (counting stats, FPTS/M, WAR/dollar).

### draft_board_analysis.py
Generates strategy-weighted draft boards. Takes strategy name as CLI argument. Calculates z-scores for all stats, applies strategy-specific weights (positive for targets, negative for punts), assigns tiers by percentile.

**Strategies:**
- `volume_power`: R, HR, RBI + QS, K, ERA, WHIP (punt SB, SV, HLD)
- `power_rp`: HR, RBI, SLG + SV, HLD, ERA, WHIP (punt SB, QS)
- `speed_rates`: SB, AVG, OBP + ERA, WHIP, K (punt HR, RBI, QS)
- `balanced`: All categories equally weighted
- `elite_bullpen`: SV, HLD, ERA, WHIP + AVG, OBP (punt HR, QS, K)

### generate_fbb_page.py
Creates interactive HTML dashboard with Alpine.js. Features: strategy tabs, sortable tables, search/filter (hide free agents, hide partial blocks), color-coded rows by status.

### analyze_fantasy.py
Historical league analysis. Creates pivot tables, calculates category correlations, identifies underutilized category combinations, scores team-building archetypes.

## League Structure

- **14 categories**: R, HR, RBI, SB, AVG, OBP, SLG (batting) + QS, SV, HLD, BB9, K, ERA, WHIP (pitching)
- **12 teams**: Rotisserie format where each category ranks 1-12, points sum to total score

## Key Thresholds

- Batters: 400+ PA to qualify
- Starters: 100+ IP (or 40+ IP for reliever-heavy strategies)
- Tiers: T1 (top 10%), T2 (10-30%), T3 (30-50%), T4 (bottom 50%)

## Data Sources

- `fangraphs-leaderboard-projections.csv`: FanGraphs batter projections
- `pitchers.csv`: Pitcher projections
- `blocked_players.csv`: Player blocking status (Full/Partial)
- `rosters.csv`: Roster assignments and salaries (2025-2028)
- `fantrax_data.csv`: Historical league standings
