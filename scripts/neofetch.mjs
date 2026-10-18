// Renders the neofetch-style profile card (assets/neofetch-dark.svg + assets/neofetch-light.svg).
// Static facts live in PROFILE below; GitHub numbers are fetched live on every run.
// Runs daily via .github/workflows/profile.yml — no dependencies, Node 20+.

import { readFile, writeFile } from 'node:fs/promises';

const USER = process.env.GH_USERNAME || 'shubham21881';
const TOKEN = process.env.GITHUB_TOKEN;
const root = new URL('../', import.meta.url);

// ── Edit this block to change what the card says ──────────────────────────────
const PROFILE = {
  title: 'shubham@mourya',
  sections: [
    [
      ['OS', 'macOS, Linux, Vercel'],
      ['Uptime', '{uptime}'],
      ['Host', 'Goose Labs'],
      ['Kernel', 'Full-stack & Applied AI Engineer'],
      ['Shell', 'Raipur, India · IST (UTC+5:30)'],
      ['IDE', 'VS Code, Claude Code'],
    ],
    [
      ['Languages.Programming', 'TypeScript, JavaScript, Python'],
      ['Languages.Computer', 'HTML, CSS, SQL, JSON'],
      ['Languages.Real', 'English, Hindi'],
    ],
    [
      ['Stack.Frontend', 'React, Next.js, Tailwind'],
      ['Stack.Backend', 'Node.js, Express, MongoDB'],
      ['Stack.AI', 'LLMs, RAG, Voice agents'],
      ['Now.Building', 'MedScribe, Engage'],
    ],
  ],
  contact: [
    ['Email', 'krishanmourya.sh@gmail.com'],
    ['LinkedIn', 'shubham-mourya-340a1b26a'],
    ['X', '@ShKrishanmourya'],
    ['Portfolio', 'itsme-delta-nine.vercel.app'],
  ],
};
// ──────────────────────────────────────────────────────────────────────────────

const THEMES = {
  dark: { bg: '#0d1117', border: '#30363d', text: '#c9d1d9', key: '#ffa657', value: '#a5d6ff', dots: '#484f58', accent: '#3fb950', ascii: '#8b949e' },
  light: { bg: '#f6f8fa', border: '#d0d7de', text: '#24292f', key: '#953800', value: '#0a3069', dots: '#afb8c1', accent: '#1a7f37', ascii: '#57606a' },
};

const WIDTH = 60; // characters in the info column
const LINE_H = 20;
const FONT = 15;
const ART_FONT = 11; // the portrait uses a smaller font so it can carry more detail
const ART_LINE_H = 13.5;

async function graphql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': `${USER}-readme-bot` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data;
}

async function fetchStats() {
  const { user } = await graphql(
    `query($login: String!) {
      user(login: $login) {
        createdAt
        followers { totalCount }
        pullRequests { totalCount }
        repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) {
          totalCount
          nodes { stargazerCount }
        }
        repositoriesContributedTo(contributionTypes: [COMMIT, PULL_REQUEST], includeUserRepositories: false) { totalCount }
        contributionsCollection { contributionCalendar { totalContributions } }
      }
    }`,
    { login: USER },
  );

  // contributionsCollection is capped at one year per query, so ask for every year since sign-up.
  const first = new Date(user.createdAt).getUTCFullYear();
  const now = new Date().getUTCFullYear();
  const years = Array.from({ length: now - first + 1 }, (_, i) => first + i);
  const perYear = years
    .map((y) => `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`)
    .join('\n');
  const { user: history } = await graphql(`query($login: String!) { user(login: $login) { ${perYear} } }`, { login: USER });
  const contributions = Object.values(history).reduce((n, y) => n + y.contributionCalendar.totalContributions, 0);

  return {
    createdAt: user.createdAt,
    repos: user.repositories.totalCount,
    stars: user.repositories.nodes.reduce((n, r) => n + r.stargazerCount, 0),
    contributedTo: user.repositoriesContributedTo.totalCount,
    followers: user.followers.totalCount,
    prs: user.pullRequests.totalCount,
    contributions,
    lastYear: user.contributionsCollection.contributionCalendar.totalContributions,
  };
}

