/**
 * regexParser.js
 * Parses regular expressions into postfix notation using the Shunting-Yard algorithm.
 * Handles concatenation insertion, character classes, escape sequences, and operator precedence.
 */

export const CONCAT_OP = '·';
export const UNION_OP = '|';
export const STAR_OP = '*';
export const PLUS_OP = '+';
export const OPT_OP = '?';

export class RegexToken {
  constructor(type, value) {
    this.type = type; // 'LITERAL', 'CHAR_CLASS', 'OP'
    this.value = value;
  }

  matches(char) {
    if (this.type === 'LITERAL') return this.value === char;
    if (this.type === 'CHAR_CLASS') return this.value.has(char);
    return false;
  }
}

export function expandCharacterClass(classStr) {
  let inner = classStr.slice(1, -1);
  let negated = false;
  if (inner.startsWith('^')) {
    negated = true;
    inner = inner.slice(1);
  }

  const chars = new Set();
  let i = 0;
  const n = inner.length;

  while (i < n) {
    if (inner[i] === '\\' && i + 1 < n) {
      const esc = inner[i + 1];
      if (esc === 'n') chars.add('\n');
      else if (esc === 't') chars.add('\t');
      else if (esc === 'r') chars.add('\r');
      else if (esc === 's') [' ', '\t', '\n', '\r'].forEach(c => chars.add(c));
      else if (esc === 'd') {
        for (let c = 48; c <= 57; c++) chars.add(String.fromCharCode(c));
      } else if (esc === 'w') {
        for (let c = 97; c <= 122; c++) chars.add(String.fromCharCode(c));
        for (let c = 65; c <= 90; c++) chars.add(String.fromCharCode(c));
        for (let c = 48; c <= 57; c++) chars.add(String.fromCharCode(c));
        chars.add('_');
      } else {
        chars.add(esc);
      }
      i += 2;
    } else if (i + 2 < n && inner[i + 1] === '-') {
      const startCode = inner.charCodeAt(i);
      const endCode = inner.charCodeAt(i + 2);
      for (let c = startCode; c <= endCode; c++) {
        chars.add(String.fromCharCode(c));
      }
      i += 3;
    } else {
      chars.add(inner[i]);
      i += 1;
    }
  }

  if (negated) {
    const fullAscii = new Set();
    for (let c = 32; c <= 126; c++) fullAscii.add(String.fromCharCode(c));
    fullAscii.add('\t'); fullAscii.add('\n'); fullAscii.add('\r');
    for (const c of chars) fullAscii.delete(c);
    return fullAscii;
  }

  return chars;
}

export function tokenizeRegex(pattern) {
  const tokens = [];
  let i = 0;
  const n = pattern.length;

  while (i < n) {
    const c = pattern[i];
    if (c === '\\') {
      if (i + 1 >= n) throw new Error('Trailing backslash in regex');
      const nxt = pattern[i + 1];
      if (nxt === 'n') tokens.push(new RegexToken('LITERAL', '\n'));
      else if (nxt === 't') tokens.push(new RegexToken('LITERAL', '\t'));
      else if (nxt === 'r') tokens.push(new RegexToken('LITERAL', '\r'));
      else if (nxt === 's') tokens.push(new RegexToken('CHAR_CLASS', new Set([' ', '\t', '\n', '\r'])));
      else if (nxt === 'd') {
        const s = new Set();
        for (let x = 48; x <= 57; x++) s.add(String.fromCharCode(x));
        tokens.push(new RegexToken('CHAR_CLASS', s));
      } else if (nxt === 'w') {
        const s = new Set();
        for (let x = 97; x <= 122; x++) s.add(String.fromCharCode(x));
        for (let x = 65; x <= 90; x++) s.add(String.fromCharCode(x));
        for (let x = 48; x <= 57; x++) s.add(String.fromCharCode(x));
        s.add('_');
        tokens.push(new RegexToken('CHAR_CLASS', s));
      } else {
        tokens.push(new RegexToken('LITERAL', nxt));
      }
      i += 2;
    } else if (c === '[') {
      let j = i + 1;
      if (j < n && pattern[j] === '^') j++;
      if (j < n && pattern[j] === ']') j++;
      while (j < n && pattern[j] !== ']') {
        if (pattern[j] === '\\') j += 2;
        else j++;
      }
      if (j >= n) throw new Error(`Unclosed character class in: ${pattern}`);
      const classStr = pattern.slice(i, j + 1);
      tokens.push(new RegexToken('CHAR_CLASS', expandCharacterClass(classStr)));
      i = j + 1;
    } else if (c === '.') {
      const allPrintable = new Set();
      for (let x = 32; x <= 126; x++) allPrintable.add(String.fromCharCode(x));
      tokens.push(new RegexToken('CHAR_CLASS', allPrintable));
      i++;
    } else if (['|', '*', '+', '?', '(', ')'].includes(c)) {
      tokens.push(new RegexToken('OP', c));
      i++;
    } else {
      tokens.push(new RegexToken('LITERAL', c));
      i++;
    }
  }

  return tokens;
}

export function insertExplicitConcat(tokens) {
  if (!tokens || tokens.length === 0) return [];
  const result = [];
  const postOps = new Set(['*', '+', '?']);

  for (let i = 0; i < tokens.length; i++) {
    const t1 = tokens[i];
    result.push(t1);

    if (i + 1 < tokens.length) {
      const t2 = tokens[i + 1];

      const t1IsOperand = (t1.type === 'LITERAL' || t1.type === 'CHAR_CLASS') ||
                          (t1.type === 'OP' && (postOps.has(t1.value) || t1.value === ')'));

      const t2IsOperand = (t2.type === 'LITERAL' || t2.type === 'CHAR_CLASS') ||
                          (t2.type === 'OP' && t2.value === '(');

      if (t1IsOperand && t2IsOperand) {
        result.push(new RegexToken('OP', CONCAT_OP));
      }
    }
  }

  return result;
}

export function regexToPostfix(pattern) {
  const rawTokens = tokenizeRegex(pattern);
  const tokens = insertExplicitConcat(rawTokens);

  const precedence = {
    [STAR_OP]: 3,
    [PLUS_OP]: 3,
    [OPT_OP]: 3,
    [CONCAT_OP]: 2,
    [UNION_OP]: 1
  };

  const output = [];
  const opStack = [];

  for (const token of tokens) {
    if (token.type === 'LITERAL' || token.type === 'CHAR_CLASS') {
      output.push(token);
    } else if (token.type === 'OP') {
      const op = token.value;
      if (op === STAR_OP || op === PLUS_OP || op === OPT_OP) {
        output.push(token);
      } else if (op === CONCAT_OP || op === UNION_OP) {
        while (opStack.length > 0 && opStack[opStack.length - 1].value !== '(') {
          const topPrec = precedence[opStack[opStack.length - 1].value] || 0;
          const curPrec = precedence[op];
          if (topPrec >= curPrec) {
            output.push(opStack.pop());
          } else {
            break;
          }
        }
        opStack.push(token);
      } else if (op === '(') {
        opStack.push(token);
      } else if (op === ')') {
        let matched = false;
        while (opStack.length > 0) {
          const top = opStack.pop();
          if (top.value === '(') {
            matched = true;
            break;
          }
          output.push(top);
        }
        if (!matched) throw new Error(`Mismatched parentheses in: ${pattern}`);
      }
    }
  }

  while (opStack.length > 0) {
    const top = opStack.pop();
    if (top.value === '(') throw new Error(`Mismatched parentheses in: ${pattern}`);
    output.push(top);
  }

  return output;
}
