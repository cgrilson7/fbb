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
- `volume_power`: R, HR, RBI + QS, K, ERA, H/IP (punt SB, SV, HLD)
- `power_rp`: HR, RBI, SLG + SV, HLD, ERA, H/IP (punt SB, QS)
- `speed_rates`: SB, AVG, OBP + ERA, H/IP, K (punt HR, RBI, QS)
- `balanced`: All categories equally weighted
- `elite_bullpen`: SV, HLD, ERA, H/IP + AVG, OBP (punt HR, QS, K)

### generate_fbb_page.py
Creates interactive HTML dashboard with Alpine.js. Features: strategy tabs, sortable tables, search/filter (hide free agents, hide partial blocks), color-coded rows by status.

### analyze_fantasy.py
Historical league analysis. Creates pivot tables, calculates category correlations, identifies underutilized category combinations, scores team-building archetypes.

## League Structure

- **Format**: Full Rotisserie dynasty league on Fantrax
- **Teams**: Minimum 10 franchises (currently 14 with 2026 expansion adds), with expansion process defined in constitution
- **14 categories**: HR, RBI, R, SB, AVG, OBP, SLG (batting) + K, QS, SV, HLD, ERA, BB/9, H/IP (pitching)
- **Scoring**: Teams ranked 1st to last in each category; points = number of teams in league that year for 1st, 1 for last. Most total points wins.
- **Season**: Ends at conclusion of game 162 of MLB regular season (tie-break games don't count)

## Salary Cap & Budget

- Base salary cap: $150MM (2024), increases $10MM/year ($160MM in 2025, $170MM in 2026, etc.)
- All contracts in $100k increments, $100k minimum salary
- Budget can be traded between franchises up to 3 years in the future
- Unused budget does NOT roll over between years
- 3x salary cap checks per season: 5/31 (25% weight), 7/31 (25%), end of last FA period (50%)
- 200% of cap = hard cap (franchise ineligible for remainder of season)
- Fines reduce budget for following 3 years

## Rosters

- **Active roster (35 spots)**: C, 1B, 2B, 3B, SS, MI, CI, LF, CF, RF, OF, DH, UTIL, 10x Pitchers, 12x Reserve
- **Farm System**: 15 minor league players (no salary counted against cap)
- **IL**: 5x Short Term IL + unlimited Long Term IL (60-day IL in real life)
- **Injured Player Salary Relief** (effective 2026): Up to 3x players/season can be designated for salary relief if on 60-day IL IRL; player becomes ineligible for rest of season, salary removed from cap
- **1x Amnesty Drop per year**: Drop a player without dead cap penalty; must be used before 2nd salary cap check (7/31), declared via WhatsApp. Cooldown = years remaining on contract minus 1.

## Lineup & Eligibility

- **Lineup setting periods**: Mon-Thu and Fri-Sun; changes allowed before games on Monday and Friday
- **Position eligibility**: 15 games at position previous season (10 games in-season to gain eligibility)
- **Minimums**: 1,000 IP and 5,200 PA per team per season (rate stats ineligible if not met)

## Contracts & Player Acquisition

### Young Players Salary Structure
- Prospect (farm system): Free
- Rookie: $500k
- Second Year: $1MM
- Third Year: $1.5MM
- Teams retain control through player's 3rd MLB season

### Off-Season Free Agency (Section 4.3)
- Blind auction via email to dynastyleaguebids@gmail.com
- Winning bid determined by total money spent (not AAV)
- Minimum AAV rules: 1yr=no min, 2yr=$2MM, 3yr=$5MM, 4yr=$9MM, 5yr=$14MM, 6-8yr=$20MM, 9+yr=$30MM
- First 12 years of contract determine winner even if contract is longer
- **Hometown Discount** (20%): Available if player was on roster since August of prior-to-last season; 21hr declaration window; usable once, then 2-year cooldown
- **Restricted Free Agents**: Match winning contract for player on roster entire prior season; 21hr window; max 5 RFAs per franchise per off-season. Can also use RFA designation in Roster Fill-Out Draft (72hrs prior, $5MM/2yr contract)

### In-Season Free Agency (Section 4.6)
- Weekly FAAB blind bids due Sunday 4pm EST, $100k increments
- All in-season contracts are 1 year, count against salary cap
- Prospects don't count against cap (bids for tie-breaking only)

### Dropped Players & Dead Cap (Section 4.8)
- Dropping a player on a multi-year contract incurs dead cap:
  - Year dropped: 80% of AAV
  - Following year: 60%
  - 3rd year and beyond: 40%
- Re-adding same player = same original contract terms

## Trades (Section 4.7)

- Trades open year-round EXCEPT: 2 weeks after MLB trade deadline through 1 week after World Series
- No league vetoes; collusion concerns trigger rationale write-ups
- Budget can be traded up to 3 years in the future
- Off-season trades can result in temporarily ineligible rosters (must be eligible 3 weeks before Opening Day)

## Expansion (Section 5.2)

- Commissioner approval + simple majority vote to add new owners
- **Expansion Draft**: Existing teams protect 5 players fully + 5 partially (20% salary premium to draft partial); expansion team picks 1 player from each existing franchise
- **Expansion Token**: One-time right to win any FA at 10% premium over winning bid; usable in first 2 off-seasons; Hometown Discount takes priority over token

## Penalties (Section 6.5)

- Starting IL player >4 lineup periods: no FA bids until fixed + 4 more periods
- Healthy player on IL >2 lineup periods: no FA bids until 1 week after activation
- MLB player left in farm system >2 lineup periods: all transactions locked
- Not meeting IP/PA minimums: rate stats = last place + $10MM cap loss
- Trade collusion: escalating penalties up to league removal
- Salary cap overages: escalating from draft position loss to franchise ineligibility

## Key Thresholds (Draft Board Analysis)

- Batters: 400+ PA to qualify
- Starters: 100+ IP (or 40+ IP for reliever-heavy strategies)
- Tiers: T1 (top 10%), T2 (10-30%), T3 (30-50%), T4 (bottom 50%)

## Data Sources

- `fangraphs-leaderboard-projections.csv`: FanGraphs batter projections
- `pitchers.csv`: Pitcher projections
- `blocked_players.csv`: Player blocking status (Full/Partial)
- `rosters.csv`: Roster assignments and salaries (2025-2028)
- `fantrax_data.csv`: Historical league standings

## Dynasty Analysis App (`app/`)

Next.js React app for dynasty league management. Run with `cd app && npm run dev`.

### Features
- **Upload**: CSV file upload with auto-detection and join across data sources
- **Players**: Searchable/sortable table with HKB dynasty rankings
- **Trade**: Two-panel trade analyzer comparing HKB values
- **Prospects**: Sortable prospect table with MiLB stats (batting/pitching); excludes anyone with an MLB appearance in any year (exact FanGraphs id match vs `mlb_debuted.csv`, generated by `scrape_mlb_debuts.py` — also drops MLB vets on rehab assignments)
- **Salaries**: Year-by-year salary breakdown, expiring contracts, franchise comparison
- **Match**: Manual reconciliation for unmatched player names
- **Franchises**: Edit status code → franchise name mappings
- **Value** (`/franchise-value`): Per-franchise roster/best-lineup/depth-chart value views (HKB, ZiPS/ZiPS DC/RoS DC FPTS, FP Rank), plus **RoS Categories** — projected rest-of-season roto standings: every franchise at its roto-optimal 23-man lineup (RoS Depth Charts data, `zips_dc_ros_advanced_*.csv`), ranked in all 14 categories with per-category heat table. **Best Lineup** defaults to roto basis: lineups maximize projected roto points (not FPTS), a 14-cat facts panel shows totals/ranks/points for the displayed lineup, and a pitching plan panel sweeps every feasible SP/RP split of the 10 pitcher slots (`analyzePitcherMix` in `rotoLineup.ts`) and ranks all rostered SP/RP by marginal roto value. Slot locks with basis 'roto' share the `roto:ros` metric key with the waiver page. Dynasty-value views exclude expiring contracts (`contractEnds === 2026`, toggleable) except planned HTD keeps (`HTD_KEEPS` set — currently Ceddanne Rafaela); RoS roto views keep expiring players. **Targets** view: young MLB players by HKB (age threshold select), top farm prospects by HKB, and buy-low candidates (HKB percentile minus RoS FPTS percentile among top-300-HKB MLB players; missing RoS proj = 0, so injured stars top the list).
- **Waiver Wire** (`/waiver-wire`): RoS category pickups vs your best lineup — roto-optimal single-swap search (tries candidate in every eligible slot, keeps highest roto-Δ), top-pickups summary across batters+pitchers, per-category rank-change detail
- **Deadline**: Trade deadline plan — fully programmatic (no hand-written narrative). Real standings heatmap (from `standings.csv`, Fantrax roto point totals) with computed buyer/bubble/seller tiers (points vs ours, `BUBBLE_MARGIN`), expiring-contract sell list, payroll-shed candidates (2027–28 deals, aging verdicts), long-deal targets (2029+ contracts on other rosters, rank/age verdicts, our 2027–28 cap room), real ZiPS 2026–28 3-yr outlooks on every table (`zips_2027_*.csv`, `zips_2028_*.csv`), and per-franchise **deal sheets driven by `src/lib/tradeEngine.ts`**, all deltas position-aware via `reoptimizeLineup` in `rotoLineup.ts` (warm-start hill climb from the team's polished baseline lineup; moves = bench→slot swap AND starter-slide-to-other-slot + bench fill, so chains like "SS leaves → MI slides to SS → bench 2B fills MI" are priced): sends = our tradeable pool (expiring + 30+ vets thru 2028) ranked by the roto gain of *their* re-optimized lineup with the player added, showing the slot he'd start at and the starter who drops out; asks = their controlled dynasty assets in HKB-then-RoS column order (HKB Rk/Val → RoS FPTS) with the roto cost to them of a re-optimized lineup without each; lineup holes vs league-median slot FPTS; and a suggested package (highest-HKB ask that a ≤3-send package covers win-now with margin AND affords at `HKB_PER_ROTO_POINT` = 250 HKB per package roto point, verified by one joint re-optimization per side so overlapping positions don't double-count — suppressed for seller-tier teams, who don't value win-now sends)

### Franchise identity mapping (verified July 2026)
**Canonical table: `app/src/lib/franchises.ts`** (FRANCHISES + `ownerNameToCode()` for loose owner-name lookup). Verified by roster-name overlap between all.csv rosters and active salaries.csv contracts — clean 1:1, zero cross-matches. Store defaults and the deadline page derive from it.
Fantrax standings team names ↔ all.csv status codes ↔ salaries.csv owner names:
Bionic Big Boys=B&A=Ben Brody & Aaron; J.D. Barnett=JD; Ellygal Immigrants=ELLY=Dustin Hart & Max Wamp;
Tyler=T; Zack=Zack; Steve Cornish=Steve; Ross & Jack=R&J; Colin & Greg=C&G;
E.T. Phone Holmes=J&A=Jake Zuckman & Andrew Meyers; Max Mastbaum & co=Max="Max, Jake & Sam";
Kai/Brian/Brenden/Ethan as named. (free_agency.csv has drifted spellings, e.g. "Max, Jake, Sam" — use `ownerNameToCode`.)

### Data Files
- `all.csv`: Base player universe from Fantrax (~10K players)
- `harryknowsball_players.csv`: Dynasty rankings (HKB rank/value)
- `salaries.csv`: League contracts with yearly salary hits
- `batting_prospects.csv` / `pitching_prospects.csv`: MiLB stats

### Key Code
- `src/lib/store.ts`: Zustand store with data joining logic
- `src/lib/franchises.ts`: Canonical franchise identity table (status code ↔ display ↔ salaries.csv owner ↔ Fantrax standings name)
- `src/lib/playerMatch.ts`: Collision-aware player joins — each HKB/salary/prospect/FP/FV row attaches to at most ONE all.csv player, disambiguated by role (pitcher/batter), team, age (or contract owner for salaries). Fixes same-name players (two Jared Joneses, two rostered Max Muncys) sharing one row; dropped (dead-cap) salary rows never attach. Fantrax two-way rows ("Shohei Ohtani-H"/"-P") normalize to the base name; contract + HKB attach to exactly one of the pair.
- `src/lib/normalize.ts`: Name normalization with nickname expansion (Leo→Leodalis, etc.)
- `src/lib/csvParser.ts`: CSV parsing and file type detection

### Your Franchise
Colin Wilson & Greg Holmes (status code: "C&G")

## League Rules Questions

When answering questions about league rules, contracts, salaries, free agency, trades, penalties, or any other constitutional matters:

1. **Always read `constitution_new.pdf`** before answering - never rely on memory or assumptions
2. The constitution has 6 sections: General Info, Rosters, League Scoring, Transactions & Contracts, Ownership, Administrative Items
3. Cite the specific section (e.g., "Section 4.2 Young Players Salary Structure") when providing answers
4. If the constitution is ambiguous or doesn't cover the scenario, say so explicitly
5. Check Section 6.6 (Tracking Rules Changes) for any recent rule votes that may override earlier sections