function uptime(since) {
  const a = new Date(since);
  const b = new Date();
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  let m = b.getUTCMonth() - a.getUTCMonth();
  let d = b.getUTCDate() - a.getUTCDate();
  if (d < 0) {
    m -= 1;
    d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate();
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `${plural(y, 'year')}, ${plural(m, 'month')}, ${plural(d, 'day')}`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => n.toLocaleString('en-US');

// One info line, e.g. ". Host:........................ Goose Labs"
function row(key, value) {
  const fill = Math.max(1, WIDTH - 2 - key.length - 1 - 1 - value.length);
  return `<tspan class="dots">. </tspan><tspan class="key">${esc(key)}</tspan>:<tspan class="dots">${'.'.repeat(fill)}</tspan> <tspan class="value">${esc(value)}</tspan>`;
}

// Two stats side by side, e.g. ". Repos:.... 27 | Stars:...... 4"
function pair([k1, v1], [k2, v2]) {
  const half = (k, v, w) => `<tspan class="key">${esc(k)}</tspan>:<tspan class="dots">${'.'.repeat(Math.max(1, w - k.length - 2 - v.length))}</tspan> <tspan class="value">${esc(v)}</tspan>`;
  const left = Math.floor((WIDTH - 5) / 2);
  return `<tspan class="dots">. </tspan>${half(k1, v1, left)}<tspan class="dots"> | </tspan>${half(k2, v2, WIDTH - 5 - left)}`;
}

const header = (label) => {
  const text = `- ${label} `;
  return `<tspan class="text">${esc(text)}</tspan><tspan class="dots">${'—'.repeat(WIDTH - text.length)}</tspan>`;
};

function render(theme, ascii, stats) {
  const c = THEMES[theme];
  const info = [];
  info.push(`<tspan class="title">${esc(PROFILE.title)}</tspan> <tspan class="dots">${'—'.repeat(WIDTH - PROFILE.title.length - 1)}</tspan>`);
  PROFILE.sections.forEach((section, i) => {
    if (i) info.push('');
    for (const [k, v] of section) info.push(row(k, v.replace('{uptime}', uptime(stats.createdAt))));
  });
  info.push('', header('Contact'));
  for (const [k, v] of PROFILE.contact) info.push(row(k, v));
  info.push('', header('GitHub Stats'));
  info.push(pair(['Repos', num(stats.repos)], ['Stars', num(stats.stars)]));
  info.push(pair(['Contributions', num(stats.contributions)], ['Followers', num(stats.followers)]));
  const since = new Date(stats.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  info.push(pair(['Pull requests', num(stats.prs)], ['Since', since]));
  info.push(row('Contributions (last year)', num(stats.lastYear)));

  const artX = 22;
  const infoX = 470;
  const top = 38;
  const infoH = (info.length + 2) * LINE_H;
  const artH = ascii.length * ART_LINE_H;
  const height = top + Math.max(infoH, artH) + 6;
  const artTop = top + Math.max(0, (infoH - artH) / 2);
  const width = infoX + Math.ceil(WIDTH * FONT * 0.61) + 24;

  const art = ascii.map((l, i) => `<text x="${artX}" y="${(artTop + i * ART_LINE_H).toFixed(1)}">${esc(l)}</text>`).join('\n    ');
  const body = info.map((l, i) => `<text x="${infoX}" y="${top + i * LINE_H}">${l}</text>`).join('\n    ');
  const promptY = top + (info.length + 1) * LINE_H;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" font-size="${FONT}px">
  <title>Shubham Mourya · Full-stack &amp; Applied AI Engineer</title>
  <style>
    text { fill: ${c.text}; white-space: pre; }
    .ascii text { fill: ${c.ascii}; font-size: ${ART_FONT}px; }
    .title { fill: ${c.accent}; font-weight: 700; }
    .key { fill: ${c.key}; }
    .value { fill: ${c.value}; }
    .dots { fill: ${c.dots}; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="${c.bg}" stroke="${c.border}" />
  <g class="ascii" xml:space="preserve">
    ${art}
  </g>
  <g xml:space="preserve">
    ${body}
    <text x="${infoX}" y="${promptY}"><tspan class="title">${esc(PROFILE.title)}</tspan><tspan class="dots"> ~ $ </tspan></text>
  </g>
  <rect x="${infoX + Math.ceil((PROFILE.title.length + 5) * FONT * 0.61)}" y="${promptY - FONT + 2}" width="${Math.round(FONT * 0.6)}" height="${FONT + 1}" fill="${c.accent}">
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1.1s" repeatCount="indefinite" />
  </rect>
</svg>
`;
}

if (!TOKEN) throw new Error('GITHUB_TOKEN is required (GraphQL needs auth)');

const stats = await fetchStats();
for (const theme of Object.keys(THEMES)) {
  // Portrait made from the avatar: dense glyphs mark bright pixels on dark, dark pixels on light.
  const ascii = (await readFile(new URL(`assets/ascii-portrait-${theme}.txt`, root), 'utf8')).replace(/\n+$/, '').split('\n');
  await writeFile(new URL(`assets/neofetch-${theme}.svg`, root), render(theme, ascii, stats));
}
console.log('neofetch cards written', stats);
