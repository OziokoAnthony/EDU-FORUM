// Copies .env.example to backend/.env and frontend/.env.local, never overwriting existing files.
import { copyFileSync, existsSync } from 'node:fs';

for (const target of ['backend/.env', 'frontend/.env.local']) {
  if (existsSync(target)) {
    console.log(`skip ${target} (already exists)`);
  } else {
    copyFileSync('.env.example', target);
    console.log(`created ${target}`);
  }
}
