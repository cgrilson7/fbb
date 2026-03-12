#!/usr/bin/env python3
"""Analyze overpaid players by comparing 2026 salary to HKB dynasty value."""

import csv
import unicodedata
import re


def normalize_name(name: str) -> str:
    """Normalize a player name for matching."""
    name = name.strip().strip('"')
    name = name.lower()
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.replace(".", "").replace("-", " ")
    name = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def parse_dollar(val: str) -> float:
    """Parse a dollar string like ' $ 35,700,000 ' into a float."""
    val = val.strip()
    if not val or val in ("$0", "-", ""):
        return 0.0
    val = val.replace("$", "").replace(",", "").strip()
    if not val or val == "-":
        return 0.0
    try:
        return float(val)
    except ValueError:
        return 0.0


def main():
    # --- Read salaries.csv ---
    salaries = {}
    with open("/Users/colin/fbb/salaries.csv", "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        reader.fieldnames = [fn.strip() for fn in reader.fieldnames]
        for row in reader:
            row = {k.strip(): v.strip() for k, v in row.items()}
            player_name = row.get("Player Name", "").strip()
            if not player_name:
                continue
            norm = normalize_name(player_name)

            salary_2026 = parse_dollar(row.get("2026 Salary Hit", "0"))
            franchise = row.get("Franchise", "")
            contract_ends = row.get("Contract Ends", "")

            # Skip players acquired in 2026 (this year's free agency)
            acq_date = row.get("Acq. Date", "").strip()
            if acq_date.endswith("/26") or acq_date.endswith("/2026"):
                continue

            if norm in salaries:
                if salary_2026 > salaries[norm]["salary_2026"]:
                    salaries[norm] = {
                        "player_name": player_name,
                        "franchise": franchise,
                        "salary_2026": salary_2026,
                        "contract_ends": contract_ends,
                    }
            else:
                salaries[norm] = {
                    "player_name": player_name,
                    "franchise": franchise,
                    "salary_2026": salary_2026,
                    "contract_ends": contract_ends,
                }

    # --- Read HKB ---
    hkb = {}
    with open("/Users/colin/fbb/harryknowsball_players.csv", "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("Name", "").strip().strip('"')
            if not name:
                continue
            norm = normalize_name(name)
            try:
                value = float(row.get("Value", "0"))
                rank = int(row.get("Rank", "0"))
            except ValueError:
                continue
            if value > 0:
                hkb[norm] = {
                    "hkb_name": name,
                    "hkb_value": value,
                    "hkb_rank": rank,
                }

    # --- Join ---
    results = []
    for norm, sal in salaries.items():
        if sal["salary_2026"] <= 0:
            continue
        if norm not in hkb:
            continue
        h = hkb[norm]
        salary_per_value = sal["salary_2026"] / h["hkb_value"]
        results.append({
            "player_name": sal["player_name"],
            "franchise": sal["franchise"],
            "salary_2026": sal["salary_2026"],
            "hkb_value": h["hkb_value"],
            "hkb_rank": h["hkb_rank"],
            "contract_ends": sal["contract_ends"],
            "salary_per_value": salary_per_value,
        })

    results.sort(key=lambda x: x["salary_per_value"], reverse=True)

    # --- Collect franchise names ---
    franchises = sorted(set(r["franchise"] for r in results))

    # --- Compute franchise summaries ---
    franchise_summaries = []
    for fr in franchises:
        fr_results = [r for r in results if r["franchise"] == fr]
        total_salary = sum(r["salary_2026"] for r in fr_results)
        total_value = sum(r["hkb_value"] for r in fr_results)
        avg_spv = total_salary / total_value if total_value > 0 else 0
        # Worst overpay
        worst = fr_results[0] if fr_results else None
        # Count players with $/value > $5,000 (significantly overpaid)
        overpaid_count = sum(1 for r in fr_results if r["salary_per_value"] > 5000)
        franchise_summaries.append({
            "franchise": fr,
            "players": len(fr_results),
            "total_salary": total_salary,
            "total_value": total_value,
            "avg_spv": avg_spv,
            "overpaid_count": overpaid_count,
            "worst": worst,
            "results": fr_results,
        })

    # Sort by avg $/value descending (worst first)
    franchise_summaries.sort(key=lambda x: x["avg_spv"], reverse=True)

    # --- League Overview ---
    print("\n" + "=" * 100)
    print("LEAGUE-WIDE OVERPAID ANALYSIS — All 14 Franchises (Legacy Contracts Only)")
    print("=" * 100)
    print(f"\nTotal matched players: {len(results)}")
    print(f"Salary cap 2026: $170MM")

    print(f"\n{'Rank':>4}  {'Franchise':<30} {'Players':>7} {'Total Sal':>12} {'Total Val':>10} {'Avg $/Val':>10} {'Overpaid':>8}")
    print("-" * 95)
    for i, fs in enumerate(franchise_summaries, 1):
        print(
            f"{i:>4}  {fs['franchise']:<30} {fs['players']:>7} "
            f"${fs['total_salary']/1e6:>9.1f}M {fs['total_value']:>10,.0f} "
            f"${fs['avg_spv']:>8,.0f} {fs['overpaid_count']:>8}"
        )

    # --- Per-franchise detail ---
    header = f"  {'#':>3}  {'Player':<24} {'2026 Salary':>13} {'HKB Rank':>9} {'HKB Value':>10} {'Ends':>5} {'$/Value':>10}"

    for fs in franchise_summaries:
        fr_results = fs["results"]
        print(f"\n{'=' * 100}")
        print(f"  {fs['franchise']}")
        print(f"  {fs['players']} legacy players  |  Total salary: ${fs['total_salary']/1e6:.1f}M  |  "
              f"Total HKB value: {fs['total_value']:,.0f}  |  Avg $/value: ${fs['avg_spv']:,.0f}")
        print(f"{'=' * 100}")
        print(header)
        print("  " + "-" * 95)
        for i, r in enumerate(fr_results, 1):
            sal_str = f"${r['salary_2026']/1e6:.1f}M"
            spv_str = f"${r['salary_per_value']:,.0f}"
            flag = " !!!" if r["salary_per_value"] > 10000 else (" !!" if r["salary_per_value"] > 5000 else ("  !" if r["salary_per_value"] > 3000 else ""))
            print(
                f"  {i:>3}  {r['player_name']:<24} {sal_str:>13} {r['hkb_rank']:>9} {r['hkb_value']:>10,.0f} {r['contract_ends']:>5} {spv_str:>10}{flag}"
            )
        print()

    # --- Top 30 most overpaid league-wide ---
    print(f"\n{'=' * 100}")
    print("TOP 30 MOST OVERPAID PLAYERS (by $/Value)")
    print(f"{'=' * 100}")
    header2 = f"{'#':>3}  {'Player':<24} {'Franchise':<26} {'2026 Salary':>13} {'HKB Rank':>9} {'Value':>7} {'Ends':>5} {'$/Value':>10}"
    print(header2)
    print("-" * len(header2))
    for i, r in enumerate(results[:30], 1):
        sal_str = f"${r['salary_2026']/1e6:.1f}M"
        spv_str = f"${r['salary_per_value']:,.0f}"
        print(
            f"{i:>3}  {r['player_name']:<24} {r['franchise']:<26} {sal_str:>13} {r['hkb_rank']:>9} {r['hkb_value']:>7,.0f} {r['contract_ends']:>5} {spv_str:>10}"
        )

    # --- Best amnesty targets league-wide ---
    print(f"\n{'=' * 100}")
    print("BEST AMNESTY DROP TARGETS (multi-year contracts, sorted by total remaining $ saved)")
    print(f"{'=' * 100}")
    amnesty_targets = []
    for r in results:
        try:
            ends = int(r["contract_ends"])
        except (ValueError, TypeError):
            continue
        yrs_left = ends - 2026 + 1
        if yrs_left < 2:
            continue
        # Dead cap avoided = 80% yr1 + 60% yr2 + 40% yr3+
        aav = r["salary_2026"]
        dead_cap = aav * 0.8  # year of drop
        if yrs_left >= 2:
            dead_cap += aav * 0.6
        if yrs_left >= 3:
            dead_cap += aav * 0.4 * (yrs_left - 2)
        amnesty_targets.append({
            **r,
            "yrs_left": yrs_left,
            "dead_cap_avoided": dead_cap,
            "total_remaining": aav * yrs_left,
        })
    amnesty_targets.sort(key=lambda x: x["dead_cap_avoided"], reverse=True)

    header3 = f"{'#':>3}  {'Player':<24} {'Franchise':<26} {'AAV':>9} {'Ends':>5} {'Yrs':>4} {'HKB Rank':>9} {'Dead Cap Saved':>15} {'Total $ Left':>13}"
    print(header3)
    print("-" * len(header3))
    for i, r in enumerate(amnesty_targets[:25], 1):
        aav_str = f"${r['salary_2026']/1e6:.1f}M"
        dc_str = f"${r['dead_cap_avoided']/1e6:.1f}M"
        tot_str = f"${r['total_remaining']/1e6:.1f}M"
        print(
            f"{i:>3}  {r['player_name']:<24} {r['franchise']:<26} {aav_str:>9} {r['contract_ends']:>5} {r['yrs_left']:>4} {r['hkb_rank']:>9} {dc_str:>15} {tot_str:>13}"
        )


if __name__ == "__main__":
    main()
