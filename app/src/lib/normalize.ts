// Common nickname mappings (nickname -> full name)
const NICKNAMES: Record<string, string> = {
  'leo': 'leodalis',
  'mike': 'michael',
  'matt': 'matthew',
  'rob': 'robert',
  'bob': 'robert',
  'bobby': 'robert',
  'joe': 'joseph',
  'joey': 'joseph',
  'tom': 'thomas',
  'bill': 'william',
  'billy': 'william',
  'will': 'william',
  'willy': 'william',
  'dan': 'daniel',
  'danny': 'daniel',
  'dave': 'david',
  'davey': 'david',
  'jim': 'james',
  'jimmy': 'james',
  'jamie': 'james',
  'chris': 'christopher',
  'tony': 'anthony',
  'nick': 'nicholas',
  'nicky': 'nicholas',
  'rick': 'richard',
  'ricky': 'richard',
  'dick': 'richard',
  'rich': 'richard',
  'ed': 'edward',
  'eddie': 'edward',
  'ted': 'theodore',
  'teddy': 'theodore',
  'alex': 'alexander',
  'zach': 'zachary',
  'zack': 'zachary',
  'jake': 'jacob',
  'josh': 'joshua',
  'ben': 'benjamin',
  'benny': 'benjamin',
  'sam': 'samuel',
  'sammy': 'samuel',
  'charlie': 'charles',
  'chuck': 'charles',
  'steve': 'steven',
  'stevie': 'steven',
  'jon': 'jonathan',
  'jonny': 'jonathan',
  'johnny': 'john',
  'jack': 'john',
  'pete': 'peter',
  'andy': 'andrew',
  'drew': 'andrew',
  'ken': 'kenneth',
  'kenny': 'kenneth',
  'greg': 'gregory',
  'larry': 'lawrence',
  'jerry': 'gerald',
  'jeff': 'jeffrey',
  'geoff': 'geoffrey',
  'ray': 'raymond',
  'ron': 'ronald',
  'ronny': 'ronald',
  'don': 'donald',
  'donny': 'donald',
  'fred': 'frederick',
  'freddy': 'frederick',
  'frankie': 'francisco',
  'frank': 'francis',
  'manny': 'manuel',
  'hank': 'henry',
  'harry': 'harold',
  'wil': 'william',
  'pat': 'patrick',
  'paddy': 'patrick',
  'tj': 'timothy',
  'cj': 'charles',
  'jt': 'justin',
  'jp': 'john',
  'aj': 'anthony',
  'jd': 'john',
}

/**
 * Expand nicknames to full names for better matching
 */
function expandNickname(firstName: string): string {
  const lower = firstName.toLowerCase()
  return NICKNAMES[lower] || lower
}

/**
 * Normalize player names for fuzzy matching across data sources
 */
export function normalize(name: string): string {
  let normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accent marks (é→e, ü→u, etc.)
    .toLowerCase()
    .trim()
    .replace(/\./g, '')
    .replace(/'/g, '')
    .replace(/'/g, '')
    .replace(/-/g, ' ')
    .replace(/ jr$/i, '')
    .replace(/ sr$/i, '')
    .replace(/ ii$/i, '')
    .replace(/ iii$/i, '')
    .replace(/ iv$/i, '')
    .replace(/\s+/g, ' ')

  const parts = normalized.split(' ')

  // Fantrax splits two-way players into "-H"/"-P" rows (Shohei Ohtani-H);
  // the hyphen became a space above, so drop the dangling h/p token to match
  // the base name used by every other source
  if (parts.length >= 3 && (parts[parts.length - 1] === 'h' || parts[parts.length - 1] === 'p')) {
    parts.pop()
  }

  // Try to expand nickname in first name
  if (parts.length >= 2) {
    parts[0] = expandNickname(parts[0])
  }
  normalized = parts.join(' ')

  return normalized
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity score between two names (0-1, 1 = exact match)
 */
export function similarity(a: string, b: string): number {
  const normalizedA = normalize(a)
  const normalizedB = normalize(b)

  if (normalizedA === normalizedB) return 1

  const maxLen = Math.max(normalizedA.length, normalizedB.length)
  if (maxLen === 0) return 1

  const distance = levenshtein(normalizedA, normalizedB)
  return 1 - distance / maxLen
}

/**
 * Find best matches for a name in a list of candidates
 */
export function findBestMatches(
  name: string,
  candidates: { name: string; normalizedName: string }[],
  threshold = 0.7,
  maxResults = 5
): { name: string; normalizedName: string; score: number }[] {
  const normalizedName = normalize(name)

  const scored = candidates
    .map(candidate => ({
      ...candidate,
      score: similarity(normalizedName, candidate.normalizedName)
    }))
    .filter(c => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)

  return scored
}
