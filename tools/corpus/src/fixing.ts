import type { Linter, Rule } from 'eslint';

export type FixOutcome = 'settled' | 'unresolved' | 'oscillates' | 'unsettled';
export type AppliedFix = { readonly ruleId: string | null; readonly replaced: string; readonly replacement: string };
export type FixRun = { readonly outcome: FixOutcome; readonly output: string; readonly passes: number; readonly applied: readonly AppliedFix[] };
type Pass = { readonly output: string; readonly applied: readonly AppliedFix[] };

type FixableMessage = Linter.LintMessage & { readonly fix: Rule.Fix };

const MAX_PASSES = 10;
const BYTE_ORDER_MARK = '\uFEFF';

function isFixable(message: Linter.LintMessage): message is FixableMessage {
  return message.fix !== undefined;
}

function byFixRange(first: FixableMessage, second: FixableMessage): number {
  return first.fix.range[0] - second.fix.range[0] || first.fix.range[1] - second.fix.range[1];
}

function removesByteOrderMark(fix: Rule.Fix): boolean {
  const [start, end] = fix.range;
  return (start < 0 && end >= 0) || (start === 0 && fix.text.startsWith(BYTE_ORDER_MARK));
}

export function applyOnePass(sourceText: string, messages: readonly Linter.LintMessage[]): Pass {
  const leadingMark = sourceText.startsWith(BYTE_ORDER_MARK) ? BYTE_ORDER_MARK : '';
  const text = sourceText.slice(leadingMark.length);
  const fixable = messages.filter(isFixable).toSorted(byFixRange);
  const applied: AppliedFix[] = [];
  let output = leadingMark;
  let lastEnd = Number.NEGATIVE_INFINITY;

  for (const { fix, ruleId } of fixable) {
    const [start, end] = fix.range;
    if (lastEnd >= start || start > end) {
      continue;
    }
    if (removesByteOrderMark(fix)) {
      output = '';
    }
    output += text.slice(Math.max(0, lastEnd), Math.max(0, start)) + fix.text;
    applied.push({ ruleId, replaced: text.slice(Math.max(0, start), end), replacement: fix.text });
    lastEnd = end;
  }

  return { output: output + text.slice(Math.max(0, lastEnd)), applied };
}

export async function fixUntilSettled(
  source: string,
  firstMessages: readonly Linter.LintMessage[],
  lint: (code: string) => Promise<readonly Linter.LintMessage[]>,
): Promise<FixRun> {
  const seenOutputs = new Set([source]);
  const applied: AppliedFix[] = [];
  let current = source;
  let messages = firstMessages;
  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    if (!messages.some(isFixable)) {
      return { outcome: 'settled', output: current, passes: pass - 1, applied };
    }
    const next = applyOnePass(current, messages);
    applied.push(...next.applied);
    if (next.output === current) {
      return { outcome: 'unresolved', output: current, passes: pass, applied };
    }
    if (seenOutputs.has(next.output)) {
      return { outcome: 'oscillates', output: next.output, passes: pass, applied };
    }
    seenOutputs.add(next.output);
    current = next.output;
    messages = await lint(current);
  }
  return { outcome: messages.some(isFixable) ? 'unsettled' : 'settled', output: current, passes: MAX_PASSES, applied };
}

export function describeFixOutcome(run: FixRun): string | undefined {
  switch (run.outcome) {
    case 'settled':
      return undefined;
    case 'unresolved':
      return 'the fix does not resolve its own report: applying it changes nothing and the report stays';
    case 'oscillates':
      return `the fix oscillates: pass ${run.passes} brings back an earlier version of the template`;
    case 'unsettled':
      return `the fix does not settle: the template still changes after ${MAX_PASSES} passes`;
  }
}
