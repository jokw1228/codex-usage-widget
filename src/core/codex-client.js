const { EventEmitter } = require("events");
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

class CodexRpcClient extends EventEmitter {
  constructor({ version, command = resolveCodexCommand(), spawnProcess = spawn }) {
    super();
    this.version = version;
    this.initializing = null;
    this.failure = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.ready = false;
    this.child = spawnProcess(command, ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: isShellScript(command),
      windowsHide: true
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => this.onStderr(chunk));
    this.child.on("error", (error) => this.onExit(error));
    this.child.stdin.on("error", (error) => this.onExit(error));
    this.child.on("exit", () => this.onExit(new Error("Codex app-server exited")));
  }

  async initialize() {
    if (this.ready) return;

    if (this.initializing) return this.initializing;

    this.initializing = this.request("initialize", {
      clientInfo: {
        name: "codex-usage-widget",
        title: "Codex Usage Widget",
        version: this.version
      },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: []
      }
    }).then(() => {
      this.ready = true;
    }).finally(() => {
      this.initializing = null;
    });

    return this.initializing;
  }

  async getRateLimits() {
    await this.initialize();
    return this.request("account/rateLimits/read", null);
  }

  request(method, params) {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settle(id, new Error(`${method} timed out`));
      }, 12_000);
      this.pending.set(id, { resolve, reject, timer });

      try {
        this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
          if (error) this.settle(id, error);
        });
      } catch (error) {
        this.settle(id, error);
      }
    });
  }

  settle(id, error, result) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (error) pending.reject(error);
    else pending.resolve(result);
  }

  onStdout(chunk) {
    this.buffer += chunk;

    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) break;

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(message, "id")) {
        this.onNotification(message);
        continue;
      }

      this.settle(
        message.id,
        message.error ? new Error(message.error.message || "Codex app-server error") : null,
        message.result
      );
    }
  }

  onStderr(chunk) {
    const text = chunk.trim();
    if (text) this.emit("diagnostic", text);
  }

  onNotification(message) {
    if (message.method === "account/rateLimits/updated") {
      this.emit("rate-limits", message.params);
    }
  }

  onExit(error) {
    if (this.failure) return;
    this.failure = error;
    this.ready = false;
    for (const id of this.pending.keys()) this.settle(id, error);
    this.emit("close");
  }

  dispose() {
    this.onExit(new Error("Codex app-server stopped"));
    if (!this.child.killed) this.child.kill();
  }
}

function resolveCodexCommand() {
  const explicitPath = process.env.CODEX_CLI_PATH;
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const candidates = [];

  try {
    const output = execFileSync("where.exe", ["codex"], {
      encoding: "utf8",
      windowsHide: true
    });
    candidates.push(...output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  } catch {
    // Fall through to common install paths.
  }

  const home = process.env.USERPROFILE;
  if (home) {
    candidates.push(path.join(home, "bin", "codex.exe"));
    candidates.push(path.join(home, "bin", "codex.cmd"));
  }

  const localAppData = process.env.LOCALAPPDATA;
  const codexBinRoot = localAppData && path.join(localAppData, "OpenAI", "Codex", "bin");
  if (codexBinRoot && fs.existsSync(codexBinRoot)) {
    for (const entry of fs.readdirSync(codexBinRoot)) {
      candidates.push(path.join(codexBinRoot, entry, "codex.exe"));
    }
  }

  const existing = candidates.filter((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });

  const exe = existing.find((candidate) => candidate.toLowerCase().endsWith(".exe"));
  if (exe) return exe;

  if (existing[0]) return existing[0];

  throw new Error("Codex CLI를 찾을 수 없습니다.");
}

function isShellScript(command) {
  return /\.(cmd|bat)$/i.test(command);
}


module.exports = { CodexRpcClient };
