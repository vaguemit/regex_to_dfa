import React, { useEffect, useRef, useState, useCallback } from 'react';
import { instance as getVizInstance } from '@viz-js/viz';
import { ZoomIn, ZoomOut, Maximize2, Download, Code, Eye, Copy, Check } from 'lucide-react';

let globalVizPromise = null;
function getViz() {
  if (!globalVizPromise) {
    globalVizPromise = getVizInstance();
  }
  return globalVizPromise;
}

export default function GraphVisualizer({
  dot,
  highlightState,
  visitedStates,
  title = "Automaton"
}) {
  const containerRef = useRef(null);
  const [vbDim, setVbDim] = useState({ width: 1000, height: 600 });
  const [svgHtml, setSvgHtml] = useState('');
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState('diagram');
  const [copiedDot, setCopiedDot] = useState(false);
  const [error, setError] = useState(null);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Stable fitToScreen callback with zero dynamic dependencies
  const fitToScreen = useCallback((targetWidth, targetHeight) => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth || 800;
    const containerH = containerRef.current.clientHeight || 520;

    const w = targetWidth || 1000;
    const h = targetHeight || 600;

    const scaleX = (containerW - 48) / w;
    const scaleY = (containerH - 48) / h;
    const fitScale = Math.min(scaleX, scaleY, 1.0);
    const safeZoom = Math.max(fitScale, 0.08);

    const panX = (containerW - w * safeZoom) / 2;
    const panY = (containerH - h * safeZoom) / 2;

    setZoom(safeZoom);
    setPan({ x: panX, y: panY });
  }, []);

  // Render SVG when DOT string changes
  useEffect(() => {
    let isMounted = true;
    if (!dot) return;

    getViz()
      .then(viz => {
        try {
          const rawSvg = viz.renderString(dot, { format: 'svg' });
          const svgStart = rawSvg.indexOf('<svg');
          let cleanSvg = svgStart !== -1 ? rawSvg.substring(svgStart) : rawSvg;

          // Parse viewBox dimensions
          const vbMatch = cleanSvg.match(/viewBox="([^"]+)"/);
          let vbW = 1000, vbH = 600;
          if (vbMatch) {
            const parts = vbMatch[1].trim().split(/\s+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
              vbW = parts[2];
              vbH = parts[3];
            }
          }

          cleanSvg = cleanSvg.replace(/<svg\s+width="[^"]*"\s+height="[^"]*"/, '<svg width="100%" height="100%"');

          if (isMounted) {
            setVbDim({ width: vbW, height: vbH });
            setSvgHtml(cleanSvg);
            setError(null);
            fitToScreen(vbW, vbH);
          }
        } catch (err) {
          if (isMounted) setError(err.message);
        }
      })
      .catch(err => {
        if (isMounted) setError(err.message);
      });

    return () => { isMounted = false; };
  }, [dot, fitToScreen]);

  // Non-passive wheel zoom listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.15 : 0.85;

      setZoom(prevZoom => {
        const nextZoom = Math.max(0.08, Math.min(3.5, prevZoom * factor));
        setPan(prevPan => {
          const nextPanX = mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom);
          const nextPanY = mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom);
          return { x: nextPanX, y: nextPanY };
        });
        return nextZoom;
      });
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Highlight visited nodes (exercised by current input stream) & active node (simulation cursor)
  useEffect(() => {
    if (!containerRef.current) return;
    const svgElem = containerRef.current.querySelector('svg');
    if (!svgElem) return;

    svgElem.querySelectorAll('.highlight-node, .visited-node').forEach(el => {
      el.classList.remove('highlight-node', 'visited-node');
    });

    const nodes = svgElem.querySelectorAll('g.node');

    // 1. Highlight all states visited by the current input stream
    if (visitedStates && visitedStates.size > 0) {
      nodes.forEach(node => {
        const titleTag = node.querySelector('title');
        const textTag = node.querySelector('text');
        const textContent = textTag ? textTag.textContent : '';
        const titleContent = titleTag ? titleTag.textContent : '';
        const label = textContent.split('\n')[0].trim() || titleContent.trim();

        if (visitedStates.has(label) || visitedStates.has(titleContent.trim())) {
          node.classList.add('visited-node');
        }
      });
    }

    // 2. Highlight currently active simulation node (amber cursor)
    if (highlightState !== null && highlightState !== undefined) {
      nodes.forEach(node => {
        const titleTag = node.querySelector('title');
        const textTag = node.querySelector('text');
        const textContent = textTag ? textTag.textContent : '';
        const titleContent = titleTag ? titleTag.textContent : '';
        const label = textContent.split('\n')[0].trim() || titleContent.trim();

        if (
          label === String(highlightState) ||
          titleContent.trim() === String(highlightState) ||
          titleContent.includes(`"${highlightState}"`)
        ) {
          node.classList.remove('visited-node');
          node.classList.add('highlight-node');
        }
      });
    }
  }, [svgHtml, highlightState, visitedStates]);

  // Mouse pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setIsDragging(true);

    const onMouseMove = (moveEvent) => {
      if (!isDraggingRef.current) return;
      setPan({
        x: moveEvent.clientX - dragStartRef.current.x,
        y: moveEvent.clientY - dragStartRef.current.y
      });
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const downloadSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyDot = () => {
    navigator.clipboard.writeText(dot);
    setCopiedDot(true);
    setTimeout(() => setCopiedDot(false), 2000);
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="graph-viewport-frame">
      {/* Top Floating Control Bar */}
      <div className="graph-control-tools">
        <button
          className="tool-btn"
          style={{
            background: viewMode === 'diagram' ? 'var(--bg-hover)' : 'transparent',
            color: viewMode === 'diagram' ? '#fff' : 'var(--text-muted)'
          }}
          title="Visual diagram view"
          onClick={() => setViewMode('diagram')}
        >
          <Eye size={13} style={{ marginRight: '4px' }} /> Diagram
        </button>
        <button
          className="tool-btn"
          style={{
            background: viewMode === 'dot' ? 'var(--bg-hover)' : 'transparent',
            color: viewMode === 'dot' ? '#fff' : 'var(--text-muted)'
          }}
          title="Raw Graphviz DOT source view"
          onClick={() => setViewMode('dot')}
        >
          <Code size={13} style={{ marginRight: '4px' }} /> DOT
        </button>

        <span style={{ borderLeft: '1px solid var(--border-color)', margin: '0 4px' }} />

        {viewMode === 'diagram' ? (
          <>
            <button className="tool-btn" title="Fit whole graph to screen" onClick={() => fitToScreen(vbDim.width, vbDim.height)}>
              <Maximize2 size={13} style={{ marginRight: '4px' }} /> Fit
            </button>
            <button className="tool-btn" title="Zoom in" onClick={() => setZoom(z => Math.min(z * 1.25, 3.5))}>
              <ZoomIn size={13} />
            </button>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 4px', userSelect: 'none' }}>
              {zoomPercent}%
            </span>
            <button className="tool-btn" title="Zoom out" onClick={() => setZoom(z => Math.max(z / 1.25, 0.08))}>
              <ZoomOut size={13} />
            </button>
            <button className="tool-btn" title="Download vector SVG" onClick={downloadSvg}>
              <Download size={13} />
            </button>
          </>
        ) : (
          <button className="tool-btn" title="Copy DOT code" onClick={copyDot}>
            {copiedDot ? <Check size={13} color="var(--color-green)" /> : <Copy size={13} />}
          </button>
        )}
      </div>

      {error ? (
        <div style={{ color: 'var(--color-red)', fontSize: '13px', padding: '16px' }}>
          Graphviz layout error: {error}
        </div>
      ) : viewMode === 'diagram' ? (
        <div
          className="graph-svg-container"
          ref={containerRef}
          onMouseDown={handleMouseDown}
          style={{
            position: 'relative',
            overflow: 'hidden',
            width: '100%',
            height: '100%',
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${vbDim.width}px`,
              height: `${vbDim.height}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isDragging ? 'none' : 'transform 0.05s ease-out',
              pointerEvents: 'none'
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        </div>
      ) : (
        <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '16px' }}>
          <pre style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: '#94a3b8',
            lineHeight: 1.5,
            userSelect: 'text'
          }}>
            {dot}
          </pre>
        </div>
      )}
    </div>
  );
}
