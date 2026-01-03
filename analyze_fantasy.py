#!/usr/bin/env python3
"""
Fantasy Baseball Category Analysis
Analyzes Fantrax standings to find strategic advantages and underutilized category combinations.
"""

import pandas as pd
import numpy as np
from itertools import combinations
from collections import defaultdict

# Load the data
df = pd.read_csv('fantrax_data.csv')

# Get unique teams and categories
teams = df['Team'].unique()
categories = df['Category'].unique()

print("=" * 80)
print("FANTASY BASEBALL CATEGORY ANALYSIS")
print("=" * 80)

# Create a pivot table: Team x Category -> Points
pivot_points = df.pivot_table(index='Team', columns='Category', values='Points', aggfunc='first')
pivot_values = df.pivot_table(index='Team', columns='Category', values='Value', aggfunc='first')
pivot_ranks = df.pivot_table(index='Team', columns='Category', values='Rank', aggfunc='first')

# Calculate total points per team
total_points = pivot_points.sum(axis=1).sort_values(ascending=False)

print("\n" + "=" * 80)
print("1. OVERALL STANDINGS (Total Roto Points)")
print("=" * 80)
for rank, (team, points) in enumerate(total_points.items(), 1):
    print(f"{rank:2}. {team:<25} {points:.1f} points")

# Identify batting vs pitching categories
batting_cats = ['R', 'HR', 'RBI', 'SB', 'AVG', 'OBP', 'SLG']
pitching_cats = ['QS', 'SV', 'HLD', 'BB9', 'K', 'ERA', 'WHIP']

batting_points = pivot_points[batting_cats].sum(axis=1).sort_values(ascending=False)
pitching_points = pivot_points[pitching_cats].sum(axis=1).sort_values(ascending=False)

print("\n" + "=" * 80)
print("2. BATTING vs PITCHING BREAKDOWN")
print("=" * 80)
print(f"\n{'Team':<25} {'Batting':>10} {'Pitching':>10} {'Total':>10}")
print("-" * 60)
for team in total_points.index:
    bat = batting_points[team]
    pit = pitching_points[team]
    tot = total_points[team]
    print(f"{team:<25} {bat:>10.1f} {pit:>10.1f} {tot:>10.1f}")

print("\n" + "=" * 80)
print("3. CATEGORY COMPETITIVENESS (Standard Deviation of Points)")
print("=" * 80)
print("Lower std dev = more competitive (harder to gain edge)")
print("Higher std dev = less competitive (easier to gain edge)")
print()

cat_std = pivot_points.std().sort_values(ascending=False)
cat_mean = pivot_points.mean()
for cat in cat_std.index:
    print(f"{cat:<6}: Std={cat_std[cat]:.2f}, Mean={cat_mean[cat]:.2f}")

print("\n" + "=" * 80)
print("4. CORRELATION MATRIX - WHICH CATEGORIES MOVE TOGETHER")
print("=" * 80)
print("High positive correlation = if you're good at one, you're good at both")
print("Low/negative correlation = independent categories")
print()

corr_matrix = pivot_points.corr()

# Find highly correlated pairs (> 0.6)
high_corr = []
low_corr = []
for i, cat1 in enumerate(categories):
    for cat2 in categories[i+1:]:
        corr = corr_matrix.loc[cat1, cat2]
        if corr > 0.6:
            high_corr.append((cat1, cat2, corr))
        elif corr < 0.2:
            low_corr.append((cat1, cat2, corr))

print("HIGHLY CORRELATED CATEGORIES (r > 0.6):")
for cat1, cat2, corr in sorted(high_corr, key=lambda x: -x[2]):
    print(f"  {cat1:>5} <-> {cat2:<5}: r={corr:.3f}")

print("\nLOW CORRELATION CATEGORIES (r < 0.2) - INDEPENDENT:")
for cat1, cat2, corr in sorted(low_corr, key=lambda x: x[2]):
    print(f"  {cat1:>5} <-> {cat2:<5}: r={corr:.3f}")

print("\n" + "=" * 80)
print("5. UNDERUTILIZED CATEGORY COMBINATIONS")
print("=" * 80)
print("Finding category combinations where top performance doesn't overlap")
print()

# For each pair of categories, find if the top 3 teams differ significantly
def category_overlap(cat1, cat2, top_n=3):
    """Calculate overlap between top teams in two categories"""
    top1 = set(pivot_points[cat1].nlargest(top_n).index)
    top2 = set(pivot_points[cat2].nlargest(top_n).index)
    return len(top1 & top2) / top_n

print("Category pairs with LOW overlap in top 3 teams (opportunity!):")
pairs_with_overlap = []
for cat1, cat2 in combinations(categories, 2):
    overlap = category_overlap(cat1, cat2)
    pairs_with_overlap.append((cat1, cat2, overlap))

for cat1, cat2, overlap in sorted(pairs_with_overlap, key=lambda x: x[2])[:15]:
    print(f"  {cat1:>5} + {cat2:<5}: {overlap*100:.0f}% overlap (r={corr_matrix.loc[cat1, cat2]:.2f})")

