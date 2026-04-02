/*! coi-serviceworker v0.1.8-enhanced (with FFmpeg & Worker caching) */
const CACHE_NAME = 'omni-compress-assets-v2';
let coepCredentialless = false;

if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => {
        event.waitUntil(
            Promise.all([
                self.clients.claim(),
                caches.keys().then((keys) => {
                    return Promise.all(
                        keys.map((key) => {
                            if (key !== CACHE_NAME) {
                                return caches.delete(key);
                            }
                        })
                    );
                })
            ])
        );
    });

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const url = new URL(r.url);
        const isFFmpegAsset = url.pathname.endsWith('.wasm') || 
                             url.pathname.includes('@ffmpeg/core') || 
                             url.pathname.includes('@jsquash/avif') ||
                             url.pathname.includes('image.worker') ||
                             url.pathname.includes('audio.worker');

        const request = (coepCredentialless && r.mode === "no-cors")
            ? new Request(r, {
                credentials: "omit",
            })
            : r;

        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(request).then((cachedResponse) => {
                    if (cachedResponse && isFFmpegAsset) {
                        return cachedResponse;
                    }

                    return fetch(request)
                        .then((response) => {
                            if (response.status === 0) {
                                return response;
                            }

                            // Cache large assets for subsequent cold starts
                            if (isFFmpegAsset && response.status === 200) {
                                cache.put(request, response.clone());
                            }

                            const newHeaders = new Headers(response.headers);
                            newHeaders.set("Cross-Origin-Embedder-Policy",
                                coepCredentialless ? "credentialless" : "require-corp"
                            );
                            if (!coepCredentialless) {
                                newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                            }
                            newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                            return new Response(response.body, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: newHeaders,
                            });
                        })
                        .catch((e) => {
                            if (cachedResponse) return cachedResponse;
                            throw e;
                        });
                });
            })
        );
    });

} else {
    (() => {
        const coi = {
            shouldRegister: () => true,
            shouldDeregister: () => false,
            coepCredentialless: () => !(window.chrome || window.netscape),
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi
        };

        const n = navigator;

        if (n.serviceWorker && n.serviceWorker.controller) {
            n.serviceWorker.controller.postMessage({
                type: "coepCredentialless",
                value: coi.coepCredentialless(),
            });

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

        if (!window.isSecureContext) {
            !coi.quiet && console.log("COOP/COEP Service Worker not registered, a secure context is required.");
            return;
        }

        if (n.serviceWorker) {
            n.serviceWorker.register(window.document.currentScript.src).then(
                (registration) => {
                    !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);

                    registration.addEventListener("updatefound", () => {
                        !coi.quiet && console.log("Reloading page to make use of updated COOP/COEP Service Worker.");
                        coi.doReload();
                    });

                    if (registration.active && !n.serviceWorker.controller) {
                        !coi.quiet && console.log("Reloading page to make use of COOP/COEP Service Worker.");
                        coi.doReload();
                    }
                },
                (err) => {
                    !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);
                }
            );
        }
    })();
}
