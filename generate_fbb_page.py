#!/usr/bin/env python3
"""
Generate interactive fantasy baseball draft board HTML page.
"""

import pandas as pd
import json
import os

# Strategy definitions
STRATEGIES = {
    'volume_power': {
        'name': 'Volume + Power',
        'file': 'draft_board_volume_power.csv',
        'description': 'Target: R, HR, RBI + QS, K, ERA, WHIP | Punt: SB, SV, HLD'
    },
    'power_rp': {
        'name': 'Power + Elite RP',
        'file': 'draft_board_power_rp.csv',
        'description': 'Target: HR, RBI, SLG + SV, HLD, ERA, WHIP | Punt: SB, QS'
    },
    'speed_rates': {
        'name': 'Speed + Rates',
        'file': 'draft_board_speed_rates.csv',
        'description': 'Target: SB, AVG, OBP + ERA, WHIP, K | Punt: HR, RBI, QS'
    },
    'balanced': {
        'name': 'Balanced',
        'file': 'draft_board_balanced.csv',
        'description': 'All categories weighted equally'
    },
    'elite_bullpen': {
        'name': 'Elite Bullpen',
        'file': 'draft_board_elite_bullpen.csv',
        'description': 'Target: SV, HLD, ERA, WHIP + AVG, OBP | Punt: HR, QS, K'
    }
}

# 2025 League Results
LEAGUE_RESULTS = [
    {'place': 1, 'team': 'Tyler & Dustin Hart', 'points': 137.0, 'strategy': 'POWER + ELITE RP', 'power': 12.0, 'speed': 8.0, 'volsp': 3.5, 'relief': 11.5, 'rates': 11.7},
    {'place': 2, 'team': 'Ross & Jack Kantor', 'points': 128.0, 'strategy': 'SPEED + RATES', 'power': 8.7, 'speed': 11.0, 'volsp': 11.0, 'relief': 9.0, 'rates': 7.7},
    {'place': 3, 'team': 'Zack Semler', 'points': 126.0, 'strategy': 'SPEED + RATES', 'power': 7.3, 'speed': 9.3, 'volsp': 12.0, 'relief': 10.0, 'rates': 8.0},
    {'place': 4, 'team': 'Jake Zuckman & Andrew Meyers', 'points': 113.0, 'strategy': 'VOLUME + POWER', 'power': 11.0, 'speed': 7.7, 'volsp': 10.0, 'relief': 7.5, 'rates': 3.7},
    {'place': 5, 'team': 'JD Barnett', 'points': 105.0, 'strategy': 'Power focus', 'power': 9.7, 'speed': 7.0, 'volsp': 7.5, 'relief': 8.0, 'rates': 5.0},
    {'place': 6, 'team': 'Nick & Alex Gianaris', 'points': 101.5, 'strategy': 'Mixed', 'power': 8.3, 'speed': 7.7, 'volsp': 5.8, 'relief': 4.5, 'rates': 7.7},
    {'place': 7, 'team': 'Jake Levine & Johnny Drago', 'points': 85.0, 'strategy': 'Mixed', 'power': 5.7, 'speed': 3.0, 'volsp': 8.5, 'relief': 5.5, 'rates': 8.7},
    {'place': 8, 'team': 'Brian Frederick', 'points': 76.0, 'strategy': 'Mixed', 'power': 4.2, 'speed': 6.3, 'volsp': 5.8, 'relief': 4.5, 'rates': 7.0},
    {'place': 9, 'team': 'Brenden Freedman', 'points': 71.5, 'strategy': 'Mixed', 'power': 2.3, 'speed': 7.0, 'volsp': 6.8, 'relief': 3.5, 'rates': 7.0},
    {'place': 10, 'team': 'Ethan Gobetz', 'points': 67.0, 'strategy': 'Rebuild', 'power': 3.3, 'speed': 3.3, 'volsp': 3.0, 'relief': 6.0, 'rates': 7.3},
    {'place': 11, 'team': 'Steve Cornish', 'points': 51.5, 'strategy': 'Rebuild', 'power': 3.7, 'speed': 5.3, 'volsp': 3.2, 'relief': 3.5, 'rates': 3.3},
    {'place': 12, 'team': 'Nolan Chidester', 'points': 30.5, 'strategy': 'Rebuild', 'power': 1.8, 'speed': 2.3, 'volsp': 1.0, 'relief': 4.5, 'rates': 1.0},
]

