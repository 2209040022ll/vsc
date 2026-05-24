"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findApiCalls = findApiCalls;
exports.splitTopLevelArgs = splitTopLevelArgs;
exports.parseArguments = parseArguments;
exports.countArguments = countArguments;
exports.readNumericArgument = readNumericArgument;
exports.readIdentifierArgument = readIdentifierArgument;
exports.parseLiteralValue = parseLiteralValue;
exports.stripStringLiteral = stripStringLiteral;
function isLineCommented(text, offset) {
    let lineStart = text.lastIndexOf('\n', offset);
    lineStart = lineStart === -1 ? 0 : lineStart + 1;
    const linePrefix = text.slice(lineStart, offset);
    return linePrefix.includes('#');
}
function findApiCalls(text) {
    const calls = [];
    const callPattern = /\b(hutb|mcp)\.(\w+)\s*\(/g;
    let match;
    while ((match = callPattern.exec(text)) !== null) {
        // 跳过被 # 注释掉的代码
        if (isLineCommented(text, match.index)) {
            continue;
        }
        const moduleName = match[1];
        const funcName = match[2];
        const openParenOffset = callPattern.lastIndex - 1;
        const closeParenOffset = findMatchingParen(text, openParenOffset);
        if (closeParenOffset < 0) {
            continue;
        }
        const startOffset = match.index;
        const endOffset = closeParenOffset + 1;
        const funcNameStartOffset = match.index + moduleName.length + 1;
        const funcNameEndOffset = funcNameStartOffset + funcName.length;
        calls.push({
            moduleName,
            funcName,
            fullName: `${moduleName}.${funcName}`,
            argsText: text.slice(openParenOffset + 1, closeParenOffset),
            startOffset,
            endOffset,
            funcNameStartOffset,
            funcNameEndOffset,
            line: getLineNumber(text, startOffset),
            assignedTo: extractAssignmentTarget(text, startOffset)
        });
        callPattern.lastIndex = endOffset;
    }
    return calls;
}
function splitTopLevelArgs(argsText) {
    const trimmed = argsText.trim();
    if (!trimmed) {
        return [];
    }
    const args = [];
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let start = 0;
    for (let i = 0; i < argsText.length; i++) {
        const ch = argsText[i];
        const previous = i > 0 ? argsText[i - 1] : '';
        if (inString) {
            if (ch === stringChar && previous !== '\\') {
                inString = false;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
            continue;
        }
        if (ch === '(' || ch === '[' || ch === '{') {
            depth++;
            continue;
        }
        if (ch === ')' || ch === ']' || ch === '}') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (ch === ',' && depth === 0) {
            args.push(argsText.slice(start, i).trim());
            start = i + 1;
        }
    }
    args.push(argsText.slice(start).trim());
    return args.filter(arg => arg.length > 0);
}
function parseArguments(argsText) {
    const positional = [];
    const named = new Map();
    for (const arg of splitTopLevelArgs(argsText)) {
        const equalsIndex = findTopLevelEquals(arg);
        if (equalsIndex > 0) {
            const name = arg.slice(0, equalsIndex).trim();
            const value = arg.slice(equalsIndex + 1).trim();
            if (/^[A-Za-z_]\w*$/.test(name)) {
                named.set(name, value);
                continue;
            }
        }
        positional.push(arg);
    }
    return { positional, named };
}
function countArguments(argsText) {
    return splitTopLevelArgs(argsText).length;
}
function readNumericArgument(parsed, positionalIndex, namedCandidates) {
    for (const name of namedCandidates) {
        const namedValue = parsed.named.get(name);
        const numeric = parseNumericLiteral(namedValue);
        if (numeric !== undefined) {
            return numeric;
        }
    }
    return parseNumericLiteral(parsed.positional[positionalIndex]);
}
function readIdentifierArgument(parsed, positionalIndex, namedCandidates) {
    for (const name of namedCandidates) {
        const namedValue = parsed.named.get(name);
        if (namedValue && isIdentifier(namedValue)) {
            return namedValue;
        }
    }
    const positional = parsed.positional[positionalIndex];
    return positional && isIdentifier(positional) ? positional : undefined;
}
function parseLiteralValue(raw) {
    if (raw === undefined) {
        return undefined;
    }
    const value = raw.trim();
    if (!value) {
        return '';
    }
    const numeric = parseNumericLiteral(value);
    if (numeric !== undefined) {
        return numeric;
    }
    if (value === 'True') {
        return true;
    }
    if (value === 'False') {
        return false;
    }
    if (value === 'None') {
        return null;
    }
    const stringValue = stripStringLiteral(value);
    return stringValue ?? value;
}
function stripStringLiteral(raw) {
    const value = raw.trim();
    if (value.length < 2) {
        return undefined;
    }
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
        return value.slice(1, -1);
    }
    return undefined;
}
function findMatchingParen(text, openParenOffset) {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    for (let i = openParenOffset; i < text.length; i++) {
        const ch = text[i];
        const previous = i > 0 ? text[i - 1] : '';
        if (inString) {
            if (ch === stringChar && previous !== '\\') {
                inString = false;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
            continue;
        }
        if (ch === '(') {
            depth++;
            continue;
        }
        if (ch === ')') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}
function findTopLevelEquals(arg) {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < arg.length; i++) {
        const ch = arg[i];
        const previous = i > 0 ? arg[i - 1] : '';
        if (inString) {
            if (ch === stringChar && previous !== '\\') {
                inString = false;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            stringChar = ch;
            continue;
        }
        if (ch === '(' || ch === '[' || ch === '{') {
            depth++;
            continue;
        }
        if (ch === ')' || ch === ']' || ch === '}') {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (ch === '=' && depth === 0) {
            return i;
        }
    }
    return -1;
}
function parseNumericLiteral(raw) {
    if (raw === undefined) {
        return undefined;
    }
    const value = raw.trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
        return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
}
function isIdentifier(raw) {
    return /^[A-Za-z_]\w*$/.test(raw.trim());
}
function extractAssignmentTarget(text, callStartOffset) {
    const lineStart = text.lastIndexOf('\n', callStartOffset - 1) + 1;
    const prefix = text.slice(lineStart, callStartOffset);
    const match = /^\s*([A-Za-z_]\w*)\s*=\s*$/.exec(prefix);
    return match?.[1];
}
function getLineNumber(text, offset) {
    let line = 0;
    for (let i = 0; i < offset; i++) {
        if (text[i] === '\n') {
            line++;
        }
    }
    return line;
}
//# sourceMappingURL=pythonCallParser.js.map