// U15 (fork): `limen complain` appends one whole line to the plant's log from the root, a worktree or a job, and
// `limen status` counts the lines no triage mark has closed.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { git, limen, plant, start } from "./plant.ts";

const ENTRY = /^- \d{4}-\d\d-\d\d \d\d:\d\d UTC · (.+?) · #repo · (.+)$/;

test("a complaint lands in the plant's spec/complain.md as one line, never in a branch", async (t) => {
	const p = await plant();
	t.after(() => p.cleanup());
	const log = join(p.root, "spec/complain.md");
	const entries = async () => (await readFile(log, "utf8")).split("\n").filter((line) => line.startsWith("- "));
	assert.equal(limen(p, ["complain", "  the build\n is   slow → again "]).status, 0);
	assert.match(await readFile(log, "utf8"), /^# Complaints\n\n.*`limen complain`.*\n.* → FNNN.*\n\n- /);
	const tree = join(p.parent, "wt");
	git(p.root, "worktree", "add", "-q", "-b", "side", tree);
	assert.equal(limen(p, ["complain", "coordinator line"], { cwd: tree, env: { LIMEN_COORDINATOR: "1" } }).status, 0);
	const job = { LIMEN_CONTEXT_ROOT: p.root, LIMEN_JOB_ID: "j1", LIMEN_COORDINATOR: "1" };
	assert.equal(limen(p, ["complain", "x".repeat(450)], { cwd: tree, env: job }).status, 0);
	assert.equal(existsSync(join(tree, "spec/complain.md")), false, "the worktree stays clean");
	const [byHand, coordinator, long] = (await entries()).map((line) => ENTRY.exec(line)?.slice(1) ?? [line]);
	assert.deepEqual(byHand, ["by hand", "the build is slow -> again"]);
	assert.deepEqual(coordinator, ["coordinator", "coordinator line"]);
	assert.deepEqual([long?.[0], long?.[1]?.length, long?.[1]?.endsWith("…")], ["job j1", 400, true]);
	const empty = limen(p, ["complain", "  "]);
	assert.deepEqual([empty.status, empty.stderr.includes("usage: limen complain")], [1, true]);
	// Jobs that finish together keep every line whole.
	const runs = Array.from({ length: 10 }, (_, n) => start(p, ["complain", `parallel ${n}`]).done);
	assert.ok((await Promise.all(runs)).every((run) => run.status === 0));
	const lines = await entries();
	assert.equal(lines.length, 13);
	assert.ok(lines.every((line) => ENTRY.test(line)));
	assert.match(limen(p, ["status"]).stdout, /\nComplaints \(13 open\): spec\/complain\.md\n/);
	await appendFile(log, "- 2026-11-16 10:00 UTC · coordinator · #repo · handled → F002\n");
	assert.match(limen(p, ["status"]).stdout, /\nComplaints \(13 open\)/);
});
