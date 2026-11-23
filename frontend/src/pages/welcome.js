/**
 * SAHAYAK B2B — Welcome / Landing Page
 * Full-screen premium landing page with interactive brand showcase
 */

import { navigate } from '../router.js';

export default function renderWelcome(container) {
  container.innerHTML = `
    <div class="welcome-container">
      <!-- Left Panel: Brand & Features -->
      <section class="welcome-left">
        <div class="welcome-left-inner">
          <!-- Brand Header -->
          <header class="welcome-brand-header">
            <div class="welcome-brand-badge">
              <img src="/logo.jpg" alt="Sahayak Logo" style="width:44px;height:44px;object-fit:contain;" />
              <span class="welcome-brand-title">SAHAYAK <span class="welcome-brand-accent">B2B</span></span>
            </div>
            <span class="badge badge-brand">AI-Powered Trade</span>
          </header>

          <!-- Hero Main -->
          <div class="welcome-hero-content">
            <h1 class="welcome-headline">
              Smart Business.<br />
              <span class="welcome-gradient-text">Better Connections.</span><br />
              Stronger Trade.
            </h1>

            <p class="welcome-subhead">
              India's intelligent B2B commerce network connecting verified retailers,
              wholesalers, manufacturers, and logistics partners through autonomous
              negotiation and transparent trade intelligence.
            </p>

            <!-- 3 Feature Highlights -->
            <div class="welcome-features">
              <div class="welcome-feature-card">
                <div class="welcome-feature-icon">🤖</div>
                <div class="welcome-feature-body">
                  <h3 class="welcome-feature-title">AI-Powered Market Intel</h3>
                  <p class="welcome-feature-desc">
                    Real-time demand forecasting, bulk price trend intelligence, and automated RFQ matching.
                  </p>
                </div>
              </div>

              <div class="welcome-feature-card">
                <div class="welcome-feature-icon">🤝</div>
                <div class="welcome-feature-body">
                  <h3 class="welcome-feature-title">KAEN Negotiation Engine</h3>
                  <p class="welcome-feature-desc">
                    Autonomous multi-round concession curve bargaining that secures optimal bulk pricing.
                  </p>
                </div>
              </div>

              <div class="welcome-feature-card">
                <div class="welcome-feature-icon">🛡️</div>
                <div class="welcome-feature-body">
                  <h3 class="welcome-feature-title">Independent Business Verification</h3>
                  <p class="welcome-feature-desc">
                    Dedicated Verification Admins review GSTIN, business documents, and trade identity before issuing verified badges.
                  </p>
                </div>
              </div>
            </div>

            <!-- Action Entry Sections: Clearly Separated Business vs Worker Access -->
            <div style="display:flex;flex-direction:column;gap:14px;margin-top:8px;">
              <div style="padding:16px;border-radius:var(--radius-lg);border:1px solid var(--color-border);background:#fff;">
                <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-primary);margin-bottom:10px;">
                  A. Admin / Business / Partner Access
                </div>
                <div class="welcome-actions" style="margin-top:0;">
                  <button id="welcome-btn-get-started" class="btn btn-primary btn-lg welcome-btn-primary">
                    Register Business
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                  <button id="welcome-btn-signin" class="btn btn-ghost btn-lg welcome-btn-secondary">
                    Business / Admin Sign In
                  </button>
                </div>
              </div>

              <div style="padding:14px 16px;border-radius:var(--radius-lg);border:1px dashed var(--color-brand-200,#ddd6fe);background:var(--color-brand-50,#f5f3ff);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div>
                  <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-primary);">
                    B. Worker Access
                  </div>
                  <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px;">
                    Employees join an existing organization using an invitation code from their manager.
                  </div>
                </div>
                <button id="welcome-btn-worker" class="btn btn-white btn-sm" style="border:1px solid var(--color-brand-200,#ddd6fe);font-weight:700;">
                  👷 Worker Sign In / Join →
                </button>
              </div>
            </div>

            <!-- Trust Bar -->
            <div class="welcome-trust-bar">
              <div class="welcome-trust-item">
                <span class="welcome-trust-check">✓</span> Backend RBAC & Org Isolation
              </div>
              <div class="welcome-trust-divider">•</div>
              <div class="welcome-trust-item">
                <span class="welcome-trust-check">✓</span> KAEN Negotiation Engine
              </div>
              <div class="welcome-trust-divider">•</div>
              <div class="welcome-trust-item">
                <span class="welcome-trust-check">✓</span> Audit-Logged Workflows
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Right Panel: Animated Gradient with Platform Lifecycle Cards -->
      <section class="welcome-right gradient-animate" aria-hidden="true">
        <div class="welcome-right-glow"></div>

        <!-- Platform Capability Cards -->
        <div class="welcome-stats-container">
          <div class="welcome-stat-card welcome-stat-card-1 animate-float">
            <div class="welcome-stat-icon-wrapper">
              <span class="welcome-stat-icon">🏢</span>
            </div>
            <div class="welcome-stat-details">
              <div class="welcome-stat-val">5 Dedicated Portals</div>
              <div class="welcome-stat-lbl">Buyer · Seller · Logistics · Workers · Admin</div>
              <div class="welcome-stat-tag">
                <span class="welcome-stat-tag-dot"></span> Unified B2B Lifecycle
              </div>
            </div>
          </div>

          <div class="welcome-stat-card welcome-stat-card-2 animate-float" style="animation-delay: -1.2s;">
            <div class="welcome-stat-icon-wrapper">
              <span class="welcome-stat-icon">🤝</span>
            </div>
            <div class="welcome-stat-details">
              <div class="welcome-stat-val">KAEN Negotiation</div>
              <div class="welcome-stat-lbl">Structured Multi-Round Bargaining</div>
              <div class="welcome-stat-tag">
                <span class="welcome-stat-tag-dot"></span> Dual-Party Approval Required
              </div>
            </div>
          </div>

          <div class="welcome-stat-card welcome-stat-card-3 animate-float" style="animation-delay: -2.4s;">
            <div class="welcome-stat-icon-wrapper">
              <span class="welcome-stat-icon">🛡️</span>
            </div>
            <div class="welcome-stat-details">
              <div class="welcome-stat-val">Verified Organizations</div>
              <div class="welcome-stat-lbl">Admin Document & GSTIN Review</div>
              <div class="welcome-stat-tag">
                <span class="welcome-stat-tag-dot"></span> SHA-256 Audit Trail
              </div>
            </div>
          </div>

          <div class="welcome-stat-card welcome-stat-card-4 animate-float" style="animation-delay: -0.6s;">
            <div class="welcome-stat-icon-wrapper">
              <span class="welcome-stat-icon">🤖</span>
            </div>
            <div class="welcome-stat-details">
              <div class="welcome-stat-val">Sahayak AI Co-Pilot</div>
              <div class="welcome-stat-lbl">Role & Organization-Scoped Gemini AI</div>
              <div class="welcome-stat-tag">
                <span class="welcome-stat-tag-dot"></span> Human-in-the-Loop Safeguards
              </div>
            </div>
          </div>
        </div>

        <!-- Subtle Bottom Wave Shape -->
        <div class="welcome-wave-wrap">
          <svg class="welcome-wave-svg" viewBox="0 0 1440 220" preserveAspectRatio="none">
            <path
              fill="#FFFFFF"
              fill-opacity="0.18"
              d="M0,64L48,80C96,96,192,128,288,128C384,128,480,96,576,96C672,96,768,128,864,138.7C960,149,1056,139,1152,117.3C1248,96,1344,64,1392,48L1440,32L1440,220L1392,220C1344,220,1248,220,1152,220C1056,220,960,220,864,220C768,220,672,220,576,220C480,220,384,220,288,220C192,220,96,220,48,220L0,220Z"
            ></path>
            <path
              fill="#FFFFFF"
              fill-opacity="0.25"
              d="M0,128L48,138.7C96,149,192,171,288,160C384,149,480,107,576,101.3C672,96,768,128,864,144C960,160,1056,160,1152,144C1248,128,1344,96,1392,80L1440,64L1440,220L1392,220C1344,220,1248,220,1152,220C1056,220,960,220,864,220C768,220,672,220,576,220C480,220,384,220,288,220C192,220,96,220,48,220L0,220Z"
            ></path>
          </svg>
        </div>
      </section>
    </div>

    <style>
      .welcome-container {
        display: flex;
        min-height: 100vh;
        width: 100%;
        background: var(--color-surface);
        overflow-x: hidden;
      }

      .welcome-left {
        flex: 1.1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-8) var(--space-6);
        background: var(--color-surface);
        z-index: 2;
      }

      .welcome-left-inner {
        width: 100%;
        max-width: 620px;
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
      }

      .welcome-brand-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .welcome-brand-badge {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .welcome-logo-badge {
        width: 38px;
        height: 38px;
        border-radius: var(--radius-md);
        background: var(--grad-primary);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: var(--text-lg);
        box-shadow: 0 4px 12px rgba(109, 40, 217, 0.3);
      }

      .welcome-brand-title {
        font-size: var(--text-xl);
        font-weight: 900;
        letter-spacing: -0.03em;
        color: var(--color-text-primary);
      }

      .welcome-brand-accent {
        color: var(--color-primary);
      }

      .welcome-hero-content {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }

      .welcome-headline {
        font-size: clamp(2rem, 4vw, 3rem);
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.15;
        color: var(--color-text-primary);
      }

      .welcome-gradient-text {
        background: var(--grad-primary);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .welcome-subhead {
        font-size: var(--text-base);
        color: var(--color-text-secondary);
        line-height: 1.65;
        max-width: 560px;
      }

      .welcome-features {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin: var(--space-2) 0;
      }

      .welcome-feature-card {
        display: flex;
        align-items: flex-start;
        gap: var(--space-4);
        padding: var(--space-3) var(--space-4);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        transition: transform var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base);
      }

      .welcome-feature-card:hover {
        transform: translateX(4px);
        border-color: var(--color-brand-300);
        background: var(--color-brand-50);
        box-shadow: var(--shadow-sm);
      }

      .welcome-feature-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-md);
        background: white;
        border: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
        box-shadow: var(--shadow-xs);
      }

      .welcome-feature-body {
        flex: 1;
      }

      .welcome-feature-title {
        font-size: var(--text-sm);
        font-weight: 700;
        color: var(--color-text-primary);
        margin-bottom: 2px;
      }

      .welcome-feature-desc {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        line-height: 1.5;
      }

      .welcome-actions {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        margin-top: var(--space-2);
        flex-wrap: wrap;
      }

      .welcome-btn-primary {
        box-shadow: 0 6px 20px rgba(109, 40, 217, 0.4);
      }

      .welcome-trust-bar {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-top: var(--space-2);
        flex-wrap: wrap;
      }

      .welcome-trust-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
      }

      .welcome-trust-check {
        color: var(--color-success);
        font-weight: 800;
      }

      .welcome-trust-divider {
        color: var(--color-border-strong);
      }

      /* Right Panel */
      .welcome-right {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-10);
        overflow: hidden;
      }

      .welcome-right-glow {
        position: absolute;
        width: 380px;
        height: 380px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.25) 0%, transparent 70%);
        top: 20%;
        left: 20%;
        pointer-events: none;
        filter: blur(20px);
      }

      .welcome-stats-container {
        position: relative;
        width: 100%;
        max-width: 480px;
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        z-index: 3;
      }

      .welcome-stat-card {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-5);
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: var(--radius-xl);
        box-shadow: 0 16px 36px rgba(44, 18, 90, 0.18);
        transition: transform var(--transition-base);
      }

      .welcome-stat-card:hover {
        transform: translateY(-4px) scale(1.02);
      }

      .welcome-stat-card-1 { align-self: flex-start; width: 92%; }
      .welcome-stat-card-2 { align-self: flex-end; width: 92%; }
      .welcome-stat-card-3 { align-self: flex-start; width: 92%; }
      .welcome-stat-card-4 { align-self: flex-end; width: 92%; }

      .welcome-stat-icon-wrapper {
        width: 52px;
        height: 52px;
        border-radius: var(--radius-lg);
        background: var(--grad-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 26px;
        flex-shrink: 0;
        box-shadow: inset 0 2px 4px rgba(109, 40, 217, 0.08);
      }

      .welcome-stat-details {
        flex: 1;
      }

      .welcome-stat-val {
        font-size: var(--text-xl);
        font-weight: 800;
        color: var(--color-text-primary);
        letter-spacing: -0.02em;
        line-height: 1.2;
      }

      .welcome-stat-lbl {
        font-size: var(--text-xs);
        color: var(--color-text-secondary);
        font-weight: 500;
        margin-top: 1px;
      }

      .welcome-stat-tag {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        color: var(--color-primary);
        margin-top: 4px;
      }

      .welcome-stat-tag-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--color-primary);
      }

      .welcome-wave-wrap {
        position: absolute;
        bottom: -2px;
        left: 0;
        right: 0;
        width: 100%;
        line-height: 0;
        pointer-events: none;
      }

      .welcome-wave-svg {
        width: 100%;
        height: 110px;
      }

      @media (max-width: 1023px) {
        .welcome-right {
          display: none !important;
        }

        .welcome-left {
          flex: 1;
          padding: var(--space-6) var(--space-4);
        }

        .welcome-actions {
          flex-direction: column;
          width: 100%;
        }

        .welcome-actions .btn {
          width: 100%;
        }
      }
    </style>
  `;

  // Attach event listeners
  const btnGetStarted = container.querySelector('#welcome-btn-get-started');
  if (btnGetStarted) {
    btnGetStarted.addEventListener('click', () => {
      navigate('/role-select');
    });
  }

  const btnSignIn = container.querySelector('#welcome-btn-signin');
  if (btnSignIn) {
    btnSignIn.addEventListener('click', () => {
      navigate('/login');
    });
  }

  const btnWorker = container.querySelector('#welcome-btn-worker');
  if (btnWorker) {
    btnWorker.addEventListener('click', () => {
      navigate('/worker-access');
    });
  }
}
