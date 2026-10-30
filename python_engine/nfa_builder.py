"""
nfa_builder.py
Implements Thompson's Construction to build an NFA from a postfix regular expression,
merging concatenated states per Dragon Book / Section 8.2 & 9 of the report,
and merges multiple token NFAs into a single combined lexical NFA.
"""

from regex_parser import (
    regex_to_postfix,
    RegexToken,
    CONCAT_OP,
    UNION_OP,
    STAR_OP,
    PLUS_OP,
    OPT_OP
)

EPSILON = None  # None represents epsilon (ε) transition

class NFAState:
    def __init__(self, state_id):
        self.id = state_id
        # transitions: symbol -> set of target state_ids
        self.transitions = {}
        self.token_name = None  # If accepting: token name (e.g., 'ID', 'KEYWORD')
        self.rule_index = None  # Priority: lower index means higher priority
        self.is_ignored = False  # e.g., whitespace or comment

    def add_transition(self, symbol, target_state_id):
        if symbol not in self.transitions:
            self.transitions[symbol] = set()
        self.transitions[symbol].add(target_state_id)

    def __repr__(self):
        return f"State({self.id}, accept={self.token_name})"


class NFAFragment:
    """Represents a fragment of an NFA with one start state and one accept state."""
    def __init__(self, start_id, accept_id):
        self.start_id = start_id
        self.accept_id = accept_id


