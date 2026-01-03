#!/usr/bin/env python3
"""
Draft Board Analysis - Multiple Strategy Support
Generates a strategy-weighted draft board with z-scores and tiered rankings.

Strategies based on Fantrax league analysis:
1. volume_power: R, HR, RBI + QS, K, ERA, WHIP (punt SB, SV, HLD)
2. power_rp: HR, RBI, SLG + SV, HLD, ERA, WHIP (punt SB, QS)
3. speed_rates: SB, AVG, OBP + ERA, WHIP, K (punt HR, QS)
4. balanced: All categories weighted equally
"""

import pandas as pd
import numpy as np
import sys

# =============================================================================
# STRATEGY DEFINITIONS
# =============================================================================

STRATEGIES = {
    'volume_power': {
        'name': 'Volume Pitching + Power',
        'description': 'Target: R, HR, RBI + QS, K, ERA, WHIP | Punt: SB, SV, HLD',
        'batter': {
            'z_HR': 1.0, 'z_RBI': 0.9, 'z_R': 0.8,
            'z_SB': -0.3, 'z_AVG': 0.0, 'z_OBP': 0.0, 'z_SLG': 0.3
        },
        'pitcher': {
            'z_QS': 1.0, 'z_K': 0.9, 'z_ERA': 0.8, 'z_WHIP': 0.8,
            'z_SV': -0.4, 'z_HLD': -0.3
        }
    },
    'power_rp': {
        'name': 'Power Hitting + Elite RP',
        'description': 'Target: HR, RBI, SLG + SV, HLD, ERA, WHIP | Punt: SB, QS',
        'batter': {
            'z_HR': 1.0, 'z_RBI': 0.9, 'z_SLG': 0.8, 'z_R': 0.5,
            'z_SB': -0.3, 'z_AVG': 0.0, 'z_OBP': 0.0
        },
        'pitcher': {
            'z_SV': 1.0, 'z_HLD': 0.9, 'z_ERA': 0.8, 'z_WHIP': 0.8,
            'z_QS': -0.3, 'z_K': 0.3
        }
    },
    'speed_rates': {
        'name': 'Speed + Rate Stats',
        'description': 'Target: SB, AVG, OBP + ERA, WHIP, K | Punt: HR, RBI, QS',
        'batter': {
            'z_SB': 1.0, 'z_AVG': 0.9, 'z_OBP': 0.9, 'z_R': 0.5,
            'z_HR': -0.2, 'z_RBI': -0.1, 'z_SLG': 0.0
        },
        'pitcher': {
            'z_ERA': 1.0, 'z_WHIP': 1.0, 'z_K': 0.7,
            'z_SV': 0.3, 'z_HLD': 0.3, 'z_QS': 0.0
        }
    },
    'balanced': {
        'name': 'Balanced Approach',
        'description': 'All categories weighted equally - best overall players',
        'batter': {
            'z_HR': 0.7, 'z_R': 0.7, 'z_RBI': 0.7, 'z_SB': 0.7,
            'z_AVG': 0.7, 'z_OBP': 0.7, 'z_SLG': 0.7
        },
        'pitcher': {
            'z_QS': 0.7, 'z_K': 0.7, 'z_ERA': 0.7, 'z_WHIP': 0.7,
            'z_SV': 0.5, 'z_HLD': 0.5
        }
    },
    'elite_bullpen': {
        'name': 'Elite Bullpen Focus',
        'description': 'Target: SV, HLD, ERA, WHIP + AVG, OBP | Punt: HR, QS, K',
        'batter': {
            'z_AVG': 1.0, 'z_OBP': 0.9, 'z_SB': 0.5, 'z_R': 0.3,
            'z_HR': -0.2, 'z_RBI': 0.0, 'z_SLG': 0.0
        },
        'pitcher': {
            'z_SV': 1.0, 'z_HLD': 1.0, 'z_ERA': 0.9, 'z_WHIP': 0.9,
            'z_QS': -0.4, 'z_K': -0.2
        }
    }
}

# =============================================================================
# SELECT STRATEGY
# =============================================================================

# Default strategy or get from command line
if len(sys.argv) > 1:
    STRATEGY_KEY = sys.argv[1]
else:
    STRATEGY_KEY = 'volume_power'

