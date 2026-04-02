import { useState, useRef, useEffect } from 'react';
import { compressImage } from '@dharanish/omni-compress';
import Compressor from 'compressorjs';
import imageCompression from 'browser-image-compression';
import { triggerFeedback } from '../utils/feedback';

interface BenchmarkResult {
  name: string;
  size: number;
  ratio: number;
  time: number;
  blob: Blob;
  url?: string;
  error?: string;
  isWinner?: boolean;
}

export function BenchmarkPanel({ isMuted = false }: { isMuted?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunningIndex, setCurrentRunningIndex] = useState(-1);
  const [selectedResult, setSelectedResult] = useState<BenchmarkResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Cleanup Object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      results.forEach(r => {
        if (r.url) URL.revokeObjectURL(r.url);
      });
    };
  }, [results]);

  const runBenchmark = async (selectedFile: File) => {
    setIsRunning(true);
    setResults([]);
    triggerFeedback('click', isMuted);

    const targetQuality = 0.8;

    const benchmarks = [
      {
        name: 'Omni-Compress (WebP)',
        id: 'omni-webp',
        fn: async () => {
          const start = performance.now();
          const res = await compressImage(selectedFile, { format: 'webp', quality: targetQuality });
          return {
            size: res.compressedSize,
            ratio: res.ratio,
            time: Math.round(performance.now() - start),
            blob: res.blob
          };
        }
      },
      {
        name: 'Omni-Compress (AVIF)',
        id: 'omni-avif',
        fn: async () => {
          const start = performance.now();
          const res = await compressImage(selectedFile, { format: 'avif', quality: targetQuality });
          return {
            size: res.compressedSize,
            ratio: res.ratio,
            time: Math.round(performance.now() - start),
            blob: res.blob
          };
        }
      },
      {
        name: 'Compressor.js',
        id: 'compressorjs',
        fn: async () => {
          const start = performance.now();
          return new Promise((resolve, reject) => {
            new Compressor(selectedFile, {
              quality: targetQuality,
              mimeType: 'image/webp',
              success: (result) => {
                resolve({
                  size: result.size,
                  ratio: result.size / selectedFile.size,
                  time: Math.round(performance.now() - start),
                  blob: result
                });
              },
              error: (err) => reject(err)
            });
          });
        }
      },
      {
        name: 'Browser-Image-Compression',
        id: 'bic',
        fn: async () => {
          const start = performance.now();
          const options = {
            maxSizeMB: 10,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            initialQuality: targetQuality,
            fileType: 'image/webp'
          };
          const result = await imageCompression(selectedFile, options);
          return {
            size: result.size,
            ratio: result.size / selectedFile.size,
            time: Math.round(performance.now() - start),
            blob: result
          };
        }
      }
    ];

    const newResults: BenchmarkResult[] = [];

    for (let i = 0; i < benchmarks.length; i++) {
      const b = benchmarks[i];
      setCurrentRunningIndex(i);
      try {
        const res = await b.fn() as any;
        newResults.push({ 
          name: b.name, 
          ...res,
          url: URL.createObjectURL(res.blob)
        });
      } catch (e: any) {
        newResults.push({ 
          name: b.name, 
          size: 0, 
          ratio: 0, 
          time: 0, 
          blob: new Blob(), 
          error: e.message 
        });
      }
    }

    // Determine winner (smallest size)
    const validResults = newResults.filter(r => !r.error && r.size > 0);
    if (validResults.length > 0) {
      const minSize = Math.min(...validResults.map(r => r.size));
      newResults.forEach(r => {
        if (r.size === minSize) r.isWinner = true;
      });
    }

    setResults(newResults);
    setIsRunning(false);
    setCurrentRunningIndex(-1);
    triggerFeedback('success', isMuted);

    // Auto-scroll to results
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      runBenchmark(selectedFile);
    }
  };

  const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + " MB";
  const formatSavings = (original: number, current: number) => {
    const saved = original - current;
    return saved > 0 ? (saved / 1024).toFixed(1) + " KB" : "0 KB";
  };

  const downloadResult = (res: BenchmarkResult) => {
    if (!res.url) return;
    const a = document.createElement('a');
    a.href = res.url;
    a.download = `compressed-${res.name.toLowerCase().replace(/\s+/g, '-')}.${res.blob.type.split('/')[1]}`;
    a.click();
    triggerFeedback('shift', isMuted);
  };

  return (
    <div className="w-full space-y-12 sm:space-y-16 pb-32 px-1 sm:px-2 lg:px-0">
      <div className="border-8 p-6 sm:p-10 bg-[var(--theme-card-bg)] border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)] sm:shadow-[16px_16px_0px_0px_var(--theme-shadow)] group hover:shadow-none hover:translate-x-[8px] hover:translate-y-[8px] sm:hover:translate-x-[16px] sm:hover:translate-y-[16px] transition-all duration-300 relative overflow-hidden mb-4 mr-4 sm:mr-6">
        {/* Decorative corner accent */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--theme-accent)] translate-x-12 -translate-y-12 rotate-45 border-b-4 border-l-4 border-[var(--theme-border)] hidden sm:block"></div>
        
        <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter mb-6 sm:mb-8 flex items-center gap-4 sm:gap-6 text-[var(--theme-text)]">
          <span className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center border-4 bg-[var(--theme-primary)] text-[var(--theme-primary-text)] shadow-[4px_4px_0px_0px_var(--theme-shadow)]">01</span>
          Init
        </h2>
        <p className="font-bold opacity-90 mb-8 sm:mb-10 border-l-8 pl-6 sm:pl-8 border-[var(--theme-primary)] text-lg sm:text-xl leading-tight sm:leading-relaxed max-w-3xl text-[var(--theme-text)]">
          Deploy a test subject into the laboratory. We'll execute parallel compression cycles to stress-test <span className="underline decoration-[var(--theme-accent)] decoration-4 underline-offset-4">isomorphic routing</span>.
        </p>

        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isRunning}
          className={`w-full font-black py-6 sm:py-8 px-6 sm:px-10 border-4 shadow-[8px_8px_0px_0px_var(--theme-shadow)] sm:shadow-[12px_12px_0px_0px_var(--theme-shadow)] transition-all flex items-center justify-center gap-4 sm:gap-6 uppercase tracking-[0.1em] sm:tracking-[0.2em] text-xl sm:text-2xl
            ${isRunning ? 'bg-stone-200 text-stone-500 cursor-wait shadow-none translate-x-[8px] translate-y-[8px]' : 'bg-[var(--theme-primary)] text-[var(--theme-primary-text)] border-[var(--theme-border)] hover:bg-[var(--theme-accent)] hover:text-[var(--theme-accent-text)] hover:shadow-none hover:translate-x-[8px] hover:translate-y-[8px]'}`}
        >
          {isRunning ? (
            <>
              <svg className="animate-spin h-8 w-8 sm:h-10 sm:w-10" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              Upload Subject
            </>
          )}
        </button>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
      </div>

      {(file || isRunning) && (
        <div className="space-y-12 sm:space-y-16 animate-in slide-in-from-bottom-8 duration-500">
          {/* File Info Section */}
          <div className="flex flex-col lg:flex-row gap-8 sm:gap-12 items-stretch">
            <div className="w-full lg:w-2/5 aspect-square border-8 border-[var(--theme-border)] bg-[var(--theme-card-bg)] shadow-[8px_8px_0px_0px_var(--theme-shadow)] overflow-hidden flex items-center justify-center p-4 sm:p-6 relative mb-4 mr-4 sm:mr-6">
              <div className="absolute top-2 sm:top-4 left-2 sm:left-4 font-mono text-[8px] sm:text-[10px] font-black opacity-30 tracking-widest uppercase text-[var(--theme-text)]">Visual Probe</div>
              {file ? (
                <img src={URL.createObjectURL(file)} className="max-w-full max-h-full object-contain z-10" alt="Test subject" />
              ) : (
                <div className="animate-pulse w-full h-full bg-[var(--theme-secondary)]/10 pattern-dots"></div>
              )}
            </div>
            <div className="flex-grow w-full flex flex-col justify-between space-y-8">
              <div className="border-8 p-6 sm:p-8 bg-[var(--theme-card-bg)] border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)] flex-grow mb-4 mr-4 sm:mr-6">
                <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mb-6 border-b-4 border-[var(--theme-border)] pb-4 flex justify-between items-center text-[var(--theme-text)]">
                  Diagnostics
                  <span className="font-mono text-[10px] opacity-40">#OC-99</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 text-[var(--theme-text)]">
                  <div className="space-y-2 min-w-0">
                    <span className="text-xs sm:text-sm font-black uppercase opacity-50 block tracking-widest">Filename</span>
                    <span className="font-bold text-base sm:text-lg break-words overflow-wrap-anywhere border-2 border-[var(--theme-border)] p-2 sm:p-3 bg-[var(--theme-bg)] block min-w-0">{file?.name || 'Waiting...'}</span>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs sm:text-sm font-black uppercase opacity-50 block tracking-widest">Size</span>
                    <div className="bg-[var(--theme-accent)] text-[var(--theme-accent-text)] p-2 sm:p-3 border-2 border-[var(--theme-border)] shadow-[4px_4px_0px_0px_var(--theme-shadow)]">
                      <span className="font-mono font-black text-2xl sm:text-3xl">{file ? formatSize(file.size) : '0.00 MB'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Progress Indicators */}
              <div className="space-y-4 pr-6">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 text-[var(--theme-text)]">Parallelism</span>
                  <span className="font-mono text-xs font-black text-[var(--theme-text)]">{results.length}/4 ACTIVE</span>
                </div>
                <div className="grid grid-cols-4 gap-3 sm:gap-4">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`h-4 sm:h-6 border-4 border-[var(--theme-border)] transition-all duration-500 shadow-[4px_4px_0px_0px_var(--theme-shadow)]
                      ${i < results.length ? 'bg-[var(--theme-primary)]' : i === currentRunningIndex ? 'bg-[var(--theme-accent)] animate-pulse' : 'bg-transparent shadow-none translate-x-[4px] translate-y-[4px]'}`}></div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Results Display */}
          {results.length > 0 && (
            <div className="space-y-8" ref={resultsRef}>
              <div className="flex items-center gap-4">
                <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter text-[var(--theme-text)]">Laboratory Results</h3>
                <div className="h-1 flex-grow bg-[var(--theme-border)] opacity-20"></div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block border-8 overflow-x-auto scrollbar-thin bg-[var(--theme-card-bg)] border-[var(--theme-border)] shadow-[20px_20px_0px_0px_var(--theme-shadow)] mr-6 mb-6">
                <table className="w-full text-left border-collapse min-w-full table-fixed">
                  <thead>
                    <tr className="bg-[var(--theme-bg)] border-b-8 border-[var(--theme-border)] text-[var(--theme-text)]">
                      <th className="p-8 font-black uppercase tracking-widest text-sm border-r-4 border-[var(--theme-border)] w-[25%]">Engine</th>
                      <th className="p-8 font-black uppercase tracking-widest text-sm border-r-4 border-[var(--theme-border)] w-[15%]">Payload</th>
                      <th className="p-8 font-black uppercase tracking-widest text-sm border-r-4 border-[var(--theme-border)] w-[25%]">Efficiency</th>
                      <th className="p-8 font-black uppercase tracking-widest text-sm border-r-4 border-[var(--theme-border)] w-[15%]">Latency</th>
                      <th className="p-8 font-black uppercase tracking-widest text-sm w-[20%]">Operation</th>
                    </tr>
                  </thead>
                  <tbody className="font-bold text-lg text-[var(--theme-text)]">
                    {results.map((r, i) => (
                      <tr key={i} className={`border-b-4 border-[var(--theme-border)] last:border-0 transition-colors group
                        ${r.isWinner ? 'bg-[var(--theme-accent)]/10' : 'hover:bg-[var(--theme-bg)]'}`}>
                        <td className="p-8 border-r-4 border-[var(--theme-border)] truncate">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`w-6 h-6 flex-shrink-0 border-4 border-[var(--theme-border)] shadow-[3px_3px_0px_0px_var(--theme-shadow)]
                              ${r.isWinner ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-primary)]'}`}></div>
                            <span className="text-xl tracking-tighter uppercase truncate">{r.name}</span>
                            {r.isWinner && <span className="flex-shrink-0 ml-4 text-xs px-3 py-1 bg-[var(--theme-accent)] text-[var(--theme-accent-text)] font-black uppercase rounded-sm shadow-[4px_4px_0px_0px_var(--theme-shadow)] animate-pulse">VICTOR</span>}
                          </div>
                        </td>
                        <td className={`p-8 border-r-4 border-[var(--theme-border)] font-mono text-2xl whitespace-nowrap ${r.isWinner ? 'text-[var(--theme-accent)] font-black' : ''}`}>
                          {r.error ? <span className="text-red-600 bg-red-100 px-3 py-1 border-4 border-red-600 text-xs uppercase">Failure</span> : formatSize(r.size)}
                        </td>
                        <td className="p-8 border-r-4 border-[var(--theme-border)]">
                          {!r.error && (
                            <div className="flex flex-col gap-2">
                              <div className="flex justify-between items-center mb-1 min-w-0">
                                <span className="font-mono text-sm text-[var(--theme-primary)] truncate">-{formatSavings(file!.size, r.size)}</span>
                                <span className="font-mono text-xs font-black flex-shrink-0">{( (1 - r.ratio) * 100).toFixed(1)}%</span>
                              </div>
                              <div className="w-full h-5 border-4 border-[var(--theme-border)] bg-white overflow-hidden shadow-inner">
                                <div className={`h-full transition-all duration-1000 ${r.isWinner ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-primary)]'}`}
                                     style={{ width: `${Math.min(100, (1 - r.ratio) * 100)}%` }}></div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="p-8 border-r-4 border-[var(--theme-border)] font-mono text-2xl whitespace-nowrap">
                          {r.error ? '—' : `${r.time}ms`}
                        </td>
                        <td className="p-8">
                          {!r.error && (
                            <div className="flex items-center gap-4 min-w-[120px]">
                              <button onClick={() => { setSelectedResult(r); triggerFeedback('click', isMuted); }} className="p-4 border-4 border-[var(--theme-border)] bg-[var(--theme-card-bg)] shadow-[6px_6px_0px_0px_var(--theme-shadow)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all text-[var(--theme-text)]" title="Visual Fidelity Audit"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>
                              <button onClick={() => downloadResult(r)} className="p-4 border-4 border-[var(--theme-border)] bg-[var(--theme-primary)] text-[var(--theme-primary-text)] shadow-[6px_6px_0px_0px_var(--theme-shadow)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all" title="Download Payload"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="grid grid-cols-1 gap-8 lg:hidden pr-4">
                {results.map((r, i) => (
                  <div key={i} className={`border-8 p-6 bg-[var(--theme-card-bg)] border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)] flex flex-col space-y-6 relative overflow-hidden ${r.isWinner ? 'bg-[var(--theme-accent)]/5' : ''}`}>
                    {r.isWinner && <div className="absolute top-0 right-0 bg-[var(--theme-accent)] text-[var(--theme-accent-text)] px-4 py-1 font-black uppercase text-xs border-b-4 border-l-4 border-[var(--theme-border)]">Victor</div>}
                    
                    <div className="flex items-center gap-4">
                      <div className={`w-6 h-6 border-4 border-[var(--theme-border)] ${r.isWinner ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-primary)]'}`}></div>
                      <h4 className="text-xl font-black uppercase tracking-tight break-words pr-12 text-[var(--theme-text)]">{r.name}</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] font-black uppercase opacity-50 block text-[var(--theme-text)]">Payload</span>
                        <span className="font-mono text-xl font-black text-[var(--theme-text)]">{r.error ? 'Error' : formatSize(r.size)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase opacity-50 block text-[var(--theme-text)]">Latency</span>
                        <span className="font-mono text-xl font-black text-[var(--theme-text)]">{r.error ? '—' : `${r.time}ms`}</span>
                      </div>
                    </div>

                    {!r.error && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs font-black uppercase text-[var(--theme-text)]">
                          <span>Efficiency</span>
                          <span className="text-[var(--theme-accent)]">{( (1 - r.ratio) * 100).toFixed(1)}% Reduction</span>
                        </div>
                        <div className="w-full h-4 border-4 border-[var(--theme-border)] bg-white overflow-hidden shadow-inner">
                          <div className={`h-full transition-all duration-1000 ${r.isWinner ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-primary)]'}`}
                                style={{ width: `${Math.min(100, (1 - r.ratio) * 100)}%` }}></div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <button onClick={() => setSelectedResult(r)} className="flex items-center justify-center gap-2 py-3 border-4 border-[var(--theme-border)] bg-[var(--theme-card-bg)] shadow-[4px_4px_0px_0px_var(--theme-shadow)] font-black uppercase text-xs text-[var(--theme-text)]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Audit</button>
                      <button onClick={() => downloadResult(r)} className="flex items-center justify-center gap-2 py-3 border-4 border-[var(--theme-border)] bg-[var(--theme-primary)] text-[var(--theme-primary-text)] shadow-[4px_4px_0px_0px_var(--theme-shadow)] font-black uppercase text-xs"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Export</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Migration Guide Link */}
          <div className="border-8 p-6 sm:p-10 bg-[var(--theme-card-alt)] text-[var(--theme-card-alt-text)] border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)] sm:shadow-[12px_12px_0px_0px_var(--theme-shadow)] flex flex-col md:flex-row justify-between items-center gap-8 sm:gap-10 relative overflow-hidden mb-4 mr-4">
             <div className="absolute top-0 left-0 w-full h-2 bg-[var(--theme-accent)]"></div>
             <div className="space-y-4 relative z-10 text-center md:text-left">
              <h4 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter italic text-[var(--theme-card-alt-text)]">Switching?</h4>
              <p className="font-bold opacity-70 text-base sm:text-xl max-w-2xl leading-tight">We provide a 1:1 drop-in compatibility shim for Compressor.js.</p>
            </div>
            <a 
              href="https://github.com/dharanish-v/omni-compress#migration-from-compressorjs" 
              target="_blank"
              rel="noopener noreferrer"
              className="w-full md:w-auto px-8 sm:px-12 py-4 sm:py-6 bg-[var(--theme-accent)] text-[var(--theme-accent-text)] border-4 border-[var(--theme-border)] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] text-lg sm:text-xl shadow-[6px_6px_0px_0px_var(--theme-shadow)] sm:shadow-[8px_8px_0px_0px_var(--theme-shadow)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] sm:hover:translate-x-[8px] sm:hover:translate-y-[8px] transition-all text-center z-10"
            >
              Shim API
            </a>
          </div>
        </div>
      )}

      {/* Visual Compare Modal */}
      {selectedResult && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-[var(--theme-text)]/60 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
          <div className="w-full max-w-7xl bg-[var(--theme-card-bg)] border-4 sm:border-[12px] border-[var(--theme-border)] shadow-[16px_16px_0px_0px_var(--theme-shadow)] sm:shadow-[32px_32px_0px_0px_var(--theme-shadow)] flex flex-col relative my-auto">
            <div className="bg-[var(--theme-accent)] p-4 sm:p-6 border-b-4 sm:border-b-[12px] border-[var(--theme-border)] flex justify-between items-center sticky top-0 z-[1001]">
              <h3 className="text-xl sm:text-4xl font-black uppercase tracking-tighter text-[var(--theme-accent-text)] flex items-center gap-3 sm:gap-6">
                <span className="p-1 sm:p-2 border-2 sm:border-4 border-white bg-black text-white shadow-[2px_2px_0px_0px_white] sm:shadow-[4px_4px_0px_0px_white]">VS</span>
                Audit
              </h3>
              <button 
                onClick={() => setSelectedResult(null)}
                className="w-10 h-10 sm:w-16 sm:h-16 flex items-center justify-center border-2 sm:border-4 border-[var(--theme-border)] bg-[var(--theme-card-bg)] text-[var(--theme-text)] shadow-[4px_4px_0px_0px_var(--theme-shadow)] sm:shadow-[6px_6px_0px_0px_var(--theme-shadow)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] sm:hover:translate-x-[6px] sm:hover:translate-y-[6px] transition-all"
              >
                <svg className="w-6 h-6 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 sm:p-12 grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 bg-white flex-grow">
              <div className="space-y-4 sm:space-y-6 min-w-0">
                <div className="inline-block px-3 sm:px-4 py-1 sm:py-2 bg-[var(--theme-secondary)] text-[var(--theme-primary-text)] font-black uppercase text-[10px] sm:text-sm tracking-widest shadow-[4px_4px_0px_0px_var(--theme-shadow)]">SOURCE_RAW</div>
                <div className="aspect-square border-4 sm:border-8 border-[var(--theme-border)] bg-[var(--theme-bg)] flex items-center justify-center p-4 sm:p-8 shadow-[8px_8px_0px_0px_var(--theme-shadow)] sm:shadow-[12px_12px_0px_0px_var(--theme-shadow)] relative overflow-hidden">
                  <img src={URL.createObjectURL(file!)} className="max-w-full max-h-full object-contain z-10" alt="Original" />
                  <div className="absolute inset-0 pattern-grid opacity-10"></div>
                </div>
                <div className="font-mono text-base sm:text-xl font-black text-center border-2 sm:border-4 border-[var(--theme-border)] p-2 sm:p-4 bg-[var(--theme-bg)] text-[var(--theme-text)]">{formatSize(file!.size)}</div>
              </div>
              <div className="space-y-4 sm:space-y-6 min-w-0">
                <div className="inline-block px-3 sm:px-4 py-1 sm:py-2 bg-[var(--theme-accent)] text-[var(--theme-accent-text)] font-black uppercase text-[10px] sm:text-sm tracking-widest shadow-[4px_4px_0px_0px_var(--theme-shadow)]">OUTPUT: {selectedResult.name}</div>
                <div className="aspect-square border-4 sm:border-8 border-[var(--theme-border)] bg-[var(--theme-bg)] flex items-center justify-center p-4 sm:p-8 shadow-[8px_8px_0px_0px_var(--theme-shadow)] sm:shadow-[12px_12px_0px_0px_var(--theme-shadow)] relative overflow-hidden">
                  <img src={selectedResult.url} className="max-w-full max-h-full object-contain z-10" alt="Compressed" />
                  <div className="absolute inset-0 pattern-grid opacity-10"></div>
                </div>
                <div className="font-mono text-base sm:text-xl font-black text-center border-2 sm:border-4 border-[var(--theme-border)] p-2 sm:p-4 bg-[var(--theme-accent)] text-[var(--theme-accent-text)] shadow-[4px_4px_0px_0px_var(--theme-shadow)]">
                  {formatSize(selectedResult.size)} ({(selectedResult.ratio * 100).toFixed(1)}%)
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 border-t-4 sm:border-t-[12px] border-[var(--theme-border)] bg-[var(--theme-bg)] flex justify-center sticky bottom-0 z-[1001]">
              <p className="text-center font-black max-w-3xl text-sm sm:text-lg uppercase tracking-tight opacity-80 leading-tight border-b-2 sm:border-b-4 border-dashed border-[var(--theme-border)] pb-2 text-[var(--theme-text)]">
                Audit complete. <span className="text-[var(--theme-accent)]">Engines optimally deployed.</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
