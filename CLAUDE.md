# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fantasy baseball analysis tools for a 12-team rotisserie league on Fantrax. The project analyzes category standings to find strategic advantages and optimal team-building approaches.

## Running the Analysis

```bash
# Activate virtual environment
source venv/bin/activate

# Run the main analysis script
python analyze_fantasy.py
```

## Data Sources

- `fantrax_data.csv`: League standings with Team, Category, Value, Rank, and Points columns
- `fangraphs-leaderboard-projections.csv`: FanGraphs player projections for roster analysis
- `Dynasty Constitution (1).pdf`: League rules and scoring settings
- `fantrax_screenshots/`: Screenshot archives of league standings

## League Structure

- **14 categories**: R, HR, RBI, SB, AVG, OBP, SLG (batting) + QS, SV, HLD, BB9, K, ERA, WHIP (pitching)
- **12 teams**: Rotisserie format where each category ranks 1-12, points sum to total score

## Code Architecture

`analyze_fantasy.py` performs multi-faceted category analysis:

1. Creates pivot tables (Team × Category) for points, values, and ranks
2. Calculates category competitiveness via standard deviation
3. Builds correlation matrix to find category synergies/anti-synergies
4. Identifies underutilized category combinations using top-N overlap analysis
5. Evaluates 7-category "bundles" for head-to-head majority strategies
6. Defines and scores team-building archetypes

Key data structures:
- `pivot_points`: Team performance in roto points per category
- `pivot_values`: Raw stat values per category
- `pivot_ranks`: Team rank (1-12) per category
- `corr_matrix`: Category-to-category correlation coefficients
