import React, { useState } from 'react';
import { Copy, Check, Download, Terminal } from 'lucide-react';

export default function CodeExporterView({ cCode, pythonCode }) {
  const [lang, setLang] = useState('c');
  const [copied, setCopied] = useState(false);

  const activeCode = lang === 'c' ? cCode : pythonCode;
  const fileName = lang === 'c' ? 'lexer.c' : 'lexer.py';

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([activeCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="code-export-toolbar">
        <div className="graph-subtab-group">
          <button
            className={`graph-subtab-btn ${lang === 'c' ? 'active' : ''}`}
            onClick={() => setLang('c')}
          >
            C Scanner (lexer.c)
          </button>
          <button
            className={`graph-subtab-btn ${lang === 'python' ? 'active' : ''}`}
            onClick={() => setLang('python')}
          >
            Python Scanner (lexer.py)
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="sim-btn" onClick={handleCopy}>
            {copied ? <Check size={13} color="var(--color-green)" /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="sim-btn" onClick={handleDownload}>
            <Download size={13} />
            Download {fileName}
          </button>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 12px',
        marginBottom: '10px',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--text-secondary)'
      }}>
        <Terminal size={14} color="var(--color-blue)" />
        {lang === 'c' ? (
          <span>Compile with: <code style={{ color: '#fff' }}>gcc -O2 -o lexer lexer.c &amp;&amp; ./lexer "input_string"</code></span>
        ) : (
          <span>Execute with: <code style={{ color: '#fff' }}>python lexer.py "input_string"</code></span>
        )}
      </div>

      <pre className="code-pre-block">
        <code>{activeCode || "// Generating scanner code..."}</code>
      </pre>
    </div>
  );
}
