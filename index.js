import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 调试日志。用用户主目录拼出来，不写死任何一台机器的绝对路径，
 * 换台电脑也能正常落盘。可用 DSH_VISION_ALL_LOG 覆盖，
 * 置为 "off" 则完全不写文件。
 */
function resolveLogPath() {
  const override = process.env.DSH_VISION_ALL_LOG;
  if (override === "off") return undefined;
  if (typeof override === "string" && override !== "") return path.resolve(override);
  const base =
    process.env.LOCALAPPDATA ??
    process.env.XDG_STATE_HOME ??
    path.join(os.homedir(), ".local", "state");
  return path.join(base, "dsh-vision-all", "debug.log");
}

const LOG = resolveLogPath();

function log(line) {
  if (LOG === undefined) return;
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, new Date().toISOString() + " " + line + "\n");
  } catch {}
}

const inject = [];

function patchProviders(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const providers = config.providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) return config;

  let touched = 0;
  for (const [id, p] of Object.entries(providers)) {
    if (!p || typeof p !== "object" || Array.isArray(p)) continue;
    const looksLikeProfile = "models" in p || "baseURL" in p || "apiKeyEnv" in p || "api" in p;
    if (!looksLikeProfile) continue;

    const cur = p.defaultInput;
    if (Array.isArray(cur)) {
      if (!cur.includes("image")) {
        const next = Array.from(new Set([...cur, "image"]));
        if (!next.includes("text")) next.unshift("text");
        p.defaultInput = next;
        touched++;
      }
    } else {
      p.defaultInput = ["text", "image"];
      touched++;
    }
    log("provider " + id + " defaultInput=" + JSON.stringify(p.defaultInput));
  }
  if (touched) log("patched " + touched + " providers");
  return config;
}

export function apply(ctx, rawConfig) {
  log("APPLY ran");
  try {
    // 关闭开关：在 profile 的 cordis.patch.yml 里给这一行加 config.enabled: false，
    // 不必从 bundles 里删包名就能关掉。
    if (rawConfig?.enabled === false) {
      log("disabled by config; nothing registered");
      return;
    }
    // cordis waterfall listeners receive (config, next): the fiber arrives as `this`,
    // not as an argument. Declaring (fiber, config, next) makes `next` undefined and
    // throws for every plugin whose config is resolved, failing the whole startup.
    ctx.on(
      "internal/config",
      function (config, next) {
        let id = "?";
        try {
          id = this?.options?.id ?? "?";
        } catch {}
        const out = typeof next === "function" ? next() : config;
        const hasProviders = !!(out && typeof out === "object" && "providers" in out);
        log("internal/config id=" + id + " hasProviders=" + hasProviders);
        if (!hasProviders) return out;
        try {
          return patchProviders(out);
        } catch (e) {
          log("patch err " + e.message);
          return out;
        }
      },
      { global: true },
    );
    log("hook registered");
  } catch (e) {
    log("register failed " + e.message);
  }
}

export { inject };