def load_strategy_data():
    """Load all strategy CSVs and convert to JSON-friendly format."""
    data = {}

    for key, info in STRATEGIES.items():
        df = pd.read_csv(info['file'])

        # Select columns for batters
        batter_cols = ['Rank', 'Name', 'Team', 'Salary_2026_M', 'Salary_2027_M', 'Salary_2028_M',
                       'Strategy_Score', 'Dollar_Per_Score',
                       'HR', 'R', 'RBI', 'SB', 'AVG', 'OBP', 'SLG', 'Block_Type', 'Rostered_By']
        batters = df[df['Player_Type'] == 'Batter'][batter_cols].head(50)

        # Select columns for pitchers
        pitcher_cols = ['Rank', 'Name', 'Team', 'Position', 'Salary_2026_M', 'Salary_2027_M', 'Salary_2028_M',
                        'Strategy_Score', 'Dollar_Per_Score',
                        'QS', 'SO', 'SV', 'HLD', 'ERA', 'WHIP', 'Block_Type', 'Rostered_By']
        pitchers = df[df['Player_Type'] == 'Pitcher'][pitcher_cols].head(50)

        # Clean data for JSON
        batters = batters.fillna('')
        pitchers = pitchers.fillna('')

        # Round numeric columns
        for col in ['Salary_2026_M', 'Salary_2027_M', 'Salary_2028_M', 'Strategy_Score', 'Dollar_Per_Score', 'AVG', 'OBP', 'SLG', 'ERA', 'WHIP']:
            if col in batters.columns:
                batters[col] = batters[col].apply(lambda x: round(x, 2) if isinstance(x, (int, float)) and x != '' else x)
            if col in pitchers.columns:
                pitchers[col] = pitchers[col].apply(lambda x: round(x, 2) if isinstance(x, (int, float)) and x != '' else x)

        data[key] = {
            'name': info['name'],
            'description': info['description'],
            'file': info['file'],
            'batters': batters.to_dict('records'),
            'pitchers': pitchers.to_dict('records')
        }

    return data