class NFA:
    def __init__(self):
        self.states = {}  # state_id -> NFAState
        self.start_state_id = None
        self.accept_states = set()  # set of state_ids
        self._next_state_id = 0

    def new_state(self):
        s = NFAState(self._next_state_id)
        self.states[self._next_state_id] = s
        self._next_state_id += 1
        return s

    def add_transition(self, from_id, symbol, to_id):
        if from_id not in self.states:
            self.states[from_id] = NFAState(from_id)
        self.states[from_id].add_transition(symbol, to_id)

    def merge_states(self, keep_id, remove_id):
        """
        Merges remove_id into keep_id:
        Transfers all outgoing transitions from remove_id to keep_id.
        Redirects all incoming transitions pointing to remove_id to point to keep_id.
        Removes remove_id from states.
        """
        if keep_id == remove_id or remove_id not in self.states:
            return

        remove_state = self.states[remove_id]
        keep_state = self.states[keep_id]

        # Transfer outgoing transitions
        for sym, targets in remove_state.transitions.items():
            for t in targets:
                # If target was remove_id itself, redirect self-loop to keep_id
                target_id = keep_id if t == remove_id else t
                keep_state.add_transition(sym, target_id)

        # Redirect incoming transitions
        for sid, state in self.states.items():
            if sid == remove_id:
                continue
            for sym, targets in list(state.transitions.items()):
                if remove_id in targets:
                    targets.remove(remove_id)
                    targets.add(keep_id)

        # Update accept_states if needed
        if remove_id in self.accept_states:
            self.accept_states.remove(remove_id)
            self.accept_states.add(keep_id)
            if remove_state.token_name:
                keep_state.token_name = remove_state.token_name
                keep_state.rule_index = remove_state.rule_index
                keep_state.is_ignored = remove_state.is_ignored

        del self.states[remove_id]

    def renumber_canonical(self):
        """
        Renumbers states starting with start_state as 0, followed by BFS order.
        Guarantees clean 0..N-1 sequential IDs.
        """
        if self.start_state_id is None or self.start_state_id not in self.states:
            return

        order = []
        visited = set()
        queue = [self.start_state_id]
        visited.add(self.start_state_id)

        while queue:
            curr = queue.pop(0)
            order.append(curr)
            curr_state = self.states[curr]
            # Visit epsilon transitions first, then symbol transitions
            next_ids = []
            for sym, targets in sorted(curr_state.transitions.items(), key=lambda x: (x[0] is not None, str(x[0]))):
                for tid in sorted(targets):
                    if tid not in visited and tid in self.states:
                        visited.add(tid)
                        queue.append(tid)

        # Add any disconnected states
        for sid in sorted(self.states.keys()):
            if sid not in visited:
                order.append(sid)

        id_map = {old: new for new, old in enumerate(order)}

        new_states = {}
        for old_id, state in self.states.items():
            new_id = id_map[old_id]
            new_s = NFAState(new_id)
            new_s.token_name = state.token_name
            new_s.rule_index = state.rule_index
            new_s.is_ignored = state.is_ignored
            for sym, targets in state.transitions.items():
                for tid in targets:
                    if tid in id_map:
                        new_s.add_transition(sym, id_map[tid])
            new_states[new_id] = new_s

        self.states = new_states
        self.start_state_id = id_map[self.start_state_id]
        self.accept_states = {id_map[aid] for aid in self.accept_states if aid in id_map}
        self._next_state_id = len(new_states)

    def to_dot(self, title="NFA"):
        """Generates Graphviz DOT representation of the NFA."""
        dot = [f'digraph "{title}" {{', '  rankdir=LR;', '  node [shape=circle, fontname="Helvetica"];', '  edge [fontname="Helvetica"];']
        dot.append('  __start [shape=none, label="", width=0, height=0];')
        dot.append(f'  __start -> {self.start_state_id};')

        for sid, state in sorted(self.states.items()):
            if sid in self.accept_states:
                label = f"{sid}\\n[{state.token_name}]" if state.token_name else f"{sid}"
                dot.append(f'  {sid} [shape=doublecircle, label="{label}", color="#10b981", style=bold];')
            else:
                dot.append(f'  {sid} [label="{sid}"];')

            for sym, targets in sorted(state.transitions.items(), key=lambda x: str(x[0])):
                for tid in sorted(targets):
                    if sym is EPSILON:
                        dot.append(f'  {sid} -> {tid} [label="ε", style=dashed, color="#6b7280"];')
                    elif isinstance(sym, RegexToken) and sym.type == 'CHAR_CLASS':
                        if len(sym.value) == 10 and all(c.isdigit() for c in sym.value):
                            lbl = "[0-9]"
                        elif len(sym.value) == 52:
                            lbl = "[a-zA-Z]"
                        elif len(sym.value) == 63:
                            lbl = "[a-zA-Z0-9_]"
                        elif len(sym.value) <= 4:
                            lbl = "[" + "".join(sorted(list(sym.value))) + "]"
                        else:
                            lbl = f"[{len(sym.value)} chars]"
                        dot.append(f'  {sid} -> {tid} [label="{lbl}"];')
                    else:
                        s_str = sym
                        if s_str == '"':
                            s_str = '\\"'
                        elif s_str == '\\':
                            s_str = '\\\\'
                        elif s_str == '\n':
                            s_str = '\\\\n'
                        elif s_str == '\t':
                            s_str = '\\\\t'
                        elif s_str == ' ':
                            s_str = '␣'
                        dot.append(f'  {sid} -> {tid} [label="{s_str}"];')

        dot.append('}')
        return '\n'.join(dot)

    def to_json(self):
        nodes = []
        for sid, state in sorted(self.states.items()):
            nodes.append({
                "id": sid,
                "label": str(sid),
                "isStart": sid == self.start_state_id,
                "isAccept": sid in self.accept_states,
                "tokenName": state.token_name,
                "ruleIndex": state.rule_index,
                "isIgnored": state.is_ignored
            })

        edges = []
        for sid, state in sorted(self.states.items()):
            for sym, targets in state.transitions.items():
                for tid in targets:
                    if sym is EPSILON:
                        label = "ε"
                        is_eps = True
                    elif isinstance(sym, RegexToken) and sym.type == 'CHAR_CLASS':
                        if len(sym.value) == 10 and all(c.isdigit() for c in sym.value):
                            label = "[0-9]"
                        elif len(sym.value) == 52:
                            label = "[a-zA-Z]"
                        elif len(sym.value) == 63:
                            label = "[a-zA-Z0-9_]"
                        elif len(sym.value) <= 5:
                            label = "[" + "".join(sorted(list(sym.value))) + "]"
                        else:
                            label = f"[{len(sym.value)} chars]"
                        is_eps = False
                    else:
                        label = "␣" if sym == " " else ("\\n" if sym == "\n" else ("\\t" if sym == "\t" else str(sym)))
                        is_eps = False

                    edges.append({
                        "from": sid,
                        "to": tid,
                        "label": label,
                        "isEpsilon": is_eps,
                        "symbol": sym.value if isinstance(sym, RegexToken) else sym
                    })

        return {
            "startState": self.start_state_id,
            "acceptStates": list(self.accept_states),
            "stateCount": len(self.states),
            "nodes": nodes,
            "edges": edges
        }


