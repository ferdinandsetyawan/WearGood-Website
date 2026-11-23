const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');
const regex = /['"](\/(?:assets|uploads)\/[^'"]+)['"]/g;
const paths = new Set();
let match;
while ((match = regex.exec(html)) !== null) paths.add(match[1]);
while ((match = regex.exec(js)) !== null) paths.add(match[1]);

console.log('Referenced asset paths:');
for (const p of paths) {
  // check if exists in public or database
  let clean = p.split('?')[0];
  let localFile = path.join(__dirname, '..', 'public', clean);
  let localDbFile = path.join(__dirname, '..', 'database', clean);
  let exists = fs.existsSync(localFile) || fs.existsSync(localDbFile);
  console.log(`  ${p} -> ${exists ? 'EXISTS' : 'MISSING!'}`);
}
