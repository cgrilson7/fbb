# Fantasy Baseball Draft Board 2026

Strategy-based draft rankings using FanGraphs projections and 2025 Fantrax league analysis.

---

## Quick Links

| File | Description |
|------|-------------|
| [draft_board_volume_power.csv](draft_board_volume_power.csv) | Volume SP + Power strategy rankings |
| [draft_board_power_rp.csv](draft_board_power_rp.csv) | Power + Elite RP strategy rankings |
| [draft_board_speed_rates.csv](draft_board_speed_rates.csv) | Speed + Rates strategy rankings |
| [draft_board_balanced.csv](draft_board_balanced.csv) | Balanced approach rankings |
| [draft_board_elite_bullpen.csv](draft_board_elite_bullpen.csv) | Elite Bullpen strategy rankings |
| [all_players.csv](all_players.csv) | Master player database (9,300+ players) |
| [draft_board_analysis.py](draft_board_analysis.py) | Analysis script (run with strategy name) |

---

## Strategy Definitions

| Strategy | Description |
|----------|-------------|
| **Volume Pitching + Power** | Target: R, HR, RBI + QS, K, ERA, WHIP \| Punt: SB, SV, HLD |
| **Power Hitting + Elite RP** | Target: HR, RBI, SLG + SV, HLD, ERA, WHIP \| Punt: SB, QS |
| **Speed + Rate Stats** | Target: SB, AVG, OBP + ERA, WHIP, K \| Punt: HR, RBI, QS |
| **Balanced Approach** | All categories weighted equally - best overall players |
| **Elite Bullpen Focus** | Target: SV, HLD, ERA, WHIP + AVG, OBP \| Punt: HR, QS, K |

---

## 2025 League Results by Strategy

| Place | Team | Points | Strategy Used | Power | Speed | Vol SP | Relief | Rates |
|------:|------|-------:|---------------|------:|------:|-------:|-------:|------:|
| **1** | Tyler & Dustin Hart | 137.0 | **POWER + ELITE RP** | 12.0 | 8.0 | 3.5 | 11.5 | 11.7 |
| **2** | Ross & Jack Kantor | 128.0 | **SPEED + RATES** | 8.7 | 11.0 | 11.0 | 9.0 | 7.7 |
| **3** | Zack Semler | 126.0 | **SPEED + RATES** | 7.3 | 9.3 | 12.0 | 10.0 | 8.0 |
| **4** | Jake Zuckman & Andrew Meyers | 113.0 | **VOLUME + POWER** | 11.0 | 7.7 | 10.0 | 7.5 | 3.7 |

*Column values = average rank in category group (12=best, 1=worst). Top 4 teams all had clear strategies.*

---

## Top 15 Batters by Strategy

*Players marked with \* are partial blocks. $/Pt = Salary per Strategy Score point (lower = better value)*

### Volume Pitching + Power

| Rank | Player | Salary | Score | $/Pt | HR | R | RBI |
|-----:|--------|-------:|------:|-----:|---:|--:|----:|
| 5 | Pete Alonso | FA | 6.69 | - | 35 | 87 | 101 |
| 8 | Matt Olson* | $24.0M | 5.69 | $4.22 | 30 | 93 | 91 |
| 10 | Ronald Acuña Jr.* | $44.0M | 5.51 | $7.98 | 30 | 110 | 84 |
| 16 | Brent Rooker | FA | 4.92 | - | 30 | 82 | 90 |
| 23 | Fernando Tatis Jr.* | $25.7M | 4.32 | $5.95 | 30 | 97 | 77 |
| 24 | Julio Rodríguez | $33.1M | 4.31 | $7.67 | 29 | 84 | 90 |
| 26 | Freddie Freeman* | $24.6M | 4.16 | $5.91 | 23 | 88 | 91 |
| 28 | Rafael Devers | $18.4M | 4.11 | $4.48 | 28 | 81 | 83 |
| 29 | Bryce Harper | $24.4M | 4.10 | $5.96 | 26 | 82 | 86 |
| 30 | Bobby Witt Jr. | $35.7M | 4.07 | $8.78 | 26 | 97 | 86 |
| 31 | Ketel Marte | FA | 4.02 | - | 26 | 90 | 79 |
| 36 | Corbin Carroll | $33.0M | 3.63 | $9.08 | 26 | 91 | 85 |
| 37 | Eugenio Suárez | FA | 3.59 | - | 30 | 71 | 82 |
| 38 | Austin Riley | $21.7M | 3.57 | $6.09 | 26 | 77 | 84 |
| 44 | Manny Machado | $8.5M | 3.30 | $2.58 | 26 | 75 | 85 |

