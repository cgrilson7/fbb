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

Based on last year's category performance, here's how each team's approach translated to standings:

| Place | Team | Points | Strategy Used | Power | Speed | Vol SP | Relief | Rates |
|------:|------|-------:|---------------|------:|------:|-------:|-------:|------:|
| **1** | Tyler & Dustin Hart | 137.0 | **POWER + ELITE RP** | 12.0 | 8.0 | 3.5 | 11.5 | 11.7 |
| **2** | Ross & Jack Kantor | 128.0 | **SPEED + RATES** | 8.7 | 11.0 | 11.0 | 9.0 | 7.7 |
| **3** | Zack Semler | 126.0 | **SPEED + RATES** | 7.3 | 9.3 | 12.0 | 10.0 | 8.0 |
| **4** | Jake Zuckman & Andrew Meyers | 113.0 | **VOLUME + POWER** | 11.0 | 7.7 | 10.0 | 7.5 | 3.7 |
| **5** | JD Barnett | 105.0 | Power focus | 9.7 | 7.0 | 7.5 | 8.0 | 5.0 |
| **6** | Nick & Alex Gianaris | 101.5 | Mixed | 8.3 | 7.7 | 5.8 | 4.5 | 7.7 |
| **7** | Jake Levine & Johnny Drago | 85.0 | Mixed | 5.7 | 3.0 | 8.5 | 5.5 | 8.7 |
| **8** | Brian Frederick | 76.0 | Mixed | 4.2 | 6.3 | 5.8 | 4.5 | 7.0 |
| **9** | Brenden Freedman | 71.5 | Mixed | 2.3 | 7.0 | 6.8 | 3.5 | 7.0 |
| **10** | Ethan Gobetz | 67.0 | Rebuild | 3.3 | 3.3 | 3.0 | 6.0 | 7.3 |
| **11** | Steve Cornish | 51.5 | Rebuild | 3.7 | 5.3 | 3.2 | 3.5 | 3.3 |
| **12** | Nolan Chidester | 30.5 | Rebuild | 1.8 | 2.3 | 1.0 | 4.5 | 1.0 |

*Column values = average rank in that category group (12=best, 1=worst)*

### Key Insight
**Clear strategies win.** The top 4 teams all had identifiable approaches. Teams without a clear strategy finished 6th-9th.

---

## Top 15 Batters by Strategy

*Players marked with \* are partial blocks*

### Volume Pitching + Power

| Rank | Player | HR | R | RBI | Score |
|------|--------|---:|--:|----:|------:|
| 1 | Pete Alonso | 35 | 87 | 101 | 6.69 |
| 2 | Matt Olson* | 30 | 93 | 91 | 5.69 |
| 3 | Ronald Acuña Jr.* | 30 | 110 | 84 | 5.51 |
| 4 | Brent Rooker | 30 | 82 | 90 | 4.92 |
| 5 | Fernando Tatis Jr.* | 30 | 97 | 77 | 4.32 |
| 6 | Julio Rodríguez | 29 | 84 | 90 | 4.31 |
| 7 | Freddie Freeman* | 23 | 88 | 91 | 4.16 |
| 8 | Rafael Devers | 28 | 81 | 83 | 4.11 |
| 9 | Bryce Harper | 26 | 82 | 86 | 4.10 |
| 10 | Bobby Witt Jr. | 26 | 97 | 86 | 4.07 |
| 11 | Ketel Marte | 26 | 90 | 79 | 4.02 |
| 12 | Corbin Carroll | 26 | 91 | 85 | 3.63 |
| 13 | Eugenio Suárez | 30 | 71 | 82 | 3.59 |
| 14 | Austin Riley | 26 | 77 | 84 | 3.57 |
| 15 | Manny Machado | 26 | 75 | 85 | 3.30 |

### Speed + Rate Stats

| Rank | Player | SB | AVG | OBP | Score |
|------|--------|---:|----:|----:|------:|
| 1 | Ronald Acuña Jr.* | 24 | .285 | .370 | 6.84 |
| 2 | Bobby Witt Jr. | 31 | .292 | .340 | 6.14 |
| 3 | Xavier Edwards | 25 | .285 | .350 | 5.07 |
| 4 | Elly De La Cruz | 37 | .264 | .320 | 4.79 |
| 5 | Fernando Tatis Jr.* | 23 | .275 | .340 | 4.70 |
| 6 | José Ramírez | 29 | .275 | .350 | 4.55 |
| 7 | Nico Hoerner* | 24 | .285 | .340 | 4.48 |
| 8 | Corbin Carroll | 32 | .261 | .340 | 4.46 |
| 9 | Trea Turner* | 26 | .280 | .330 | 4.20 |
| 10 | Maikel Garcia | 26 | .275 | .320 | 4.18 |
| 11 | Geraldo Perdomo | 18 | .270 | .360 | 4.02 |
| 12 | Luis Arraez* | 8 | .305 | .360 | 3.81 |
| 13 | Steven Kwan* | 16 | .278 | .360 | 3.70 |
| 14 | Yandy Díaz | 2 | .294 | .380 | 3.25 |
| 15 | Luke Keaschall | 19 | .267 | .330 | 3.04 |

---

## Top 15 Pitchers by Strategy

### Volume Pitching + Power (Starting Pitchers)

