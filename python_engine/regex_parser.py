r"""
regex_parser.py
Module for parsing regular expressions into postfix notation using the Shunting-Yard algorithm.
Supports:
- Union (|)
- Concatenation (implicit or explicit)
- Kleene star (*)
- Positive closure (+)
- Optional (?)
- Grouping ()
- Character classes [a-z0-9_], [^...]
- Escaped characters (\n, \t, \s, \d, \w, \., etc.)
"""

import sys

# Special operator symbols used in postfix
CONCAT_OP = '·'
UNION_OP = '|'
STAR_OP = '*'
PLUS_OP = '+'
OPT_OP = '?'

class RegexToken:
    """Represents a token in the regex: literal, char class, or operator."""
    def __init__(self, token_type, value):
        self.type = token_type  # 'LITERAL', 'CHAR_CLASS', 'OP'
        self.value = value      # char, set of chars, or operator string

    def __repr__(self):
        if self.type == 'CHAR_CLASS':
            if len(self.value) <= 5:
                sorted_chars = sorted(list(self.value))
                return f"Class({''.join(sorted_chars)})"
            return f"Class({len(self.value)} chars)"
        return f"{self.value}"

    def matches(self, char):
        if self.type == 'LITERAL':
            return self.value == char
        elif self.type == 'CHAR_CLASS':
            return char in self.value
        return False


def expand_character_class(class_str):
    """
    Expands a character class string like [a-zA-Z0-9_] or [^a-z] into a set of characters.
    """
    assert class_str.startswith('[') and class_str.endswith(']')
    inner = class_str[1:-1]
    negated = False
    if inner.startswith('^'):
        negated = True
        inner = inner[1:]

    chars = set()
    i = 0
    n = len(inner)
    while i < n:
        if inner[i] == '\\' and i + 1 < n:
            esc = inner[i + 1]
            if esc == 'n':
                chars.add('\n')
            elif esc == 't':
                chars.add('\t')
            elif esc == 'r':
                chars.add('\r')
            elif esc == 's':
                chars.update({' ', '\t', '\n', '\r'})
            elif esc == 'd':
                chars.update({chr(c) for c in range(ord('0'), ord('9') + 1)})
            elif esc == 'w':
                chars.update({chr(c) for c in range(ord('a'), ord('z') + 1)})
                chars.update({chr(c) for c in range(ord('A'), ord('Z') + 1)})
                chars.update({chr(c) for c in range(ord('0'), ord('9') + 1)})
                chars.add('_')
            else:
                chars.add(esc)
            i += 2
        elif i + 2 < n and inner[i + 1] == '-':
            # Range e.g. a-z
            start_c = inner[i]
            end_c = inner[i + 2]
            for c in range(ord(start_c), ord(end_c) + 1):
                chars.add(chr(c))
            i += 3
        else:
            chars.add(inner[i])
            i += 1

    if negated:
        # Printable ASCII + whitespace
        all_ascii = {chr(c) for c in range(32, 127)} | {'\t', '\n', '\r'}
        chars = all_ascii - chars

    return chars


