import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMermaid, downloadSvg } from "../../src/utils/download";

describe("download utilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and clicks a Mermaid source download link", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadMermaid("sequenceDiagram\nA->>B: Hi");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("creates and clicks an SVG download link", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:svg");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadSvg("<svg></svg>");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:svg");
  });
});
