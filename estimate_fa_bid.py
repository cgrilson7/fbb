#!/usr/bin/env python3
"""
Estimate free agent bid amounts based on ECR and rostered player salaries.
"""

import pandas as pd
import numpy as np
import re

def parse_salary(salary_str: str) -> int:
    """Convert salary string like '17,200,000' to integer."""
    if pd.isna(salary_str):
        return 0
    return int(str(salary_str).replace(',', '').replace('$', ''))

def normalize_name(name: str) -> str:
    """Normalize player name for matching."""
    if pd.isna(name):
        return ''
    name = re.sub(r'-[HP]$', '', str(name))
    return name.lower().strip()

def names_match(name1: str, name2: str) -> bool:
    """Check if two names match."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    if n1 == n2:
        return True
    if len(n1) > 5 and len(n2) > 5:
        if n1 in n2 or n2 in n1:
            return True
    return False

def main():
    # Load data
    available = pd.read_csv('all_available.csv')
    available['Salary_Int'] = available['Salary'].apply(parse_salary)
    available['Is_FA'] = available['Status'] == 'FA'
    available['Name_Key'] = available['Player'].apply(normalize_name)

    fp = pd.read_csv('fp_rankings.csv')
    fp['ECR'] = fp['RK'].astype(int)
    fp['Name_Key'] = fp['PLAYER NAME'].apply(normalize_name)

    # Build lookup dict from FP rankings
    fp_lookup = dict(zip(fp['Name_Key'], fp['ECR']))

    # Match using merge on normalized names
    available['ECR'] = available['Name_Key'].map(fp_lookup)

    df = available[['Player', 'ECR', 'Salary_Int', 'Is_FA', 'Status']].copy()
    df.columns = ['Player', 'ECR', 'Salary', 'Is_FA', 'Owner']
    df = df.dropna(subset=['ECR'])

    # Get rostered players only (non-FA) for salary model
    # Filter out cheap rookie/extension deals (< $3M) to reflect FA market value
    rostered = df[~df['Is_FA']].copy()
    rostered = rostered[(rostered['ECR'] <= 500) & (rostered['Salary'] >= 3000000)]

    # Build salary model: bin by ECR ranges and get median salary
    bins = [0, 10, 25, 50, 75, 100, 150, 200, 300, 400, 500]
    rostered['ECR_Bin'] = pd.cut(rostered['ECR'], bins=bins)

    salary_by_ecr = rostered.groupby('ECR_Bin', observed=True)['Salary'].agg(['median', 'mean', 'count'])

    print("=" * 70)
    print("SALARY BY ECR RANGE (Rostered Players Only)")
    print("=" * 70)
    print(f"{'ECR Range':<15} {'Median Salary':>15} {'Mean Salary':>15} {'Count':>8}")
    print("-" * 55)
    for idx, row in salary_by_ecr.iterrows():
        print(f"{str(idx):<15} ${row['median']:>13,.0f} ${row['mean']:>13,.0f} {int(row['count']):>8}")

    # Function to estimate salary from ECR
    def estimate_salary(ecr):
        if ecr <= 10:
            return salary_by_ecr.loc[salary_by_ecr.index[0], 'median']
        for i, (lo, hi) in enumerate([(0,10), (10,25), (25,50), (50,75), (75,100), (100,150), (150,200), (200,300), (300,400), (400,500)]):
            if lo < ecr <= hi:
                return salary_by_ecr.iloc[i]['median']
        return 500000  # minimum for ECR > 500

    # Target players from user's table
    targets = [
        ('Willy Adames', 'SF', 'SS', 'SS #4'),
        ('Maikel Garcia', 'KC', '2B,3B,SS,OF', '3B #12'),
        ('Matt Chapman', 'SF', '3B', '3B #15'),
        ('Jordan Westburg', 'BAL', '2B,3B', '2B #14'),
        ('Alejandro Kirk', 'TOR', 'C', 'C #10'),
        ('Moises Ballesteros', 'CHC', 'C,1B', 'C #16'),
        ('Ramon Laureano', 'ATL', 'OF', 'OF #68'),
        ('Trent Grisham', 'NYY', 'OF', 'OF #82'),
        ('Chris Sale', 'ATL', 'SP', 'SP #8'),
        ('Jacob deGrom', 'TEX', 'SP', 'SP #11'),
        ('Joe Ryan', 'MIN', 'SP', 'SP #20'),
        ('Jesus Luzardo', 'PHI', 'SP', 'SP #26'),
        ('Framber Valdez', 'FA', 'SP', 'SP #32'),
        ('Kodai Senga', 'NYM', 'SP', 'SP #40'),
        ('Jared Jones', 'PIT', 'SP', 'SP #48'),
        ('Brice Turang', 'MIL', '2B', '2B #3'),
        ('Yandy Diaz', 'TB', '1B', '1B #11'),
        ('Wilyer Abreu', 'BOS', 'OF', 'OF #34'),
        ('Andrew Vaughn', 'MIL', '1B', '1B #20'),
        ('Daulton Varsho', 'TOR', 'OF', 'OF #45'),
        ('Trevor Story', 'BOS', 'SS', 'SS #24'),
        ('Drake Baldwin', 'ATL', 'C', 'C #15'),
        ('Owen Caissie', 'MIA', 'OF', 'OF'),
    ]

    # Find ECR for each target
    results = []
    for name, team, elig, pos_rank in targets:
        ecr = fp_lookup.get(normalize_name(name))
        est_salary = estimate_salary(ecr) if ecr else 500000
        results.append({
            'Player': name,
            'Team': team,
            'Eligibility': elig,
            'Pos_Rank': pos_rank,
            'ECR': ecr,
            'Proj_Salary': est_salary
        })

    # Group by date
    dates = {
        'Willy Adames': 'Mon 2/2', 'Maikel Garcia': 'Mon 2/2', 'Matt Chapman': 'Mon 2/2',
        'Jordan Westburg': 'Mon 2/2', 'Alejandro Kirk': 'Mon 2/2', 'Moises Ballesteros': 'Mon 2/2',
        'Ramon Laureano': 'Mon 2/2', 'Trent Grisham': 'Mon 2/2',
        'Chris Sale': 'Tue 2/3', 'Jacob deGrom': 'Tue 2/3', 'Joe Ryan': 'Tue 2/3',
        'Jesus Luzardo': 'Tue 2/3', 'Framber Valdez': 'Tue 2/3', 'Kodai Senga': 'Tue 2/3',
        'Jared Jones': 'Tue 2/3',
        'Brice Turang': 'Wed 2/4', 'Yandy Diaz': 'Wed 2/4', 'Wilyer Abreu': 'Wed 2/4',
        'Andrew Vaughn': 'Wed 2/4', 'Daulton Varsho': 'Wed 2/4', 'Trevor Story': 'Wed 2/4',
        'Drake Baldwin': 'Wed 2/4', 'Owen Caissie': 'Wed 2/4'
    }

    print()
    print()
    print("=" * 100)
    print("PROJECTED BIDS FOR TARGET FREE AGENTS")
    print("=" * 100)
    print()
    print(f"| {'Date':<8} | {'Player':<20} | {'Team':<4} | {'Eligibility':<15} | {'ECR':>5} | {'FP Pos Rank':<12} | {'Proj Bid':>12} |")
    print("|" + "-"*10 + "|" + "-"*22 + "|" + "-"*6 + "|" + "-"*17 + "|" + "-"*7 + "|" + "-"*14 + "|" + "-"*14 + "|")

    last_date = ""
    for r in results:
        date = dates.get(r['Player'], '')
        date_display = date if date != last_date else ''
        last_date = date

        ecr_str = str(r['ECR']) if r['ECR'] else '-'
        bid_str = f"${int(r['Proj_Salary']):,}"

        print(f"| {date_display:<8} | {r['Player']:<20} | {r['Team']:<4} | {r['Eligibility']:<15} | {ecr_str:>5} | {r['Pos_Rank']:<12} | {bid_str:>12} |")

if __name__ == '__main__':
    main()
