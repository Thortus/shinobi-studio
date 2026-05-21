import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ShinobiRise Studio',
  description: 'AI-powered video tools for real estate agents and content creators.',
};

export default function Home() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #1A0B12; }
        .landing {
          min-height: 100vh;
          background: #1A0B12;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 2rem;
        }
        .logo-link { margin-bottom: 3rem; display: block; }
        .logo-img { height: 48px; width: auto; }
        .headline { text-align: center; max-width: 580px; margin-bottom: 3.5rem; }
        .headline h1 {
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.02em;
          line-height: 1.15;
          margin-bottom: 1rem;
        }
        .headline h1 span { color: #A52A3A; }
        .headline p {
          font-size: 1.05rem;
          color: rgba(255,255,255,0.55);
          line-height: 1.7;
        }
        .ctas {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
          max-width: 420px;
        }
        .cta-primary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #A52A3A;
          color: #fff;
          padding: 1.1rem 1.5rem;
          border-radius: 10px;
          font-weight: 600;
          font-size: 1rem;
          text-decoration: none;
          letter-spacing: 0.01em;
          transition: opacity 0.15s;
        }
        .cta-primary:hover { opacity: 0.88; }
        .cta-secondary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          padding: 1.1rem 1.5rem;
          border-radius: 10px;
          font-weight: 500;
          font-size: 1rem;
          text-decoration: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .cta-secondary:hover {
          border-color: rgba(165,42,58,0.6);
          background: rgba(165,42,58,0.08);
        }
        .cta-label { display: block; font-weight: 600; margin-bottom: 0.15rem; }
        .cta-sub { display: block; font-size: 0.82rem; color: rgba(255,255,255,0.45); font-weight: 400; }
        .arrow { flex-shrink: 0; margin-left: 0.75rem; }
        .arrow-dim { opacity: 0.45; }
        .footer-copy {
          margin-top: 3rem;
          font-size: 0.78rem;
          color: rgba(255,255,255,0.25);
          letter-spacing: 0.03em;
        }
      `}</style>

      <main className="landing">
        <a href="https://shinobirise.com" className="logo-link">
          <img
            src="https://shinobirise.com/wp-content/uploads/2026/05/logo_navbar_300w.png"
            alt="ShinobiRise"
            className="logo-img"
          />
        </a>

        <div className="headline">
          <h1>
            Elevate your brand with&nbsp;
            <span>AI-powered video</span>
          </h1>
          <p>
            ShinobiRise Studio helps real estate agents and content creators produce
            luxury-grade video — without the production team.
          </p>
        </div>

        <div className="ctas">
          <a href="https://calendly.com/drcabrerap/30min" className="cta-primary">
            <span>Book a Free Strategy Call</span>
            <svg className="arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>

          <a href="https://shinobirise.com/realty" className="cta-secondary">
            <span>
              <span className="cta-label">For Real Estate Agents</span>
              <span className="cta-sub">Listing videos, market updates &amp; more</span>
            </span>
            <svg className="arrow arrow-dim" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>

          <a href="https://shinobirise.com/creators" className="cta-secondary">
            <span>
              <span className="cta-label">For Creators</span>
              <span className="cta-sub">Short-form video, brand content &amp; reels</span>
            </span>
            <svg className="arrow arrow-dim" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        <p className="footer-copy">© 2026 ShinobiRise. All rights reserved.</p>
      </main>
    </>
  );
}
