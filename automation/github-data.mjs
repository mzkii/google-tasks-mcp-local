// Read-only GitHub fetch for the Slack -> Google Tasks sync. Called by run.sh.
// Env: GITHUB_OWNER, LOOKBACK_HOURS. Prints one JSON document to stdout.
// Only fixed read-only `gh` commands are used, with array arguments (no shell).
// On failure prints one line to stderr and exits 1; run.sh then skips GitHub only.
import { execFileSync } from "node:child_process";

const MAX_TOTAL = 60000;
const MAX_BODY = 500;
const MAX_PRS = 15;
const LIMIT = 30;

const owner = process.env.GITHUB_OWNER ?? "";
const hours = Number(process.env.LOOKBACK_HOURS ?? "24");
if (!/^[A-Za-z0-9-]+$/.test(owner)) fail("invalid GITHUB_OWNER");
if (!Number.isFinite(hours) || hours <= 0) fail("invalid LOOKBACK_HOURS");

const sinceMs = Date.now() - hours * 3600 * 1000;
const since = new Date(sinceMs).toISOString().replace(/\.\d+Z$/, "Z");

function fail(msg) {
  console.error(`github: ${String(msg).split("\n")[0].slice(0, 200)}`);
  process.exit(1);
}

function gh(args) {
  try {
    const out = execFileSync("gh", args, {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out);
  } catch (e) {
    if (e.code === "ENOENT") fail("gh not found");
    const err = String(e.stderr || e.message || "gh failed").trim();
    fail(`gh failed: ${err}`);
  }
}

const prFields = "url,title,state,repository,number,updatedAt,author,isDraft";
const issueFields = "url,title,state,repository,number,updatedAt,author";

const involved = gh(["search", "prs", "--involves=@me", `--owner=${owner}`, `--updated=>=${since}`, "--limit", String(LIMIT), "--json", prFields]);
const reviewRequested = gh(["search", "prs", "--review-requested=@me", `--owner=${owner}`, "--state=open", "--limit", String(LIMIT), "--json", prFields]);
const issues = gh(["search", "issues", "--involves=@me", `--owner=${owner}`, `--updated=>=${since}`, "--limit", String(LIMIT), "--json", issueFields]);

const slim = (x) => ({
  repo: x.repository?.nameWithOwner ?? null,
  number: x.number,
  url: x.url,
  title: x.title,
  state: x.state,
  isDraft: x.isDraft,
  author: x.author?.login ?? null,
  updatedAt: x.updatedAt,
});

const cut = (s) => (typeof s === "string" && s.length > MAX_BODY ? s.slice(0, MAX_BODY) + "...(truncated)" : s ?? "");
const inRange = (t) => t && Date.parse(t) >= sinceMs;

// Dedupe PRs by url (review-requested first), cap at MAX_PRS
const seen = new Set();
const prs = [];
for (const p of [...reviewRequested, ...involved]) {
  if (!p.url || seen.has(p.url)) continue;
  seen.add(p.url);
  prs.push(p);
}
const targets = prs.slice(0, MAX_PRS);

const prDetails = [];
for (const p of targets) {
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(p.url)) continue;
  const v = gh(["pr", "view", p.url, "--json", "state,mergedAt,reviewDecision,reviews,comments,author"]);
  prDetails.push({
    url: p.url,
    state: v.state,
    mergedAt: v.mergedAt,
    reviewDecision: v.reviewDecision,
    author: v.author?.login ?? null,
    reviews: (v.reviews ?? []).filter((r) => inRange(r.submittedAt)).map((r) => ({
      author: r.author?.login ?? null, state: r.state, submittedAt: r.submittedAt, body: cut(r.body),
    })),
    comments: (v.comments ?? []).filter((c) => inRange(c.createdAt)).map((c) => ({
      author: c.author?.login ?? null, createdAt: c.createdAt, body: cut(c.body),
    })),
  });
}

const doc = {
  owner,
  since,
  truncated: false,
  reviewRequestedPrs: reviewRequested.map(slim),
  involvedPrs: involved.map(slim),
  issues: issues.map(slim),
  prDetails,
};

// "<" is escaped so the data cannot close the <github_data> delimiter in the prompt
const render = () => JSON.stringify(doc, null, 1).replace(/</g, "\\u003c");

let out = render();
if (out.length > MAX_TOTAL) {
  doc.truncated = true;
  doc.truncatedNote = `output exceeded ${MAX_TOTAL} chars; later items were dropped`;
  const order = ["prDetails", "issues", "involvedPrs", "reviewRequestedPrs"];
  while ((out = render()).length > MAX_TOTAL) {
    const k = order.find((key) => doc[key].length > 0);
    if (!k) break;
    doc[k].pop();
  }
}
process.stdout.write(out);
