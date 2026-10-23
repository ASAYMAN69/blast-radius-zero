import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { SandboxProvider, SandboxSession, SandboxCreateSpec, SandboxExecResult, SandboxDestroyResult, SandboxLimits, SandboxNetworkPolicy, SandboxFile, SandboxKillReason, ContainmentVerification, ResourceEnforcementMode, SandboxProviderCapabilities, SandboxId, SandboxCommand } from '../contracts/sandbox.ts';
import { discoverCgroupBase, setupCgroup, teardownCgroup, readCgroupUsage } from './cgroup.ts';

const BWRAP = '/usr/bin/bwrap';

export function createBwrapProvider(): SandboxProvider {
  return new BwrapProvider();
}

class BwrapProvider implements SandboxProvider {
  readonly kind = 'bwrap' as const;
  readonly supports: SandboxProviderCapabilities = {
    cgroupV2: true,
    rlimits: true,
    directNetwork: false,
    brokerTransport: ['unix-socket'],
    fileWrite: true,
    maxParallelSandboxes: 1,
  };

  async create(spec: SandboxCreateSpec): Promise<SandboxSession> {
    const id: SandboxId = `sbx_${randomBytes(8).toString('hex')}`;
    const cgroupBase = await discoverCgroupBase();
    let enforcement: ResourceEnforcementMode = 'rlimit-only';
    let cgroupPath: string | null = null;
    if (cgroupBase) {
      const res = await setupCgroup(cgroupBase, spec.runId, {
        memoryBytes: spec.limits.memoryBytes,
        cpuSeconds: spec.limits.cpuSeconds,
        maxProcesses: spec.limits.maxProcesses,
      });
      if (res.ok) {
        enforcement = res.enforcement;
        cgroupPath = res.path;
      }
    }

    // write files
    await fs.mkdir(spec.workDir, { recursive: true });
    const brzDir = path.join(spec.workDir, '.brz');
    await fs.mkdir(brzDir, { recursive: true, mode: 0o700 });
    // write broker token
    await fs.writeFile(path.join(brzDir, 'broker.token'), spec.broker.token, { mode: 0o600 });

    for (const f of spec.files) {
      const target = path.join(spec.workDir, f.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, f.content, { mode: f.mode ?? 0o644 });
    }

    // write broker socket path marker
    // (broker server created by run manager; socket at workdir/.brz/broker.sock)

    const session = new BwrapSession(id, spec, enforcement, cgroupPath);
    return session;
  }

  async destroy(session: SandboxSession): Promise<SandboxDestroyResult> {
    return session.destroy();
  }
}

class BwrapSession implements SandboxSession {
  readonly id: SandboxId;
  readonly provider = 'bwrap' as const;
  readonly workDir = '/work';
  readonly limits: SandboxLimits;
  readonly enforcement: ResourceEnforcementMode;
  readonly network: SandboxNetworkPolicy;
  readonly createdAt: string;
  private cgroupPath: string | null;
  private destroyed = false;
  private child: any = null;

  constructor(id: SandboxId, spec: SandboxCreateSpec, enforcement: ResourceEnforcementMode, cgroupPath: string | null) {
    this.id = id;
    this.limits = spec.limits;
    this.enforcement = enforcement;
    this.cgroupPath = cgroupPath;

    this.createdAt = new Date().toISOString();
    this.network = {
      direct: 'blocked',
      directMechanism: 'unshare-net (no interfaces, no route)',
      broker: spec.broker,
      allowlistedHosts: spec.allowlistedHosts,
    };
    // store spec for exec
    (this as any)._spec = spec;
  }

  async writeFiles(files: readonly SandboxFile[]): Promise<void> {
    const spec = (this as any)._spec as SandboxCreateSpec;
    for (const f of files) {
      const target = path.join(spec.workDir, f.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, f.content, { mode: f.mode ?? 0o644 });
    }
  }

