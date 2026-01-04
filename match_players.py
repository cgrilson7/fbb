#!/usr/bin/env python3
"""
Master player database: FanGraphs projections + blocked status + roster/contract info.
"""

import pandas as pd

# Load data sources
batters = pd.read_csv('fangraphs-leaderboard-projections.csv')
pitchers = pd.read_csv('pitchers.csv')
blocked = pd.read_csv('blocked_players.csv')
rosters = pd.read_csv('rosters.csv', skiprows=2)
rosters.columns = rosters.columns.str.strip()

# Normalize names for matching
def normalize(name):
    if pd.isna(name):
        return ''
    return name.lower().strip().replace('.', '').replace("'", "").replace(' jr', '').replace(' sr', '')

# Add player type
batters['Player_Type'] = 'Batter'
pitchers['Player_Type'] = 'Pitcher'

# Clean up duplicates/bad data:
# - Remove Ohtani from pitchers (keep as batter)
# - Remove Juan Soto from pitchers
# - Remove Dodgers Max Muncy (keep A's Max Muncy)
# - Remove Edwin Diaz from batters (keep as pitcher)
pitchers = pitchers[~pitchers['NameASCII'].isin(['Shohei Ohtani', 'Juan Soto'])]
batters = batters[~((batters['NameASCII'] == 'Max Muncy') & (batters['Team'] == 'LAD'))]
batters = batters[~(batters['NameASCII'] == 'Edwin Diaz')]

# Add name_norm for matching
batters['name_norm'] = batters['NameASCII'].apply(normalize)
pitchers['name_norm'] = pitchers['NameASCII'].apply(normalize)
blocked['name_norm'] = blocked['Player'].apply(normalize)
rosters['name_norm'] = rosters['Player Name'].apply(normalize)

# Union batters and pitchers (keep all columns)
projections = pd.concat([batters, pitchers], ignore_index=True)

print(f"Total projections: {len(projections)} ({len(batters)} batters + {len(pitchers)} pitchers)")

# Left join blocked status
blocked_cols = ['name_norm', 'Player', 'Franchise', 'Block_Type']
blocked = blocked.rename(columns={'Franchise': 'Blocking_Franchise', 'Player': 'Blocked_Player'})
projections = projections.merge(
    blocked[['name_norm', 'Blocking_Franchise', 'Block_Type']],
    on='name_norm',
    how='left'
)

# Left join roster/contract info
roster_cols = ['name_norm', 'Franchise', 'Contract Type', 'Salary',
               'Contract Length', 'Contract Starts', 'Contract Ends',
               '2025 Salary Hit', '2026 Salary Hit', '2027 Salary Hit', '2028 Salary Hit']
projections = projections.merge(
    rosters[roster_cols],
    on='name_norm',
    how='left'
)

# Rename for clarity
projections = projections.rename(columns={'Franchise': 'Rostered_By'})

# Clean salary columns (remove $ and commas, convert to numeric)
def clean_salary(val):
    if pd.isna(val) or val == '' or val == ' $ -   ':
        return None
    val_str = str(val).replace('$', '').replace(',', '').strip()
    if val_str == '' or val_str == 'YP' or val_str == '-':
        return None
    try:
        return float(val_str)
    except ValueError:
        return None

projections['Salary_Clean'] = projections['Salary'].apply(clean_salary)
projections['Salary_2025'] = projections['2025 Salary Hit'].apply(clean_salary)
projections['Salary_2026'] = projections['2026 Salary Hit'].apply(clean_salary)
projections['Salary_2027'] = projections['2027 Salary Hit'].apply(clean_salary)
projections['Salary_2028'] = projections['2028 Salary Hit'].apply(clean_salary)

