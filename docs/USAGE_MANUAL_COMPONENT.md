# BookManual component usage

This feature branch adds a BookManual React component and placeholder assets under public/manual. The component is a Tailwind-based UI that shows a clickable "book slip" and opens a modal with a 3-step manual.

Files added
- artifacts/library-system/src/components/BookManual/BookManual.tsx
- public/manual/book-icon.svg
- public/manual/step-1.svg
- public/manual/step-2.svg
- public/manual/step-3.svg
- public/manual/handbook.pdf

How to use
1. Import the component in your login page (example):

```tsx
import BookManual from "@/components/BookManual/BookManual"; // adjust the path to your project

function LoginPage() {
  return (
    <div className="login-layout">
      {/* ...existing login UI... */}

      {/* Place the book manual near the login form, e.g., on the right side */}
      <div className="absolute right-6 top-24">
        <BookManual />
      </div>
    </div>
  );
}
```

2. Replace the placeholder SVGs in public/manual with real screenshots or PNGs sized around 800x480.
3. Replace public/manual/handbook.pdf with your real handbook PDF if available.

Notes & Accessibility
- The modal supports Esc-to-close and focus management (focus moves to the modal on open and restores on close).
- The component uses Tailwind utility classes to match the repository style; if your project uses a different path alias, update the import path accordingly.

If you would like, I can now search and make the single import/edit in the login page for you (one-line import + placing <BookManual />). Reply to confirm and I will perform that edit on this same branch.
