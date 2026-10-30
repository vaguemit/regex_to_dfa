import React, { useState } from 'react';

export default function TransitionTableView({ tableData, title = "Transition Table" }) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!tableData || !tableData.rows || tableData.rows.length === 0) {
    return <div style={{ color: 'var(--text-muted)', padding: '16px' }}>No transition table data available.</div>;
  }

  const { columns, rows } = tableData;

  const filteredRows = rows.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.state.toLowerCase().includes(term) ||
      (r.token && r.token.toLowerCase().includes(term)) ||
      (r.merged_states && r.merged_states.some(s => s.toLowerCase().includes(term))) ||
      (r.mergedStates && r.mergedStates.some(s => s.toLowerCase().includes(term)))
    );
  });

  return (
    <div className="table-panel">
      <div className="table-header-bar">
        <div style={{ fontWeight: 600, fontSize: '13px' }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            className="table-search-input"
            placeholder="Search state..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {filteredRows.length} / {rows.length}
          </span>
        </div>
      </div>

      <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
        <table className="std-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }}>State</th>
              <th>Composition</th>
              <th style={{ width: '80px' }}>Accepting</th>
              <th style={{ width: '100px' }}>Token</th>
              {columns.slice(0, 25).map(col => (
                <th key={col} style={{ textAlign: 'center', minWidth: '32px' }}>
                  {col === ' ' ? '␣' : (col === '\n' ? '\\n' : (col === '\t' ? '\\t' : col))}
                </th>
              ))}
              {columns.length > 25 && <th>...</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => {
              const comp = row.merged_states || row.mergedStates || (row.nfa_states || row.nfaStates || []);
              const compStr = "{" + comp.join(', ') + "}";
              const isAcc = row.is_accept || row.isAccept;

              return (
                <tr key={row.state}>
                  <td>
                    <span className={`badge-state ${isAcc ? 'accepting' : ''}`}>
                      {row.state}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{compStr}</td>
                  <td>
                    {isAcc ? (
                      <span style={{ color: 'var(--color-green)' }}>Yes</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>No</span>
                    )}
                  </td>
                  <td>
                    {row.token && row.token !== '-' ? (
                      <span style={{ color: '#93c5fd' }}>{row.token}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  {columns.slice(0, 25).map(col => {
                    const target = row.transitions[col];
                    return (
                      <td key={col} style={{ textAlign: 'center' }}>
                        {target && target !== '-' ? (
                          <span style={{ color: '#38bdf8' }}>{target}</span>
                        ) : (
                          <span style={{ color: 'var(--border-color)' }}>-</span>
                        )}
                      </td>
                    );
                  })}
                  {columns.length > 25 && <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>...</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
