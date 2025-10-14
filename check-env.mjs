import 'dotenv/config';
import fs from 'fs';

const p = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
console.log('GOOGLE_SERVICE_ACCOUNT_FILE =', p || '(unset)');

if (!p) process.exit(1);

const exists = fs.existsSync(p);
console.log('Exists =', exists);

if (!exists) process.exit(1);

const raw = fs.readFileSync(p, 'utf8');
let j;
try {
  j = JSON.parse(raw);
} catch (e) {
  console.error('key.json is not valid JSON:', e.message);
  process.exit(1);
}

console.log('type =', j.type);
console.log('has_private_key =', !!j.private_key);
console.log('client_email =', j.client_email);
