// Rewrites the auto-generated sections of README.md from live GitHub data.
// Runs daily via .github/workflows/update-readme.yml — no dependencies, Node 20+.
//
// Sections are delimited by HTML comments, e.g.
//   <!-- LATEST_PROJECTS:START --> ... <!-- LATEST_PROJECTS:END -->
// Everything outside the markers is hand-written and never touched.

import { readFile, writeFile } from 'node:fs/promises';

const USER = process.env.GH_USERNAME || 'shubham21881';
const TOKEN = process.env.GITHUB_TOKEN;
const README = new URL('../README.md', import.meta.url);

// Repos that should never show up in "Latest builds".
const HIDDEN = new Set([USER, 'helloworld', 'assignments']);
const PROJECT_COUNT = 6;

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${USER}-readme-bot`,
      ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const escape = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function latestProjects() {
  // The users/ endpoint only returns public repos, even with an authenticated token.
  const repos = await gh(`/users/${USER}/repos?type=owner&sort=pushed&per_page=100`);
  const items = repos
    .filter((r) => !r.fork && !r.archived && !HIDDEN.has(r.name))
    .slice(0, PROJECT_COUNT)
    .map((r) => {
      // Set a repo's description/website on GitHub and it shows up here on the next run.
      const parts = [
        r.language && `\`${r.language}\``,
        r.homepage && `[Live demo ↗](${r.homepage})`,
        `<sub>updated ${fmtDate(r.pushed_at)}</sub>`,
      ].filter(Boolean);
      const desc = r.description ? ` — ${escape(r.description.trim())}` : '';
      return `- [**${r.name}**](${r.html_url})${desc}<br />${parts.join(' · ')}`;
    });
  return items.join('\n');
}

function replaceSection(md, name, body) {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(md)) throw new Error(`Marker ${name} not found in README.md`);
  return md.replace(re, `$1\n${body}\n$2`);
}

const original = await readFile(README, 'utf8');
let md = original;
md = replaceSection(md, 'LATEST_PROJECTS', await latestProjects());

// Only touch the timestamp when something real changed, so the bot doesn't commit daily noise.
if (md !== original) {
  md = replaceSection(md, 'LAST_UPDATED', `<sub>Auto-updated on ${fmtDate(new Date().toISOString())}</sub>`);
  await writeFile(README, md);
  console.log('README.md updated');
} else {
  console.log('README.md already up to date');
}
