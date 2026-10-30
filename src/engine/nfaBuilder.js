/**
 * nfaBuilder.js
 * Implements Thompson's Construction with Dragon Book concatenation state merging
 * and multi-rule token combining under a global start state.
 */

import { regexToPostfix, RegexToken, CONCAT_OP, UNION_OP, STAR_OP, PLUS_OP, OPT_OP } from './regexParser.js';

export const EPSILON = null;

export class NFAState {
  constructor(id) {
    this.id = id;
    this.transitions = new Map(); // symbol -> Set of target IDs
    this.tokenName = null;
    this.ruleIndex = null;
    this.isIgnored = false;
  }

  addTransition(symbol, targetId) {
    if (!this.transitions.has(symbol)) {
      this.transitions.set(symbol, new Set());
    }
    this.transitions.get(symbol).add(targetId);
  }
}

export class NFAFragment {
  constructor(startId, acceptId) {
    this.startId = startId;
    this.acceptId = acceptId;
  }
}

export class NFA {
  constructor() {
    this.states = new Map();
    this.startStateId = null;
    this.acceptStates = new Set();
    this._nextId = 0;
  }

  newState() {
    const s = new NFAState(this._nextId++);
    this.states.set(s.id, s);
    return s;
  }

  addTransition(fromId, symbol, toId) {
    if (!this.states.has(fromId)) {
      this.states.set(fromId, new NFAState(fromId));
    }
    this.states.get(fromId).addTransition(symbol, toId);
  }

  mergeStates(keepId, removeId) {
    if (keepId === removeId || !this.states.has(removeId)) return;
    const removeState = this.states.get(removeId);
    const keepState = this.states.get(keepId);

    // Transfer outgoing
    for (const [sym, targets] of removeState.transitions.entries()) {
      for (const t of targets) {
        keepState.addTransition(sym, t === removeId ? keepId : t);
      }
    }

    // Redirect incoming
    for (const [sid, state] of this.states.entries()) {
      if (sid === removeId) continue;
      for (const [sym, targets] of state.transitions.entries()) {
        if (targets.has(removeId)) {
          targets.delete(removeId);
          targets.add(keepId);
        }
      }
    }

    if (this.acceptStates.has(removeId)) {
      this.acceptStates.delete(removeId);
      this.acceptStates.add(keepId);
      if (removeState.tokenName) {
        keepState.tokenName = removeState.tokenName;
        keepState.ruleIndex = removeState.ruleIndex;
        keepState.isIgnored = removeState.isIgnored;
      }
    }

    this.states.delete(removeId);
  }

  renumberCanonical() {
    if (this.startStateId === null || !this.states.has(this.startStateId)) return;
    const order = [];
    const visited = new Set();
    const queue = [this.startStateId];
    visited.add(this.startStateId);

    while (queue.length > 0) {
      const curr = queue.shift();
      order.push(curr);
      const currState = this.states.get(curr);
      for (const [sym, targets] of currState.transitions.entries()) {
        for (const tid of targets) {
          if (!visited.has(tid) && this.states.has(tid)) {
            visited.add(tid);
            queue.push(tid);
          }
        }
      }
    }

    for (const sid of Array.from(this.states.keys()).sort((a,b) => a - b)) {
      if (!visited.has(sid)) order.push(sid);
    }

    const idMap = new Map();
    order.forEach((oldId, newId) => idMap.set(oldId, newId));

    const newStates = new Map();
    for (const [oldId, state] of this.states.entries()) {
      const newId = idMap.get(oldId);
      const newS = new NFAState(newId);
      newS.tokenName = state.tokenName;
      newS.ruleIndex = state.ruleIndex;
      newS.isIgnored = state.isIgnored;

      for (const [sym, targets] of state.transitions.entries()) {
        for (const tid of targets) {
          if (idMap.has(tid)) {
            newS.addTransition(sym, idMap.get(tid));
          }
        }
      }
      newStates.set(newId, newS);
    }

    this.states = newStates;
    this.startStateId = idMap.get(this.startStateId);
    const newAccepts = new Set();
    for (const aid of this.acceptStates) {
      if (idMap.has(aid)) newAccepts.add(idMap.get(aid));
    }
    this.acceptStates = newAccepts;
    this._nextId = newStates.size;
  }