if STRATEGY_KEY not in STRATEGIES:
    print(f"Unknown strategy: {STRATEGY_KEY}")
    print(f"Available strategies: {', '.join(STRATEGIES.keys())}")
    sys.exit(1)

STRATEGY = STRATEGIES[STRATEGY_KEY]
BATTER_WEIGHTS = STRATEGY['batter']
PITCHER_WEIGHTS = STRATEGY['pitcher']

print(f"Strategy: {STRATEGY['name']}")
print(f"{STRATEGY['description']}")

# =============================================================================
# LOAD DATA
# =============================================================================

print("Loading data...")
df = pd.read_csv('all_players.csv')

# Split into batters and pitchers
batters = df[df['Player_Type'] == 'Batter'].copy()
pitchers = df[df['Player_Type'] == 'Pitcher'].copy()

print(f"Total players: {len(df)} ({len(batters)} batters + {len(pitchers)} pitchers)")

# =============================================================================
# FILTER TO MEANINGFUL PLAYING TIME
# =============================================================================

MIN_PA = 400  # Minimum plate appearances for batters

# For reliever-focused strategies, use lower IP threshold to include actual relievers
RELIEVER_STRATEGIES = ['power_rp', 'elite_bullpen']
if STRATEGY_KEY in RELIEVER_STRATEGIES:
    MIN_IP_SP = 100  # Starters still need 100 IP
    MIN_IP_RP = 40   # Relievers need 40 IP (about 1 IP every 4 games)
    print(f"Reliever-focused strategy: Using split IP thresholds (SP>={MIN_IP_SP}, RP>={MIN_IP_RP})")

    # Classify pitchers by GS ratio
    pitchers['is_SP'] = pitchers['GS'].fillna(0) > 5
    sp = pitchers[(pitchers['is_SP']) & (pitchers['IP'] >= MIN_IP_SP)].copy()
    rp = pitchers[(~pitchers['is_SP']) & (pitchers['IP'] >= MIN_IP_RP)].copy()
    pitchers = pd.concat([sp, rp], ignore_index=True)
    pitchers = pitchers.drop(columns=['is_SP'])
else:
    MIN_IP = 100  # Minimum innings pitched for pitchers
    pitchers = pitchers[pitchers['IP'] >= MIN_IP].copy()

batters = batters[batters['PA'] >= MIN_PA].copy()

print(f"After filtering: {len(batters)} batters + {len(pitchers)} pitchers")

# =============================================================================
# CALCULATE Z-SCORES
# =============================================================================

def calc_zscore(series):
    """Calculate z-score, handling NaN values."""
    mean = series.mean()
    std = series.std()
    if std == 0:
        return pd.Series(0, index=series.index)
    return (series - mean) / std

print("Calculating z-scores...")

# Batter z-scores (all categories)
batters['z_HR'] = calc_zscore(batters['HR'])
batters['z_R'] = calc_zscore(batters['R'])
batters['z_RBI'] = calc_zscore(batters['RBI'])
batters['z_SB'] = calc_zscore(batters['SB'])
batters['z_AVG'] = calc_zscore(batters['AVG'])
batters['z_OBP'] = calc_zscore(batters['OBP'])
batters['z_SLG'] = calc_zscore(batters['SLG'])

# Pitcher z-scores (all categories)
pitchers['z_QS'] = calc_zscore(pitchers['QS'])
pitchers['z_K'] = calc_zscore(pitchers['SO'])  # SO column is K
pitchers['z_SV'] = calc_zscore(pitchers['SV'].fillna(0))
pitchers['z_HLD'] = calc_zscore(pitchers['HLD'].fillna(0))

# For ERA and WHIP, lower is better - invert the z-score
pitchers['z_ERA'] = -calc_zscore(pitchers['ERA'])
pitchers['z_WHIP'] = -calc_zscore(pitchers['WHIP'])

# =============================================================================
# CALCULATE STRATEGY SCORES
# =============================================================================

print("Calculating Strategy Scores...")

# Batter Strategy Score - apply weights from strategy
batters['Strategy_Score'] = sum(
    BATTER_WEIGHTS.get(col, 0) * batters[col]
    for col in ['z_HR', 'z_R', 'z_RBI', 'z_SB', 'z_AVG', 'z_OBP', 'z_SLG']
)

