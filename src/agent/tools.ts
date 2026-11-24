import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  GeminiClient,
  GeminiFunctionDeclaration,
  ToolExecutionResult,
} from './gemini.js';

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = '/home/antigravity';
const TRADING_AGENTS_DIR = '/home/antigravity/TradingAgents';
const TRADING_AGENTS_BIN = path.join(TRADING_AGENTS_DIR, '.venv/bin/tradingagents');

async function runCli(
  bin: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(bin, args, {
    cwd: options.cwd ?? WORKSPACE_ROOT,
    timeout: options.timeoutMs ?? 30_000,
    maxBuffer: 4 * 1024 * 1024,
    env: options.env ?? process.env,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

function sanitizeTicker(raw: string): string {
  const cleaned = raw.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,18}$/.test(cleaned)) {
    throw new Error(`Invalid stock ticker format: "${raw}"`);
  }
  return cleaned;
}

export async function runTradingAgentsAnalysis(params: {
  ticker: string;
  date?: string;
  analysts?: string;
}): Promise<{
  ticker: string;
  date: string;
  summary: string;
  htmlReportPath: string | null;
}> {
  const ticker = sanitizeTicker(params.ticker);
  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : new Date().toISOString().slice(0, 10);
  const analysts = params.analysts?.trim() || 'market,news,fundamentals';

  // Ensure TradingAgents exists
  await fs.access(TRADING_AGENTS_BIN);

  const { stdout, stderr } = await runCli(
    TRADING_AGENTS_BIN,
    [
      '--ticker',
      ticker,
      '--date',
      date,
      '--analysts',
      analysts,
      '--save',
      '--no-show',
      '--html',
    ],
    {
      cwd: TRADING_AGENTS_DIR,
      timeoutMs: 8 * 60 * 1000, // up to 8 min for multi-agent analysis
    },
  );

  // Locate saved report directory & files
  const reportsDir = path.join(TRADING_AGENTS_DIR, 'results', ticker, date, 'reports');
  let htmlReportPath: string | null = null;
  const candidateHtml = path.join(reportsDir, 'complete_report.html');
  try {
    await fs.access(candidateHtml);
    htmlReportPath = candidateHtml;
  } catch {
    // Also check one level up in case layout differs
    const altHtml = path.join(
      TRADING_AGENTS_DIR,
      'results',
      ticker,
      date,
      'complete_report.html',
    );
    try {
      await fs.access(altHtml);
      htmlReportPath = altHtml;
    } catch {
      htmlReportPath = null;
    }
  }

  let reportExcerpt = '';
  for (const mdName of [
    'final_trade_decision.md',
    'trader_investment_plan.md',
    'investment_plan.md',
  ]) {
    try {
      const content = await fs.readFile(path.join(reportsDir, mdName), 'utf-8');
      if (content.trim()) {
        reportExcerpt += `\n\n### ${mdName}\n${content.slice(0, 3500)}`;
      }
    } catch {
      // Optional report file
    }
  }

  const combined =
    reportExcerpt.trim() ||
    stdout.slice(-3500) ||
    stderr.slice(-1500) ||
    `Analysis for ${ticker} completed.`;

  return {
    ticker,
    date,
    summary: combined.slice(0, 8000),
    htmlReportPath,
  };
}

export const AGENT_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'web_search',
    description:
      'Search real-time web news, stock prices, Thai/US market updates, weather, or any current facts via Google Search.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Search query in Thai or English.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyze_stock',
    description:
      'Run the full Multi-Agent TradingAgents framework on a stock/crypto ticker (e.g. NVDA, AAPL, PTT.BK, BTC-USD) to generate a deep Thai investment report and HTML file.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: {
          type: 'STRING',
          description: 'Yahoo Finance ticker symbol, e.g. NVDA, AAPL, PTT.BK, BTC-USD.',
        },
        analysts: {
          type: 'STRING',
          description:
            'Optional comma-separated analysts: market,news,fundamentals,social (default: market,news,fundamentals).',
        },
        date: {
          type: 'STRING',
          description: 'Optional YYYY-MM-DD analysis date (defaults to today).',
        },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'google_drive',
    description:
      'Inspect the connected Google Drive account (read-only): check auth status, storage quota, recent files, list root files, or search files by name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Read-only Google Drive action to perform.',
          enum: ['status', 'quota', 'recent', 'ls', 'search'],
        },
        query: {
          type: 'STRING',
          description: 'File name search query when action is "search".',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'github_query',
    description:
      'Inspect GitHub via gh CLI (read-only): search repositories, view repo info or README, or list the user repositories.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Read-only GitHub action to perform.',
          enum: ['search_repos', 'repo_view', 'repo_readme', 'my_repos'],
        },
        query: {
          type: 'STRING',
          description:
            'Search query (for search_repos) or owner/repo (for repo_view / repo_readme).',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'workspace_inspect',
    description:
      'List directories or read a text file inside /home/antigravity workspace.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'list or read',
          enum: ['list', 'read'],
        },
        targetPath: {
          type: 'STRING',
          description: 'Relative path under /home/antigravity (e.g. shc08032545/antigravity-telegram-bridge/README.md).',
        },
      },
      required: ['action'],
    },
  },
];

