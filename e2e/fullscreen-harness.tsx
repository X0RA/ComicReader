import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReaderFullscreenProvider, ReaderToolbar, useReaderFullscreen } from '../app/read/[id]/_fullscreen';
function Reader() {
  const fullscreen = useReaderFullscreen();
  return <main>
    <ReaderToolbar fullscreen={fullscreen}><button>Library</button><span>Comic title</span></ReaderToolbar>
    <p role="status">{fullscreen.error}</p>
    <output aria-label="Fullscreen state">{String(fullscreen.active)}</output>
  </main>;
}
function Harness() {
  const [mounted, setMounted] = useState(true);
  return <>{mounted && <ReaderFullscreenProvider><Reader /></ReaderFullscreenProvider>}<button style={{ position: 'fixed', bottom: 80 }} onClick={() => setMounted(false)}>Unmount reader</button></>;
}
createRoot(document.body.appendChild(document.createElement('div'))).render(<Harness />);
