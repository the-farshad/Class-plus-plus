// Bootstrap / admin script: set a password for any email directly.
// Usage:
//   node scripts/set-password.js <email> [<password>]
// If password is omitted, a strong one is generated and printed.
// Use this once after deploy to seed the initial instructor's password,
// or to reset anyone's password from the shell.

import "dotenv/config";
import { setPassword, generateTempPassword } from "../src/auth.js";

const [, , email, providedPassword] = process.argv;
if (!email) {
  console.error("Usage: node scripts/set-password.js <email> [<password>]");
  process.exit(1);
}

const password = providedPassword || generateTempPassword(14);
setPassword(email, password, /* setBy */ "cli", /* mustChange */ 0);

console.log(`Password set for ${email}:`);
console.log(password);
console.log("(Stored as bcrypt hash; the plaintext above is shown ONCE.)");
