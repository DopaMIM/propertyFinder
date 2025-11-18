// urls.js
// Programmatically build Redfin search URLs from a base template plus remark keywords.

const baseUrl =
  'https://www.redfin.com/zipcode/{ZIP}/filter/property-type=house+multifamily,remarks={TERM},include=forsale+fsbo,status=active';

const zipCodes = ['38104', '38111', '38117', '38109', '38127'];

const terms = [
  'seller financing',
  'owner financing',
  'owner will carry',
  'seller will carry',
  'OWC',
  'contract for deed',

  'wraparound mortgage',
  'wrap mortgage',
  'assumable',
  'assume loan',
  'assume mortgage',
  'subject to',
  'no bank qualifying',
  'no qualifying',
  'easy qualifying',
  'flexible terms',
  'creative financing',
  'carryback',
  'seller carryback',
  'private financing',
  'owner terms',
  'seller terms',
  'motivated',
  'motivated seller',
  'must sell',
  'need to sell',
  'priced to sell' /*,
 // 'make offer',
  'bring all offers',
  'any reasonable offer',
  'all offers considered',
  'submit all offers',
  'relocation',
  'relocating',
  'job transfer',
  'divorce',
  'estate sale',
  'probate',
  'inheritance',
  'inherited',
  'court ordered',
  'bank owned',
  'REO',
  'foreclosure',
  'short sale',
  'pre-foreclosure'


  
  ,
  'rent to own',
  'lease option',
  'lease purchase',
  'as is',
  'as-is',
  'handyman special',
  'investor special',
  'needs work',
  'TLC',
  'fixer',
  'fixer upper',
  'unfin basement',
  'unfinished basement',
  'unpermitted',
  'cash only',
  'cash sale',
  'distressed',
  'value add',
  'development opportunity',
  'tear down',
  'subdividable',
  'sub-dividable',
  'lot split',
  'large lot',
  'oversized lot',
  'corner lot',
  'partially finished',
  'needs updating',
  'outdated',
  'good bones',
  'under market',
  'below market',
  'ADU',
  'granny unit',
  'in-law unit',
  'mother in law',
  'guest house',
  'casita',
  'zoned multifamily',
  'R2',
  'R-2',
  'R3',
  'R-3',
  'R4',
  'R-4',
  'duplex',
  'triplex',
  'fourplex',
  'strong rental history',
  'rental income',
  'tenant in place',
  'leased through',
  'current rent',
  'below market rent',
  'under-rented',
  'rent potential',
  'Airbnb',
  'VRBO',
  'short term rental',
  'STR',
  'vacation rental',
  'furnished rental',
  'mid term rental',
  'travel nurse',
  'student rental',
  'near university',
  'near campus',
  'walking distance to',
  'NNN',
  'triple net',
  'cap rate',
  'NOI',
  'net operating income',
  'long term tenant',
  'anchor tenant',
  'credit tenant',
  'value-add opportunity',
  'underperforming',
  'vacant',
  'high vacancy',
  'owner user',
  'mixed use',
  'foundation issues',
  'structural issues',
  'settling',
  'water intrusion',
  'mold',
  'sinkhole',
  'flood zone',
  'septic issues',
  'failed inspection',
  'historic district',
  'land lease',
  'age-restricted',
  '55+'
  */
];

function encodeTerm(term) {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return null;
  // Use encodeURIComponent to preserve literal '+' etc., then turn spaces into '+' for consistency.
  return encodeURIComponent(normalized).replace(/%20/g, '+');
}

export function buildUrls(customBase = baseUrl, customTerms = terms, customZipCodes = zipCodes) {
  if (!customBase.includes('{TERM}')) {
    throw new Error('base URL must include a {TERM} placeholder');
  }
  const termValues = customTerms.map(encodeTerm).filter(Boolean);
  const zips = customBase.includes('{ZIP}') ? customZipCodes.filter(z => String(z).trim()) : [''];
  const urls = [];
  for (const zip of zips) {
    for (const encodedTerm of termValues) {
      let url = customBase.replace('{TERM}', encodedTerm);
      if (customBase.includes('{ZIP}')) {
        if (!zip) continue;
        url = url.replace('{ZIP}', encodeURIComponent(String(zip).trim()));
      }
      urls.push(url);
    }
  }
  return urls;
}

export const urls = buildUrls();
