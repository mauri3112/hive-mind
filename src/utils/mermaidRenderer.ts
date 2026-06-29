let initialized = false;
let renderSeq = 0;

export interface MermaidValidationResult {
  valid: boolean;
  message: string;
}

export async function validateMermaidSource(source: string): Promise<MermaidValidationResult> {
  try {
    const mermaid = await loadMermaid();
    await mermaid.parse(source);
    return { valid: true, message: "Valid Mermaid" };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : "Mermaid validation failed"
    };
  }
}

export async function renderMermaidSvg(source: string): Promise<string> {
  const mermaid = await loadMermaid();
  await mermaid.parse(source);
  const id = `hive_mermaid_${++renderSeq}`;
  const { svg } = await mermaid.render(id, source);
  return fitSvgToContainer(svg);
}

function fitSvgToContainer(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const nextAttrs = attrs
      .replace(/\swidth="[^"]*"/i, "")
      .replace(/\sheight="[^"]*"/i, "")
      .replace(/\sstyle="[^"]*"/i, "")
      .replace(/\spreserveAspectRatio="[^"]*"/i, "");

    return `<svg${nextAttrs} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;max-width:100%;max-height:100%;display:block;">`;
  });
}

async function loadMermaid() {
  const mermaid = (await import("mermaid")).default;

  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "dark",
      themeVariables: {
        background: "#101617",
        mainBkg: "#132022",
        primaryColor: "#132022",
        primaryTextColor: "#e8eeee",
        primaryBorderColor: "#2dd4bf",
        lineColor: "#9fb0b2",
        secondaryColor: "#1f2a2c",
        tertiaryColor: "#0b0f10",
        noteBkgColor: "#332a12",
        noteTextColor: "#fff2bd",
        noteBorderColor: "#facc15",
        actorBkg: "#122326",
        actorBorder: "#2dd4bf",
        actorTextColor: "#e8eeee",
        signalColor: "#d8e2e2",
        signalTextColor: "#e8eeee"
      }
    });
    initialized = true;
  }

  return mermaid;
}