| Rank | Player | QS | K | ERA | WHIP | Score |
|------|--------|---:|--:|----:|-----:|------:|
| 1 | Garrett Crochet | 20 | 238 | 3.01 | 1.07 | 9.14 |
| 2 | Chris Sale | 17 | 205 | 3.19 | 1.09 | 7.00 |
| 3 | Cristopher Sánchez* | 21 | 192 | 3.16 | 1.18 | 6.85 |
| 4 | Jacob deGrom | 18 | 213 | 3.48 | 1.09 | 6.85 |
| 5 | Cole Ragans* | 17 | 210 | 3.23 | 1.17 | 6.37 |
| 6 | Bryan Woo | 19 | 195 | 3.59 | 1.13 | 6.12 |
| 7 | Logan Gilbert* | 16 | 182 | 3.39 | 1.10 | 5.58 |
| 8 | Dylan Cease | 17 | 216 | 3.60 | 1.22 | 5.37 |
| 9 | George Kirby | 17 | 174 | 3.50 | 1.12 | 5.27 |
| 10 | Jesús Luzardo | 17 | 198 | 3.57 | 1.19 | 5.16 |
| 11 | Joe Ryan | 16 | 199 | 3.83 | 1.14 | 5.05 |
| 12 | Hunter Greene | 16 | 220 | 3.94 | 1.19 | 4.94 |
| 13 | Hunter Brown | 17 | 199 | 3.63 | 1.23 | 4.89 |
| 14 | Nick Pivetta | 17 | 209 | 3.96 | 1.20 | 4.67 |
| 15 | Framber Valdez | 19 | 178 | 3.47 | 1.28 | 4.57 |

### Power Hitting + Elite RP (Relief Pitchers)

| Rank | Player | SV | HLD | ERA | WHIP | Score |
|------|--------|---:|----:|----:|-----:|------:|
| 1 | Mason Miller | 31 | 2 | 2.38 | 1.00 | 10.79 |
| 2 | Edwin Díaz* | 35 | 2 | 3.02 | 1.09 | 9.55 |
| 3 | Cade Smith | 29 | 3 | 2.97 | 1.10 | 8.66 |
| 4 | Jhoan Duran | 28 | 3 | 2.78 | 1.13 | 8.42 |
| 5 | Josh Hader | 31 | 2 | 3.29 | 1.12 | 7.94 |
| 6 | Devin Williams | 32 | 3 | 3.14 | 1.19 | 7.85 |
| 7 | Aroldis Chapman | 31 | 1 | 3.00 | 1.18 | 7.83 |
| 8 | Andrés Muñoz | 28 | 3 | 2.91 | 1.17 | 7.82 |
| 9 | David Bednar | 32 | 1 | 3.30 | 1.15 | 7.79 |
| 10 | Ryan Walker | 30 | 3 | 3.30 | 1.19 | 7.34 |
| 11 | Jeff Hoffman | 26 | 3 | 3.46 | 1.18 | 6.43 |
| 12 | Daniel Palencia | 29 | 4 | 3.62 | 1.26 | 6.18 |
| 13 | Abner Uribe | 23 | 4 | 3.15 | 1.25 | 6.13 |
| 14 | Griffin Jax* | 11 | 9 | 3.13 | 1.13 | 6.12 |
| 15 | Ryan Helsley | 24 | 3 | 3.47 | 1.22 | 5.85 |

---

## Key Takeaways

### Universal Elite Players
- **Garrett Crochet** - Top SP across Volume/Speed/Balanced strategies (21 QS, 239 K, 3.01 ERA)
- **Mason Miller** - Top RP across reliever-focused strategies (31 SV, 2.38 ERA, 1.00 WHIP)
- **Ronald Acuña Jr.** - Top 5 batter in every strategy (partial block: Steve Cornish)

### Strategy-Specific Targets

| If You Choose... | Target These Batters | Target These Pitchers |
|------------------|---------------------|----------------------|
| Volume + Power | Pete Alonso, Brent Rooker, Matt Olson | Crochet, Sale, deGrom, Bryan Woo (SP) |
| Power + Elite RP | Pete Alonso, Brent Rooker, Julio Rodriguez | Mason Miller, Edwin Díaz, Cade Smith, Jhoan Duran (RP) |
| Speed + Rates | Acuña, Witt, Xavier Edwards, Elly De La Cruz | Crochet, Sale, Logan Gilbert (SP) |
| Balanced | Acuña, Witt, Tatis, Corbin Carroll | Crochet, Sale, deGrom (SP) |
| Elite Bullpen | Acuña, Xavier Edwards, Luis Arraez, Yandy Díaz | Mason Miller, Cade Smith, Muñoz, Devin Williams (RP) |

### Best Free Agent Targets

**Volume + Power:** Pete Alonso, Brent Rooker, Ketel Marte, Eugenio Suárez

**Power + Elite RP:** Mason Miller, Josh Hader, Aroldis Chapman, Andrés Muñoz *(all closers are FA!)*

**Speed + Rates:** Maikel Garcia, Geraldo Perdomo, Yandy Díaz

**Balanced:** Ketel Marte, Pete Alonso, Yandy Díaz, Corey Seager

### Partial Blocks Worth Monitoring
- Cristopher Sánchez & Cole Ragans (JD Barnett) - Elite SP value
- Edwin Díaz & Griffin Jax (Ross & Jack Kantor) - Top RP value
- Matt Olson & Fernando Tatis Jr. (Tyler Hart) - Top power bats
- Ronald Acuña Jr. (Steve Cornish) - Elite across all strategies

---

*Generated from FanGraphs 2026 projections and Fantrax league historical analysis*
