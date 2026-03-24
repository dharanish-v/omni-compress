import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const coveragePath = path.join(import.meta.dirname, '../../../packages/omni-compress/coverage/coverage-summary.json');
try {
  const coverageData = JSON.parse(readFileSync(coveragePath, 'utf8'));
  const total = coverageData.total;
  
  // We can use lines, statements, functions, or branches. Usually lines or statements is standard.
  const percentage = total.statements.pct;
  
  let color = 'red';
  if (percentage >= 80) color = 'green';
  else if (percentage >= 60) color = 'yellow';
  else if (percentage >= 40) color = 'orange';

  const badgeData = {
    schemaVersion: 1,
    label: 'coverage',
    message: `${percentage}%`,
    color: color,
  };

  const outPath = path.join(import.meta.dirname, '../public/coverage.json');
  writeFileSync(outPath, JSON.stringify(badgeData, null, 2));
  console.log(`Coverage badge data written to ${outPath}`);
} catch (e) {
  console.error('Failed to generate coverage badge data:', e);
}