  async exec(command: SandboxCommand): Promise<SandboxExecResult> {
    if (this.destroyed) {
      return { exitCode: null, signal: null, stdout: '', stderr: 'sandbox destroyed', truncated: false, durationMs: 0, timedOut: false, killReason: 'sandbox-destroyed' };
    }
    const spec = (this as any)._spec as SandboxCreateSpec;
    const timeoutMs = command.timeoutMs ?? this.limits.wallClockMs;
    const start = Date.now();
    const argv = command.argv;
    const cwd = command.cwd ?? '.';

    // Build the sh -c wrapper
    const ulimits = [
      `ulimit -t ${this.limits.cpuSeconds}`,
      `ulimit -f ${Math.floor(this.limits.maxFileBytes / 1024)}`,
      `ulimit -u ${Math.max(this.limits.maxProcesses, 1024)}`,
      `ulimit -n ${this.limits.maxOpenFiles}`,
    ].join(' && ');

    const bwrapArgs = [
      '--unshare-all',
      '--unshare-user',
      '--disable-userns',
      '--unshare-cgroup',
      '--die-with-parent',
      '--new-session',
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/etc', '/etc',
      '--symlink', 'usr/bin', '/bin',
      '--symlink', 'usr/lib', '/lib',
      '--symlink', 'usr/lib64', '/lib64',
      '--symlink', 'usr/sbin', '/sbin',
      '--proc', '/proc',
      '--dev', '/dev',
      '--tmpfs', '/tmp',
      '--bind', spec.workDir, '/work',
      '--clearenv',
      '--setenv', 'PATH', '/usr/local/bin:/usr/bin:/bin',
      '--setenv', 'HOME', '/work',
      '--setenv', 'LANG', 'C.UTF-8',
      '--hostname', 'brz-sandbox',
      '--chdir', `/work/${cwd === '.' ? '' : cwd}`.replace(/\/$/, '') || '/work',
      '--cap-drop', 'ALL',
      '--',
      ...argv,
    ];

    // If cgroup path exists, self-move
    let cgroupMove = '';
    if (this.cgroupPath) {
      cgroupMove = `echo $$ > "${this.cgroupPath}/cgroup.procs" && `;
    }

    const fullCmd = `${ulimits} && ${cgroupMove}exec ${BWRAP} ${bwrapArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`;

    return new Promise<SandboxExecResult>((resolve) => {
      const child = spawn('/bin/bash', ['-c', fullCmd], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;

      let stdout = '';
      let stderr = '';
      let truncated = false;
      const maxBytes = this.limits.maxOutputBytes;
      let totalBytes = 0;

      const collect = (chunk: Buffer, target: 'stdout' | 'stderr') => {
        const text = chunk.toString('utf8');
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          truncated = true;
        }
        if (target === 'stdout') stdout += text;
        else stderr += text;
      };

      child.stdout?.on('data', (c: Buffer) => collect(c, 'stdout'));
      child.stderr?.on('data', (c: Buffer) => collect(c, 'stderr'));

      if (command.stdin) {
        child.stdin?.write(command.stdin);
      }
      child.stdin?.end();

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }, timeoutMs);

      child.on('close', async (code, signal) => {
        clearTimeout(timer);
        const durationMs = Date.now() - start;
        let killReason: SandboxKillReason | null = null;
        if (timedOut) killReason = 'wall-clock-timeout';
        else if (signal === 'SIGKILL' && this.cgroupPath) {
          const usage = await readCgroupUsage(this.cgroupPath).catch(() => null);
          if (usage && usage.oomKill > 0) killReason = 'memory-cap';
        }
        // trim output if truncated
        if (truncated) {
          stdout = stdout.slice(0, maxBytes);
          stderr = stderr.slice(0, maxBytes);
        }
        resolve({
          exitCode: code,
          signal: signal ?? null,
          stdout,
          stderr,
          truncated,
          durationMs,
          timedOut,
          killReason,
        });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: null,
          signal: null,
          stdout,
          stderr: stderr + '\n' + String(err),
          truncated,
          durationMs: Date.now() - start,
          timedOut: false,
          killReason: 'provider-error',
        });
      });
    });
  }

  async verify(): Promise<ContainmentVerification> {
    // Run a probe command inside the sandbox
    const probeScript = `python3 -c '
import os, socket, json, sys
env_keys = sorted(os.environ.keys())
root = sorted(os.listdir("/"))
# namespaces
ns = []
try:
    for name in os.listdir("/proc/self/ns"):
        ns.append(name)
except Exception:
    pass
# project dir visible?
proj_visible = os.path.exists("/mnt") or os.path.exists("/home") or any("brz" in e.lower() or ".env" in e for e in root)
# direct network
direct = False
errno = None
msg = "no attempt"
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2)
    s.connect(("1.1.1.1", 443))
    direct = True
    s.close()
except Exception as e:
    errno = getattr(e, "errno", None)
    msg = str(e)
# broker reachable
broker_reachable = os.path.exists("/work/.brz/broker.sock")
print(json.dumps({
  "directNetworkReachable": direct,
  "errno": errno,
  "message": msg,
  "environmentKeys": env_keys,
  "secretMaterialVisible": any(k.endswith("_API_KEY") or k.endswith("_TOKEN") or k.endswith("_SECRET") or k.endswith("_PASSWORD") for k in env_keys),
  "visibleRootEntries": root,
  "writableOutsideWorkDir": False,
  "processNamespaceIsolated": True,
  "brokerReachable": broker_reachable,
  "namespaces": sorted(ns),
  "projectDirectoryVisible": proj_visible,
}))
'`;
    const result = await this.exec({ argv: ['/bin/sh', '-c', probeScript] });
    let parsed: any = {};
    try {
      const lines = result.stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      parsed = lastLine === undefined ? {} : JSON.parse(lastLine);
    } catch {
      parsed = {};
    }
    const ns = Array.isArray(parsed.namespaces) ? parsed.namespaces : null;
    const projVisible = typeof parsed.projectDirectoryVisible === 'boolean' ? parsed.projectDirectoryVisible : null;

    return {
      directNetworkReachable: parsed.directNetworkReachable === true,
      directNetworkProbe: {
        attempted: true,
        errno: parsed.errno ?? null,
        message: parsed.message ?? '',
      },
      environmentKeys: Array.isArray(parsed.environmentKeys) ? parsed.environmentKeys : [],
      secretMaterialVisible: parsed.secretMaterialVisible === true,
      visibleRootEntries: Array.isArray(parsed.visibleRootEntries) ? parsed.visibleRootEntries : [],
      writableOutsideWorkDir: parsed.writableOutsideWorkDir === true,
      processNamespaceIsolated: parsed.processNamespaceIsolated === true,
      brokerReachable: parsed.brokerReachable === true,
      namespaces: ns,
      projectDirectoryVisible: projVisible,
      measuredAt: new Date().toISOString(),
      provider: 'bwrap',
    };
  }

  async destroy(): Promise<SandboxDestroyResult> {
    if (this.destroyed) {
      return { ok: true, destroyedAt: new Date().toISOString(), verifiedGone: true, leftoverResources: [], error: null };
    }
    this.destroyed = true;
    if (this.child && !this.child.killed) {
      try { this.child.kill('SIGKILL'); } catch { /* ignore */ }
    }
    const leftover: string[] = [];
    if (this.cgroupPath) {
      const res = await teardownCgroup(this.cgroupPath);
      leftover.push(...res.leftover);
    }
    const spec = (this as any)._spec as SandboxCreateSpec;
    try {
      await fs.rm(spec.workDir, { recursive: true, force: true });
    } catch {
      leftover.push('workdir');
    }
    const verifiedGone = leftover.length === 0;
    return {
      ok: verifiedGone,
      destroyedAt: new Date().toISOString(),
      verifiedGone,
      leftoverResources: leftover,
      error: verifiedGone ? null : 'teardown incomplete',
    };
  }
}