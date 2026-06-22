const fs = require('fs');
const path = require('path');

// Get all lines with hardcoded Spanish error strings
const execSync = require('child_process').execSync;

try {
  const output = execSync('grep -rn "error:.*[áéíóúñü]" lib/actions/ app/api/ --include="*.ts" --include="*.tsx" 2>/dev/null || true').toString();
  const lines = output.trim().split('\n').filter(l => l);
  
  // Parse and format
  const results = lines.map(line => {
    const match = line.match(/^([^:]+):(\d+):\s*return\s*{\s*error:\s*([^,}]+)/);
    if (match) {
      const [, filePath, lineNum, errorMsg] = match;
      const cleanFile = filePath.replace(/\/g, '/').replace(/^.*dashboard\//, '');
      return `${cleanFile}:${lineNum}: ${errorMsg.slice(0, 50)}...`;
    }
    return null;
  }).filter(Boolean);
  
  console.log('=== HARDCODED USER-FACING STRINGS (Spanish) ===\n');
  results.slice(0, 50).forEach(r => console.log(r));
  if (results.length > 50) console.log(`\n... and ${results.length - 50} more hardcoded strings`);
  console.log(`\nTOTAL: ${results.length} hardcoded non-English strings found`);
} catch(e) {
  console.error('Error:', e.message);
}
