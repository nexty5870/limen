import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { gitCommonDir, limenRoot } from "../project/git.ts";
import { withSeatLock } from "../project/seat.ts";

// Fork addition (nexty5870/limen). Upstream described the same command; keep the path and line shape so a later
// upstream version replaces this file without moving anyone's log.
export const COMPLAINTS = "spec/complain.md";
/** A handled line ends with this mark and the ticket or the reason. */
export const HANDLED = " → ";
const LIMIT = 400;
const HEADER = [
	"# Complaints",
	"",
	"One line per annoyance, written by `limen complain`. The coordinator marks a handled line by appending",
	"` → FNNN` (the ticket that fixes it) or ` → won't fix: <reason>`.",
	"",
	"",
].join("\n");

/** `limen complain "<sentence>"`: appends one line to the plant's complaint log. It never commits. */
export async function complainCommand(args: readonly string[], cwd: string): Promise<void> {
	const sentence = oneLine(args.join(" "));
	if (!sentence) {
		throw new Error('usage: limen complain "<one sentence about what got in the way>"');
	}
	const root = plantRoot(cwd);
	const path = join(root, COMPLAINTS);
	const line = `- ${stamp(new Date())} · ${who()} · #${tag(basename(root))} · ${sentence}\n`;
	withSeatLock(path, () => {
		const before = existsSync(path) ? readFileSync(path, "utf8") : undefined;
		const lead = before === undefined ? HEADER : before.endsWith("\n") || before === "" ? "" : "\n";
		appendFileSync(path, `${lead}${line}`);
	});
	console.log(`added to ${path}`);
}

/** Open complaints: entry lines without the handled mark. */
export function openComplaints(root: string): number {
	const path = join(root, COMPLAINTS);
	if (!existsSync(path)) {
		return 0;
	}
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.startsWith("- ") && !line.includes(HANDLED)).length;
}

/** A job writes to its plant, a coordinator in its own worktree to the primary checkout: never to a branch. */
function plantRoot(cwd: string): string {
	const context = process.env.LIMEN_CONTEXT_ROOT?.trim();
	if (context) {
		return context;
	}
	const root = limenRoot(cwd);
	const common = gitCommonDir(root);
	return common && basename(common) === ".git" ? dirname(common) : root;
}

function oneLine(text: string): string {
	const flat = text.replaceAll("→", "->").replace(/\s+/g, " ").trim();
	return flat.length > LIMIT ? `${flat.slice(0, LIMIT - 1)}…` : flat;
}

function stamp(now: Date): string {
	return `${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function who(): string {
	const job = process.env.LIMEN_JOB_ID?.trim();
	if (job) {
		return `job ${job}`;
	}
	return process.env.LIMEN_COORDINATOR === "1" ? "coordinator" : "by hand";
}

function tag(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, "-")
			.replace(/^-|-$/g, "") || "plant"
	);
}
