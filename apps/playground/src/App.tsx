import { useState, useEffect, useRef } from "react";
import { OmniCompressor } from "omni-compress";

function App() {
  const [isReady, setIsReady] = useState(false);
  const compressorRef = useRef<OmniCompressor | null>(null);
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

  const [audioResult, setAudioResult] = useState<{
    url: string;
    size: number;
    time: number;
    format: string;
    flacUrl: string;
    flacSize: number;
    flacTime: number;
  } | null>(null);

  const [originalSize, setOriginalSize] = useState(0);
  const [activeTab, setActiveTab] = useState<"image" | "audio">("image");

  useEffect(() => {
    const compressor = new OmniCompressor();
    compressor.init().then(() => {
      compressorRef.current = compressor;
      setIsReady(true);
    });

    return () => {
      compressorRef.current?.terminate();
    };
  }, []);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !compressorRef.current) return;

    setOriginalUrl(null);
    setWasmResult(null);
    setAudioResult(null);
    setOriginalSize(file.size);

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Get interleaved samples
    const channels = audioBuffer.numberOfChannels;
    const pcmData = new Float32Array(audioBuffer.length * channels);
    for (let i = 0; i < channels; i++) {
      const channelData = audioBuffer.getChannelData(i);
      for (let j = 0; j < channelData.length; j++) {
        pcmData[j * channels + i] = channelData[j];
      }
    }

    // 🏎️ CONTESTANT: WASM AUDIO (MP3)
    const startMp3 = performance.now();
    const compressedMp3 = await compressorRef.current.compressAudioMp3(
      pcmData,
      audioBuffer.sampleRate,
      channels,
      128 // 128kbps
    );
    const endMp3 = performance.now();

    const mp3Blob = new Blob([new Uint8Array(compressedMp3)], { type: "audio/mp3" });
    
    // 🏎️ CONTESTANT: WASM AUDIO (FLAC)
    const startFlac = performance.now();
    const compressedFlac = await compressorRef.current.compressAudioFlac(
      pcmData,
      audioBuffer.sampleRate,
      channels,
      16 // 16-bit
    );
    const endFlac = performance.now();
    const flacBlob = new Blob([new Uint8Array(compressedFlac)], { type: "audio/flac" });

    setAudioResult({
      url: URL.createObjectURL(mp3Blob),
      size: mp3Blob.size,
      time: Math.round(endMp3 - startMp3),
      format: "MP3",
      flacUrl: URL.createObjectURL(flacBlob),
      flacSize: flacBlob.size,
      flacTime: Math.round(endFlac - startFlac),
    });
  };

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

    // 🏎️ CONTESTANT 1: WEB ASSEMBLY (RUST) - Now with Worker!
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async () => {
      const inputBytes = new Uint8Array(reader.result as ArrayBuffer);

      if (!compressorRef.current) return;

      const startWasm = performance.now();
      const outputBytes = await compressorRef.current.compressImage(inputBytes, 0, targetQuality);
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
          <h1 className="title">Omni Compressor</h1>

          <div className="tabs" style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <button 
              className={`btn ${activeTab === "image" ? "btn-ready" : ""}`}
              onClick={() => setActiveTab("image")}
            >
              Images
            </button>
            <button 
              className={`btn ${activeTab === "audio" ? "btn-ready" : ""}`}
              onClick={() => setActiveTab("audio")}
            >
              Audio
            </button>
          </div>

          {activeTab === "image" ? (
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
          ) : (
            <div className="upload-area">
              <input
                type="file"
                onChange={handleAudioUpload}
                disabled={!isReady}
                accept="audio/*"
                className="file-input"
                id="audio-upload"
              />
              <label
                htmlFor="audio-upload"
                className={`btn ${isReady ? "btn-ready" : "btn-loading"}`}
              >
                {isReady ? "Upload Audio File" : "Loading Engines..."}
              </label>
              <p className="hint">
                Upload a WAV/MP3 to compress to MP3 via Rust WASM.
              </p>
            </div>
          )}

          {activeTab === "audio" && audioResult && (
            <div className="results">
               <div style={{ flex: "1 1 250px" }}>
                <h3 className="results-title">Original</h3>
                <ul className="stats">
                  <li>
                    <span className="k">Size</span>{" "}
                    <span className="v">
                      {(originalSize / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </li>
                </ul>
              </div>
              <div style={{ flex: "1 1 250px" }}>
                <h3 className="results-title" style={{ color: "var(--accent-2)" }}>🦀 Wasm MP3</h3>
                <ul className="stats">
                  <li>
                    <span className="k">Size</span>{" "}
                    <span className="v">
                      {(audioResult.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </li>
                  <li>
                    <span className="k">Time</span>{" "}
                    <span className="v" style={{ color: "var(--accent-2)", fontWeight: "bold" }}>
                      {audioResult.time} ms
                    </span>
                  </li>
                </ul>
                <audio controls src={audioResult.url} style={{ marginTop: "10px", width: "100%" }} />
                <a 
                  href={audioResult.url} 
                  download="compressed.mp3"
                  className="btn btn-ready"
                  style={{ marginTop: "10px", display: "block", textAlign: "center", textDecoration: "none" }}
                >
                  Download MP3
                </a>
              </div>
              <div style={{ flex: "1 1 250px" }}>
                <h3 className="results-title" style={{ color: "#00d1ff" }}>🦀 Wasm FLAC</h3>
                <ul className="stats">
                  <li>
                    <span className="k">Size</span>{" "}
                    <span className="v">
                      {(audioResult.flacSize / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </li>
                  <li>
                    <span className="k">Time</span>{" "}
                    <span className="v" style={{ color: "#00d1ff", fontWeight: "bold" }}>
                      {audioResult.flacTime} ms
                    </span>
                  </li>
                </ul>
                <audio controls src={audioResult.flacUrl} style={{ marginTop: "10px", width: "100%" }} />
                <a 
                  href={audioResult.flacUrl} 
                  download="compressed.flac"
                  className="btn btn-ready"
                  style={{ marginTop: "10px", display: "block", textAlign: "center", textDecoration: "none", backgroundColor: "#00d1ff" }}
                >
                  Download FLAC
                </a>
              </div>
            </div>
          )}

          {activeTab === "image" && originalUrl && (
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
