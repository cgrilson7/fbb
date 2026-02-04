#!/usr/bin/env python3
"""
Match all_available.csv (Fantrax) to:
- harryknowsball_players.csv (dynasty rankings)
- batting_prospects.csv (prospect batting stats)
- pitching_prospects.csv (prospect pitching stats)
"""

import pandas as pd

# Normalize names for matching (same logic as match_players.py)
def normalize(name):
    if pd.isna(name):
        return ''
    return name.lower().strip().replace('.', '').replace("'", "").replace(' jr', '').replace(' sr', '').replace(' ii', '').replace(' iii', '')

# Load data
available = pd.read_csv('all_available.csv')
hkb = pd.read_csv('harryknowsball_players.csv')
batting_prospects = pd.read_csv('batting_prospects.csv')
pitching_prospects = pd.read_csv('pitching_prospects.csv')

print(f"Available players: {len(available)}")
print(f"HarryKnowsBall players: {len(hkb)}")
print(f"Batting prospects: {len(batting_prospects)}")
print(f"Pitching prospects: {len(pitching_prospects)}")

# Add normalized names to all tables
available['name_norm'] = available['Player'].apply(normalize)
hkb['name_norm'] = hkb['Name'].apply(normalize)
batting_prospects['name_norm'] = batting_prospects['full_name'].apply(normalize)
pitching_prospects['name_norm'] = pitching_prospects['full_name'].apply(normalize)

# Handle duplicates in source tables: keep best rank
hkb_deduped = hkb.sort_values(['name_norm', 'Rank']).drop_duplicates(subset='name_norm', keep='first')
batting_deduped = batting_prospects.sort_values(['name_norm', 'rank']).drop_duplicates(subset='name_norm', keep='first')
pitching_deduped = pitching_prospects.sort_values(['name_norm', 'rank']).drop_duplicates(subset='name_norm', keep='first')

print(f"\nAfter dedup:")
print(f"  HKB: {len(hkb_deduped)} (removed {len(hkb) - len(hkb_deduped)})")
print(f"  Batting prospects: {len(batting_deduped)} (removed {len(batting_prospects) - len(batting_deduped)})")
print(f"  Pitching prospects: {len(pitching_deduped)} (removed {len(pitching_prospects) - len(pitching_deduped)})")

# Prepare HKB columns for merge
hkb_cols = hkb_deduped[['name_norm', 'Rank', 'Name', 'Value', 'Positions', 'Level']].rename(columns={
    'Rank': 'HKB_Rank',
    'Name': 'HKB_Name',
    'Value': 'HKB_Value',
    'Positions': 'HKB_Positions',
    'Level': 'HKB_Level'
})

# Prepare batting prospect columns for merge (prefix with BP_)
batting_cols = batting_deduped[[
    'name_norm', 'rank', 'age', 'atBats', 'runs', 'hits', 'doubles', 'triples',
    'homeRuns', 'obp', 'ops', 'slg', 'rbi', 'baseOnBalls', 'strikeOuts',
    'stolenBases', 'caughtStealing', 'totalBases', 'avg', 'position', 'sportAbbrev'
]].rename(columns={
    'rank': 'BP_Rank',
    'age': 'BP_Age',
    'atBats': 'BP_AB',
    'runs': 'BP_R',
    'hits': 'BP_H',
    'doubles': 'BP_2B',
    'triples': 'BP_3B',
    'homeRuns': 'BP_HR',
    'obp': 'BP_OBP',
    'ops': 'BP_OPS',
    'slg': 'BP_SLG',
    'rbi': 'BP_RBI',
    'baseOnBalls': 'BP_BB',
    'strikeOuts': 'BP_K',
    'stolenBases': 'BP_SB',
    'caughtStealing': 'BP_CS',
    'totalBases': 'BP_TB',
    'avg': 'BP_AVG',
    'position': 'BP_Pos',
    'sportAbbrev': 'BP_Level'
})

# Prepare pitching prospect columns for merge (prefix with PP_)
pitching_cols = pitching_deduped[[
    'name_norm', 'rank', 'age', 'gamesPitched', 'whip', 'inningsPitched',
    'hits', 'runs', 'earnedRuns', 'baseOnBalls', 'strikeOuts', 'homeRuns',
    'era', 'saves', 'holds', 'wins', 'losses', 'sportAbbrev'
]].rename(columns={
    'rank': 'PP_Rank',
    'age': 'PP_Age',
    'gamesPitched': 'PP_G',
    'whip': 'PP_WHIP',
    'inningsPitched': 'PP_IP',
    'hits': 'PP_H',
    'runs': 'PP_R',
    'earnedRuns': 'PP_ER',
    'baseOnBalls': 'PP_BB',
    'strikeOuts': 'PP_K',
    'homeRuns': 'PP_HR',
    'era': 'PP_ERA',
    'saves': 'PP_SV',
    'holds': 'PP_HLD',
    'wins': 'PP_W',
    'losses': 'PP_L',
    'sportAbbrev': 'PP_Level'
})