def generate_html(data):
    """Generate the full HTML page."""

    html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fantasy Baseball Draft Board 2026</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <style>
        [x-cloak] { display: none !important; }
        .sortable { cursor: pointer; user-select: none; }
        .sortable:hover { background-color: #f3f4f6; }
        .fa-row { background-color: #ecfdf5 !important; }
        .partial-row { background-color: #fefce8 !important; }
        .full-row { background-color: #fee2e2 !important; }
        .table-container { max-height: 600px; overflow: auto; }
        thead th { position: sticky; top: 0; z-index: 10; }
        .sticky-col { position: sticky; background-color: inherit; z-index: 5; }
        .sticky-col-1 { left: 0; }
        .sticky-col-2 { left: 90px; }
        thead .sticky-col { z-index: 15; background-color: #f3f4f6; }
        tr.fa-row .sticky-col { background-color: #ecfdf5; }
        tr.partial-row .sticky-col { background-color: #fefce8; }
        tr.full-row .sticky-col { background-color: #fee2e2; }
        tr:not(.fa-row):not(.partial-row):not(.full-row) .sticky-col { background-color: white; }
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
    <div x-data="draftBoard()" x-cloak class="max-w-7xl mx-auto px-4 py-8">
        <!-- Header -->
        <header class="mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-2">Fantasy Baseball Draft Board 2026</h1>
            <p class="text-gray-600">Strategy-based rankings using FanGraphs projections</p>
        </header>

        <!-- Strategy Tabs -->
        <div class="mb-6">
            <div class="border-b border-gray-200">
                <nav class="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                    <template x-for="(strat, key) in strategies" :key="key">
                        <button @click="activeStrategy = key"
                            :class="activeStrategy === key
                                ? 'border-blue-500 text-blue-600 bg-white'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
                            class="whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm rounded-t-lg transition-colors">
                            <span x-text="strat.name"></span>
                        </button>
                    </template>
                </nav>
            </div>
        </div>

        <!-- Active Strategy Content -->
        <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                    <h2 class="text-2xl font-semibold text-gray-900" x-text="strategies[activeStrategy].name"></h2>
                    <p class="text-gray-600 text-sm" x-text="strategies[activeStrategy].description"></p>
                </div>
                <a :href="strategies[activeStrategy].file"
                   class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    Download CSV
                </a>
            </div>

            <!-- Filters -->
            <div class="flex flex-wrap gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div class="flex-1 min-w-[200px]">
                    <input type="text" x-model="searchQuery" placeholder="Search player name..."
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>
                <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" x-model="hideFreeAgents" class="rounded text-blue-600 focus:ring-blue-500">
                    <span class="text-sm text-gray-700">Hide Free Agents</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" x-model="hidePartialBlocks" class="rounded text-blue-600 focus:ring-blue-500">
                    <span class="text-sm text-gray-700">Hide Partial Blocks</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" x-model="showFAOnly" class="rounded text-blue-600 focus:ring-blue-500">
                    <span class="text-sm text-gray-700">Free Agents Only</span>
                </label>
            </div>

            <!-- Batters Table -->
            <div class="mb-8">
                <h3 class="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs mr-2">BATTERS</span>
                    <span x-text="filteredBatters().length + ' players'"></span>
                </h3>
                <div class="table-container border rounded-lg">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-100">
                            <tr>
                                <th @click="sortBy('Rostered_By', 'batters')" class="sortable sticky-col sticky-col-1 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[90px]">Franchise</th>
                                <th @click="sortBy('Block_Type', 'batters')" class="sortable sticky-col sticky-col-2 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Block</th>
                                <th @click="sortBy('Rank', 'batters')" class="sortable px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                                <th @click="sortBy('Name', 'batters')" class="sortable px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                                <th @click="sortBy('Team', 'batters')" class="sortable px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                                <th @click="sortBy('Salary_2026_M', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">2026</th>
                                <th @click="sortBy('Salary_2027_M', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">2027</th>
                                <th @click="sortBy('Salary_2028_M', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">2028</th>
                                <th @click="sortBy('Strategy_Score', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                                <th @click="sortBy('Dollar_Per_Score', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">$/Pt</th>
                                <th @click="sortBy('HR', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">HR</th>
                                <th @click="sortBy('R', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">R</th>
                                <th @click="sortBy('RBI', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">RBI</th>
                                <th @click="sortBy('SB', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">SB</th>
                                <th @click="sortBy('AVG', 'batters')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">AVG</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            <template x-for="player in filteredBatters()" :key="player.Name">
                                <tr :class="getRowClass(player)">
                                    <td class="sticky-col sticky-col-1 px-3 py-2 whitespace-nowrap text-sm text-gray-600 min-w-[90px]" x-text="formatFranchise(player.Rostered_By)"></td>
                                    <td class="sticky-col sticky-col-2 px-3 py-2 whitespace-nowrap text-sm" x-html="getBlockBadge(player.Block_Type)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900" x-text="player.Rank"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900" x-text="player.Name"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500" x-text="player.Team"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="formatSalary(player.Salary_2026_M)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="formatSalary(player.Salary_2027_M)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="formatSalary(player.Salary_2028_M)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right font-semibold" x-text="player.Strategy_Score?.toFixed(2) || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-right" x-text="formatDPS(player.Dollar_Per_Score)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.HR || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.R || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.RBI || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.SB || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.AVG ? player.AVG.toFixed(3) : '-'"></td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Pitchers Table -->
            <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-2">PITCHERS</span>
                    <span x-text="filteredPitchers().length + ' players'"></span>
                </h3>
                <div class="table-container border rounded-lg">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-100">
                            <tr>
                                <th @click="sortBy('Rostered_By', 'pitchers')" class="sortable sticky-col sticky-col-1 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[90px]">Franchise</th>
                                <th @click="sortBy('Block_Type', 'pitchers')" class="sortable sticky-col sticky-col-2 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Block</th>
                                <th @click="sortBy('Rank', 'pitchers')" class="sortable px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                                <th @click="sortBy('Name', 'pitchers')" class="sortable px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                                <th @click="sortBy('Position', 'pitchers')" class="sortable px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pos</th>
                                <th @click="sortBy('Salary_2026_M', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">2026</th>
                                <th @click="sortBy('Salary_2027_M', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">2027</th>
                                <th @click="sortBy('Salary_2028_M', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">2028</th>
                                <th @click="sortBy('Strategy_Score', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                                <th @click="sortBy('Dollar_Per_Score', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">$/Pt</th>
                                <th @click="sortBy('QS', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">QS</th>
                                <th @click="sortBy('SO', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">K</th>
                                <th @click="sortBy('SV', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">SV</th>
                                <th @click="sortBy('HLD', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">HLD</th>
                                <th @click="sortBy('ERA', 'pitchers')" class="sortable px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ERA</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            <template x-for="player in filteredPitchers()" :key="player.Name">
                                <tr :class="getRowClass(player)">
                                    <td class="sticky-col sticky-col-1 px-3 py-2 whitespace-nowrap text-sm text-gray-600 min-w-[90px]" x-text="formatFranchise(player.Rostered_By)"></td>
                                    <td class="sticky-col sticky-col-2 px-3 py-2 whitespace-nowrap text-sm" x-html="getBlockBadge(player.Block_Type)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900" x-text="player.Rank"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900" x-text="player.Name"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500" x-text="player.Position"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="formatSalary(player.Salary_2026_M)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="formatSalary(player.Salary_2027_M)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="formatSalary(player.Salary_2028_M)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right font-semibold" x-text="player.Strategy_Score?.toFixed(2) || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 text-right" x-text="formatDPS(player.Dollar_Per_Score)"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.QS || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.SO || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.SV || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.HLD || '-'"></td>
                                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="player.ERA ? player.ERA.toFixed(2) : '-'"></td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- 2025 League Results -->
        <div class="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 class="text-2xl font-semibold text-gray-900 mb-4">2025 League Results by Strategy</h2>
            <p class="text-gray-600 text-sm mb-4">Category values = average rank (12=best, 1=worst). Top 4 teams all had clear strategies.</p>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Place</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Team</th>
                            <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Points</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
                            <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Power</th>
                            <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Speed</th>
                            <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Vol SP</th>
                            <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Relief</th>
                            <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rates</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        <template x-for="team in leagueResults" :key="team.place">
                            <tr :class="team.place <= 4 ? 'bg-green-50' : ''">
                                <td class="px-3 py-2 whitespace-nowrap text-sm font-bold" x-text="team.place"></td>
                                <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900" x-text="team.team"></td>
                                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right" x-text="team.points"></td>
                                <td class="px-3 py-2 whitespace-nowrap text-sm">
                                    <span :class="team.place <= 4 ? 'bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium' : 'text-gray-500'" x-text="team.strategy"></span>
                                </td>
                                <td class="px-3 py-2 whitespace-nowrap text-sm text-right" :class="team.power >= 9 ? 'text-green-600 font-semibold' : (team.power <= 4 ? 'text-red-500' : 'text-gray-900')" x-text="team.power"></td>
                                <td class="px-3 py-2 whitespace-nowrap text-sm text-right" :class="team.speed >= 9 ? 'text-green-600 font-semibold' : (team.speed <= 4 ? 'text-red-500' : 'text-gray-900')" x-text="team.speed"></td>
                                <td class="px-3 py-2 whitespace-nowrap text-sm text-right" :class="team.volsp >= 9 ? 'text-green-600 font-semibold' : (team.volsp <= 4 ? 'text-red-500' : 'text-gray-900')" x-text="team.volsp"></td>
                                <td class="px-3 py-2 whitespace-nowrap text-sm text-right" :class="team.relief >= 9 ? 'text-green-600 font-semibold' : (team.relief <= 4 ? 'text-red-500' : 'text-gray-900')" x-text="team.relief"></td>
                                <td class="px-3 py-2 whitespace-nowrap text-sm text-right" :class="team.rates >= 9 ? 'text-green-600 font-semibold' : (team.rates <= 4 ? 'text-red-500' : 'text-gray-900')" x-text="team.rates"></td>
                            </tr>
                        </template>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Footer -->
        <footer class="text-center text-gray-500 text-sm py-8">
            Generated from FanGraphs 2026 projections and Fantrax league historical analysis
        </footer>
    </div>

    <script>
        const STRATEGY_DATA = ''' + json.dumps(data) + ''';
        const LEAGUE_RESULTS = ''' + json.dumps(LEAGUE_RESULTS) + ''';

        function draftBoard() {
            return {
                strategies: STRATEGY_DATA,
                leagueResults: LEAGUE_RESULTS,
                activeStrategy: 'volume_power',
                searchQuery: '',
                showFAOnly: false,
                hideFreeAgents: true,
                hidePartialBlocks: false,
                sortColumn: 'Rank',
                sortDirection: 'asc',
                sortType: 'batters',

                sortBy(column, type) {
                    if (this.sortColumn === column && this.sortType === type) {
                        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortColumn = column;
                        this.sortType = type;
                        this.sortDirection = 'asc';
                    }
                },

                filterPlayers(players) {
                    return players.filter(p => {
                        if (this.searchQuery && !p.Name.toLowerCase().includes(this.searchQuery.toLowerCase())) {
                            return false;
                        }
                        if (this.showFAOnly && p.Rostered_By) {
                            return false;
                        }
                        if (this.hideFreeAgents && !p.Rostered_By) {
                            return false;
                        }
                        if (this.hidePartialBlocks && p.Block_Type === 'Partial') {
                            return false;
                        }
                        return true;
                    });
                },

                sortPlayers(players, type) {
                    if (this.sortType !== type) return players;

                    return [...players].sort((a, b) => {
                        let aVal = a[this.sortColumn];
                        let bVal = b[this.sortColumn];

                        // Handle empty values
                        if (aVal === '' || aVal === null || aVal === undefined) aVal = this.sortDirection === 'asc' ? Infinity : -Infinity;
                        if (bVal === '' || bVal === null || bVal === undefined) bVal = this.sortDirection === 'asc' ? Infinity : -Infinity;

                        // Compare
                        if (typeof aVal === 'string') {
                            return this.sortDirection === 'asc'
                                ? aVal.localeCompare(bVal)
                                : bVal.localeCompare(aVal);
                        }
                        return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
                    });
                },

                filteredBatters() {
                    const batters = this.strategies[this.activeStrategy].batters;
                    return this.sortPlayers(this.filterPlayers(batters), 'batters');
                },

                filteredPitchers() {
                    const pitchers = this.strategies[this.activeStrategy].pitchers;
                    return this.sortPlayers(this.filterPlayers(pitchers), 'pitchers');
                },

                formatSalary(val) {
                    if (!val || val === '') return 'FA';
                    return '$' + val.toFixed(1) + 'M';
                },

                formatDPS(val) {
                    if (!val || val === '') return '-';
                    return '$' + val.toFixed(2);
                },

                getRowClass(player) {
                    if (!player.Rostered_By) return 'fa-row';
                    if (player.Block_Type === 'Full') return 'full-row';
                    if (player.Block_Type === 'Partial') return 'partial-row';
                    return '';
                },

                formatFranchise(roster) {
                    if (!roster) return 'FA';
                    // Shorten long franchise names
                    const shortcuts = {
                        'Jake Zuckman & Andrew Meyers': 'Jake Z & Andrew',
                        'Jake Levine & Johnny Drago': 'Jake L & Johnny',
                        'Ben Brody & Aaron': 'Ben & Aaron',
                        'Ross & Jack Kantor': 'Ross & Jack',
                        'Brenden Freedman': 'Brenden',
                        'Brian Frederick': 'Brian',
                        'Ethan Gobetz': 'Ethan',
                        'Nolan Chidester': 'Nolan',
                        'Steve Cornish': 'Steve',
                        'Tyler Hart': 'Tyler',
                        'Zack Semler': 'Zack',
                        'JD Barnett': 'JD'
                    };
                    return shortcuts[roster] || roster;
                },

                getBlockBadge(blockType) {
                    if (!blockType) {
                        return '<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">-</span>';
                    }
                    if (blockType === 'Full') {
                        return '<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">Full</span>';
                    }
                    if (blockType === 'Partial') {
                        return '<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">Partial</span>';
                    }
                    return '<span class="text-gray-400 text-xs">-</span>';
                }
            }
        }
    </script>
</body>
</html>'''

    return html

def main():
    print("Loading strategy data...")
    data = load_strategy_data()

    print("Generating HTML...")
    html = generate_html(data)

    output_path = os.path.expanduser('~/catalyst/catalyst/public/fbb/index.html')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w') as f:
        f.write(html)

    print(f"Saved to {output_path}")

    # Also copy CSVs
    import shutil
    for key, info in STRATEGIES.items():
        src = info['file']
        dst = os.path.expanduser(f"~/catalyst/catalyst/public/fbb/{info['file']}")
        shutil.copy(src, dst)
        print(f"Copied {src}")

    print("\nDone! Deploy with:")
    print("  cd ~/catalyst/catalyst && npm run build && npx netlify deploy --prod")

if __name__ == '__main__':
    main()
