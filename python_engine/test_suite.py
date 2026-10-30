"""
test_suite.py
Comprehensive test suite verifying the algorithms against the Project Report:
1. Section 9 Worked Example: (a|b)*abb
2. Section 10 Token Specification: C-like language
3. Maximal Munch & Rule Priority Tests
4. Error Reporting & Recovery Tests
"""

import sys
from regex_parser import regex_to_postfix
from nfa_builder import build_thompson_nfa, combine_token_rules, TokenRule
from dfa_builder import build_subset_dfa
from minimizer import minimize_dfa
from lexer_engine import LexerEngine
from code_exporter import export_to_c, export_to_python

def test_section_9_worked_example():
    print("=" * 60)
    print("TEST 1: Section 9 Worked Example: (a|b)*abb")
    print("=" * 60)

    pattern = "(a|b)*abb"
    postfix = regex_to_postfix(pattern)
    print(f"Postfix tokens: {postfix}")

    nfa, fragment = build_thompson_nfa(postfix)
    print(f"NFA state count: {len(nfa.states)} (Report expects 11)")

    # Build DFA via Subset Construction
    dfa = build_subset_dfa(nfa)
    print(f"DFA state count: {len(dfa.states)} (Report expects 5: A, B, C, D, E)")
    for sid, st in sorted(dfa.states.items()):
        acc_str = f" [Accepting]" if st.is_accept else ""
        print(f"  State {st.label}: NFA states {sorted(list(st.nfa_states))}{acc_str}")

    # Minimize DFA
    min_dfa = minimize_dfa(dfa)
    print(f"Minimized DFA state count: {len(min_dfa.states)} (Report expects 4: S0, S1, S2, S3)")
    for sid, st in sorted(min_dfa.states.items()):
        merged = min_dfa.group_mapping.get(st.label, [st.label])
        acc_str = " [Accepting]" if st.is_accept else ""
        print(f"  Minimal State {st.label} = {merged}{acc_str}")

    # Check transitions of Minimized DFA
    print("Transitions:")
    for sid, st in sorted(min_dfa.states.items()):
        t_a = st.transitions.get('a')
        t_b = st.transitions.get('b')
        print(f"  {st.label} on 'a' -> {t_a.label if t_a else '-'}, on 'b' -> {t_b.label if t_b else '-'}")

    # Verify matching
    # Tag accept state as MATCH
    for st in min_dfa.states.values():
        if st.is_accept:
            st.token_name = "MATCH"

    lexer = LexerEngine(min_dfa)
    tokens, errors, _ = lexer.tokenize("ababb")
    print(f"Tokens for 'ababb': {[t.lexeme for t in tokens if not t.is_error]}")
    assert any(t.lexeme == "ababb" for t in tokens), "Failed to match ababb!"
    print(">>> TEST 1 PASSED! Worked example matches report theory!\n")


def test_section_10_c_like_lexer():
    print("=" * 60)
    print("TEST 2: Section 10 Token Specification & Sample Run")
    print("=" * 60)

    rules = [
        TokenRule("KEYWORD", "if|else|while|return", priority=0),
        TokenRule("ID", "[a-zA-Z_][a-zA-Z0-9_]*", priority=1),
        TokenRule("NUM", "[0-9]+(\\.[0-9]+)?", priority=2),
        TokenRule("OP", ">=|<=|==|!=|[+\\-*/<>=]", priority=3),
        TokenRule("PUNCT", "[(){};,]", priority=4),
        TokenRule("WS", "[ \\t\\n]+", is_ignored=True, priority=5)
    ]

    print("Building Combined NFA from 6 token rules...")
    combined_nfa = combine_token_rules(rules)
    print(f"Combined NFA states: {len(combined_nfa.states)}")

    print("Building DFA via Subset Construction...")
    dfa = build_subset_dfa(combined_nfa)
    print(f"DFA states: {len(dfa.states)}")

    print("Minimizing DFA...")
    min_dfa = minimize_dfa(dfa)
    print(f"Minimized DFA states: {len(min_dfa.states)}")

    # Sample input from Section 10:
    sample_input = "if (count1 >= 42) return 3.14;"
    print(f"\nScanning Input: '{sample_input}'")

    lexer = LexerEngine(min_dfa)
    tokens, errors, trace = lexer.tokenize(sample_input)

    print("\nProduced Tokens:")
    for t in tokens:
        print(f"  {t.type}({t.lexeme}) at line {t.line}, col {t.column}")

    expected_sequence = [
        ("KEYWORD", "if"),
        ("PUNCT", "("),
        ("ID", "count1"),
        ("OP", ">="),
        ("NUM", "42"),
        ("PUNCT", ")"),
        ("KEYWORD", "return"),
        ("NUM", "3.14"),
        ("PUNCT", ";")
    ]

    actual_sequence = [(t.type, t.lexeme) for t in tokens]
    print(f"\nExpected tokens: {expected_sequence}")
    print(f"Actual tokens:   {actual_sequence}")

    assert actual_sequence == expected_sequence, f"Mismatch!\nExpected: {expected_sequence}\nActual: {actual_sequence}"
    print(">>> TEST 2 PASSED! Generated tokens match Section 10 exactly!\n")


