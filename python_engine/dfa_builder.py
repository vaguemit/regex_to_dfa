"""
dfa_builder.py
Implements the Subset Construction algorithm to convert an NFA into a DFA.
Uses frozensets to represent DFA states as sets of NFA state IDs.
Resolves token conflicts using rule priority (lowest rule index wins).
"""

from collections import deque
from nfa_builder import EPSILON, RegexToken

class DFAState:
    def __init__(self, state_id, nfa_states, label=None):
        self.id = state_id               # Integer ID (0, 1, 2...)
        self.label = label or str(state_id) # 'A', 'B', 'C'... or 'S0', 'S1'...
        self.nfa_states = frozenset(nfa_states) # frozenset of NFA state IDs
        self.transitions = {}            # char/symbol -> target DFAState
        self.is_accept = False
        self.token_name = None
        self.rule_index = None
        self.is_ignored = False

    def __repr__(self):
        acc = f", accept={self.token_name}" if self.is_accept else ""
        return f"DFAState({self.label}, NFA={sorted(list(self.nfa_states))}{acc})"


class DFA:
    def __init__(self):
        self.states = {}         # state_id -> DFAState
        self.start_state = None  # DFAState
        self.alphabet = set()    # Set of distinct symbols

    def add_state(self, dfa_state):
        self.states[dfa_state.id] = dfa_state
        return dfa_state

    def to_dot(self, title="DFA"):
        """Generates Graphviz DOT representation of the DFA."""
        dot = [f'digraph "{title}" {{', '  rankdir=LR;', '  node [shape=circle, fontname="Helvetica"];', '  edge [fontname="Helvetica"];']
        dot.append('  __start [shape=none, label="", width=0, height=0];')
        if self.start_state:
            dot.append(f'  __start -> {self.start_state.id};')

        for sid, state in sorted(self.states.items()):
            nfa_str = "{" + ",".join(map(str, sorted(state.nfa_states))) + "}"
            if state.is_accept:
                lbl = f"{state.label}\\n{nfa_str}\\n[{state.token_name}]"
                dot.append(f'  {sid} [shape=doublecircle, label="{lbl}", color="#10b981", style=bold];')
            else:
                lbl = f"{state.label}\\n{nfa_str}"
                dot.append(f'  {sid} [label="{lbl}"];')

            # Group transitions with the same target
            target_to_syms = {}
            for sym, target in sorted(state.transitions.items(), key=lambda x: str(x[0])):
                target_to_syms.setdefault(target.id, []).append(sym)

            for tid, syms in target_to_syms.items():
                lbl = format_symbols_label(syms)
                dot.append(f'  {sid} -> {tid} [label="{lbl}"];')

        dot.append('}')
        return '\n'.join(dot)

    def to_table(self):
        """Returns rows for the DFA transition table."""
        # Sort alphabet for clean table columns
        cols = sorted(list(self.alphabet), key=lambda x: (len(str(x)), str(x)))
        rows = []
        for sid, state in sorted(self.states.items()):
            row = {
                "state": state.label,
                "nfa_states": sorted(list(state.nfa_states)),
                "is_accept": state.is_accept,
                "token": state.token_name if state.is_accept else "-",
                "transitions": {}
            }
            for sym in cols:
                tgt = state.transitions.get(sym)
                row["transitions"][sym] = tgt.label if tgt else "-"
            rows.append(row)
        return {"columns": cols, "rows": rows}

    def to_json(self):
        """Serializes DFA to JSON-friendly dict for visualization."""
        nodes = []
        for sid, state in sorted(self.states.items()):
            nodes.append({
                "id": sid,
                "label": state.label,
                "nfaStates": sorted(list(state.nfa_states)),
                "isStart": self.start_state and sid == self.start_state.id,
                "isAccept": state.is_accept,
                "tokenName": state.token_name,
                "ruleIndex": state.rule_index,
                "isIgnored": state.is_ignored
            })

        edges = []
        for sid, state in sorted(self.states.items()):
            target_to_syms = {}
            for sym, target in state.transitions.items():
                target_to_syms.setdefault(target.id, []).append(sym)

            for tid, syms in target_to_syms.items():
                edges.append({
                    "from": sid,
                    "to": tid,
                    "label": format_symbols_label(syms),
                    "symbols": [s if isinstance(s, str) else str(s) for s in syms]
                })

        return {
            "startState": self.start_state.id if self.start_state else None,
            "stateCount": len(self.states),
            "alphabet": [s if isinstance(s, str) else str(s) for s in sorted(list(self.alphabet), key=str)],
            "nodes": nodes,
            "edges": edges,
            "table": self.to_table()
        }


def format_symbols_label(symbols):
    """Formats a list of transition symbols cleanly for display."""
    clean = []
    for s in symbols:
        if s == ' ':
            clean.append('␣')
        elif s == '\n':
            clean.append('\\n')
        elif s == '\t':
            clean.append('\\t')
        elif s == '"':
            clean.append('\\"')
        else:
            clean.append(str(s))

    # If symbols form a large consecutive range like '0'..'9' or 'a'..'z'
    if len(clean) > 8:
        return f"{clean[0]}..{clean[-1]} ({len(clean)})"
    return ", ".join(clean)


