export function downloadText(content: string, filename: string, type = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadMermaid(source: string, filename = "hive-mind-diagram.mmd"): void {
  downloadText(source, filename, "text/plain;charset=utf-8");
}

export function downloadSvg(svg: string, filename = "hive-mind-diagram.svg"): void {
  downloadText(svg, filename, "image/svg+xml;charset=utf-8");
}
