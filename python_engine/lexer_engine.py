"""
lexer_engine.py
Implements the Lexer Engine using the generated Minimized DFA.
Features:
- Maximal Munch (Longest Match Rule)
- Rule Priority Resolution
- Line & Column tracking (1-indexed)
- Lexical error reporting and error recovery
- Ignored tokens (e.g. whitespace, comments)
- Step-by-step trace recorder for interactive visualization
"""

class Token:
    def __init__(self, token_type, lexeme, line, column, is_error=False, is_ignored=False):
        self.type = token_type
        self.lexeme = lexeme
        self.line = line
        self.column = column
        self.is_error = is_error
        self.is_ignored = is_ignored

    def __repr__(self):
        if self.is_error:
            return f"ERROR('{self.lexeme}', line {self.line}, col {self.column})"
        return f"{self.type}('{self.lexeme}', line {self.line}, col {self.column})"

    def to_dict(self):
        return {
            "type": self.type,
            "lexeme": self.lexeme,
            "line": self.line,
            "column": self.column,
            "isError": self.is_error,
            "isIgnored": self.is_ignored
        }


class LexerEngine:
    def __init__(self, min_dfa):
        self.dfa = min_dfa

    def tokenize(self, source_code, include_ignored=False):
        """
        Tokenizes the input string using the Maximal Munch algorithm.
        Returns (tokens, errors, trace).
        """
        tokens = []
        errors = []
        trace = []

        n = len(source_code)
        pos = 0

        # Calculate line and column for each index in source_code
        # index -> (line, col)
        coords = []
        cur_line = 1
        cur_col = 1
        for char in source_code:
            coords.append((cur_line, cur_col))
            if char == '\n':
                cur_line += 1
                cur_col = 1
            else:
                cur_col += 1
        coords.append((cur_line, cur_col)) # EOF coord

        start_state = self.dfa.start_state
        if not start_state:
            return tokens, errors, trace

        step_counter = 0

        while pos < n:
            current_state = start_state
            scan_pos = pos

            last_accept_pos = None
            last_accept_token = None
            last_accept_ignored = False
            last_accept_state_label = None

            # If start state itself is accepting (e.g. matches empty string)
            if current_state.is_accept:
                last_accept_pos = scan_pos
                last_accept_token = current_state.token_name
                last_accept_ignored = current_state.is_ignored
                last_accept_state_label = current_state.label

            trace.append({
                "step": step_counter,
                "action": "START_LEXEME",
                "pos": pos,
                "state": current_state.label,
                "char": source_code[pos] if pos < n else "EOF",
                "lexeme": "",
                "description": f"Start scan at line {coords[pos][0]}, col {coords[pos][1]} from state {current_state.label}"
            })
            step_counter += 1

            # Traverse DFA as far as possible
            while scan_pos < n:
                char = source_code[scan_pos]
                next_state = current_state.transitions.get(char)

                if next_state is None:
                    # No transition possible on this character
                    trace.append({
                        "step": step_counter,
                        "action": "NO_TRANSITION",
                        "pos": scan_pos,
                        "state": current_state.label,
                        "char": char,
                        "lexeme": source_code[pos:scan_pos],
                        "description": f"No transition from state {current_state.label} on '{_escape_char(char)}'"
                    })
                    step_counter += 1
                    break

                current_state = next_state
                scan_pos += 1

                if current_state.is_accept:
                    last_accept_pos = scan_pos
                    last_accept_token = current_state.token_name
                    last_accept_ignored = current_state.is_ignored
                    last_accept_state_label = current_state.label

                    trace.append({
                        "step": step_counter,
                        "action": "ACCEPT_CANDIDATE",
                        "pos": scan_pos,
                        "state": current_state.label,
                        "char": char,
                        "lexeme": source_code[pos:scan_pos],
                        "description": f"Reached accepting state {current_state.label} [{current_state.token_name}] with lexeme '{source_code[pos:scan_pos]}'"
                    })
                    step_counter += 1
                else:
                    trace.append({
                        "step": step_counter,
                        "action": "CONSUME",
                        "pos": scan_pos,
                        "state": current_state.label,
                        "char": char,
                        "lexeme": source_code[pos:scan_pos],
                        "description": f"Transitioned to state {current_state.label} on '{_escape_char(char)}'"
                    })
                    step_counter += 1

            # Evaluate outcome: Maximal Munch
            if last_accept_pos is not None and last_accept_pos > pos:
                # Successfully recognized longest match!
                lexeme = source_code[pos:last_accept_pos]
                line, col = coords[pos]
                tok = Token(last_accept_token, lexeme, line, col, is_ignored=last_accept_ignored)

                if not last_accept_ignored or include_ignored:
                    tokens.append(tok)

                trace.append({
                    "step": step_counter,
                    "action": "EMIT_TOKEN",
                    "pos": last_accept_pos,
                    "state": last_accept_state_label,
                    "char": "",
                    "lexeme": lexeme,
                    "token": tok.to_dict(),
                    "description": f"Emitted {last_accept_token}('{lexeme}') at line {line}, col {col}" + (" (ignored)" if last_accept_ignored else "")
                })
                step_counter += 1

                pos = last_accept_pos
            else:
                # Lexical Error: no accepting state was reached
                err_char = source_code[pos]
                line, col = coords[pos]
                err_tok = Token("LEXICAL_ERROR", err_char, line, col, is_error=True)
                errors.append(err_tok)
                tokens.append(err_tok)

                trace.append({
                    "step": step_counter,
                    "action": "LEXICAL_ERROR",
                    "pos": pos,
                    "state": current_state.label,
                    "char": err_char,
                    "lexeme": err_char,
                    "token": err_tok.to_dict(),
                    "description": f"Lexical error: unexpected character '{_escape_char(err_char)}' at line {line}, col {col}"
                })
                step_counter += 1

                # Error recovery: discard offending character and continue
                pos += 1

        return tokens, errors, trace


def _escape_char(c):
    if c == '\n':
        return '\\n'
    elif c == '\t':
        return '\\t'
    elif c == ' ':
        return '␣'
    return c
