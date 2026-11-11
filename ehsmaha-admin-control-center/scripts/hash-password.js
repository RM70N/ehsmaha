// يولّد مشتق Argon2id لكلمة مرور حتى تضعه في OWNER_PASSWORD_HASH / ADMIN_PASSWORD_HASH.
// الاستخدام:  node scripts/hash-password.js   (يسأل عن كلمة المرور بلا إظهار)   أو:  echo -n "كلمة" | node scripts/hash-password.js -
import readline from 'node:readline';
import { hashPassword } from '../server/auth/accounts.js';

async function readSecret() {
  if (process.argv[2] === '-') { let d = ''; for await (const c of process.stdin) d += c; return d.replace(/\r?\n$/, ''); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {}; // بلا إظهار
  process.stdout.write('كلمة المرور: ');
  return new Promise((res) => rl.question('', (a) => { rl.close(); process.stdout.write('\n'); res(a); }));
}
const pw = await readSecret();
if (pw.length < 8) { console.error('كلمة المرور قصيرة (8 أحرف على الأقل)'); process.exit(1); }
console.log(await hashPassword(pw));
