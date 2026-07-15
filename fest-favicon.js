(function() {
    // Inject dynamic 80% zoom CSS on the body
    const zoomStyle = document.createElement('style');
    zoomStyle.id = 'dynamic-zoom-style';
    zoomStyle.textContent = `
        html {
            zoom: 80% !important;
            width: 125vw !important;
            height: 125vh !important;
            background-color: #f8f9fc !important;
        }
        body {
            width: 100% !important;
            height: 100% !important;
        }
    `;
    if (document.head) {
        document.head.appendChild(zoomStyle);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            document.head.appendChild(zoomStyle);
        });
    }

    // Function to dynamically update page favicon and manifest based on Firestore config
    function updatePageFaviconAndManifest(data) {
        if (!data) return;
        const name = data.name || 'Festival';
        const logo192 = data.logo192 || data.logo || '';
        const logo512 = data.logo512 || data.logo502 || data.logo || '';

        // 1. Dynamic Favicon & Apple Touch Icon Update
        if (logo512 || logo192) {
            const primaryLogo = logo512 || logo192;
            
            // Find existing icon link elements
            const iconLinks = document.querySelectorAll('link[rel*="icon"]');
            if (iconLinks.length > 0) {
                iconLinks.forEach(link => {
                    if (link.rel.includes('apple-touch-icon')) {
                        if (logo192) link.href = logo192;
                    } else {
                        link.href = primaryLogo;
                    }
                });
            } else {
                // If no favicon link exists, create a new one
                const link = document.createElement('link');
                link.rel = 'icon';
                link.href = primaryLogo;
                document.head.appendChild(link);
            }

            // Specifically search and ensure apple-touch-icon is updated or created
            let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
            if (appleIcon) {
                if (logo192) appleIcon.href = logo192;
            } else if (logo192) {
                appleIcon = document.createElement('link');
                appleIcon.rel = 'apple-touch-icon';
                appleIcon.href = logo192;
                document.head.appendChild(appleIcon);
            }
        }

        // 2. Dynamic PWA Manifest Update via Blob URL
        // This allows browser installation prompts and installed shortcuts to use the uploaded logo
        const existingManifest = document.querySelector('link[rel="manifest"]');
        const startUrl = new URL("./index.html", window.location.href).href;
        const icon192Url = logo192 ? logo192 : new URL("./logo-192.svg", window.location.href).href;
        const icon512Url = logo512 ? logo512 : new URL("./logo-512.svg", window.location.href).href;

        const manifestObj = {
            "name": name + " Admin Panel",
            "short_name": name,
            "description": name + " Management System",
            "start_url": startUrl,
            "display": "standalone",
            "background_color": "#ffffff",
            "theme_color": "#134E8E",
            "icons": [
                {
                    "src": icon192Url,
                    "sizes": "192x192",
                    "type": logo192 ? "image/png" : "image/svg+xml",
                    "purpose": "any maskable"
                },
                {
                    "src": icon512Url,
                    "sizes": "512x512",
                    "type": logo512 ? "image/png" : "image/svg+xml",
                    "purpose": "any maskable"
                }
            ]
        };
        
        try {
            const blob = new Blob([JSON.stringify(manifestObj, null, 2)], { type: 'application/json' });
            const manifestUrl = URL.createObjectURL(blob);
            
            if (existingManifest) {
                existingManifest.href = manifestUrl;
            } else {
                const link = document.createElement('link');
                link.rel = 'manifest';
                link.href = manifestUrl;
                document.head.appendChild(link);
            }
        } catch (e) {
            console.error("Failed to generate dynamic manifest:", e);
        }
    }

    // Expose function globally
    window.updatePageFaviconAndManifest = updatePageFaviconAndManifest;

    // Start a listener automatically if Firebase is available
    function initListener() {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            try {
                const db = firebase.firestore();
                db.collection('config').doc('festData').onSnapshot(doc => {
                    if (doc.exists) {
                        updatePageFaviconAndManifest(doc.data());
                    }
                }, err => {
                    console.warn("Favicon sync error:", err);
                });
            } catch (e) {
                console.error("Error setting up automatic favicon listener:", e);
            }
        } else {
            // Retry if Firebase isn't initialized yet
            setTimeout(initListener, 100);
        }
    }

    // Run when the DOM is ready or immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initListener);
    } else {
        initListener();
    }
})();