# Pitcher Strategy Score - apply weights from strategy
pitchers['Strategy_Score'] = sum(
    PITCHER_WEIGHTS.get(col, 0) * pitchers[col]
    for col in ['z_QS', 'z_K', 'z_ERA', 'z_WHIP', 'z_SV', 'z_HLD']
)

# =============================================================================
# FILTER BLOCKED PLAYERS
# =============================================================================

print("Filtering blocked players...")

# Exclude fully blocked players
batters_available = batters[batters['Block_Type'] != 'Full'].copy()
pitchers_available = pitchers[pitchers['Block_Type'] != 'Full'].copy()

print(f"After removing full blocks: {len(batters_available)} batters, {len(pitchers_available)} pitchers")

# Flag partial blocks
batters_available['Is_Partial_Block'] = batters_available['Block_Type'] == 'Partial'
pitchers_available['Is_Partial_Block'] = pitchers_available['Block_Type'] == 'Partial'

# =============================================================================
# ASSIGN TIERS
# =============================================================================

print("Assigning tiers...")

def assign_tier(score, thresholds):
    """Assign tier based on score percentile thresholds."""
    if pd.isna(score):
        return 'Tier 4 - Depth'
    if score >= thresholds['elite']:
        return 'Tier 1 - Elite'
    elif score >= thresholds['strong']:
        return 'Tier 2 - Strong'
    elif score >= thresholds['solid']:
        return 'Tier 3 - Solid'
    else:
        return 'Tier 4 - Depth'

# Calculate thresholds
batter_thresholds = {
    'elite': batters_available['Strategy_Score'].quantile(0.90),
    'strong': batters_available['Strategy_Score'].quantile(0.70),
    'solid': batters_available['Strategy_Score'].quantile(0.50),
}

pitcher_thresholds = {
    'elite': pitchers_available['Strategy_Score'].quantile(0.90),
    'strong': pitchers_available['Strategy_Score'].quantile(0.70),
    'solid': pitchers_available['Strategy_Score'].quantile(0.50),
}

batters_available['Tier'] = batters_available['Strategy_Score'].apply(
    lambda x: assign_tier(x, batter_thresholds)
)
pitchers_available['Tier'] = pitchers_available['Strategy_Score'].apply(
    lambda x: assign_tier(x, pitcher_thresholds)
)

# =============================================================================
# ASSIGN POSITIONS
# =============================================================================

# Batter positions not available - mark as Unknown
batters_available['Position'] = 'Batter'

# Pitcher position based on GS
pitchers_available['Position'] = pitchers_available.apply(
    lambda row: 'SP' if pd.notna(row['GS']) and row['GS'] > 5 else 'RP',
    axis=1
)

# =============================================================================
# COMBINE AND RANK
# =============================================================================

print("Combining and ranking...")

# Combine into single draft board
draft_board = pd.concat([batters_available, pitchers_available], ignore_index=True)

# Sort by Strategy Score descending
draft_board = draft_board.sort_values('Strategy_Score', ascending=False)

# Add overall rank
draft_board['Rank'] = range(1, len(draft_board) + 1)

# =============================================================================
# EXPORT CSV
# =============================================================================

output_cols = [
    'Rank', 'Name', 'Team', 'Player_Type', 'Position',
    # Batter stats
    'HR', 'R', 'RBI', 'SB', 'AVG', 'OBP', 'SLG',
    # Pitcher stats
    'W', 'QS', 'SO', 'ERA', 'WHIP', 'IP', 'SV', 'HLD',
    # Scores and value
    'Strategy_Score', 'FPTS', 'WAR',
    # Z-scores
    'z_HR', 'z_R', 'z_RBI', 'z_QS', 'z_K', 'z_ERA', 'z_WHIP',
    # Block info
    'Block_Type', 'Blocking_Franchise', 'Rostered_By',
    # Tier
    'Tier'
]

# Only include columns that exist
output_cols = [c for c in output_cols if c in draft_board.columns]

output_file = f'draft_board_{STRATEGY_KEY}.csv'
draft_board[output_cols].to_csv(output_file, index=False)
print(f"\nSaved draft board to {output_file}")

# =============================================================================
# SUMMARY REPORTS
# =============================================================================

print("\n" + "=" * 80)
print(f"DRAFT BOARD ANALYSIS - {STRATEGY['name']}")
print("=" * 80)
print(f"{STRATEGY['description']}")