### Speed + Rate Stats

| Rank | Player | Salary | Score | $/Pt | SB | AVG | OBP |
|-----:|--------|-------:|------:|-----:|---:|----:|----:|
| 1 | Ronald Acuña Jr.* | $44.0M | 6.84 | $6.43 | 24 | .285 | .370 |
| 3 | Bobby Witt Jr. | $35.7M | 6.14 | $5.82 | 31 | .292 | .340 |
| 6 | Xavier Edwards | $9.3M | 5.07 | $1.84 | 25 | .285 | .350 |
| 7 | Elly De La Cruz | $15.1M | 4.79 | $3.15 | 37 | .264 | .320 |
| 9 | Fernando Tatis Jr.* | $25.7M | 4.70 | $5.47 | 23 | .275 | .340 |
| 11 | José Ramírez | $20.0M | 4.55 | $4.40 | 29 | .275 | .350 |
| 12 | Nico Hoerner* | $5.0M | 4.48 | $1.12 | 24 | .285 | .340 |
| 13 | Corbin Carroll | $33.0M | 4.46 | $7.40 | 32 | .261 | .340 |
| 17 | Trea Turner* | $17.8M | 4.20 | $4.24 | 26 | .280 | .330 |
| 18 | Maikel Garcia | FA | 4.18 | - | 26 | .275 | .320 |
| 20 | Geraldo Perdomo | FA | 4.02 | - | 18 | .270 | .360 |
| 22 | Luis Arraez* | $10.3M | 3.81 | $2.70 | 8 | .305 | .360 |
| 23 | Steven Kwan* | $5.3M | 3.70 | $1.43 | 16 | .278 | .360 |
| 27 | Yandy Díaz | FA | 3.25 | - | 2 | .294 | .380 |
| 30 | Luke Keaschall | $1.0M | 3.04 | $0.33 | 19 | .267 | .330 |

---

## Top 15 Pitchers by Strategy

### Volume Pitching + Power (Starting Pitchers)

| Rank | Player | Salary | Score | $/Pt | QS | K | ERA |
|-----:|--------|-------:|------:|-----:|---:|--:|----:|
| 1 | Garrett Crochet | FA | 9.14 | - | 20 | 238 | 3.01 |
| 2 | Chris Sale | FA | 7.00 | - | 17 | 205 | 3.19 |
| 3 | Cristopher Sánchez* | $2.0M | 6.85 | $0.29 | 21 | 192 | 3.16 |
| 4 | Jacob deGrom | FA | 6.85 | - | 18 | 213 | 3.48 |
| 6 | Cole Ragans* | $11.0M | 6.37 | $1.73 | 17 | 210 | 3.23 |
| 7 | Bryan Woo | FA | 6.12 | - | 19 | 195 | 3.59 |
| 9 | Logan Gilbert* | $13.8M | 5.58 | $2.47 | 16 | 182 | 3.39 |
| 11 | Dylan Cease | $14.6M | 5.37 | $2.72 | 17 | 216 | 3.60 |
| 12 | George Kirby | $23.9M | 5.27 | $4.54 | 17 | 174 | 3.50 |
| 13 | Jesús Luzardo | FA | 5.16 | - | 17 | 198 | 3.57 |
| 14 | Joe Ryan | FA | 5.05 | - | 16 | 199 | 3.83 |
| 15 | Hunter Greene | FA | 4.94 | - | 16 | 220 | 3.94 |
| 17 | Hunter Brown | FA | 4.89 | - | 17 | 199 | 3.63 |
| 18 | Nick Pivetta | FA | 4.67 | - | 17 | 209 | 3.96 |
| 19 | Framber Valdez | FA | 4.57 | - | 19 | 178 | 3.47 |