print("\n" + "=" * 80)
print("6. PUNTING ANALYSIS - CATEGORIES THAT TOP TEAMS IGNORE")
print("=" * 80)

# For top 3 teams overall, which categories did they punt (rank 8+)?
top_3_teams = total_points.head(3).index.tolist()
print(f"\nTop 3 overall teams: {', '.join(top_3_teams)}")
print()

for team in top_3_teams:
    weak_cats = pivot_ranks.loc[team].sort_values(ascending=False)
    print(f"{team}:")
    print(f"  Strong (rank 1-4): {', '.join([f'{cat}(#{int(r)})' for cat, r in weak_cats.items() if r <= 4])}")
    print(f"  Weak (rank 8-12): {', '.join([f'{cat}(#{int(r)})' for cat, r in weak_cats.items() if r >= 8])}")
    print()

print("\n" + "=" * 80)
print("7. VALUE GAPS - WHERE SMALL IMPROVEMENTS YIELD BIG POINT GAINS")
print("=" * 80)

for cat in categories:
    print(f"\n{cat}:")
    sorted_teams = pivot_points[cat].sort_values(ascending=False)
    for i, (team, pts) in enumerate(sorted_teams.items()):
        if i == 0:
            prev_pts = pts
            continue
        gap = prev_pts - pts
        value = pivot_values.loc[team, cat]
        prev_value = pivot_values.loc[sorted_teams.index[i-1], cat]
        if isinstance(value, float) and value < 1:  # Rate stats
            value_gap = abs(prev_value - value)
            print(f"  {i+1}. {team:<22} {pts:.1f}pts (gap: {gap:.1f}pts for {value_gap:.3f} improvement)")
        else:
            value_gap = abs(prev_value - value)
            print(f"  {i+1}. {team:<22} {pts:.1f}pts (gap: {gap:.1f}pts for {value_gap:.0f} more)")
        prev_pts = pts

print("\n" + "=" * 80)
print("8. STRATEGIC CATEGORY BUNDLES")
print("=" * 80)
print("Finding the optimal 7-category bundle (majority) with best combined points")
print()

# Test all 7-category combinations
best_bundles = []
for cat_combo in combinations(categories, 7):
    combo_points = pivot_points[list(cat_combo)].sum(axis=1)
    best_team = combo_points.idxmax()
    best_score = combo_points.max()
    best_bundles.append((cat_combo, best_team, best_score))

# Sort by highest achievable score
best_bundles.sort(key=lambda x: -x[2])

print("Top 10 7-category bundles (for head-to-head majority strategy):")
for i, (cats, team, score) in enumerate(best_bundles[:10], 1):
    batting = [c for c in cats if c in batting_cats]
    pitching = [c for c in cats if c in pitching_cats]
    print(f"\n{i}. Score: {score:.1f} pts - Best team: {team}")
    print(f"   Batting ({len(batting)}): {', '.join(batting)}")
    print(f"   Pitching ({len(pitching)}): {', '.join(pitching)}")

print("\n" + "=" * 80)
print("9. ARCHETYPE ANALYSIS")
print("=" * 80)
print("Identifying team building archetypes that succeed")
print()

# Define archetypes
archetypes = {
    "Power Hitting + Elite RP": ['HR', 'RBI', 'SLG', 'SV', 'HLD', 'ERA', 'WHIP'],
    "Speed + Rate Stats": ['SB', 'AVG', 'OBP', 'ERA', 'WHIP', 'BB9', 'K'],
    "Volume Pitching + Power": ['R', 'HR', 'RBI', 'QS', 'K', 'ERA', 'WHIP'],
    "Balanced (top 6 each)": batting_cats[:4] + pitching_cats[:3],
    "Elite Bullpen Focus": ['SV', 'HLD', 'ERA', 'WHIP', 'BB9', 'AVG', 'OBP'],
}

for name, cats in archetypes.items():
    combo_points = pivot_points[cats].sum(axis=1).sort_values(ascending=False)
    print(f"\n{name}:")
    print(f"  Categories: {', '.join(cats)}")
    print(f"  Rankings:")
    for rank, (team, pts) in enumerate(combo_points.head(5).items(), 1):
        print(f"    {rank}. {team:<22} {pts:.1f} pts")

print("\n" + "=" * 80)
print("10. RECOMMENDATIONS FOR NEXT SEASON")
print("=" * 80)

# Calculate which categories are least contested at the top
print("\n10a. CATEGORIES WITH WEAK COMPETITION AT TOP:")
for cat in categories:
    top_team = pivot_points[cat].idxmax()
    top_val = pivot_values.loc[top_team, cat]
    sorted_vals = pivot_values[cat].sort_values(ascending=(cat in ['ERA', 'WHIP', 'BB9']))
    second_team = sorted_vals.index[1]
    second_val = sorted_vals.iloc[1]
    gap = abs(top_val - second_val)
    print(f"  {cat}: Leader {top_team} ({top_val}) - Gap to 2nd: {gap:.3f}")

print("\n10b. UNDEREXPLOITED CATEGORY COMBINATIONS:")
print("Based on correlation and overlap analysis, these combinations are underutilized:")
print()

