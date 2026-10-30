/**
 * lexerEngine.js
 * Implements Maximal Munch (longest match) tokenization engine with error recovery
 * and full step-by-step trace recorder for interactive visual simulation.
 */

export class Token {
  constructor(type, lexeme, line, column, isError = false, isIgnored = false) {
    this.type = type;
    this.lexeme = lexeme;
    this.line = line;
    this.column = column;
    this.isError = isError;
    this.isIgnored = isIgnored;
  }
}

export class LexerEngine {
  constructor(minDFA) {
    this.dfa = minDFA;
  }

  tokenize(sourceCode, includeIgnored = false) {
    const tokens = [];
    const errors = [];
    const trace = [];

    const n = sourceCode.length;
    let pos = 0;

    // Coordinate mapping (index -> line, col)
    const coords = [];
    let curLine = 1, curCol = 1;
    for (let i = 0; i < n; i++) {
      coords.push({ line: curLine, col: curCol });
      if (sourceCode[i] === '\n') {
        curLine++;
        curCol = 1;
      } else {
        curCol++;
      }
    }
    coords.push({ line: curLine, col: curCol }); // EOF

    const startState = this.dfa.startState;
    if (!startState) return { tokens, errors, trace };

    let stepCounter = 0;

    while (pos < n) {
      let currentState = startState;
      let scanPos = pos;

      let lastAcceptPos = null;
      let lastAcceptToken = null;
      let lastAcceptIgnored = false;
      let lastAcceptStateLabel = null;

      if (currentState.isAccept) {
        lastAcceptPos = scanPos;
        lastAcceptToken = currentState.tokenName;
        lastAcceptIgnored = currentState.isIgnored;
        lastAcceptStateLabel = currentState.label;
      }

      trace.push({
        step: stepCounter++,
        action: "START_LEXEME",
        pos,
        state: currentState.label,
        char: pos < n ? sourceCode[pos] : "EOF",
        lexeme: "",
        description: `Start scan at line ${coords[pos].line}, col ${coords[pos].col} from state ${currentState.label}`
      });

      while (scanPos < n) {
        const char = sourceCode[scanPos];
        const nextState = currentState.transitions.get(char);

        if (!nextState) {
          trace.push({
            step: stepCounter++,
            action: "NO_TRANSITION",
            pos: scanPos,
            state: currentState.label,
            char,
            lexeme: sourceCode.slice(pos, scanPos),
            description: `No transition from state ${currentState.label} on '${escapeChar(char)}'`
          });
          break;
        }

        currentState = nextState;
        scanPos++;

        if (currentState.isAccept) {
          lastAcceptPos = scanPos;
          lastAcceptToken = currentState.tokenName;
          lastAcceptIgnored = currentState.isIgnored;
          lastAcceptStateLabel = currentState.label;

          trace.push({
            step: stepCounter++,
            action: "ACCEPT_CANDIDATE",
            pos: scanPos,
            state: currentState.label,
            char,
            lexeme: sourceCode.slice(pos, scanPos),
            description: `Reached accepting state ${currentState.label} [${currentState.tokenName}] with candidate '${sourceCode.slice(pos, scanPos)}'`
          });
        } else {
          trace.push({
            step: stepCounter++,
            action: "CONSUME",
            pos: scanPos,
            state: currentState.label,
            char,
            lexeme: sourceCode.slice(pos, scanPos),
            description: `Transitioned to state ${currentState.label} on '${escapeChar(char)}'`
          });
        }
      }

      // Maximal Munch Decision
      if (lastAcceptPos !== null && lastAcceptPos > pos) {
        const lexeme = sourceCode.slice(pos, lastAcceptPos);
        const { line, col } = coords[pos];
        const tok = new Token(lastAcceptToken, lexeme, line, col, false, lastAcceptIgnored);

        if (!lastAcceptIgnored || includeIgnored) {
          tokens.push(tok);
        }

        trace.push({
          step: stepCounter++,
          action: "EMIT_TOKEN",
          pos: lastAcceptPos,
          state: lastAcceptStateLabel,
          char: "",
          lexeme,
          token: tok,
          description: `Emitted ${lastAcceptToken}("${lexeme}") at line ${line}, col ${col}${lastAcceptIgnored ? " (ignored)" : ""}`
        });

        pos = lastAcceptPos;
      } else {
        const errChar = sourceCode[pos];
        const { line, col } = coords[pos];
        const errTok = new Token("LEXICAL_ERROR", errChar, line, col, true, false);
        errors.push(errTok);
        tokens.push(errTok);

        trace.push({
          step: stepCounter++,
          action: "LEXICAL_ERROR",
          pos,
          state: currentState.label,
          char: errChar,
          lexeme: errChar,
          token: errTok,
          description: `Lexical error: unexpected character '${escapeChar(errChar)}' at line ${line}, col ${col}`
        });

        // Error recovery: discard character and continue
        pos++;
      }
    }

    return { tokens, errors, trace };
  }
}

function escapeChar(c) {
  if (c === '\n') return '\\n';
  if (c === '\t') return '\\t';
  if (c === ' ') return '␣';
  return c;
}
