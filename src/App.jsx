import React, { useState, useMemo, useCallback } from 'react';
import {
  GitBranch,
  Play,
  Table,
  FileCode,
  CheckCircle,
  Trash2,
  AlertCircle,
  ArrowRight
} from 'lucide-react';

import { combineTokenRules } from './engine/nfaBuilder.js';
import { buildSubsetDFA } from './engine/dfaBuilder.js';
import { minimizeDFA } from './engine/minimizer.js';
import { LexerEngine } from './engine/lexerEngine.js';
import { exportToC, exportToPython } from './engine/codeExporter.js';

import GraphVisualizer from './components/GraphVisualizer.jsx';
import TransitionTableView from './components/TransitionTableView.jsx';
import SimulationPanel from './components/SimulationPanel.jsx';
import CodeExporterView from './components/CodeExporterView.jsx';
import { PRESETS } from './components/Presets.js';

export default function App() {
  const [selectedPreset, setSelectedPreset] = useState('section10');
  const [rules, setRules] = useState(PRESETS.section10.rules);
  const [sourceCode, setSourceCode] = useState(PRESETS.section10.source);

  const [activeTab, setActiveTab] = useState('graphs'); // 'graphs' | 'simulation' | 'tables' | 'tokens' | 'export'
  const [activeGraphSubtab, setActiveGraphSubtab] = useState('minDfa'); // 'minDfa' | 'dfa' | 'nfa'
  const [highlightedState, setHighlightedState] = useState(null);

  // Stage 1-4: Automata Construction (depends ONLY on rules, fast 1-time build)
  const automataResult = useMemo(() => {
    try {
      if (!rules || rules.length === 0) {
        return { success: false, error: "No rules defined" };
      }

      const combinedNfa = combineTokenRules(rules);
      const dfa = buildSubsetDFA(combinedNfa);
      const minDfa = minimizeDFA(dfa);

      const tokenNames = rules.map(r => r.name);
      const cCode = exportToC(minDfa, tokenNames);
      const pythonCode = exportToPython(minDfa, tokenNames);

      const nfaCount = combinedNfa.states.size;
      const dfaCount = dfa.states.size;
      const minCount = minDfa.states.size;
      const reduction = Math.round((1 - minCount / Math.max(1, nfaCount)) * 100);

      return {
        success: true,
        nfa: combinedNfa,
        dfa,
        minDfa,
        cCode,
        pythonCode,
        metrics: {
          nfaCount,
          dfaCount,
          minCount,
          reduction
        }
      };
    } catch (err) {
      console.error("Automata construction error:", err);
      return { success: false, error: err.message };
    }
  }, [rules]);

  // Stage 5: Tokenization Engine (sub-millisecond instant execution on every keystroke)
  const lexingResult = useMemo(() => {
    if (!automataResult?.success || !automataResult.minDfa) {
      return { tokens: [], errors: [], trace: [] };
    }
    try {
      const lexer = new LexerEngine(automataResult.minDfa);
      return lexer.tokenize(sourceCode, false);
    } catch (err) {
      console.error("Tokenization error:", err);
      return { tokens: [], errors: [], trace: [] };
    }
  }, [automataResult, sourceCode]);

  // Set of DFA states exercised / visited by the current input stream
  const visitedStates = useMemo(() => {
    if (!lexingResult?.trace) return new Set();
    const set = new Set();
    lexingResult.trace.forEach(step => {
      if (step.state) set.add(step.state);
    });
    return set;
  }, [lexingResult]);

  const pipelineError = !automataResult?.success ? automataResult?.error : null;

  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey);
    const p = PRESETS[presetKey];
    if (p) {
      setRules(p.rules);
      setSourceCode(p.source);
    }
  };

  const handleRuleChange = (index, field, value) => {
    const next = [...rules];
    next[index] = { ...next[index], [field]: value };
    setRules(next);
  };

  const handleAddRule = () => {
    setRules([...rules, { name: `TOKEN_${rules.length + 1}`, pattern: 'a|b', isIgnored: false }]);
  };

  const handleRemoveRule = (index) => {
    if (rules.length <= 1) return;
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleStateHighlight = useCallback((state) => {
    setHighlightedState(state);
  }, []);

  const currentGraphData = useMemo(() => {
    if (!automataResult || !automataResult.success) return { dot: '', title: '' };
    if (activeGraphSubtab === 'nfa') {
      return { dot: automataResult.nfa.toDot("Thompson Combined NFA"), title: "Thompson Combined NFA" };
    } else if (activeGraphSubtab === 'dfa') {
      return { dot: automataResult.dfa.toDot("Subset Construction DFA"), title: "Subset Construction DFA" };
    } else {
      return { dot: automataResult.minDfa.toDot("Hopcroft Minimized DFA"), title: "Hopcroft Minimized DFA" };
    }
  }, [automataResult, activeGraphSubtab]);

  return (
    <div className="app-container">
      {/* Clean Top Bar */}
      <header className="top-nav">
        <div className="nav-left">
          <div className="project-title">Regex to DFA Lexer Generator</div>
          <div className="project-subtitle">
            Interactive Lexical Analysis &bull; Automata Visualizer
          </div>
        </div>

        <div className="nav-right">
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Preset:</label>
          <select
            className="preset-dropdown"
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {Object.entries(PRESETS).map(([key, val]) => (
              <option key={key} value={key}>{val.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Two-Column Workbench Layout */}
      <div className="main-layout">
        {/* Left Column: Configuration, Source Input & Live Token Stream */}
        <aside className="left-sidebar">
          {/* Metrics summary */}
          {automataResult?.success && (
            <div className="sidebar-section">
              <div className="section-title" style={{ marginBottom: '8px' }}>Automata Complexity</div>
              <div className="metrics-box">
                <div>
                  <div className="metric-item-label">NFA</div>
                  <div className="metric-item-value">{automataResult.metrics.nfaCount}</div>
                </div>
                <div>
                  <div className="metric-item-label">DFA</div>
                  <div className="metric-item-value">{automataResult.metrics.dfaCount}</div>
                </div>
                <div>
                  <div className="metric-item-label">Minimal</div>
                  <div className="metric-item-value">{automataResult.metrics.minCount}</div>
                </div>
                <div>
                  <div className="metric-item-label">Reduction</div>
                  <div className="metric-item-value" style={{ color: 'var(--color-green)' }}>
                    -{automataResult.metrics.reduction}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rules Editor */}
          <div className="sidebar-section">
            <div className="section-header">
              <span className="section-title">Token Rules (Priority Order)</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{rules.length} rules</span>
            </div>

            <div className="rules-list">
              {rules.map((rule, idx) => (
                <div key={idx} className="rule-row">
                  <input
                    type="text"
                    className="rule-input-name"
                    value={rule.name}
                    onChange={(e) => handleRuleChange(idx, 'name', e.target.value)}
                    placeholder="TOKEN"
                    title="Token Category Name"
                  />
                  <input
                    type="text"
                    className="rule-input-pattern"
                    value={rule.pattern}
                    onChange={(e) => handleRuleChange(idx, 'pattern', e.target.value)}
                    placeholder="regex pattern"
                    title="Regular Expression Pattern"
                  />
                  <div className="ignore-checkbox-wrapper" title="Skip token during output (e.g. whitespace)">
                    <input
                      type="checkbox"
                      checked={rule.isIgnored}
                      onChange={(e) => handleRuleChange(idx, 'isIgnored', e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>
                  <button
                    className="btn-delete-rule"
                    onClick={() => handleRemoveRule(idx)}
                    disabled={rules.length <= 1}
                    title="Delete rule"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <button className="btn-add-rule" onClick={handleAddRule}>
              + Add Rule
            </button>
          </div>

          {/* Source Input Stream */}
          <div className="sidebar-section">
            <div className="section-header">
              <span className="section-title">Source Input Stream</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sourceCode.length} chars</span>
            </div>

            <textarea
              className="source-textarea"
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              placeholder="Enter source text to scan..."
              spellCheck="false"
            />
          </div>

          {/* LIVE Real-Time Token Output in Sidebar */}
          <div className="sidebar-section" style={{ flex: 1 }}>
            <div className="section-header">
              <span className="section-title">Live Lexer Output</span>
              <span style={{ fontSize: '11px', color: '#93c5fd' }}>
                {lexingResult.tokens.length} token(s)
              </span>
            </div>

            {/* Error badge if errors present */}
            {lexingResult.errors.length > 0 && (
              <div className="alert-box" style={{ padding: '6px 10px', fontSize: '12px', marginBottom: '8px' }}>
                {lexingResult.errors.map((e, idx) => (
                  <div key={idx}>
                    Lexical error on <code>'{e.lexeme}'</code> at L{e.line}:C{e.column}
                  </div>
                ))}
              </div>
            )}

            {/* Live Token Chips */}
            <div className="token-grid" style={{ padding: '8px', marginBottom: '10px' }}>
              {lexingResult.tokens.length === 0 ? (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Type in the input stream above to see live tokenization.
                </span>
              ) : (
                lexingResult.tokens.map((tok, i) => (
                  <div key={i} className={`token-pill ${tok.isError ? 'is-error' : ''}`}>
                    <span className="token-pill-type">{tok.type}</span>
                    <span>"{tok.lexeme === ' ' ? '␣' : tok.lexeme}"</span>
                  </div>
                ))
              )}
            </div>

            {/* Quick jump to Simulation */}
            <button
              className="sim-btn"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setActiveTab('simulation')}
            >
              <Play size={13} /> Step Through This Input in Simulator <ArrowRight size={13} />
            </button>
          </div>
        </aside>

        {/* Right Column: Visualization & Execution Workbench */}
        <main className="right-workbench">
          {/* Secondary Workbench Tabs */}
          <nav className="workbench-tabs">
            <button
              className={`wb-tab ${activeTab === 'graphs' ? 'active' : ''}`}
              onClick={() => setActiveTab('graphs')}
            >
              <GitBranch size={14} /> Automata Graphs
            </button>
            <button
              className={`wb-tab ${activeTab === 'simulation' ? 'active' : ''}`}
              onClick={() => setActiveTab('simulation')}
            >
              <Play size={14} /> Maximal Munch Simulation
            </button>
            <button
              className={`wb-tab ${activeTab === 'tables' ? 'active' : ''}`}
              onClick={() => setActiveTab('tables')}
            >
              <Table size={14} /> Transition Tables
            </button>
            <button
              className={`wb-tab ${activeTab === 'tokens' ? 'active' : ''}`}
              onClick={() => setActiveTab('tokens')}
            >
              <CheckCircle size={14} />
              Tokens Table ({lexingResult.tokens.length})
            </button>
            <button
              className={`wb-tab ${activeTab === 'export' ? 'active' : ''}`}
              onClick={() => setActiveTab('export')}
            >
              <FileCode size={14} /> Export C/Python Code
            </button>
          </nav>

          {/* Workbench Body */}
          <div className="workbench-content">
            {pipelineError && (
              <div className="alert-box">
                <AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px' }} />
                <strong>Syntax Error:</strong> {pipelineError}
              </div>
            )}

            {/* Tab 1: Automata Graphs */}
            {activeTab === 'graphs' && automataResult?.success && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div className="graph-toolbar">
                  <div className="graph-subtab-group">
                    <button
                      className={`graph-subtab-btn ${activeGraphSubtab === 'minDfa' ? 'active' : ''}`}
                      onClick={() => setActiveGraphSubtab('minDfa')}
                    >
                      Minimized DFA ({automataResult.minDfa.states.size} states)
                    </button>
                    <button
                      className={`graph-subtab-btn ${activeGraphSubtab === 'dfa' ? 'active' : ''}`}
                      onClick={() => setActiveGraphSubtab('dfa')}
                    >
                      Subset DFA ({automataResult.dfa.states.size} states)
                    </button>
                    <button
                      className={`graph-subtab-btn ${activeGraphSubtab === 'nfa' ? 'active' : ''}`}
                      onClick={() => setActiveGraphSubtab('nfa')}
                    >
                      Thompson NFA ({automataResult.nfa.states.size} states)
                    </button>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <span style={{ color: '#38bdf8' }}>&bull; Blue fill: Exercised by input ({visitedStates.size} states)</span>
                    <span>&bull; Double circles: Accepting</span>
                    <span>&bull; Dashed: &epsilon;</span>
                  </div>
                </div>

                <GraphVisualizer
                  dot={currentGraphData.dot}
                  highlightState={highlightedState}
                  visitedStates={visitedStates}
                  title={currentGraphData.title}
                />
              </div>
            )}

            {/* Tab 2: Simulation Panel */}
            {activeTab === 'simulation' && automataResult?.success && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flex: 1, minHeight: 0 }}>
                <SimulationPanel
                  trace={lexingResult.trace}
                  sourceCode={sourceCode}
                  onStateHighlight={handleStateHighlight}
                />

                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    AUTOMATON STATE TRACKER
                  </div>
                  <GraphVisualizer
                    dot={automataResult.minDfa.toDot("Active Minimized DFA")}
                    highlightState={highlightedState}
                    title="Active Minimized DFA"
                  />
                </div>
              </div>
            )}

            {/* Tab 3: Transition Tables */}
            {activeTab === 'tables' && automataResult?.success && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <TransitionTableView
                  tableData={automataResult.minDfa.toTable()}
                  title="Minimized DFA Transition Matrix (States S0..Sn)"
                />
                <TransitionTableView
                  tableData={automataResult.dfa.toTable()}
                  title="Subset Construction DFA Transition Matrix (Power Sets)"
                />
              </div>
            )}

            {/* Tab 4: Tokens Output Table & Errors */}
            {activeTab === 'tokens' && automataResult?.success && (
              <div className="table-panel">
                <div className="table-header-bar">
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>
                    Lexical Tokens Produced ({lexingResult.tokens.length})
                  </div>
                  {lexingResult.errors.length > 0 && (
                    <span style={{ color: 'var(--color-red)', fontSize: '12px' }}>
                      {lexingResult.errors.length} lexical error(s)
                    </span>
                  )}
                </div>

                {lexingResult.errors.length > 0 && (
                  <div className="alert-box" style={{ margin: '12px' }}>
                    <strong>Errors Encountered:</strong>
                    {lexingResult.errors.map((e, idx) => (
                      <div key={idx} style={{ marginTop: '2px' }}>
                        Illegal character <code>'{e.lexeme}'</code> at line {e.line}, column {e.column}. Scanner recovered by skipping character.
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ padding: '12px' }}>
                  <div className="token-grid">
                    {lexingResult.tokens.map((tok, i) => (
                      <div key={i} className={`token-pill ${tok.isError ? 'is-error' : ''}`}>
                        <span className="token-pill-type">{tok.type}</span>
                        <span>"{tok.lexeme === ' ' ? '␣' : tok.lexeme}"</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>L{tok.line}:C{tok.column}</span>
                      </div>
                    ))}
                  </div>

                  <table className="std-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th>Token Category</th>
                        <th>Lexeme</th>
                        <th>Line</th>
                        <th>Column</th>
                        <th>Classification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lexingResult.tokens.map((tok, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td>
                            <span style={{ color: tok.isError ? 'var(--color-red)' : '#93c5fd', fontWeight: 500 }}>
                              {tok.type}
                            </span>
                          </td>
                          <td><code>"{tok.lexeme}"</code></td>
                          <td>{tok.line}</td>
                          <td>{tok.column}</td>
                          <td>
                            {tok.isError ? (
                              <span style={{ color: 'var(--color-red)' }}>Error</span>
                            ) : (
                              <span style={{ color: 'var(--color-green)' }}>Matched</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 5: Code Exporter */}
            {activeTab === 'export' && automataResult?.success && (
              <CodeExporterView
                cCode={automataResult.cCode}
                pythonCode={automataResult.pythonCode}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
