import { useState, useRef, useEffect } from "react";
import { OmniCompressor, WorkerConfig } from "@dharanish/omni-compress";

// Vite bundles these workers into self-contained assets and returns their URLs.
// @ts-ignore - Vite ?worker&url import
import ImageWorkerUrl from '../../../packages/omni-compress/src/workers/image.worker.ts?worker&url';
// @ts-ignore - Vite ?worker&url import
import AudioWorkerUrl from '../../../packages/omni-compress/src/workers/audio.worker.ts?worker&url';

WorkerConfig.imageWorkerUrl = ImageWorkerUrl;
WorkerConfig.audioWorkerUrl = AudioWorkerUrl;

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ origSize: number; newSize: number; time: number; format: string } | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file) {
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        if (file.type === 'image/webp') setSelectedFormat('avif');
        else setSelectedFormat('webp');
      } else {
        if (file.type === 'audio/mpeg' || file.type === 'audio/mp3') setSelectedFormat('opus');
        else setSelectedFormat('mp3');
      }
    }
  }, [file]);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
    };
  }, [originalUrl, compressedUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      setOriginalUrl(URL.createObjectURL(selectedFile));
      setCompressedUrl(null);
      setStats(null);
      setProgress(0);
    }
  };

  const handleCompress = async () => {
    if (!file || !selectedFormat) return;
    setIsProcessing(true);
    setProgress(0);
    
    try {
      const isImage = file.type.startsWith('image/');
      const type = isImage ? 'image' : 'audio';

      const start = performance.now();
      
      const resultBlob = await OmniCompressor.process(file, {
        type,
        format: selectedFormat,
        quality: 0.8,
        onProgress: (p) => setProgress(Math.round(p))
      });

      const time = Math.round(performance.now() - start);

      const url = URL.createObjectURL(resultBlob);
      setCompressedUrl(url);
      setStats({
        origSize: file.size,
        newSize: resultBlob.size,
        time,
        format: selectedFormat
      });
    } catch (err) {
      console.error(err);
      alert("Failed to compress file");
    } finally {
      setIsProcessing(false);
    }
  };

  const isLossy = (file: File | null) => {
    if (!file) return false;
    const lossyMimes = [
      'image/jpeg', 'image/jpg', 'audio/mpeg', 'audio/mp3', 'audio/opus', 'audio/ogg', 'audio/webm', 'video/webm'
    ];
    const lossyExts = ['.jpg', '.jpeg', '.mp3', '.ogg', '.opus', '.webm'];
    const fileName = file.name.toLowerCase();
    
    return lossyMimes.includes(file.type) || lossyExts.some(ext => fileName.endsWith(ext));
  };

  const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-picasso-rose selection:text-white flex items-center justify-center">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 relative">
        
        {/* Decorative background shapes mimicking cubism */}
        <div className="absolute -top-10 -left-10 w-48 h-48 bg-picasso-lightblue rounded-full mix-blend-multiply opacity-50 blur-xl"></div>
        <div className="absolute -bottom-10 -right-10 w-72 h-72 bg-picasso-ochre mix-blend-multiply opacity-30 blur-2xl transform rotate-12"></div>
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-picasso-rose mix-blend-multiply opacity-40 blur-2xl transform -translate-y-1/2"></div>

        {/* Header / Intro Section (Spans 5 cols) */}
        <div className="md:col-span-5 flex flex-col justify-center relative z-10">
          <div className="bg-white border-4 border-picasso-dark p-8 shadow-[12px_12px_0px_0px_rgba(43,43,43,1)] transform -rotate-1 hover:rotate-0 transition-transform duration-300">
            <h1 className="text-5xl font-black text-picasso-dark tracking-tighter uppercase leading-none mb-4">
              Omni<br />
              <span className="text-picasso-terracotta">Compress</span>
            </h1>
            <p className="text-lg text-gray-700 font-medium leading-relaxed mb-6 border-l-4 border-picasso-blue pl-4">
              The zero-compromise media abstraction layer. 
              Upload an image or audio file and let WebAssembly and standard Web APIs sculpt it down to size.
            </p>
            
            <div className="space-y-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-picasso-blue hover:bg-picasso-dark text-white font-bold py-4 px-6 border-2 border-transparent hover:border-picasso-blue shadow-[4px_4px_0px_0px_rgba(43,43,43,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
              >
                {file ? file.name : "Select Media File"}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*,audio/*" 
                className="hidden" 
              />

              {file && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-picasso-dark uppercase">Output Format</label>
                    {isLossy(file) && (
                      <span className="text-[10px] bg-picasso-terracotta text-white px-2 py-0.5 font-bold rounded">
                        LOSSY SOURCE
                      </span>
                    )}
                  </div>
                  <select 
                    value={selectedFormat}
                    onChange={(e) => setSelectedFormat(e.target.value)}
                    className="w-full bg-stone-100 border-2 border-picasso-dark p-2 font-bold focus:outline-none focus:bg-picasso-sand transition-colors"
                  >
                    {file.type.startsWith('image/') ? (
                      <>
                        {file.type !== 'image/webp' && <option value="webp">WebP (Optimized)</option>}
                        {file.type !== 'image/avif' && <option value="avif">AVIF (High Quality)</option>}
                        {!(file.type === 'image/jpeg' || file.type === 'image/jpg') && <option value="jpeg">JPEG (Standard)</option>}
                        {/* Only allow PNG if the source is NOT lossy */}
                        {!isLossy(file) && file.type !== 'image/png' && <option value="png">PNG (Lossless)</option>}
                      </>
                    ) : (
                      <>
                        {file.type !== 'audio/mpeg' && file.type !== 'audio/mp3' && <option value="mp3">MP3 (Compressed)</option>}
                        {file.type !== 'audio/opus' && <option value="opus">Opus (Web-ready)</option>}
                        {/* Only allow Lossless outputs (FLAC/WAV) if the source is NOT lossy */}
                        {!isLossy(file) && (
                          <>
                            {file.type !== 'audio/flac' && <option value="flac">FLAC (Lossless)</option>}
                            {file.type !== 'audio/wav' && file.type !== 'audio/x-wav' && <option value="wav">WAV (Uncompressed)</option>}
                          </>
                        )}
                      </>
                    )}
                  </select>
                  {isLossy(file) && (
                    <p className="text-[10px] text-gray-500 italic mt-1">
                      * Lossless options disabled to prevent file size bloating from a compressed source.
                    </p>
                  )}
                </div>
              )}
              
              <button 
                onClick={handleCompress} 
                disabled={!file || isProcessing}
                className={`w-full font-bold py-4 px-6 border-2 border-picasso-dark shadow-[4px_4px_0px_0px_rgba(43,43,43,1)] transition-all flex justify-center items-center gap-2
                  ${(!file || isProcessing) 
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed shadow-none translate-x-[4px] translate-y-[4px]" 
                    : "bg-picasso-ochre text-picasso-dark hover:bg-picasso-terracotta hover:text-white hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]"}`}
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing... {progress}%
                  </>
                ) : 'Start Compression'}
              </button>
            </div>
          </div>
        </div>

        {/* Results / Preview Section (Spans 7 cols) */}
        <div className="md:col-span-7 relative z-10 flex flex-col justify-center">
          {(!file && !compressedUrl) && (
            <div className="h-full min-h-[400px] border-4 border-dashed border-picasso-lightblue/50 bg-white/40 flex items-center justify-center transform rotate-1 p-8 text-center">
              <p className="text-2xl font-bold text-picasso-lightblue/70 rotate-[-2deg]">
                "Art is the elimination of the unnecessary."<br/>
                <span className="text-lg opacity-70 block mt-2">- Pablo Picasso</span>
              </p>
            </div>
          )}

          {(file || compressedUrl) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 h-full">
              
              {/* Original Card */}
              {originalUrl && (
                <div className="bg-white border-4 border-picasso-dark p-4 shadow-[8px_8px_0px_0px_rgba(83,134,180,1)] flex flex-col">
                  <div className="bg-picasso-lightblue text-white font-bold uppercase tracking-wider py-1 px-3 inline-block self-start mb-4 border-2 border-picasso-dark">
                    Original
                  </div>
                  <div className="flex-grow flex items-center justify-center bg-stone-100 border-2 border-picasso-dark overflow-hidden relative group">
                    {file?.type.startsWith('image/') ? (
                      <img src={originalUrl} alt="Original" className="max-h-64 object-contain group-hover:scale-105 transition-transform" />
                    ) : (
                      <audio controls src={originalUrl} className="w-full px-2" />
                    )}
                  </div>
                  {stats && (
                    <div className="mt-4 flex justify-between items-end border-t-2 border-dashed border-gray-300 pt-4">
                      <span className="text-sm font-bold text-gray-500 uppercase">Size</span>
                      <span className="text-xl font-black text-picasso-dark">{formatSize(stats.origSize)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Compressed Card */}
              {compressedUrl && stats && (
                <div className="bg-picasso-dark border-4 border-picasso-dark p-4 shadow-[8px_8px_0px_0px_rgba(214,140,137,1)] flex flex-col text-white transform md:translate-y-8">
                  <div className="bg-picasso-rose text-picasso-dark font-black uppercase tracking-wider py-1 px-3 inline-block self-start mb-4 border-2 border-white">
                    Masterpiece
                  </div>
                  <div className="flex-grow flex items-center justify-center bg-[#1a1a1a] border-2 border-gray-600 overflow-hidden relative">
                    {file?.type.startsWith('image/') ? (
                      <img src={compressedUrl} alt="Compressed" className="max-h-64 object-contain" />
                    ) : (
                      <audio controls src={compressedUrl} className="w-full px-2 filter invert sepia hue-rotate-180" />
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t-2 border-dashed border-gray-600 pt-4">
                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase block">New Size</span>
                      <span className="text-xl font-black text-picasso-ochre">{formatSize(stats.newSize)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-gray-400 uppercase block">Time</span>
                      <span className="text-xl font-black text-picasso-lightblue">{stats.time}ms</span>
                    </div>
                  </div>
                  <a 
                    href={compressedUrl} 
                    download={`compressed-${file?.name.split('.').slice(0, -1).join('.') || 'file'}.${stats.format}`}
                    className="mt-4 w-full bg-picasso-terracotta hover:bg-white hover:text-picasso-terracotta text-white text-center font-bold py-3 px-4 border-2 border-transparent hover:border-picasso-terracotta transition-colors uppercase tracking-widest"
                  >
                    Download Art
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