def build_thompson_nfa(postfix_tokens):
    """
    Builds an NFA fragment from postfix tokens using Thompson's construction.
    Concatenation merges the accepting state of the first fragment with the start of the second.
    Returns (nfa, fragment).
    """
    nfa = NFA()
    stack = []

    for token in postfix_tokens:
        if token.type in ('LITERAL', 'CHAR_CLASS'):
            s = nfa.new_state()
            f = nfa.new_state()
            sym = token.value if token.type == 'LITERAL' else token
            nfa.add_transition(s.id, sym, f.id)
            stack.append(NFAFragment(s.id, f.id))

        elif token.type == 'OP':
            op = token.value
            if op == CONCAT_OP:
                f2 = stack.pop()
                f1 = stack.pop()
                # Merge f1.accept and f2.start
                nfa.merge_states(f1.accept_id, f2.start_id)
                new_accept = f1.accept_id if f2.start_id == f2.accept_id else f2.accept_id
                stack.append(NFAFragment(f1.start_id, new_accept))

            elif op == UNION_OP:
                f2 = stack.pop()
                f1 = stack.pop()
                s = nfa.new_state()
                f = nfa.new_state()
                nfa.add_transition(s.id, EPSILON, f1.start_id)
                nfa.add_transition(s.id, EPSILON, f2.start_id)
                nfa.add_transition(f1.accept_id, EPSILON, f.id)
                nfa.add_transition(f2.accept_id, EPSILON, f.id)
                stack.append(NFAFragment(s.id, f.id))

            elif op == STAR_OP:
                f1 = stack.pop()
                s = nfa.new_state()
                f = nfa.new_state()
                nfa.add_transition(s.id, EPSILON, f1.start_id)
                nfa.add_transition(s.id, EPSILON, f.id)
                nfa.add_transition(f1.accept_id, EPSILON, f1.start_id)
                nfa.add_transition(f1.accept_id, EPSILON, f.id)
                stack.append(NFAFragment(s.id, f.id))

            elif op == PLUS_OP:
                f1 = stack.pop()
                s = nfa.new_state()
                f = nfa.new_state()
                nfa.add_transition(s.id, EPSILON, f1.start_id)
                nfa.add_transition(f1.accept_id, EPSILON, f1.start_id)
                nfa.add_transition(f1.accept_id, EPSILON, f.id)
                stack.append(NFAFragment(s.id, f.id))

            elif op == OPT_OP:
                f1 = stack.pop()
                s = nfa.new_state()
                f = nfa.new_state()
                nfa.add_transition(s.id, EPSILON, f1.start_id)
                nfa.add_transition(s.id, EPSILON, f.id)
                nfa.add_transition(f1.accept_id, EPSILON, f.id)
                stack.append(NFAFragment(s.id, f.id))

    if not stack:
        s = nfa.new_state()
        f = nfa.new_state()
        nfa.add_transition(s.id, EPSILON, f.id)
        fragment = NFAFragment(s.id, f.id)
    else:
        fragment = stack.pop()

    nfa.start_state_id = fragment.start_id
    nfa.accept_states.add(fragment.accept_id)
    nfa.renumber_canonical()
    return nfa, fragment


class TokenRule:
    def __init__(self, name, pattern, is_ignored=False, priority=0):
        self.name = name
        self.pattern = pattern
        self.is_ignored = is_ignored
        self.priority = priority


def combine_token_rules(rules):
    """
    Section 8.3: Combining Token Rules.
    Creates a new global start state with ε-transitions to each token's NFA start state.
    Tags each accept state with token name and priority (rule_index).
    """
    combined_nfa = NFA()
    global_start = combined_nfa.new_state()
    combined_nfa.start_state_id = global_start.id

    for idx, rule in enumerate(rules):
        postfix = regex_to_postfix(rule.pattern)
        rule_nfa, fragment = build_thompson_nfa(postfix)

        id_map = {}
        for old_id, state in sorted(rule_nfa.states.items()):
            new_s = combined_nfa.new_state()
            id_map[old_id] = new_s.id

        for old_id, state in rule_nfa.states.items():
            new_from = id_map[old_id]
            for sym, targets in state.transitions.items():
                for old_to in targets:
                    new_to = id_map[old_to]
                    combined_nfa.add_transition(new_from, sym, new_to)

        mapped_start = id_map[rule_nfa.start_state_id]
        combined_nfa.add_transition(global_start.id, EPSILON, mapped_start)

        for old_acc in rule_nfa.accept_states:
            mapped_accept = id_map[old_acc]
            acc_state = combined_nfa.states[mapped_accept]
            acc_state.token_name = rule.name
            acc_state.rule_index = rule.priority if rule.priority is not None else idx
            acc_state.is_ignored = rule.is_ignored
            combined_nfa.accept_states.add(mapped_accept)

    combined_nfa.renumber_canonical()
    return combined_nfa
