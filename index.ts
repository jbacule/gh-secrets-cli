#!/usr/bin/env node

import { SecretManagerCLI } from "./cli.js";

const cli = new SecretManagerCLI();
cli.start().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