  toDot(title = "NFA") {
    const lines = [
      `digraph "${title}" {`,
      '  rankdir=LR;',
      '  node [shape=circle, fontname="Helvetica", fontsize=12, fillcolor="#1e293b", style="filled", fontcolor="#f8fafc", color="#475569"];',
      '  edge [fontname="Helvetica", fontsize=11, fontcolor="#cbd5e1", color="#64748b"];',
      '  __start [shape=none, label="", width=0, height=0];',
      `  __start -> ${this.startStateId} [color="#38bdf8", penwidth=2];`
    ];

    for (const [sid, state] of Array.from(this.states.entries()).sort((a,b) => a[0] - b[0])) {
      if (this.acceptStates.has(sid)) {
        const lbl = state.tokenName ? `${sid}\\n[${state.tokenName}]` : `${sid}`;
        lines.push(`  ${sid} [shape=doublecircle, label="${lbl}", fillcolor="#064e3b", color="#10b981", fontcolor="#a7f3d0", penwidth=2.5];`);
      } else {
        lines.push(`  ${sid} [label="${sid}"];`);
      }

      for (const [sym, targets] of state.transitions.entries()) {
        for (const tid of targets) {
          if (sym === EPSILON) {
            lines.push(`  ${sid} -> ${tid} [label="ε", style=dashed, color="#94a3b8", fontcolor="#94a3b8"];`);
          } else if (sym instanceof RegexToken && sym.type === 'CHAR_CLASS') {
            let lbl = `[${sym.value.size} chars]`;
            if (sym.value.size === 10) lbl = "[0-9]";
            else if (sym.value.size === 52) lbl = "[a-zA-Z]";
            else if (sym.value.size === 63) lbl = "[a-zA-Z0-9_]";
            else if (sym.value.size <= 5) lbl = "[" + Array.from(sym.value).sort().join('') + "]";
            lines.push(`  ${sid} -> ${tid} [label="${lbl}", color="#38bdf8"];`);
          } else {
            let sStr = sym;
            if (sStr === '"') sStr = '\\"';
            else if (sStr === '\\') sStr = '\\\\';
            else if (sStr === '\n') sStr = '\\\\n';
            else if (sStr === '\t') sStr = '\\\\t';
            else if (sStr === ' ') sStr = '␣';
            lines.push(`  ${sid} -> ${tid} [label="${sStr}", color="#38bdf8"];`);
          }
        }
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  toJson() {
    const nodes = [];
    for (const [sid, state] of Array.from(this.states.entries()).sort((a,b) => a[0] - b[0])) {
      nodes.push({
        id: sid,
        label: String(sid),
        isStart: sid === this.startStateId,
        isAccept: this.acceptStates.has(sid),
        tokenName: state.tokenName,
        ruleIndex: state.ruleIndex,
        isIgnored: state.isIgnored
      });
    }

    const edges = [];
    for (const [sid, state] of this.states.entries()) {
      for (const [sym, targets] of state.transitions.entries()) {
        for (const tid of targets) {
          let label = "ε";
          let isEps = true;
          if (sym !== EPSILON) {
            isEps = false;
            if (sym instanceof RegexToken && sym.type === 'CHAR_CLASS') {
              if (sym.value.size === 10) label = "[0-9]";
              else if (sym.value.size === 52) label = "[a-zA-Z]";
              else if (sym.value.size === 63) label = "[a-zA-Z0-9_]";
              else if (sym.value.size <= 5) label = "[" + Array.from(sym.value).sort().join('') + "]";
              else label = `[${sym.value.size} chars]`;
            } else {
              label = sym === ' ' ? '␣' : (sym === '\n' ? '\\n' : (sym === '\t' ? '\\t' : String(sym)));
            }
          }
          edges.push({ from: sid, to: tid, label, isEpsilon: isEps });
        }
      }
    }

    return {
      startState: this.startStateId,
      acceptStates: Array.from(this.acceptStates),
      stateCount: this.states.size,
      nodes,
      edges
    };
  }
}

export function buildThompsonNFA(postfixTokens) {
  const nfa = new NFA();
  const stack = [];

  for (const token of postfixTokens) {
    if (token.type === 'LITERAL' || token.type === 'CHAR_CLASS') {
      const s = nfa.newState();
      const f = nfa.newState();
      const sym = token.type === 'LITERAL' ? token.value : token;
      nfa.addTransition(s.id, sym, f.id);
      stack.push(new NFAFragment(s.id, f.id));
    } else if (token.type === 'OP') {
      const op = token.value;
      if (op === CONCAT_OP) {
        const f2 = stack.pop();
        const f1 = stack.pop();
        nfa.mergeStates(f1.acceptId, f2.startId);
        const newAccept = f1.acceptId === f2.startId && f2.startId === f2.acceptId ? f1.acceptId : f2.acceptId;
        stack.push(new NFAFragment(f1.startId, newAccept));
      } else if (op === UNION_OP) {
        const f2 = stack.pop();
        const f1 = stack.pop();
        const s = nfa.newState();
        const f = nfa.newState();
        nfa.addTransition(s.id, EPSILON, f1.startId);
        nfa.addTransition(s.id, EPSILON, f2.startId);
        nfa.addTransition(f1.acceptId, EPSILON, f.id);
        nfa.addTransition(f2.acceptId, EPSILON, f.id);
        stack.push(new NFAFragment(s.id, f.id));
      } else if (op === STAR_OP) {
        const f1 = stack.pop();
        const s = nfa.newState();
        const f = nfa.newState();
        nfa.addTransition(s.id, EPSILON, f1.startId);
        nfa.addTransition(s.id, EPSILON, f.id);
        nfa.addTransition(f1.acceptId, EPSILON, f1.startId);
        nfa.addTransition(f1.acceptId, EPSILON, f.id);
        stack.push(new NFAFragment(s.id, f.id));
      } else if (op === PLUS_OP) {
        const f1 = stack.pop();
        const s = nfa.newState();
        const f = nfa.newState();
        nfa.addTransition(s.id, EPSILON, f1.startId);
        nfa.addTransition(f1.acceptId, EPSILON, f1.startId);
        nfa.addTransition(f1.acceptId, EPSILON, f.id);
        stack.push(new NFAFragment(s.id, f.id));
      } else if (op === OPT_OP) {
        const f1 = stack.pop();
        const s = nfa.newState();
        const f = nfa.newState();
        nfa.addTransition(s.id, EPSILON, f1.startId);
        nfa.addTransition(s.id, EPSILON, f.id);
        nfa.addTransition(f1.acceptId, EPSILON, f.id);
        stack.push(new NFAFragment(s.id, f.id));
      }
    }
  }

  const fragment = stack.length > 0 ? stack.pop() : (() => {
    const s = nfa.newState(); const f = nfa.newState();
    nfa.addTransition(s.id, EPSILON, f.id);
    return new NFAFragment(s.id, f.id);
  })();

  nfa.startStateId = fragment.startId;
  nfa.acceptStates.add(fragment.acceptId);
  nfa.renumberCanonical();
  return { nfa, fragment };
}

export function combineTokenRules(rules) {
  const combined = new NFA();
  const globalStart = combined.newState();
  combined.startStateId = globalStart.id;

  rules.forEach((rule, idx) => {
    const postfix = regexToPostfix(rule.pattern);
    const { nfa: ruleNfa } = buildThompsonNFA(postfix);

    const idMap = new Map();
    for (const [oldId] of ruleNfa.states.entries()) {
      const newS = combined.newState();
      idMap.set(oldId, newS.id);
    }

    for (const [oldId, state] of ruleNfa.states.entries()) {
      const newFrom = idMap.get(oldId);
      for (const [sym, targets] of state.transitions.entries()) {
        for (const oldTo of targets) {
          combined.addTransition(newFrom, sym, idMap.get(oldTo));
        }
      }
    }

    const mappedStart = idMap.get(ruleNfa.startStateId);
    combined.addTransition(globalStart.id, EPSILON, mappedStart);

    for (const oldAcc of ruleNfa.acceptStates) {
      const mappedAcc = idMap.get(oldAcc);
      const accState = combined.states.get(mappedAcc);
      accState.tokenName = rule.name;
      accState.ruleIndex = rule.priority !== undefined ? rule.priority : idx;
      accState.isIgnored = Boolean(rule.isIgnored);
      combined.acceptStates.add(mappedAcc);
    }
  });

  combined.renumberCanonical();
  return combined;
}