# Top 25 Batters
print("\n" + "=" * 80)
print("TOP 25 BATTERS BY STRATEGY SCORE")
print("=" * 80)
top_batters = draft_board[draft_board['Player_Type'] == 'Batter'].head(25)
for _, row in top_batters.iterrows():
    block = f"[PARTIAL]" if row['Block_Type'] == 'Partial' else ""
    rostered = f"({row['Rostered_By']})" if pd.notna(row['Rostered_By']) else "(FA)"
    hr = row['HR'] if pd.notna(row['HR']) else 0
    r = row['R'] if pd.notna(row['R']) else 0
    rbi = row['RBI'] if pd.notna(row['RBI']) else 0
    print(f"{row['Rank']:4}. {row['Name']:<25} HR:{hr:>5.0f} R:{r:>5.0f} RBI:{rbi:>5.0f} "
          f"Score:{row['Strategy_Score']:>6.2f} {block} {rostered}")

# Top 25 Pitchers
print("\n" + "=" * 80)
print("TOP 25 PITCHERS BY STRATEGY SCORE (Starting Pitchers)")
print("=" * 80)
top_pitchers = draft_board[(draft_board['Player_Type'] == 'Pitcher') & (draft_board['Position'] == 'SP')].head(25)
for _, row in top_pitchers.iterrows():
    block = f"[PARTIAL]" if row['Block_Type'] == 'Partial' else ""
    rostered = f"({row['Rostered_By']})" if pd.notna(row['Rostered_By']) else "(FA)"
    qs = row['QS'] if pd.notna(row['QS']) else 0
    k = row['SO'] if pd.notna(row['SO']) else 0
    era = row['ERA'] if pd.notna(row['ERA']) else 0
    print(f"{row['Rank']:4}. {row['Name']:<25} QS:{qs:>5.0f} K:{k:>5.0f} ERA:{era:>5.2f} "
          f"Score:{row['Strategy_Score']:>6.2f} {block} {rostered}")

# Best FPTS Value (high Strategy Score relative to raw FPTS)
print("\n" + "=" * 80)
print("STRATEGY SCORE LEADERS (Pure Projection Value)")
print("=" * 80)
top_overall = draft_board.nlargest(20, 'Strategy_Score')
for _, row in top_overall.iterrows():
    block = f"[PARTIAL]" if row['Block_Type'] == 'Partial' else ""
    rostered = f"({row['Rostered_By']})" if pd.notna(row['Rostered_By']) else "(FA)"
    fpts = row['FPTS'] if pd.notna(row['FPTS']) else 0
    print(f"{row['Rank']:4}. {row['Name']:<25} {row['Player_Type']:<7} "
          f"FPTS:{fpts:>6.0f} Score:{row['Strategy_Score']:>6.2f} {block} {rostered}")

# Partial Block Targets Worth Monitoring
print("\n" + "=" * 80)
print("PARTIAL BLOCK TARGETS WORTH MONITORING")
print("=" * 80)
partial_blocks = draft_board[draft_board['Block_Type'] == 'Partial'].nlargest(15, 'Strategy_Score')
for _, row in partial_blocks.iterrows():
    print(f"{row['Name']:<25} {row['Player_Type']:<7} Score:{row['Strategy_Score']:>6.2f} "
          f"Blocker: {row['Blocking_Franchise']}")

# Tier Distribution
print("\n" + "=" * 80)
print("TIER DISTRIBUTION")
print("=" * 80)
tier_counts = draft_board.groupby(['Player_Type', 'Tier']).size().unstack(fill_value=0)
print(tier_counts)

# Top picks by tier for quick reference
print("\n" + "=" * 80)
print("TOP 10 TIER 1 (ELITE) PICKS - MUST TARGET")
print("=" * 80)
elite = draft_board[draft_board['Tier'] == 'Tier 1 - Elite'].head(10)
for _, row in elite.iterrows():
    block = f"[PARTIAL]" if row['Block_Type'] == 'Partial' else ""
    rostered = f"({row['Rostered_By']})" if pd.notna(row['Rostered_By']) else "(FA)"
    print(f"{row['Rank']:4}. {row['Name']:<25} {row['Player_Type']:<7} "
          f"Score:{row['Strategy_Score']:>6.2f} {block} {rostered}")
