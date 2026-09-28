// Import first in scripts: loads the same env files as Next (.env.local wins
// over .env) before any module that reads process.env is evaluated.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