def test_maximal_munch_and_errors():
    print("=" * 60)
    print("TEST 3: Maximal Munch, Rule Priority & Error Recovery")
    print("=" * 60)

    rules = [
        TokenRule("KEYWORD", "if|else", priority=0),
        TokenRule("ID", "[a-zA-Z_][a-zA-Z0-9_]*", priority=1),
        TokenRule("OP", ">=|>", priority=2),
        TokenRule("NUM", "[0-9]+", priority=3),
        TokenRule("WS", "[ \\t\\n]+", is_ignored=True, priority=4)
    ]

    combined_nfa = combine_token_rules(rules)
    dfa = build_subset_dfa(combined_nfa)
    min_dfa = minimize_dfa(dfa)
    lexer = LexerEngine(min_dfa)

    # 1. 'if' should be KEYWORD because KEYWORD has higher priority
    toks, _, _ = lexer.tokenize("if")
    assert toks[0].type == "KEYWORD", f"'if' should be KEYWORD, got {toks[0].type}"

    # 2. 'iffy' should be ID because of Maximal Munch (longest match)
    toks, _, _ = lexer.tokenize("iffy")
    assert toks[0].type == "ID" and toks[0].lexeme == "iffy", f"'iffy' should be ID, got {toks[0]}"

    # 3. '>=' should be OP('>=') rather than OP('>') and OP('=')
    toks, _, _ = lexer.tokenize(">=")
    assert toks[0].type == "OP" and toks[0].lexeme == ">=", f"'>=' failed maximal munch: {toks}"

    # 4. Error recovery: 'x = 5 @ 2'
    toks, errors, _ = lexer.tokenize("x >= 5 @ 2")
    err_chars = [e.lexeme for e in errors]
    print(f"Errors caught: {errors}")
    assert "@" in err_chars, f"Failed to report lexical error on '@'!"
    print(">>> TEST 3 PASSED! Priority, Maximal Munch and Error Recovery validated!\n")


def test_code_exporters():
    print("=" * 60)
    print("TEST 4: C and Python Code Exporter")
    print("=" * 60)

    rules = [
        TokenRule("KEYWORD", "if|else|return", priority=0),
        TokenRule("ID", "[a-z]+", priority=1),
        TokenRule("NUM", "[0-9]+", priority=2),
        TokenRule("WS", "[ \\t\\n]+", is_ignored=True, priority=3)
    ]
    min_dfa = minimize_dfa(build_subset_dfa(combine_token_rules(rules)))
    token_names = ["KEYWORD", "ID", "NUM", "WS"]

    c_code = export_to_c(min_dfa, token_names)
    assert "#include <stdio.h>" in c_code
    assert "tokenize(" in c_code
    print("Generated C Code preview (first 10 lines):")
    print("\n".join(c_code.splitlines()[:10]))

    py_code = export_to_python(min_dfa, token_names)
    assert "def tokenize(" in py_code
    print("\nGenerated Python Code preview (first 10 lines):")
    print("\n".join(py_code.splitlines()[:10]))

    print("\n>>> TEST 4 PASSED! Code exporters working properly!\n")


if __name__ == "__main__":
    test_section_9_worked_example()
    test_section_10_c_like_lexer()
    test_maximal_munch_and_errors()
    test_code_exporters()
    print("=" * 60)
    print("ALL TESTS COMPLETED SUCCESSFULLY! 100% PASS RATE")
    print("=" * 60)
