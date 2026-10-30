"""
cli.py
Command-Line Interface for the Regex to DFA Lexer Generator.
Usage:
  python cli.py --rules rules.txt --input source.txt
  python cli.py --preset sample
  python cli.py --preset worked_example
"""

import argparse
import sys
from regex_parser import regex_to_postfix
from nfa_builder import build_thompson_nfa, combine_token_rules, TokenRule
from dfa_builder import build_subset_dfa
from minimizer import minimize_dfa
from lexer_engine import LexerEngine
from code_exporter import export_to_c, export_to_python

def parse_rules_file(filepath):
    rules = []
    priority = 0
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split(None, 1)
            if len(parts) < 2:
                continue
            name = parts[0]
            rest = parts[1].strip()
            is_ignored = False
            if rest.endswith('(ignore)'):
                is_ignored = True
                rest = rest[:-8].strip()
            rules.append(TokenRule(name, rest, is_ignored=is_ignored, priority=priority))
            priority += 1
    return rules

def get_preset_rules(name):
    if name == "worked_example":
        return [TokenRule("MATCH", "(a|b)*abb", priority=0)], "ababb"
    else: # sample from section 10
        rules = [
            TokenRule("KEYWORD", "if|else|while|return", priority=0),
            TokenRule("ID", "[a-zA-Z_][a-zA-Z0-9_]*", priority=1),
            TokenRule("NUM", "[0-9]+(\\.[0-9]+)?", priority=2),
            TokenRule("OP", ">=|<=|==|!=|[+\\-*/<>=]", priority=3),
            TokenRule("PUNCT", "[(){};,]", priority=4),
            TokenRule("WS", "[ \\t\\n]+", is_ignored=True, priority=5)
        ]
        return rules, "if (count1 >= 42) return 3.14;"

def main():
    parser = argparse.ArgumentParser(description="Regex to DFA Lexer Generator")
    parser.add_argument("--preset", choices=["sample", "worked_example"], default="sample", help="Run with standard presets")
    parser.add_argument("--rules", help="Path to token specification rules file")
    parser.add_argument("--input", help="Source code string or file to tokenize")
    parser.add_argument("--export-c", help="Save standalone C scanner to file")
    parser.add_argument("--export-py", help="Save standalone Python scanner to file")
    args = parser.parse_args()

    if args.rules:
        rules = parse_rules_file(args.rules)
        source = args.input or ""
    else:
        rules, default_source = get_preset_rules(args.preset)
        source = args.input or default_source

    print("=" * 60)
    print("Regex to DFA Lexer Generator - Pipeline Execution")
    print("=" * 60)
    print(f"Token Rules ({len(rules)} rules):")
    for r in rules:
        ign = " (ignored)" if r.is_ignored else ""
        print(f"  {r.name:<10}: {r.pattern}{ign}")

    print("\n[Stage 1 & 2] Building Thompson NFA...")
    nfa = combine_token_rules(rules)
    print(f"  -> NFA States: {len(nfa.states)}")

    print("\n[Stage 3] Building DFA via Subset Construction...")
    dfa = build_subset_dfa(nfa)
    print(f"  -> DFA States: {len(dfa.states)}")

    print("\n[Stage 4] Minimizing DFA using Hopcroft Partition Refinement...")
    min_dfa = minimize_dfa(dfa)
    print(f"  -> Minimized DFA States: {len(min_dfa.states)}")
    print(f"  -> State Reduction: {len(nfa.states)} NFA -> {len(dfa.states)} DFA -> {len(min_dfa.states)} Minimal")

    print("\n[Stage 5] Tokenizing Source Input with Maximal Munch...")
    print(f"  Input: {repr(source)}")
    lexer = LexerEngine(min_dfa)
    tokens, errors, _ = lexer.tokenize(source)

    print("\nTokens Produced:")
    for t in tokens:
        if t.is_error:
            print(f"  [ERROR] Line {t.line}, Col {t.column}: Unexpected char '{t.lexeme}'")
        else:
            print(f"  {t.type:<12} : {repr(t.lexeme):<15} (line {t.line}, col {t.column})")

    if args.export_c:
        c_code = export_to_c(min_dfa, [r.name for r in rules])
        with open(args.export_c, 'w', encoding='utf-8') as f:
            f.write(c_code)
        print(f"\n[Export] Standalone C code written to: {args.export_c}")

    if args.export_py:
        py_code = export_to_python(min_dfa, [r.name for r in rules])
        with open(args.export_py, 'w', encoding='utf-8') as f:
            f.write(py_code)
        print(f"\n[Export] Standalone Python code written to: {args.export_py}")

if __name__ == "__main__":
    main()