def epsilon_closure(nfa, state_ids):
    """
    Computes the ε-closure of a set of NFA state IDs.
    Returns a frozenset of all NFA state IDs reachable via ε-transitions.
    """
    closure = set(state_ids)
    stack = list(state_ids)

    while stack:
        curr_id = stack.pop()
        curr_state = nfa.states[curr_id]
        eps_targets = curr_state.transitions.get(EPSILON, set())
        for target_id in eps_targets:
            if target_id not in closure:
                closure.add(target_id)
                stack.append(target_id)

    return frozenset(closure)


def nfa_move(nfa, state_ids, symbol):
    """
    Computes the move(T, symbol) operation:
    The set of all NFA state IDs reachable from any state in state_ids on symbol.
    """
    targets = set()
    for sid in state_ids:
        state = nfa.states[sid]
        for trans_sym, trans_targets in state.transitions.items():
            if trans_sym is EPSILON:
                continue
            if isinstance(trans_sym, str) and trans_sym == symbol:
                targets.update(trans_targets)
            elif isinstance(trans_sym, RegexToken) and trans_sym.matches(symbol):
                targets.update(trans_targets)
    return frozenset(targets)


def extract_alphabet(nfa):
    """
    Extracts the effective alphabet of atomic characters and classes from the NFA.
    For small alphabets (e.g. (a|b)*abb), returns {'a', 'b'}.
    For general token rules, collects all distinct literal chars and class samples.
    """
    literals = set()
    char_classes = []

    for state in nfa.states.values():
        for sym in state.transitions.keys():
            if sym is EPSILON:
                continue
            if isinstance(sym, str):
                literals.add(sym)
            elif isinstance(sym, RegexToken):
                if sym.type == 'LITERAL':
                    literals.add(sym.value)
                elif sym.type == 'CHAR_CLASS':
                    char_classes.append(sym.value)

    # Expand char_classes into characters that actually appear in classes
    # If the user has broad classes like [a-zA-Z0-9_], we add them to the alphabet
    full_alphabet = set(literals)
    for cset in char_classes:
        full_alphabet.update(cset)

    # If empty (epsilon only regex), return dummy
    if not full_alphabet:
        full_alphabet.add('a')

    return full_alphabet


def build_subset_dfa(nfa):
    """
    Section 8.4: Subset Construction.
    Converts an NFA into a DFA.
    Uses frozensets of NFA state IDs as DFA state identifiers.
    Assigns state labels A, B, C... or S0, S1, S2...
    Resolves token priority by lowest rule index.
    """
    dfa = DFA()
    alphabet = extract_alphabet(nfa)
    dfa.alphabet = alphabet

    # 1. Start state = epsilon-closure of NFA start state
    start_nfa_set = epsilon_closure(nfa, {nfa.start_state_id})

    # Label generator: A, B, C... Z, AA, AB...
    def get_label(idx):
        if idx < 26:
            return chr(ord('A') + idx)
        return f"S{idx}"

    state_map = {}  # frozenset(nfa_ids) -> DFAState
    worklist = deque()

    start_dfa_state = DFAState(0, start_nfa_set, get_label(0))
    _determine_acceptance(start_dfa_state, nfa)
    dfa.add_state(start_dfa_state)
    dfa.start_state = start_dfa_state
    state_map[start_nfa_set] = start_dfa_state
    worklist.append(start_dfa_state)

    next_id = 1

    # 2. Process worklist
    while worklist:
        curr_dfa_state = worklist.popleft()

        for sym in alphabet:
            move_set = nfa_move(nfa, curr_dfa_state.nfa_states, sym)
            if not move_set:
                continue

            closure_set = epsilon_closure(nfa, move_set)
            if not closure_set:
                continue

            if closure_set not in state_map:
                new_state = DFAState(next_id, closure_set, get_label(next_id))
                next_id += 1
                _determine_acceptance(new_state, nfa)
                dfa.add_state(new_state)
                state_map[closure_set] = new_state
                worklist.append(new_state)

            curr_dfa_state.transitions[sym] = state_map[closure_set]

    return dfa


def _determine_acceptance(dfa_state, nfa):
    """
    Determines if a DFA state is accepting, and resolves token priority
    (lowest rule index wins when multiple NFA accepting states are present).
    """
    best_rule_index = None
    best_token = None
    best_is_ignored = False
    has_accept = False

    for nfa_id in dfa_state.nfa_states:
        if nfa_id in nfa.accept_states:
            has_accept = True
            nfa_state = nfa.states[nfa_id]
            r_idx = nfa_state.rule_index if nfa_state.rule_index is not None else 999999
            if best_rule_index is None or r_idx < best_rule_index:
                best_rule_index = r_idx
                best_token = nfa_state.token_name
                best_is_ignored = nfa_state.is_ignored

    if has_accept:
        dfa_state.is_accept = True
        dfa_state.token_name = best_token or "ACCEPT"
        dfa_state.rule_index = best_rule_index if best_rule_index is not None else 0
        dfa_state.is_ignored = best_is_ignored