export function createAgentToolExecutor(gemini: GeminiClient) {
  return async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> => {
    if (name === 'web_search') {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('query is required');
      const res = await gemini.groundedWebSearch(query);
      return { result: res };
    }

    if (name === 'analyze_stock') {
      const ticker = String(args.ticker ?? '').trim();
      const analysts =
        typeof args.analysts === 'string' ? args.analysts : undefined;
      const date = typeof args.date === 'string' ? args.date : undefined;
      const analysis = await runTradingAgentsAnalysis({
        ticker,
        analysts,
        date,
      });
      return {
        result: {
          ticker: analysis.ticker,
          date: analysis.date,
          htmlReportAttached: Boolean(analysis.htmlReportPath),
          reportSummary: analysis.summary,
        },
        attachments: analysis.htmlReportPath ? [analysis.htmlReportPath] : [],
      };
    }

    if (name === 'google_drive') {
      const action = String(args.action ?? 'status');
      if (action === 'status') {
        const [auth, quota] = await Promise.all([
          runCli('gdrive', ['auth', 'status']),
          runCli('gdrive', ['readonly', 'quota']),
        ]);
        return {
          result: {
            auth: auth.stdout.replace(/Token file:.*/g, 'Token file: [hidden]'),
            quota: quota.stdout,
          },
        };
      }
      if (action === 'quota') {
        const { stdout } = await runCli('gdrive', ['readonly', 'quota']);
        return { result: { quota: stdout } };
      }
      if (action === 'recent') {
        const { stdout } = await runCli('gdrive', [
          'readonly',
          'recent',
          '--max',
          '10',
        ]);
        return { result: { recent: stdout } };
      }
      if (action === 'ls') {
        const { stdout } = await runCli('gdrive', [
          'readonly',
          'ls',
          '--max',
          '20',
        ]);
        return { result: { files: stdout } };
      }
      if (action === 'search') {
        const q = String(args.query ?? '').trim();
        if (!q) throw new Error('query is required for google_drive search');
        const { stdout } = await runCli('gdrive', [
          'readonly',
          'search',
          '--name-contains',
          q,
        ]);
        return { result: { matches: stdout.slice(0, 6000) } };
      }
      throw new Error(`Unsupported google_drive action: ${action}`);
    }

    if (name === 'github_query') {
      const action = String(args.action ?? 'my_repos');
      const q = String(args.query ?? '').trim();

      if (action === 'my_repos') {
        const { stdout } = await runCli('gh', [
          'repo',
          'list',
          '--limit',
          '20',
          '--json',
          'nameWithOwner,description,isPrivate,updatedAt,url',
        ]);
        return { result: { repos: JSON.parse(stdout || '[]') } };
      }
      if (action === 'search_repos') {
        if (!q) throw new Error('query is required for search_repos');
        const { stdout } = await runCli('gh', [
          'search',
          'repos',
          q,
          '--sort',
          'stars',
          '--limit',
          '8',
          '--json',
          'fullName,description,stargazersCount,language,url',
        ]);
        return { result: { repos: JSON.parse(stdout || '[]') } };
      }
      if (action === 'repo_view') {
        if (!q || !q.includes('/')) {
          throw new Error('query must be in owner/repo format');
        }
        const { stdout } = await runCli('gh', [
          'repo',
          'view',
          q,
          '--json',
          'nameWithOwner,description,stargazerCount,forkCount,url,pushedAt,defaultBranchRef',
        ]);
        return { result: { repo: JSON.parse(stdout || '{}') } };
      }
      if (action === 'repo_readme') {
        if (!q || !q.includes('/')) {
          throw new Error('query must be in owner/repo format');
        }
        const { stdout } = await runCli('gh', [
          'api',
          `repos/${q}/readme`,
          '--jq',
          '.content',
        ]);
        const decoded = Buffer.from(stdout.replace(/\s+/g, ''), 'base64').toString(
          'utf-8',
        );
        return { result: { readme: decoded.slice(0, 7000) } };
      }
      throw new Error(`Unsupported github_query action: ${action}`);
    }

    if (name === 'workspace_inspect') {
      const action = String(args.action ?? 'list');
      const rel = String(args.targetPath ?? '').trim();
      const resolved = path.resolve(WORKSPACE_ROOT, rel);
      if (
        resolved !== WORKSPACE_ROOT &&
        !resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`)
      ) {
        throw new Error('Path must stay inside /home/antigravity');
      }
      // Block reading .env secret files
      if (path.basename(resolved).startsWith('.env')) {
        throw new Error('Reading .env files is blocked for security.');
      }

      if (action === 'list') {
        const entries = await fs.readdir(resolved, { withFileTypes: true });
        return {
          result: {
            path: resolved,
            entries: entries
              .slice(0, 60)
              .map((e) => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`),
          },
        };
      }
      if (action === 'read') {
        const content = await fs.readFile(resolved, 'utf-8');
        return { result: { path: resolved, content: content.slice(0, 8000) } };
      }
      throw new Error(`Unsupported workspace_inspect action: ${action}`);
    }

    throw new Error(`Unknown tool: ${name}`);
  };
}
