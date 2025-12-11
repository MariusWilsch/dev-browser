import { serve } from "@/index.js";
import type { ServeOptions } from "@/types.js";
import { execSync } from "child_process";
import { mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname, "..", "tmp");
const profileDir = join(__dirname, "..", "profiles");

const HELP_TEXT = `
dev-browser server

Options:
  --headless          Run browser in headless mode
  --no-headless       Run browser in headed mode (default)
  --port <number>     HTTP API port (default: 9222)
  --cdp-port <number> CDP debugging port (default: 9223)
  --help             Show this help message

Environment Variables:
  DEV_BROWSER_HEADLESS=true   Run in headless mode
`;

// Parse CLI arguments and environment variables
function parseConfig(): Partial<ServeOptions> {
  const args = process.argv.slice(2);
  const config: Partial<ServeOptions> = {};

  // Environment variable support
  if (process.env.DEV_BROWSER_HEADLESS) {
    config.headless = process.env.DEV_BROWSER_HEADLESS.toLowerCase() === "true";
  }

  // CLI arguments (override env vars)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--headless") {
      config.headless = true;
    } else if (args[i] === "--no-headless") {
      config.headless = false;
    } else if (args[i] === "--port") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --port requires a value");
        process.exit(1);
      }
      config.port = parseInt(value, 10);
    } else if (args[i] === "--cdp-port") {
      const value = args[++i];
      if (value === undefined) {
        console.error("Error: --cdp-port requires a value");
        process.exit(1);
      }
      config.cdpPort = parseInt(value, 10);
    } else if (args[i] === "--help") {
      console.log(HELP_TEXT);
      process.exit(0);
    }
  }

  return config;
}

// Create tmp and profile directories if they don't exist
console.log("Creating tmp directory...");
mkdirSync(tmpDir, { recursive: true });
console.log("Creating profiles directory...");
mkdirSync(profileDir, { recursive: true });

// Install Playwright browsers if not already installed
console.log("Checking Playwright browser installation...");

function findPackageManager(): { name: string; command: string } | null {
  const managers = [
    { name: "bun", command: "bunx playwright install chromium" },
    { name: "pnpm", command: "pnpm exec playwright install chromium" },
    { name: "npm", command: "npx playwright install chromium" },
  ];

  for (const manager of managers) {
    try {
      execSync(`which ${manager.name}`, { stdio: "ignore" });
      return manager;
    } catch {
      // Package manager not found, try next
    }
  }
  return null;
}

function isChromiumInstalled(): boolean {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const playwrightCacheDir = join(homeDir, ".cache", "ms-playwright");

  if (!existsSync(playwrightCacheDir)) {
    return false;
  }

  // Check for chromium directories (e.g., chromium-1148, chromium_headless_shell-1148)
  try {
    const entries = readdirSync(playwrightCacheDir);
    return entries.some((entry) => entry.startsWith("chromium"));
  } catch {
    return false;
  }
}

try {
  if (!isChromiumInstalled()) {
    console.log("Playwright Chromium not found. Installing (this may take a minute)...");

    const pm = findPackageManager();
    if (!pm) {
      throw new Error("No package manager found (tried bun, pnpm, npm)");
    }

    console.log(`Using ${pm.name} to install Playwright...`);
    execSync(pm.command, { stdio: "inherit" });
    console.log("Chromium installed successfully.");
  } else {
    console.log("Playwright Chromium already installed.");
  }
} catch (error) {
  console.error("Failed to install Playwright browsers:", error);
  console.log("You may need to run: npx playwright install chromium");
}

// Kill any existing process on port 9222 (HTTP API) and 9223 (CDP)
console.log("Checking for existing servers...");
try {
  // Find and kill processes on our ports
  const ports = [9222, 9223];
  for (const port of ports) {
    try {
      const pid = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
      if (pid) {
        console.log(`Killing existing process on port ${port} (PID: ${pid})`);
        execSync(`kill -9 ${pid}`);
      }
    } catch {
      // No process on this port, which is fine
    }
  }
} catch {
  // lsof not available or no processes found
}

console.log("Starting dev browser server...");
const config = parseConfig();
const server = await serve({
  port: config.port ?? 9222,
  headless: config.headless ?? false,
  cdpPort: config.cdpPort ?? 9223,
  profileDir,
});

console.log(`Dev browser server started`);
console.log(`  Mode: ${(config.headless ?? false) ? "headless" : "headed"}`);
console.log(`  WebSocket: ${server.wsEndpoint}`);
console.log(`  Tmp directory: ${tmpDir}`);
console.log(`  Profile directory: ${profileDir}`);
console.log(`\nReady`);
console.log(`\nPress Ctrl+C to stop`);

// Keep the process running
await new Promise(() => {});
