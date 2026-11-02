import { containsGroupDelimiter, isGroupDelimiter } from './class-groups.js';
import { offsetOf } from './file-spans.js';
import type { Linter } from 'eslint';
import type { FileSpans } from './file-spans.js';

const SILENCED_RULE_PREFIX = 'better-tailwindcss/';

function isInsideInterpolatedString(message: Linter.LintMessage, spans: FileSpans): boolean {
  const offset = offsetOf(spans, message.line, message.column);
  if (offset === undefined) {
    return false;
  }

  return spans.interpolatedStrings.some(([start, end]) => offset >= start && offset < end);
}

function isAboutAGroupDelimiter(message: Linter.LintMessage, spans: FileSpans): boolean {
  if (message.endLine === undefined || message.endColumn === undefined) {
    return false;
  }

  const start = offsetOf(spans, message.line, message.column);
  const end = offsetOf(spans, message.endLine, message.endColumn);

  return start !== undefined && end !== undefined && isGroupDelimiter(spans.text.slice(start, end));
}

function isAboutAGroupedClassList(message: Linter.LintMessage, spans: FileSpans): boolean {
  if (isAboutAGroupDelimiter(message, spans)) {
    return true;
  }

  return message.fix !== undefined && containsGroupDelimiter(spans.text.slice(...message.fix.range));
}

export function isSilencedMessage(message: Linter.LintMessage, spans: FileSpans): boolean {
  if (!message.ruleId?.startsWith(SILENCED_RULE_PREFIX)) {
    return false;
  }

  return isInsideInterpolatedString(message, spans) || isAboutAGroupedClassList(message, spans);
}
