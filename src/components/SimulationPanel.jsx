import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, RotateCcw } from 'lucide-react';

export default function SimulationPanel({
  trace = [],
  sourceCode = "",
  onStateHighlight
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef(null);
  const lastStateRef = useRef(null);

  const totalSteps = trace.length;
  const currentStep = trace[currentStepIndex] || null;

  // Reset simulator to beginning when input stream or trace changes
  useEffect(() => {
    setCurrentStepIndex(0);
    setIsPlaying(false);
  }, [sourceCode]);

  // Only notify parent when active state actually changes
  useEffect(() => {
    if (currentStep && currentStep.state !== lastStateRef.current) {
      lastStateRef.current = currentStep.state;
      if (typeof onStateHighlight === 'function') {
        onStateHighlight(currentStep.state);
      }
    }
  }, [currentStep, onStateHighlight]);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentStepIndex(prev => {
          if (prev + 1 >= totalSteps) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, Math.max(120, 700 / speed));
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, totalSteps, speed]);

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    if (currentStepIndex + 1 < totalSteps) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  if (!trace || trace.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '16px' }}>
        No simulation trace available. Run the pipeline to simulate.
      </div>
    );
  }

  const activeCharPos = currentStep ? currentStep.pos : 0;
  const chars = Array.from(sourceCode);

  const emittedTokensSoFar = [];
  for (let i = 0; i <= currentStepIndex; i++) {
    const st = trace[i];
    if (st.action === 'EMIT_TOKEN' && st.token && !st.token.isIgnored) {
      emittedTokensSoFar.push(st.token);
    } else if (st.action === 'LEXICAL_ERROR' && st.token) {
      emittedTokensSoFar.push(st.token);
    }
  }

  return (
    <div className="sim-workbench">
      {/* Control Bar */}
      <div className="sim-control-bar">
        <div className="sim-btn-group">
          <button className="sim-btn" onClick={handleReset} title="Reset to step 0">
            <RotateCcw size={13} /> Reset
          </button>
          <button className="sim-btn" onClick={handleStepBack} disabled={currentStepIndex === 0}>
            <SkipBack size={13} /> Back
          </button>
          <button className="sim-btn primary" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="sim-btn" onClick={handleStepForward} disabled={currentStepIndex >= totalSteps - 1}>
            Next <SkipForward size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Speed:</span>
            {[0.5, 1, 2].map(s => (
              <button
                key={s}
                className="tool-btn"
                style={{
                  background: speed === s ? 'var(--bg-hover)' : 'transparent',
                  color: speed === s ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '11px',
                  padding: '2px 6px'
                }}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Step <strong>{currentStepIndex + 1}</strong> of <strong>{totalSteps}</strong>
          </div>
        </div>
      </div>

      {/* Input Tape Track */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>INPUT STREAM TAPE</span>
          <span>Index: {activeCharPos} / {chars.length}</span>
        </div>
        <div className="tape-track">
          {chars.map((ch, idx) => {
            const isHead = idx === activeCharPos;
            const isMatched = currentStep && currentStep.lexeme &&
              idx >= currentStep.pos - currentStep.lexeme.length && idx < currentStep.pos;

            let display = ch;
            if (ch === ' ') display = '␣';
            else if (ch === '\t') display = '\\t';
            else if (ch === '\n') display = '\\n';

            return (
              <div
                key={idx}
                className={`tape-char-slot ${isHead ? 'slot-active' : ''} ${isMatched ? 'slot-matched' : ''}`}
              >
                <span>{display}</span>
                <span className="slot-index">{idx}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Step Description Callout */}
      <div className="step-explanation-box">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <span className="badge-state accepting">State: {currentStep ? currentStep.state : '-'}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Action: <strong>{currentStep ? currentStep.action : '-'}</strong>
          </span>
        </div>
        <div>{currentStep ? currentStep.description : 'Ready'}</div>
      </div>

      {/* Emitted Tokens Live Feed */}
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
          Emitted Tokens ({emittedTokensSoFar.length})
        </div>
        <div className="token-grid" style={{ minHeight: '44px' }}>
          {emittedTokensSoFar.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Consuming characters according to maximal munch...
            </span>
          ) : (
            emittedTokensSoFar.map((tok, i) => (
              <div key={i} className={`token-pill ${tok.isError ? 'is-error' : ''}`}>
                <span className="token-pill-type">{tok.type}</span>
                <span>"{tok.lexeme === ' ' ? '␣' : tok.lexeme}"</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>L{tok.line}:C{tok.column}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