### Power Hitting + Elite RP (Relief Pitchers)

| Rank | Player | Salary | Score | $/Pt | SV | HLD | ERA |
|-----:|--------|-------:|------:|-----:|---:|----:|----:|
| 1 | Mason Miller | FA | 10.79 | - | 31 | 2 | 2.38 |
| 2 | Edwin Díaz* | $5.3M | 9.55 | $0.55 | 35 | 2 | 3.02 |
| 3 | Cade Smith | $6.0M | 8.66 | $0.69 | 29 | 3 | 2.97 |
| 4 | Jhoan Duran | $2.4M | 8.42 | $0.28 | 28 | 3 | 2.78 |
| 5 | Josh Hader | FA | 7.94 | - | 31 | 2 | 3.29 |
| 6 | Devin Williams | FA | 7.85 | - | 32 | 3 | 3.14 |
| 7 | Aroldis Chapman | FA | 7.83 | - | 31 | 1 | 3.00 |
| 8 | Andrés Muñoz | FA | 7.82 | - | 28 | 3 | 2.91 |
| 9 | David Bednar | FA | 7.79 | - | 32 | 1 | 3.30 |
| 10 | Ryan Walker | FA | 7.34 | - | 30 | 3 | 3.30 |
| 12 | Jeff Hoffman | $3.0M | 6.43 | $0.47 | 26 | 3 | 3.46 |
| 13 | Daniel Palencia | FA | 6.18 | - | 29 | 4 | 3.62 |
| 14 | Abner Uribe | FA | 6.13 | - | 23 | 4 | 3.15 |
| 15 | Griffin Jax* | $4.4M | 6.12 | $0.72 | 11 | 9 | 3.13 |
| 16 | Ryan Helsley | FA | 5.85 | - | 24 | 3 | 3.47 |

---

## Key Takeaways

### Best Value Contracts (Low $/Pt)

**Batters:**
- **Luke Keaschall** ($1.0M, $0.33/pt) - Speed strategy steal
- **Nico Hoerner** ($5.0M, $1.12/pt) - Elite speed value
- **Steven Kwan** ($5.3M, $1.43/pt) - Rate stats bargain
- **Xavier Edwards** ($9.3M, $1.84/pt) - Speed + contact
- **Manny Machado** ($8.5M, $2.58/pt) - Power on a discount

**Pitchers:**
- **Jhoan Duran** ($2.4M, $0.28/pt) - Elite closer, elite price
- **Cristopher Sánchez** ($2.0M, $0.29/pt) - Volume SP steal
- **Jeff Hoffman** ($3.0M, $0.47/pt) - RP value
- **Edwin Díaz** ($5.3M, $0.55/pt) - Top closer, cheap
- **Cade Smith** ($6.0M, $0.69/pt) - Elite RP production

### Free Agent Targets

**Volume + Power:** Pete Alonso, Brent Rooker, Ketel Marte, Eugenio Suárez, Garrett Crochet, Chris Sale, Jacob deGrom

**Power + Elite RP:** Mason Miller, Josh Hader, Aroldis Chapman, Andrés Muñoz, David Bednar, Devin Williams

**Speed + Rates:** Maikel Garcia, Geraldo Perdomo, Yandy Díaz

### Partial Blocks Worth Monitoring
- **Cristopher Sánchez & Cole Ragans** (JD Barnett) - Elite SP value at $2M and $11M
- **Edwin Díaz & Griffin Jax** (Ross & Jack Kantor) - Top RP value
- **Matt Olson & Fernando Tatis Jr.** (Tyler Hart) - Top power bats
- **Ronald Acuña Jr.** (Steve Cornish) - Elite across all strategies

---

*Generated from FanGraphs 2026 projections and Fantrax league historical analysis*
