import React, { useEffect, useRef, useState } from "react";

/**
 * BookManual React component
 * - Tailwind-based styles so it matches the repository's design system
 * - Clickable book slip that opens a modal with a 3-step manual
 * - Accessible: Esc to close, focus trap basics (focus on modal on open, restore on close)
 *
 * Usage: import and place <BookManual /> inside your login page component
 */

export default function BookManual() {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      setTimeout(() => modalRef.current?.focus(), 50);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Open user manual"
        onClick={() => setOpen(true)}
        className={
          "flex items-center gap-3 px-4 py-2 rounded-2xl bg-gradient-to-b from-white/3 to-black/5 backdrop-blur-sm border border-white/5 shadow-lg transform transition-transform hover:-translate-y-1 hover:scale-101 focus:outline-none"
        }
        style={{
          // subtle rim light like the mockup
          boxShadow:
            "0 8px 24px rgba(2,6,23,0.6), inset 0 1px 0 rgba(255,255,255,0.02)",
        }}
      >
        <img src="/manual/book-icon.svg" alt="" className="w-10 h-10" />
        <span className="text-sm font-semibold text-slate-100">User Manual</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label="User manual"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            ref={modalRef}
            tabIndex={-1}
            className="relative max-w-5xl w-full max-h-[90vh] overflow-auto rounded-2xl p-6 bg-gradient-to-b from-slate-900/70 to-slate-800/60 border border-white/5 shadow-2xl"
            style={{ transform: "translateZ(0)" }}
          >
            <button
              aria-label="Close manual"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-slate-300 hover:text-white bg-transparent rounded-md p-2"
            >
              ×
            </button>

            <header className="flex items-center gap-4 mb-4">
              <img src="/manual/book-icon.svg" alt="L-CMS manual" className="w-12 h-12" />
              <div>
                <h2 className="text-xl font-semibold text-white">How to use L-CMS</h2>
                <p className="text-sm text-slate-300">Quick steps to start and end a session</p>
              </div>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <article className="p-4 rounded-lg bg-gradient-to-b from-white/2 to-black/3 border border-white/4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold">1</div>
                  <h3 className="text-white font-semibold">Login with Student ID</h3>
                </div>
                <p className="text-sm text-slate-300">Enter your Student ID (e.g., 24-12913). Default password is your Student ID.</p>
                <img src="/manual/step-1.svg" alt="Step 1" className="mt-3 w-full rounded-md shadow-md" />
              </article>

              <article className="p-4 rounded-lg bg-gradient-to-b from-white/2 to-black/3 border border-white/4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold">2</div>
                  <h3 className="text-white font-semibold">Go to Desktop</h3>
                </div>
                <p className="text-sm text-slate-300">After login, click 'Go to Desktop' to use the PC desktop and apps while your session runs.</p>
                <img src="/manual/step-2.svg" alt="Step 2" className="mt-3 w-full rounded-md shadow-md" />
              </article>

              <article className="p-4 rounded-lg bg-gradient-to-b from-white/2 to-black/3 border border-white/4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold">3</div>
                  <h3 className="text-white font-semibold">End Session Properly</h3>
                </div>
                <p className="text-sm text-slate-300">Always click 'End Session' before leaving to free the PC and terminate access.</p>
                <img src="/manual/step-3.svg" alt="Step 3" className="mt-3 w-full rounded-md shadow-md" />
              </article>
            </section>

            <footer className="mt-6 flex items-center justify-between gap-4">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-semibold"
              >
                Got it
              </button>

              <a
                href="/manual/handbook.pdf"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-emerald-400 hover:underline"
              >
                Download full handbook (PDF)
              </a>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
