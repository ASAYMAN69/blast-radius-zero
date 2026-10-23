import { promises as fs } from 'node:fs';
import path from 'node:path';

/** The cgroup v2 base path for a run. */
export interface CgroupPaths {
  readonly base: string;
  readonly runCgroup: string;
}

/** Discover the nearest writable domain cgroup ancestor. */
export async function discoverCgroupBase(): Promise<string | null> {
  let cur = '';
  try {
    const cgroup = await fs.readFile('/proc/self/cgroup', 'utf8');
    const lines = cgroup.trim().split('\n');
    // unified hierarchy line: "0::/path"
    const unified = lines.find((l) => l.startsWith('0::')) ?? lines[0];
    const relPath = unified ? unified.split(':')[2] ?? '' : '';
    cur = path.join('/sys/fs/cgroup', relPath);
  } catch {
    return null;
  }

  // Walk upward
  const root = '/sys/fs/cgroup';
  const candidates: string[] = [];
  let p = cur;
  while (p !== root && p.startsWith(root)) {
    candidates.push(p);
    p = path.dirname(p);
  }
  candidates.push(root);

  for (const cand of candidates) {
    try {
      await fs.access(cand, fs.constants.W_OK);
      const type = (await fs.readFile(path.join(cand, 'cgroup.type'), 'utf8')).trim();
      if (type !== 'domain') continue;
      const controllers = (await fs.readFile(path.join(cand, 'cgroup.controllers'), 'utf8')).trim().split(/\s+/);
      if (!controllers.includes('memory') || !controllers.includes('cpu') || !controllers.includes('pids')) continue;
      // The candidate must have the controllers enabled for its CHILDREN, otherwise
      // a child cgroup cannot use them. The leaf scope has an empty subtree_control.
      let subtree: string[] = [];
      try {
        subtree = (await fs.readFile(path.join(cand, 'cgroup.subtree_control'), 'utf8')).trim().split(/\s+/).filter(Boolean);
      } catch { subtree = []; }
      if (!subtree.includes('memory') || !subtree.includes('cpu') || !subtree.includes('pids')) continue;
      return cand;
    } catch {
      continue;
    }
  }
  return null;
}

export async function setupCgroup(base: string, runId: string, limits: { memoryBytes: number; cpuSeconds: number; maxProcesses: number }): Promise<{ ok: boolean; path: string; enforcement: 'cgroup+rlimit' | 'rlimit-only' }> {
  const runPath = path.join(base, `brz-${runId}`);
  try {
    await fs.mkdir(runPath);
    await fs.writeFile(path.join(runPath, 'memory.max'), String(limits.memoryBytes));
    await fs.writeFile(path.join(runPath, 'memory.swap.max'), '0');
    // cpu.max: quota period. Use 100000 period, quota = cpuSeconds? Actually cpuSeconds is total; use quota based on 1 cpu = 100000
    const quota = limits.cpuSeconds > 0 ? String(limits.cpuSeconds * 100000) : 'max';
    await fs.writeFile(path.join(runPath, 'cpu.max'), `${quota} 100000`);
    await fs.writeFile(path.join(runPath, 'pids.max'), String(limits.maxProcesses));
    return { ok: true, path: runPath, enforcement: 'cgroup+rlimit' };
  } catch {
    try { await fs.rm(runPath, { recursive: true, force: true }); } catch { /* ignore */ }
    return { ok: false, path: runPath, enforcement: 'rlimit-only' };
  }
}

export async function teardownCgroup(cgroupPath: string): Promise<{ removed: boolean; leftover: string[] }> {
  const leftover: string[] = [];
  try {
    // check procs
    const procs = await fs.readFile(path.join(cgroupPath, 'cgroup.procs'), 'utf8').catch(() => '');
    const pids = procs.trim().split(/\s+/).filter(Boolean);
    if (pids.length > 0) {
      leftover.push(...pids.map((p) => `pid:${p}`));
      return { removed: false, leftover };
    }
    await fs.rmdir(cgroupPath);
    return { removed: true, leftover: [] };
  } catch {
    leftover.push('cgroup');
    return { removed: false, leftover };
  }
}

export async function readCgroupUsage(cgroupPath: string): Promise<{ memoryCurrent: number; memoryPeak: number; cpuUsec: number; pidsCurrent: number; oomKill: number }> {
  const read = async (f: string) => { try { return await fs.readFile(path.join(cgroupPath, f), 'utf8'); } catch { return ''; } };
  const memoryCurrent = parseInt((await read('memory.current')).trim() || '0', 10);
  const memoryPeak = parseInt((await read('memory.peak')).trim() || '0', 10);
  const cpuStat = await read('cpu.stat');
  const cpuUsec = parseInt((cpuStat.match(/usage_usec\s+(\d+)/)?.[1] ?? '0'), 10);
  const pidsCurrent = parseInt((await read('pids.current')).trim() || '0', 10);
  const memEvents = await read('memory.events');
  const oomKill = parseInt((memEvents.match(/oom_kill\s+(\d+)/)?.[1] ?? '0'), 10);
  return { memoryCurrent, memoryPeak, cpuUsec, pidsCurrent, oomKill };
}