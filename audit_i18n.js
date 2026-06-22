const fs = require('fs');
const path = require('path');

// Load all translation files
const basePath = './messages';
const locales = ['en', 'es', 'pt', 'fr', 'it'];
const translations = {};

locales.forEach(locale => {
  const filePath = path.join(basePath, `${locale}.json`);
  try {
    translations[locale] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error loading ${locale}.json:`, e.message);
  }
});

// Flatten nested keys
function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Get all keys per locale
const keysByLocale = {};
locales.forEach(locale => {
  keysByLocale[locale] = new Set(flattenKeys(translations[locale]));
});

// Find key parity issues
console.log('=== KEY PARITY ANALYSIS ===\n');

const enKeys = keysByLocale['en'];
const allLocaleKeys = new Set([...keysByLocale['en'], ...keysByLocale['es'], ...keysByLocale['pt'], ...keysByLocale['fr'], ...keysByLocale['it']]);

let parityIssues = false;
locales.forEach(locale => {
  const missing = Array.from(allLocaleKeys).filter(k => !keysByLocale[locale].has(k));
  const extra = Array.from(keysByLocale[locale]).filter(k => !enKeys.has(k));
  
  if (missing.length > 0 || extra.length > 0) {
    parityIssues = true;
    console.log(`\n${locale.toUpperCase()}:`);
    if (missing.length > 0) {
      console.log(`  Missing keys (${missing.length}): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
    }
    if (extra.length > 0) {
      console.log(`  Extra keys (${extra.length}): ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '...' : ''}`);
    }
  }
});

if (!parityIssues) {
  console.log('All locales have matching keys - PASS');
}

// Find untranslated content (identical to EN)
console.log('\n=== UNTRANSLATED CONTENT ===\n');

function getNestedValue(obj, key) {
  return key.split('.').reduce((current, k) => current?.[k], obj);
}

const brandNames = ['BolivAI', 'BOLIV', 'CCAVAI', 'AIMA', 'WhatsApp', 'Instagram', 'Messenger', 'LinkedIn', 'Facebook', 'X', 'E.164', 'Stripe', 'ElevenLabs', 'Rebecca', 'Sandra', 'VIRA'];
const languageEndonyms = ['Español', 'English', 'Português', 'Français', 'Italiano'];

locales.slice(1).forEach(locale => {
  const untranslated = [];
  enKeys.forEach(key => {
    const enVal = getNestedValue(translations['en'], key);
    const localeVal = getNestedValue(translations[locale], key);
    
    if (enVal === localeVal && typeof enVal === 'string') {
      const isBrand = brandNames.some(name => enVal.includes(name));
      const isEndonym = languageEndonyms.includes(enVal);
      const isCode = /^[A-Z_]+$/.test(enVal) || enVal.startsWith('{');
      
      if (!isBrand && !isEndonym && !isCode && enVal.length > 2) {
        untranslated.push({key, val: enVal});
      }
    }
  });
  
  if (untranslated.length > 0) {
    console.log(`\n${locale.toUpperCase()} (${untranslated.length} suspect):`);
    untranslated.slice(0, 10).forEach(({key, val}) => {
      console.log(`  - ${key}: "${val}"`);
    });
    if (untranslated.length > 10) {
      console.log(`  ... and ${untranslated.length - 10} more`);
    }
  }
});

console.log('\n=== KEY COUNTS ===');
locales.forEach(locale => {
  console.log(`${locale.toUpperCase()}: ${keysByLocale[locale].size} keys`);
});
