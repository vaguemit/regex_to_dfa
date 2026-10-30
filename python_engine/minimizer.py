"""
minimizer.py
Implements DFA Minimization using partition refinement (Hopcroft's style).
Separates non-accepting states and groups accepting states by token identity.
Refines partitions until stable, merges equivalent states, and constructs the Minimal DFA.
"""

from dfa_builder import DFA, DFAState, format_symbols_label

class MinimizedDFA:
    def __init__(self):
        self.states = {}            # state_id -> DFAState
        self.start_state = None     # DFAState
        self.alphabet = set()       # Set of symbols
        self.partition_history = [] # Step-by-step history of partition refinement
        self.group_mapping = {}     # minimal_state_label -> list of original DFAState labels

    def add_state(self, state):
        self.states[state.id] = state
        return state

    def to_dot(self, title="Minimized DFA"):
        """Generates Graphviz DOT representation of the Minimized DFA."""
        dot = [f'digraph "{title}" {{', '  rankdir=LR;', '  node [shape=circle, fontname="Helvetica"];', '  edge [fontname="Helvetica"];']
        dot.append('  __start [shape=none, label="", width=0, height=0];')
        if self.start_state:
            dot.append(f'  __start -> {self.start_state.id};')

        for sid, state in sorted(self.states.items()):
            orig_str = "{" + ",".join(self.group_mapping.get(state.label, [state.label])) + "}"
            if state.is_accept:
                lbl = f"{state.label}\\n{orig_str}\\n[{state.token_name}]"
                dot.append(f'  {sid} [shape=doublecircle, label="{lbl}", color="#10b981", style=bold];')
            else:
                lbl = f"{state.label}\\n{orig_str}"
                dot.append(f'  {sid} [label="{lbl}"];')

            target_to_syms = {}
            for sym, target in sorted(state.transitions.items(), key=lambda x: str(x[0])):
                target_to_syms.setdefault(target.id, []).append(sym)

            for tid, syms in target_to_syms.items():
                lbl = format_symbols_label(syms)
                dot.append(f'  {sid} -> {tid} [label="{lbl}"];')

        dot.append('}')
        return '\n'.join(dot)

    def to_table(self):
        cols = sorted(list(self.alphabet), key=lambda x: (len(str(x)), str(x)))
        rows = []
        for sid, state in sorted(self.states.items()):
            row = {
                "state": state.label,
                "merged_states": self.group_mapping.get(state.label, [state.label]),
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
        nodes = []
        for sid, state in sorted(self.states.items()):
            nodes.append({
                "id": sid,
                "label": state.label,
                "mergedStates": self.group_mapping.get(state.label, [state.label]),
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
            "groupMapping": self.group_mapping,
            "partitionHistory": self.partition_history,
            "table": self.to_table()
        }


def minimize_dfa(dfa):
    """
    Section 8.5: DFA Minimization using partition refinement.
    Initial partition groups non-accepting states together, and
    accepting states by (token_name, rule_index, is_ignored).
    Splits groups until fixed point is reached.
    """
    if not dfa.states:
        return MinimizedDFA()

    alphabet = dfa.alphabet
    all_states = list(dfa.states.values())

    # Step 1: Initial Partition
    # Group by key: None for non-accepting, (token_name, rule_index) for accepting
    initial_groups = {}
    for state in all_states:
        key = None if not state.is_accept else (state.token_name, state.rule_index, state.is_ignored)
        initial_groups.setdefault(key, []).append(state)

    partitions = [frozenset(group) for group in initial_groups.values() if group]

    history = []
    history.append({
        "step": 0,
        "description": "Initial partition: non-accepting states and accepting states grouped by token",
        "groups": [[s.label for s in group] for group in partitions]
    })

    # Step 2: Partition Refinement Loop
    step_num = 1
    changed = True
    while changed:
        changed = False
        new_partitions = []

        # Map each DFAState to its current partition group index
        state_to_group = {}
        for grp_idx, grp in enumerate(partitions):
            for state in grp:
                state_to_group[state.id] = grp_idx

        for grp in partitions:
            if len(grp) <= 1:
                new_partitions.append(grp)
                continue

            # Split grp based on target group signatures across alphabet
            subgroups = {}
            for state in grp:
                # Signature is tuple of target group index for each symbol in alphabet
                sig = []
                for sym in sorted(list(alphabet), key=str):
                    tgt = state.transitions.get(sym)
                    tgt_grp = state_to_group.get(tgt.id, -1) if tgt else -1
                    sig.append(tgt_grp)
                sig = tuple(sig)
                subgroups.setdefault(sig, []).append(state)

            if len(subgroups) > 1:
                changed = True
                for sub in subgroups.values():
                    new_partitions.append(frozenset(sub))
            else:
                new_partitions.append(grp)

        if changed:
            history.append({
                "step": step_num,
                "description": f"Refined partitions into {len(new_partitions)} groups",
                "groups": [[s.label for s in group] for group in new_partitions]
            })
            step_num += 1
            partitions = new_partitions

    # Step 3: Construct Minimized DFA from Partitions
    min_dfa = MinimizedDFA()
    min_dfa.alphabet = alphabet
    min_dfa.partition_history = history

    # Sort partitions so that the group containing the original start state is first (S0)
    def has_start(group):
        return any(s.id == dfa.start_state.id for s in group)

    partitions.sort(key=lambda g: (not has_start(g), min(s.id for s in g)))

    # Create Minimized States
    state_to_min_state = {}
    for idx, grp in enumerate(partitions):
        rep = next(iter(grp))  # representative state
        label = f"S{idx}"
        orig_labels = sorted([s.label for s in grp])
        all_nfa_states = set()
        for s in grp:
            all_nfa_states.update(s.nfa_states)

        min_state = DFAState(idx, all_nfa_states, label)
        min_state.is_accept = rep.is_accept
        min_state.token_name = rep.token_name
        min_state.rule_index = rep.rule_index
        min_state.is_ignored = rep.is_ignored

        min_dfa.add_state(min_state)
        min_dfa.group_mapping[label] = orig_labels

        if has_start(grp):
            min_dfa.start_state = min_state

        for s in grp:
            state_to_min_state[s.id] = min_state

    # Step 4: Add Transitions for Minimized States
    for grp in partitions:
        rep = next(iter(grp))
        source_min = state_to_min_state[rep.id]
        for sym, tgt in rep.transitions.items():
            if tgt.id in state_to_min_state:
                target_min = state_to_min_state[tgt.id]
                source_min.transitions[sym] = target_min

    return min_dfa