def tokenize_regex(pattern):
    """
    Tokenizes a raw regex string into a list of RegexToken objects.
    Expands escape sequences and character classes.
    """
    tokens = []
    i = 0
    n = len(pattern)

    while i < n:
        c = pattern[i]
        if c == '\\':
            if i + 1 >= n:
                raise ValueError("Trailing backslash in regex")
            nxt = pattern[i + 1]
            if nxt == 'n':
                tokens.append(RegexToken('LITERAL', '\n'))
            elif nxt == 't':
                tokens.append(RegexToken('LITERAL', '\t'))
            elif nxt == 'r':
                tokens.append(RegexToken('LITERAL', '\r'))
            elif nxt == 's':
                tokens.append(RegexToken('CHAR_CLASS', {' ', '\t', '\n', '\r'}))
            elif nxt == 'd':
                tokens.append(RegexToken('CHAR_CLASS', {chr(x) for x in range(ord('0'), ord('9') + 1)}))
            elif nxt == 'w':
                chars = {chr(x) for x in range(ord('a'), ord('z') + 1)} | \
                        {chr(x) for x in range(ord('A'), ord('Z') + 1)} | \
                        {chr(x) for x in range(ord('0'), ord('9') + 1)} | {'_'}
                tokens.append(RegexToken('CHAR_CLASS', chars))
            else:
                # Escaped literal e.g. \+, \*, \., \(
                tokens.append(RegexToken('LITERAL', nxt))
            i += 2
        elif c == '[':
            # Parse character class until matching unescaped ']'
            j = i + 1
            if j < n and pattern[j] == '^':
                j += 1
            if j < n and pattern[j] == ']':
                j += 1
            while j < n and pattern[j] != ']':
                if pattern[j] == '\\':
                    j += 2
                else:
                    j += 1
            if j >= n:
                raise ValueError(f"Unclosed character class in regex: {pattern}")
            class_str = pattern[i:j+1]
            char_set = expand_character_class(class_str)
            tokens.append(RegexToken('CHAR_CLASS', char_set))
            i = j + 1
        elif c == '.':
            # Wildcard: all printable ASCII
            all_printable = {chr(x) for x in range(32, 127)}
            tokens.append(RegexToken('CHAR_CLASS', all_printable))
            i += 1
        elif c in ('|', '*', '+', '?', '(', ')'):
            tokens.append(RegexToken('OP', c))
            i += 1
        else:
            tokens.append(RegexToken('LITERAL', c))
            i += 1

    return tokens


def insert_explicit_concat(tokens):
    """
    Inserts explicit concatenation operators between adjacent operands.
    Operands include: LITERAL, CHAR_CLASS, ')', '*', '+', '?'
    Specifically:
    Insert CONCAT between:
    - operand and operand
    - operand and '('
    - ')' and operand
    - ')' and '('
    - post-operators (*, +, ?) and operand
    - post-operators (*, +, ?) and '('
    """
    if not tokens:
        return []

    result = []
    post_ops = {'*', '+', '?'}

    for i in range(len(tokens)):
        t1 = tokens[i]
        result.append(t1)

        if i + 1 < len(tokens):
            t2 = tokens[i + 1]

            t1_is_operand = (t1.type in ('LITERAL', 'CHAR_CLASS')) or \
                            (t1.type == 'OP' and (t1.value in post_ops or t1.value == ')'))

            t2_is_operand = (t2.type in ('LITERAL', 'CHAR_CLASS')) or \
                            (t2.type == 'OP' and t2.value == '(')

            if t1_is_operand and t2_is_operand:
                result.append(RegexToken('OP', CONCAT_OP))

    return result


def regex_to_postfix(pattern):
    """
    Converts a regular expression string into a list of postfix tokens using Shunting-Yard.
    Precedence:
      *, +, ?: 3 (unary postfix)
      · (concat): 2 (binary left-assoc)
      | (union): 1 (binary left-assoc)
    """
    raw_tokens = tokenize_regex(pattern)
    tokens = insert_explicit_concat(raw_tokens)

    precedence = {
        STAR_OP: 3,
        PLUS_OP: 3,
        OPT_OP: 3,
        CONCAT_OP: 2,
        UNION_OP: 1
    }

    output = []
    op_stack = []

    for token in tokens:
        if token.type in ('LITERAL', 'CHAR_CLASS'):
            output.append(token)
        elif token.type == 'OP':
            op = token.value
            if op in (STAR_OP, PLUS_OP, OPT_OP):
                # Unary postfix operator: immediately append or treat as high precedence
                # In Shunting-Yard, postfix operators can go directly to output
                output.append(token)
            elif op in (CONCAT_OP, UNION_OP):
                while op_stack and op_stack[-1].value != '(':
                    top_prec = precedence.get(op_stack[-1].value, 0)
                    cur_prec = precedence[op]
                    if top_prec >= cur_prec:
                        output.append(op_stack.pop())
                    else:
                        break
                op_stack.append(token)
            elif op == '(':
                op_stack.append(token)
            elif op == ')':
                matched = False
                while op_stack:
                    top = op_stack.pop()
                    if top.value == '(':
                        matched = True
                        break
                    output.append(top)
                if not matched:
                    raise ValueError(f"Mismatched parentheses in regex: {pattern}")

    while op_stack:
        top = op_stack.pop()
        if top.value == '(':
            raise ValueError(f"Mismatched parentheses in regex: {pattern}")
        output.append(top)

    return output