# Calculate counting stats
# Batters: HR + R + RBI + SB
# Pitchers: W + QS + SV + HLD + SO (handle NaN with fillna)
def calc_counting(row):
    if row['Player_Type'] == 'Batter':
        return (pd.to_numeric(row['HR'], errors='coerce') or 0) + \
               (pd.to_numeric(row['R'], errors='coerce') or 0) + \
               (pd.to_numeric(row['RBI'], errors='coerce') or 0) + \
               (pd.to_numeric(row['SB'], errors='coerce') or 0)
    elif row['Player_Type'] == 'Pitcher':
        return (pd.to_numeric(row['W'], errors='coerce') or 0) + \
               (pd.to_numeric(row['QS'], errors='coerce') or 0) + \
               (pd.to_numeric(row['SV'], errors='coerce') or 0) + \
               (pd.to_numeric(row['HLD'], errors='coerce') or 0) + \
               (pd.to_numeric(row['SO'], errors='coerce') or 0)
    return None

projections['Counting_Stats'] = projections.apply(calc_counting, axis=1)

# Value calculations (per million dollars)
projections['FPTS_per_M'] = projections['FPTS'] / (projections['Salary_2026'] / 1_000_000)
projections['Counting_per_M'] = projections['Counting_Stats'] / (projections['Salary_2026'] / 1_000_000)
projections['WAR_per_M'] = projections['WAR'] / (projections['Salary_2026'] / 1_000_000)

# Value calculations (per ADP - lower ADP is better, so FPTS/ADP shows value)
projections['FPTS_per_ADP'] = projections['FPTS'] / projections['ADP']
projections['Counting_per_ADP'] = projections['Counting_Stats'] / projections['ADP']
projections['WAR_per_ADP'] = projections['WAR'] / projections['ADP']

# ADP per salary (how much ADP you get per dollar - higher = better value in draft)
projections['ADP_per_M'] = projections['ADP'] / (projections['Salary_2026'] / 1_000_000)

# Summary stats
print(f"Players with block status: {projections['Block_Type'].notna().sum()}")
print(f"Players on rosters: {projections['Rostered_By'].notna().sum()}")
print(f"Full blocks: {(projections['Block_Type'] == 'Full').sum()}")
print(f"Partial blocks: {(projections['Block_Type'] == 'Partial').sum()}")

# Save full dataset
projections.to_csv('all_players.csv', index=False)
print(f"\nSaved to all_players.csv")

# Show top available players (not full blocked, sorted by FPTS)
print("\n" + "="*80)
print("TOP 25 AVAILABLE PLAYERS (not full-blocked, by FPTS)")
print("="*80)
available = projections[projections['Block_Type'] != 'Full'].sort_values('FPTS', ascending=False).head(25)
for _, row in available.iterrows():
    block = row['Block_Type'] if pd.notna(row['Block_Type']) else '-'
    rostered = row['Rostered_By'] if pd.notna(row['Rostered_By']) else 'Free Agent'
    print(f"{row['Name']:<25} {row['Player_Type']:<7} FPTS: {row['FPTS']:>7.0f}  Block: {block:<7}  Roster: {rostered}")

# Show best value by FPTS per dollar (rostered players only)
print("\n" + "="*80)
print("TOP 20 VALUE PLAYS (FPTS per $M, rostered players with 2026 salary)")
print("="*80)
has_salary = projections[(projections['Salary_2026'].notna()) & (projections['Salary_2026'] > 0)]
best_value = has_salary.sort_values('FPTS_per_M', ascending=False).head(20)
for _, row in best_value.iterrows():
    sal_m = row['Salary_2026'] / 1_000_000
    print(f"{row['Name']:<25} {row['Player_Type']:<7} FPTS: {row['FPTS']:>6.0f}  ${sal_m:>5.1f}M  FPTS/$M: {row['FPTS_per_M']:>6.1f}")

# Show best value by FPTS per ADP
print("\n" + "="*80)
print("TOP 20 DRAFT VALUE (FPTS per ADP)")
print("="*80)
has_adp = projections[(projections['ADP'].notna()) & (projections['ADP'] > 0)]
best_draft = has_adp.sort_values('FPTS_per_ADP', ascending=False).head(20)
for _, row in best_draft.iterrows():
    block = row['Block_Type'] if pd.notna(row['Block_Type']) else '-'
    print(f"{row['Name']:<25} {row['Player_Type']:<7} FPTS: {row['FPTS']:>6.0f}  ADP: {row['ADP']:>6.1f}  FPTS/ADP: {row['FPTS_per_ADP']:>6.1f}  Block: {block}")
