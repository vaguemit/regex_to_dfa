/**
 * minimizer.js
 * Implements DFA Minimization using partition refinement (Hopcroft style).
 * Separates non-accepting states and groups accepting states by token identity.
 */

import { DFAState, formatSymbolsLabel } from './dfaBuilder.js';

export class MinimizedDFA {
  constructor() {
    this.states = new Map();
    this.startState = null;
    this.alphabet = new Set();
    this.partitionHistory = [];
    this.groupMapping = {};
  }

  addState(state) {
    this.states.set(state.id, state);
    return state;
  }

  toDot(title = "Minimized DFA") {
    const lines = [
      `digraph "${title}" {`,
      '  rankdir=LR;',
      '  node [shape=circle, fontname="Helvetica", fontsize=12, fillcolor="#1e293b", style="filled", fontcolor="#f8fafc", color="#475569"];',
      '  edge [fontname="Helvetica", fontsize=11, fontcolor="#cbd5e1", color="#64748b"];',
      '  __start [shape=none, label="", width=0, height=0];'
    ];

    if (this.startState) {
      lines.push(`  __start -> ${this.startState.id} [color="#38bdf8", penwidth=2];`);
    }

    for (const [sid, state] of Array.from(this.states.entries()).sort((a,b) => a[0] - b[0])) {
      const origStr = "{" + (this.groupMapping[state.label] || [state.label]).join(',') + "}";
      if (state.isAccept) {
        const lbl = `${state.label}\\n${origStr}\\n[${state.tokenName}]`;
        lines.push(`  ${sid} [shape=doublecircle, label="${lbl}", fillcolor="#064e3b", color="#10b981", fontcolor="#a7f3d0", penwidth=2.5];`);
      } else {
        const lbl = `${state.label}\\n${origStr}`;
        lines.push(`  ${sid} [label="${lbl}"];`);
      }

      const tgtToSyms = new Map();
      for (const [sym, target] of state.transitions.entries()) {
        if (!tgtToSyms.has(target.id)) tgtToSyms.set(target.id, []);
        tgtToSyms.get(target.id).push(sym);
      }

      for (const [tid, syms] of tgtToSyms.entries()) {
        const lbl = formatSymbolsLabel(syms);
        lines.push(`  ${sid} -> ${tid} [label="${lbl}", color="#38bdf8"];`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  toTable() {
    const cols = Array.from(this.alphabet).sort();
    const rows = [];
    for (const [sid, state] of Array.from(this.states.entries()).sort((a,b) => a[0] - b[0])) {
      const row = {
        state: state.label,
        mergedStates: this.groupMapping[state.label] || [state.label],
        isAccept: state.isAccept,
        token: state.isAccept ? state.tokenName : "-",
        transitions: {}
      };
      for (const sym of cols) {
        const tgt = state.transitions.get(sym);
        row.transitions[sym] = tgt ? tgt.label : "-";
      }
      rows.push(row);
    }
    return { columns: cols, rows };
  }

  toJson() {
    const nodes = [];
    for (const [sid, state] of Array.from(this.states.entries()).sort((a,b) => a[0] - b[0])) {
      nodes.push({
        id: sid,
        label: state.label,
        mergedStates: this.groupMapping[state.label] || [state.label],
        isStart: this.startState && sid === this.startState.id,
        isAccept: state.isAccept,
        tokenName: state.tokenName,
        ruleIndex: state.ruleIndex,
        isIgnored: state.isIgnored
      });
    }

    const edges = [];
    for (const [sid, state] of this.states.entries()) {
      const tgtToSyms = new Map();
      for (const [sym, target] of state.transitions.entries()) {
        if (!tgtToSyms.has(target.id)) tgtToSyms.set(target.id, []);
        tgtToSyms.get(target.id).push(sym);
      }

      for (const [tid, syms] of tgtToSyms.entries()) {
        edges.push({
          from: sid,
          to: tid,
          label: formatSymbolsLabel(syms),
          symbols: syms
        });
      }
    }

    return {
      startState: this.startState ? this.startState.id : null,
      stateCount: this.states.size,
      alphabet: Array.from(this.alphabet).sort(),
      nodes,
      edges,
      groupMapping: this.groupMapping,
      partitionHistory: this.partitionHistory,
      table: this.toTable()
    };
  }
}

export function minimizeDFA(dfa) {
  if (!dfa.states || dfa.states.size === 0) return new MinimizedDFA();

  const alphabet = dfa.alphabet;
  const allStates = Array.from(dfa.states.values());

  // Step 1: Initial Partition
  const initialGroups = new Map();
  for (const state of allStates) {
    const key = !state.isAccept ? 'NON_ACCEPT' : `${state.tokenName}#${state.ruleIndex}#${state.isIgnored}`;
    if (!initialGroups.has(key)) initialGroups.set(key, []);
    initialGroups.get(key).push(state);
  }

  let partitions = Array.from(initialGroups.values());
  const history = [{
    step: 0,
    description: "Initial partition: non-accepting states and accepting states grouped by token",
    groups: partitions.map(g => g.map(s => s.label))
  }];

  // Step 2: Refinement Loop
  let changed = true;
  let stepNum = 1;

  while (changed) {
    changed = false;
    const newPartitions = [];

    const stateToGroup = new Map();
    partitions.forEach((grp, grpIdx) => {
      grp.forEach(s => stateToGroup.set(s.id, grpIdx));
    });

    for (const grp of partitions) {
      if (grp.length <= 1) {
        newPartitions.push(grp);
        continue;
      }

      const subgroups = new Map();
      for (const state of grp) {
        const sig = Array.from(alphabet).sort().map(sym => {
          const tgt = state.transitions.get(sym);
          return tgt ? stateToGroup.get(tgt.id) : -1;
        }).join(':');

        if (!subgroups.has(sig)) subgroups.set(sig, []);
        subgroups.get(sig).push(state);
      }

      if (subgroups.size > 1) {
        changed = true;
        for (const sub of subgroups.values()) {
          newPartitions.push(sub);
        }
      } else {
        newPartitions.push(grp);
      }
    }

    if (changed) {
      history.push({
        step: stepNum++,
        description: `Refined partitions into ${newPartitions.length} groups`,
        groups: newPartitions.map(g => g.map(s => s.label))
      });
      partitions = newPartitions;
    }
  }

  // Step 3: Build Minimized DFA
  const minDFA = new MinimizedDFA();
  minDFA.alphabet = alphabet;
  minDFA.partitionHistory = history;

  function hasStart(group) {
    return group.some(s => s.id === dfa.startState.id);
  }

  partitions.sort((g1, g2) => {
    const s1 = hasStart(g1);
    const s2 = hasStart(g2);
    if (s1 && !s2) return -1;
    if (!s1 && s2) return 1;
    return Math.min(...g1.map(s => s.id)) - Math.min(...g2.map(s => s.id));
  });

  const stateToMinState = new Map();
  partitions.forEach((grp, idx) => {
    const rep = grp[0];
    const label = `S${idx}`;
    const origLabels = grp.map(s => s.label).sort();

    const allNfaStates = new Set();
    grp.forEach(s => s.nfaStates.forEach(nid => allNfaStates.add(nid)));

    const minState = new DFAState(idx, allNfaStates, label);
    minState.isAccept = rep.isAccept;
    minState.tokenName = rep.tokenName;
    minState.ruleIndex = rep.ruleIndex;
    minState.isIgnored = rep.isIgnored;

    minDFA.addState(minState);
    minDFA.groupMapping[label] = origLabels;

    if (hasStart(grp)) {
      minDFA.startState = minState;
    }

    grp.forEach(s => stateToMinState.set(s.id, minState));
  });

  // Step 4: Add Transitions
  partitions.forEach(grp => {
    const rep = grp[0];
    const sourceMin = stateToMinState.get(rep.id);
    for (const [sym, tgt] of rep.transitions.entries()) {
      if (stateToMinState.has(tgt.id)) {
        sourceMin.transitions.set(sym, stateToMinState.get(tgt.id));
      }
    }
  });

  return minDFA;
}
