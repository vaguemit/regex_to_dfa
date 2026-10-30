/**
 * dfaBuilder.js
 * Implements Subset Construction algorithm for converting NFA to DFA.
 * Uses sorted string keys for sets of NFA state IDs.
 */

import { EPSILON } from './nfaBuilder.js';
import { RegexToken } from './regexParser.js';

export class DFAState {
  constructor(id, nfaStates, label) {
    this.id = id;
    this.label = label || String(id);
    this.nfaStates = new Set(nfaStates);
    this.transitions = new Map(); // symbol -> target DFAState
    this.isAccept = false;
    this.tokenName = null;
    this.ruleIndex = null;
    this.isIgnored = false;
  }
}

export class DFA {
  constructor() {
    this.states = new Map();
    this.startState = null;
    this.alphabet = new Set();
  }

  addState(state) {
    this.states.set(state.id, state);
    return state;
  }

  toDot(title = "DFA") {
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
      const nfaStr = "{" + Array.from(state.nfaStates).sort((a,b) => a - b).join(',') + "}";
      if (state.isAccept) {
        const lbl = `${state.label}\\n${nfaStr}\\n[${state.tokenName}]`;
        lines.push(`  ${sid} [shape=doublecircle, label="${lbl}", fillcolor="#064e3b", color="#10b981", fontcolor="#a7f3d0", penwidth=2.5];`);
      } else {
        const lbl = `${state.label}\\n${nfaStr}`;
        lines.push(`  ${sid} [label="${lbl}"];`);
      }

      // Group transitions by target
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
        nfaStates: Array.from(state.nfaStates).sort((a,b) => a - b),
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
        nfaStates: Array.from(state.nfaStates).sort((a,b) => a - b),
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
      table: this.toTable()
    };
  }
}

export function formatSymbolsLabel(symbols) {
  const clean = symbols.map(s => {
    if (s === ' ') return '␣';
    if (s === '\n') return '\\n';
    if (s === '\t') return '\\t';
    if (s === '"') return '\\"';
    return String(s);
  });
  if (clean.length > 8) {
    return `${clean[0]}..${clean[clean.length - 1]} (${clean.length})`;
  }
  return clean.join(', ');
}

export function epsilonClosure(nfa, stateIds) {
  const closure = new Set(stateIds);
  const stack = Array.from(stateIds);

  while (stack.length > 0) {
    const currId = stack.pop();
    const currState = nfa.states.get(currId);
    if (!currState) continue;
    const epsTargets = currState.transitions.get(EPSILON);
    if (epsTargets) {
      for (const tid of epsTargets) {
        if (!closure.has(tid)) {
          closure.add(tid);
          stack.push(tid);
        }
      }
    }
  }

  return closure;
}

export function nfaMove(nfa, stateIds, symbol) {
  const targets = new Set();
  for (const sid of stateIds) {
    const state = nfa.states.get(sid);
    if (!state) continue;
    for (const [transSym, transTargets] of state.transitions.entries()) {
      if (transSym === EPSILON) continue;
      if (typeof transSym === 'string' && transSym === symbol) {
        transTargets.forEach(t => targets.add(t));
      } else if (transSym instanceof RegexToken && transSym.matches(symbol)) {
        transTargets.forEach(t => targets.add(t));
      }
    }
  }
  return targets;
}

export function extractAlphabet(nfa) {
  const alphabet = new Set();
  for (const state of nfa.states.values()) {
    for (const sym of state.transitions.keys()) {
      if (sym === EPSILON) continue;
      if (typeof sym === 'string') {
        alphabet.add(sym);
      } else if (sym instanceof RegexToken) {
        if (sym.type === 'LITERAL') alphabet.add(sym.value);
        else if (sym.type === 'CHAR_CLASS') {
          sym.value.forEach(c => alphabet.add(c));
        }
      }
    }
  }
  if (alphabet.size === 0) alphabet.add('a');
  return alphabet;
}

function setToKey(s) {
  return Array.from(s).sort((a,b) => a - b).join(',');
}

export function buildSubsetDFA(nfa) {
  const dfa = new DFA();
  const alphabet = extractAlphabet(nfa);
  dfa.alphabet = alphabet;

  const startClosure = epsilonClosure(nfa, [nfa.startStateId]);

  function getLabel(idx) {
    if (idx < 26) return String.fromCharCode(65 + idx);
    return `S${idx}`;
  }

  const stateMap = new Map(); // key -> DFAState
  const worklist = [];

  const startDFAState = new DFAState(0, startClosure, getLabel(0));
  determineAcceptance(startDFAState, nfa);
  dfa.addState(startDFAState);
  dfa.startState = startDFAState;
  stateMap.set(setToKey(startClosure), startDFAState);
  worklist.push(startDFAState);

  let nextId = 1;

  while (worklist.length > 0) {
    const curr = worklist.shift();

    for (const sym of alphabet) {
      const moveSet = nfaMove(nfa, curr.nfaStates, sym);
      if (moveSet.size === 0) continue;

      const closureSet = epsilonClosure(nfa, moveSet);
      if (closureSet.size === 0) continue;

      const key = setToKey(closureSet);
      if (!stateMap.has(key)) {
        const newState = new DFAState(nextId, closureSet, getLabel(nextId));
        nextId++;
        determineAcceptance(newState, nfa);
        dfa.addState(newState);
        stateMap.set(key, newState);
        worklist.push(newState);
      }

      curr.transitions.set(sym, stateMap.get(key));
    }
  }

  return dfa;
}

function determineAcceptance(dfaState, nfa) {
  let bestRuleIndex = null;
  let bestToken = null;
  let bestIsIgnored = false;
  let hasAccept = false;

  for (const nfaId of dfaState.nfaStates) {
    if (nfa.acceptStates.has(nfaId)) {
      hasAccept = true;
      const nState = nfa.states.get(nfaId);
      const rIdx = (nState && nState.ruleIndex !== null && nState.ruleIndex !== undefined) ? nState.ruleIndex : 999999;
      if (bestRuleIndex === null || rIdx < bestRuleIndex) {
        bestRuleIndex = rIdx;
        bestToken = nState ? nState.tokenName : null;
        bestIsIgnored = nState ? nState.isIgnored : false;
      }
    }
  }

  if (hasAccept) {
    dfaState.isAccept = true;
    dfaState.tokenName = bestToken || "ACCEPT";
    dfaState.ruleIndex = bestRuleIndex !== null ? bestRuleIndex : 0;
    dfaState.isIgnored = bestIsIgnored;
  }
}