# Find 7-cat combos with lowest average correlation
low_corr_bundles = []
for cat_combo in combinations(categories, 7):
    combo_list = list(cat_combo)
    avg_corr = 0
    count = 0
    for c1, c2 in combinations(combo_list, 2):
        avg_corr += corr_matrix.loc[c1, c2]
        count += 1
    avg_corr /= count
    total_pts_available = pivot_points[combo_list].max().sum()
    low_corr_bundles.append((cat_combo, avg_corr, total_pts_available))

low_corr_bundles.sort(key=lambda x: x[1])

print("7-category bundles with LOWEST internal correlation (independent categories):")
for i, (cats, avg_corr, max_pts) in enumerate(low_corr_bundles[:5], 1):
    print(f"\n{i}. Avg correlation: {avg_corr:.3f}, Max achievable: {max_pts:.1f} pts")
    print(f"   {', '.join(cats)}")

print("\n10c. SPECIFIC STRATEGIC RECOMMENDATIONS:")
print()

# Analyze SB - it has high variance and low correlation with power
print("1. STOLEN BASES as a differentiator:")
sb_points = pivot_points['SB']
sb_corr_with_power = corr_matrix.loc['SB', ['HR', 'RBI', 'SLG']].mean()
print(f"   - SB has low correlation with power stats (avg r={sb_corr_with_power:.2f})")
print(f"   - Leaders: Brenden (12pts), Ross & Jack (11pts)")
print(f"   - This category is often punted by power-focused teams")

# Analyze QS
print("\n2. QUALITY STARTS as overlooked category:")
qs_top = pivot_points['QS'].sort_values(ascending=False)
print(f"   - Tyler & Dustin (overall #1) ranks #11 in QS!")
print(f"   - QS leaders (Zack, Ross & Jack) have less competition for other pitching cats")

# Analyze HLD
print("\n3. HOLDS - the forgotten reliever category:")
hld_points = pivot_points['HLD']
print(f"   - Wide variance (12 pts to 1 pt)")
print(f"   - Combining SV+HLD focus could dominate reliever categories")
print(f"   - Few teams prioritize HLD (bottom 4 teams have 1-4 pts)")

# Analyze rate stat combos
print("\n4. RATE STAT TRIPLE (AVG, OBP, WHIP):")
rate_combo = pivot_points[['AVG', 'OBP', 'WHIP']].sum(axis=1).sort_values(ascending=False)
print(f"   Top teams in this bundle:")
for team, pts in rate_combo.head(3).items():
    print(f"   - {team}: {pts:.1f} combined pts")
print(f"   - These categories reward quality over quantity")
print(f"   - Fewer roster moves needed, more stable week-to-week")

# Final recommendation
print("\n" + "=" * 80)
print("OPTIMAL STRATEGY SUMMARY")
print("=" * 80)
print("""
Based on the analysis, here are the key insights:

1. HIGH OPPORTUNITY CATEGORIES (low competition, high variance):
   - SB: Often punted by power teams, dedicated speed can win easily
   - HLD: Most neglected category, easy points with targeted rostering
   - QS: Volume pitching approach undervalued

2. NATURAL SYNERGIES (high correlation, package together):
   - R + HR + RBI + SLG (power bundle) - if you go power, go all-in
   - ERA + WHIP + BB9 (pitching quality) - reliever-heavy approach works

3. ANTI-SYNERGIES (target these combos since few compete):
   - SB + HR (r=low) - speed/power combo is rare
   - QS + SV (different pitcher types)
   - OBP + K (patient hitters vs strikeout pitchers)

4. RECOMMENDED BUILD ARCHETYPES:

   A) "Speed + Rate Stats + Elite Bullpen"
      Target: SB, AVG, OBP, SV, HLD, ERA, WHIP
      Punt: HR, QS, K
      Strategy: Patient hitters who steal, elite closers/holders

   B) "Volume Pitching + Power"
      Target: HR, RBI, SLG, QS, K, ERA, WHIP
      Punt: SB, AVG, HLD
      Strategy: Ace starters, power bats, ignore speed

   C) "Balanced with SB Edge"
      Target: Slight edge in SB while staying competitive everywhere
      Strategy: Draft speed earlier than ADP suggests
""")

# Export team profiles
print("\n" + "=" * 80)
print("APPENDIX: FULL TEAM PROFILES")
print("=" * 80)

for team in total_points.index[:6]:  # Top 6 teams
    print(f"\n{team} (Total: {total_points[team]:.1f} pts)")
    print("-" * 50)
    team_cats = pivot_points.loc[team].sort_values(ascending=False)
    strengths = [(cat, pts) for cat, pts in team_cats.items() if pts >= 9]
    weaknesses = [(cat, pts) for cat, pts in team_cats.items() if pts <= 4]
    print(f"  Strengths (9+ pts): {', '.join([f'{c}({p:.0f})' for c,p in strengths])}")
    print(f"  Weaknesses (<=4 pts): {', '.join([f'{c}({p:.0f})' for c,p in weaknesses])}")
