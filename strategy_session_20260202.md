# FA Bidding Strategy Session - 2026-02-02

## Overview

This document summarizes the analytical process used to develop FA bidding strategy for the dynasty fantasy baseball league.

---

## Inputs Required

### Data Files
| File | Purpose |
|------|---------|
| `all_available.csv` | Full player pool with salaries, scores, positions, ownership status |
| `fp_rankings.csv` | FantasyPros ECR rankings with position ranks |
| `current_roster.csv` | Current team roster with salaries and stats |
| `fa_through_0201.csv` | Historical FA auction results (winning bids + all bids) |
| `all_catchers.csv` | Position-specific depth chart (create for other positions as needed) |
| `constitution.pdf` | League rules, especially bidding minimums and contract structures |

### Key Parameters
- **2026 Salary Cap**: $170MM
- **Available Budget**: $23.8MM remaining
- **Bid Increments**: $100K

### Contract Minimums (from Constitution)
| Years | Min AAV | Min Total |
|-------|---------|-----------|
| 1 | None ($100K floor) | $100K |
| 2 | $2MM | $4MM |
| 3 | $5MM | $15MM |
| 4 | $9MM | $36MM |
| 5 | $14MM | $70MM |
| 6+ | $20MM | $120MM+ |

---

## Analysis Process

### Step 1: Salary-to-ECR Model

Built a model to estimate FA value based on rostered player salaries by ECR tier.

**Key insight**: Filter out salaries < $3MM to exclude rookie/cheap extension deals that don't reflect FA market value.

**Resulting salary bands (median, rostered players with salary >= $3MM):**
| ECR Range | Median Salary |
|-----------|---------------|
| 1-10 | $33.0M |
| 11-25 | $23.4M |
| 26-50 | $20.6M |
| 51-75 | $11.0M |
| 76-100 | $19.5M |
| 101-150 | $7.8M |
| 151-200 | $8.0M |
| 201-300 | $7.8M |
| 300-400 | $5.0M |
| 400-500 | $4.0M |

Script: `estimate_fa_bid.py`

### Step 2: Roster Needs Assessment

Analyzed current roster to identify gaps:

| Position | Status | Priority |
|----------|--------|----------|
| C | **EMPTY** | CRITICAL |
| 2B | Weak (only prospect) | High |
| SS | Weak (only prospects) | High |
| SP | Only 2 rostered | CRITICAL |
| RP | Only 1 rostered | CRITICAL |
| OF | Stacked | None |
| 1B/3B/DH | Solid | None |

### Step 3: Historical Bid Analysis

Reviewed `fa_through_0201.csv` to understand league bidding patterns:

**Key findings:**
1. **League goes LONG** - Winners often use 8-15+ year contracts
2. **Total $ wins**, not AAV - a 5yr/$55M beats 4yr/$50M
3. **RFA + Hometown Discount** gives incumbents huge advantage
4. **Unprotected players** (no RFA, no hometown) are best targets for budget teams

**Sample winning bids:**
| Player | Contract | Total |
|--------|----------|-------|
| Crochet | 20yr/$30M AAV | $600M |
| Bryan Woo | 15yr/$36.5M | $547M |
| W. Contreras | 8yr/$23M | $184M |
| Teoscar | 2yr/$8M | $16M |
| Glasnow | 3yr/$15M | $45M |

### Step 4: Target Identification

Cross-referenced:
- Players up for auction (by date)
- Their RFA/Hometown status
- Our roster needs
- Our budget constraints

**Best targets = No RFA + No Hometown + Fills a need**

### Step 5: Position Depth Analysis

Created position-specific analysis (e.g., `all_catchers.csv`) to find:
- Best available FAs at position
- When they come up for auction
- Their projected value vs. alternatives

**Catcher example:**
| Rank | Player | Age | Score | Auction Date | Protection |
|------|--------|-----|-------|--------------|------------|
| 5 | Shea Langeliers | 28 | 77.1 | 2/9 | None |
| 6 | Salvador Perez | 35 | 75.6 | 2/6 | None |
| 9 | Drake Baldwin | 24 | 70.2 | 2/4 | None |
| 14 | Alejandro Kirk | 27 | 61.5 | 2/2 | None |

### Step 6: Game Theory Bid Optimization

For each target, analyzed:
1. **Jump points** - where longer contracts beat shorter ones regardless of AAV
2. **Expected competitor behavior** - what bids are likely from others
3. **Budget constraints** - max AAV we can afford
4. **Risk tolerance** - lottery tickets vs. must-wins

**Key game theory insight:**
- 3yr minimum ($15M total) beats ANY 2yr bid up to $7.49M AAV
- Bid just above expected cluster points to win without overpaying

---

## Outputs

### Per-Player Bid Sheet
For each target, document:
- Player name, position, ECR
- RFA/Hometown status
- Projected value (from ECR model)
- Recommended bid (years/AAV/total)
- 2026 cap hit
- Confidence level (steal attempt / solid bid / must-win)

### Daily Auction Summary
| Date | Player | Protection | Our Need | Rec Action |
|------|--------|------------|----------|------------|
| 2/2 | Kirk | None | C (critical) | Low bid - better Cs coming |
| 2/2 | Ballesteros | None | C (prospect) | Minimum lottery |
| 2/3 | Jared Jones | None | SP (critical) | Compete |
| 2/3 | Chris Sale | None | SP (critical) | Moderate bid |
| 2/4 | Drake Baldwin | None | C (critical) | **Priority target** |

### Budget Tracker
Track cumulative 2026 cap commitments from bids to stay under budget.

---

## Recommended Workflow for Future Sessions

### Inputs Needed
1. Updated `fa_through_MMDD.csv` with latest auction results
2. Updated `current_roster.csv` if roster changed
3. Remaining budget for the year
4. List of players up for auction that day/week

### Quick Analysis Steps
1. **Check protection status** - Skip RFA+Hometown players unless very motivated
2. **Check roster need** - Does this player fill a gap?
3. **Check position depth** - Is there a better option coming later?
4. **Set bid ceiling** - Based on ECR model and budget
5. **Apply game theory** - Choose years/AAV to beat expected competition

### Output Format
```
PLAYER: [Name]
DATE: [Auction date]
PROTECTION: [None / RFA / Hometown / Both]
ECR: [X] | POSITION RANK: [Pos #X]
PROJECTED VALUE: $[X]M
OUR NEED: [Critical / High / Low / None]

RECOMMENDED BID: [X]yr / $[X]M AAV / $[X]M total
2026 CAP HIT: $[X]M
CONFIDENCE: [Steal attempt / Solid / Must-win]

RATIONALE: [1-2 sentences]
```

---

## Scripts & Tools

| Script | Purpose |
|--------|---------|
| `estimate_fa_bid.py` | Generate salary projections from ECR |
| `match_players.py` | Build master player database |
| `draft_board_analysis.py` | Strategy-weighted draft boards |

### Future Improvements
- [ ] Automate daily auction target list generation
- [ ] Build bid recommendation engine with budget constraints
- [ ] Track bid history to refine competitor behavior model
- [ ] Create position depth charts for all positions (not just C)