# Merge all onto available (left joins)
merged = available.merge(hkb_cols, on='name_norm', how='left')
merged = merged.merge(batting_cols, on='name_norm', how='left')
merged = merged.merge(pitching_cols, on='name_norm', how='left')

# Stats
hkb_matched = merged['HKB_Rank'].notna().sum()
bp_matched = merged['BP_Rank'].notna().sum()
pp_matched = merged['PP_Rank'].notna().sum()
any_matched = ((merged['HKB_Rank'].notna()) | (merged['BP_Rank'].notna()) | (merged['PP_Rank'].notna())).sum()

print(f"\nMatch stats:")
print(f"  HKB matched: {hkb_matched}")
print(f"  Batting prospects matched: {bp_matched}")
print(f"  Pitching prospects matched: {pp_matched}")
print(f"  Any source matched: {any_matched}")

# Sort by HKB rank (matched first), then by prospect rank
merged['sort_key'] = merged['HKB_Rank'].fillna(99999)
merged = merged.sort_values('sort_key')

# Save full merged output
merged.to_csv('available_with_hkb.csv', index=False)
print(f"\nSaved merged data to available_with_hkb.csv ({len(merged)} rows, {len(merged.columns)} columns)")

# Show top available players by HKB rank
print("\n" + "="*90)
print("TOP 30 AVAILABLE BY HARRYKNOWSBALL RANK")
print("="*90)
top_hkb = merged[merged['HKB_Rank'].notna()].head(30)
for _, row in top_hkb.iterrows():
    bp_info = f"BP#{int(row['BP_Rank'])}" if pd.notna(row['BP_Rank']) else ""
    pp_info = f"PP#{int(row['PP_Rank'])}" if pd.notna(row['PP_Rank']) else ""
    prospect_info = f" [{bp_info}{pp_info}]" if bp_info or pp_info else ""
    print(f"#{int(row['HKB_Rank']):>4}  {row['Player']:<25} {row['Position']:<12} Val:{int(row['HKB_Value']):>5}{prospect_info}")

# Show top batting prospects available
print("\n" + "="*90)
print("TOP 30 BATTING PROSPECTS AVAILABLE")
print("="*90)
top_bp = merged[merged['BP_Rank'].notna()].sort_values('BP_Rank').head(30)
for _, row in top_bp.iterrows():
    hkb_info = f"HKB#{int(row['HKB_Rank'])}" if pd.notna(row['HKB_Rank']) else "No HKB"
    stats = f".{int(row['BP_AVG']*1000):03d}/{int(row['BP_HR'])}HR/{int(row['BP_SB'])}SB" if pd.notna(row['BP_AVG']) else ""
    print(f"#{int(row['BP_Rank']):>3}  {row['Player']:<25} {row['BP_Pos']:<4} {row['BP_Level']:<8} {stats:<20} {hkb_info}")

# Show top pitching prospects available
print("\n" + "="*90)
print("TOP 30 PITCHING PROSPECTS AVAILABLE")
print("="*90)
top_pp = merged[merged['PP_Rank'].notna()].sort_values('PP_Rank').head(30)
for _, row in top_pp.iterrows():
    hkb_info = f"HKB#{int(row['HKB_Rank'])}" if pd.notna(row['HKB_Rank']) else "No HKB"
    stats = f"{row['PP_ERA']:.2f}ERA/{row['PP_WHIP']:.2f}WHIP/{int(row['PP_K'])}K" if pd.notna(row['PP_ERA']) else ""
    print(f"#{int(row['PP_Rank']):>3}  {row['Player']:<25} {row['PP_Level']:<8} {stats:<25} {hkb_info}")

# Show players with prospect data but no HKB ranking (potential sleepers)
print("\n" + "="*90)
print("PROSPECTS WITHOUT HKB RANKING (potential sleepers)")
print("="*90)
sleepers = merged[(merged['HKB_Rank'].isna()) & ((merged['BP_Rank'].notna()) | (merged['PP_Rank'].notna()))]
sleepers = sleepers.sort_values(['BP_Rank', 'PP_Rank'])
for _, row in sleepers.head(20).iterrows():
    if pd.notna(row['BP_Rank']):
        stats = f"BP#{int(row['BP_Rank'])} .{int(row['BP_AVG']*1000):03d}/{int(row['BP_HR'])}HR/{int(row['BP_SB'])}SB"
    else:
        stats = f"PP#{int(row['PP_Rank'])} {row['PP_ERA']:.2f}ERA/{int(row['PP_K'])}K"
    print(f"{row['Player']:<30} {stats}")
