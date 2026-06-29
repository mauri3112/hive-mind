import { AlertTriangle, CheckCircle2, Code2, Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DiagramDocument } from "../../shared/hiveSchemas";
import { renderMermaidSvg } from "../utils/mermaidRenderer";

interface DiagramPreviewProps {
  document: DiagramDocument;
  status: string;
  onRenderedSvgChange?: (svg: string) => void;
}

export function DiagramPreview({ document, status, onRenderedSvgChange }: DiagramPreviewProps) {
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsRendering(true);
    setRenderError(null);

    renderMermaidSvg(document.source)
      .then((nextSvg) => {
        if (cancelled) {
          return;
        }
        setSvg(nextSvg);
        onRenderedSvgChange?.(nextSvg);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to render Mermaid diagram.";
        setRenderError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsRendering(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [document.source, onRenderedSvgChange]);

  const lines = useMemo(() => document.source.split("\n"), [document.source]);
  const diagramLabel = document.diagramType === "sequence" ? "sequenceDiagram" : "stateDiagram-v2";

  return (
    <section className="diagram-panel" aria-label="Diagram workspace">
      <div className="diagram-toolbar">
        <div>
          <span className="toolbar-title">Diagram</span>
          <span className="toolbar-meta">{diagramLabel}</span>
          <span className="toolbar-meta">rev {document.revision}</span>
        </div>
        <span className="proposal-status">{status}</span>
      </div>

      <div className="diagram-preview-wrap">
        <div className="diagram-stage" aria-label="Mermaid preview">
          <div className="stage-toolbar">
            <span>
              <Eye size={14} />
              Preview
            </span>
            <span className={renderError ? "render-state error" : "render-state"}>
              {isRendering ? <Loader2 size={14} className="spin" /> : renderError ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {isRendering ? "Rendering" : renderError ? "Invalid" : "Ready"}
            </span>
          </div>
          <div className="render-surface">
            {renderError ? (
              <div className="render-error">
                <AlertTriangle size={18} />
                <span>{renderError}</span>
              </div>
            ) : svg ? (
              <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="render-loading">Preparing diagram...</div>
            )}
          </div>
        </div>

        <div className="source-panel" aria-label="Mermaid source">
          <div className="source-toolbar">
            <span>
              <Code2 size={14} />
              untitled-diagram.mmd
            </span>
            <span>Mermaid</span>
          </div>
          <pre className="source-code" aria-label="Current Mermaid source">
            {lines.map((line, index) => (
              <span className="source-line" key={`${index}-${line}`}>
                <span className="line-number">{index + 1}</span>
                <code>{line || " "}</code>
              </span>
            ))}
          </pre>
        </div>
      </div>
    </section>
  );
}
