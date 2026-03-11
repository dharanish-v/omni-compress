import { useState, useEffect } from "react";
import init, { compress_image } from "omni-compress";

function App() {
  const [isReady, setIsReady] = useState(false);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);

  const [wasmResult, setWasmResult] = useState<{
    url: string;
    size: number;
    time: number;
  } | null>(null);
  const [canvasResult, setCanvasResult] = useState<{
    url: string;
    size: number;
    time: number;
  } | null>(null);

  const [originalSize, setOriginalSize] = useState(0);

  useEffect(() => {
    init().then(() => setIsReady(true));
  }, []);

  const compressWithCanvas = (
    file: File,
    quality: number,
  ): Promise<{ blob: Blob; time: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        const start = performance.now();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        ctx?.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            const end = performance.now();
            if (blob) resolve({ blob, time: Math.round(end - start) });
          },
          "image/jpeg",
          quality / 100,
        );
      };
      img.src = url;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isReady) return;

    if (file.type === "image/gif") {
      alert(
        "GIFs are animated timelines, not static images. Wasm will only process the first frame. Use a heavy PNG or JPG for the true benchmark.",
      );
    }

    setOriginalUrl(URL.createObjectURL(file));
    setOriginalSize(file.size);
    setWasmResult(null);
    setCanvasResult(null);

    const targetQuality = 80;

    // 🏎️ CONTESTANT 1: WEB ASSEMBLY (RUST)
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
      const inputBytes = new Uint8Array(reader.result as ArrayBuffer);

      const startWasm = performance.now();
      const outputBytes = compress_image(inputBytes, 0, targetQuality);
      const endWasm = performance.now();

      const wasmBlob = new Blob([new Uint8Array(outputBytes)], { type: "image/jpeg" });
      setWasmResult({
        url: URL.createObjectURL(wasmBlob),
        size: wasmBlob.size,
        time: Math.round(endWasm - startWasm),
      });
    };

    // 🏎️ CONTESTANT 2: NATIVE CANVAS (JS)
    const { blob: canvasBlob, time: canvasTime } = await compressWithCanvas(
      file,
      targetQuality,
    );
    setCanvasResult({
      url: URL.createObjectURL(canvasBlob),
      size: canvasBlob.size,
      time: canvasTime,
    });
  };

  return (
    <div className="app-root">
      <div className="container">
        <div className="card">
          <h1 className="title">The Sovereign Benchmark</h1>

          <div className="upload-area">
            <input
              type="file"
              onChange={handleUpload}
              disabled={!isReady}
              accept="image/png, image/jpeg, image/gif"
              className="file-input"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className={`btn ${isReady ? "btn-ready" : "btn-loading"}`}
            >
              {isReady ? "Upload Heavy Image (2MB+)" : "Loading Engines..."}
            </label>
            <p className="hint">
              Upload a high-res image to compare Wasm vs Native UI thread.
            </p>
          </div>

          {originalUrl && (
            <div className="results">
              {/* Column 1: Original */}
              <div style={{ flex: "1 1 250px" }}>
                <h3 className="results-title">Original</h3>
                <ul className="stats">
                  <li>
                    <span className="k">Size</span>{" "}
                    <span className="v">
                      {(originalSize / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </li>
                  <li>
                    <span className="k">Time</span> <span className="v">-</span>
                  </li>
                </ul>
                <div className="preview">
                  <img src={originalUrl} alt="Original" />
                </div>
              </div>

              {/* Column 2: Wasm */}
              <div style={{ flex: "1 1 250px" }}>
                <h3
                  className="results-title"
                  style={{ color: "var(--accent-2)" }}
                >
                  🦀 Wasm
                </h3>
                {wasmResult ? (
                  <>
                    <ul className="stats">
                      <li>
                        <span className="k">Size</span>{" "}
                        <span className="v">
                          {(wasmResult.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </li>
                      <li>
                        <span className="k">Time</span>{" "}
                        <span
                          className="v"
                          style={{
                            color: "var(--accent-2)",
                            fontWeight: "bold",
                          }}
                        >
                          {wasmResult.time} ms
                        </span>
                      </li>
                    </ul>
                    <div className="preview">
                      <img src={wasmResult.url} alt="Wasm Result" />
                    </div>
                  </>
                ) : (
                  <p className="hint" style={{ padding: "14px" }}>
                    Processing in Wasm...
                  </p>
                )}
              </div>

              {/* Column 3: Canvas */}
              <div style={{ flex: "1 1 250px" }}>
                <h3 className="results-title" style={{ color: "#f7df1e" }}>
                  🟨 Canvas
                </h3>
                {canvasResult ? (
                  <>
                    <ul className="stats">
                      <li>
                        <span className="k">Size</span>{" "}
                        <span className="v">
                          {(canvasResult.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </li>
                      <li>
                        <span className="k">Time</span>{" "}
                        <span
                          className="v"
                          style={{ color: "#f7df1e", fontWeight: "bold" }}
                        >
                          {canvasResult.time} ms
                        </span>
                      </li>
                    </ul>
                    <div className="preview">
                      <img src={canvasResult.url} alt="Canvas Result" />
                    </div>
                  </>
                ) : (
                  <p className="hint" style={{ padding: "14px" }}>
                    Processing in DOM...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
