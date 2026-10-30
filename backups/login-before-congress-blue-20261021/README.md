# Login appearance backup

Saved before Congress Blue and the enlarged logo on 21 October 2026. This directory preserves the original SignIn.tsx, SignIn.css, experience.css and main.tsx. The skyline and CIDCO logo assets are unchanged.

Run `npm run restore:login` from the project root to restore the saved login appearance. The command restores SignIn.css only: the rendered layout was not changed in this update, and current authentication/account identity logic must be retained. Vite refreshes the appearance automatically; rebuild for production.

The other files are a reference snapshot. Do not copy main.tsx or experience.css over the live application when restoring only the login.
