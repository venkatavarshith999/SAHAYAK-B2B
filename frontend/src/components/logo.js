/**
 * SAHAYAK B2B — Logo Component
 * Returns the brand logo HTML for use across all pages.
 * size: 'sm' | 'md' | 'lg' | 'xl'
 */

const SIZES = {
  sm:  { img: 32,  text: '14px', gap: '8px' },
  md:  { img: 44,  text: '18px', gap: '10px' },
  lg:  { img: 56,  text: '22px', gap: '12px' },
  xl:  { img: 80,  text: '28px', gap: '16px' },
};

export function logoHTML(size = 'md', showText = true) {
  const s = SIZES[size] || SIZES.md;
  return `
    <div class="sahayak-logo" style="display:flex;align-items:center;gap:${s.gap};text-decoration:none;cursor:pointer;" onclick="navigate('/')">
      <img
        src="/logo.jpg"
        alt="SAHAYAK B2B Logo"
        style="width:${s.img}px;height:${s.img}px;object-fit:contain;border-radius:10px;flex-shrink:0;"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
      />
      <span style="display:none;width:${s.img}px;height:${s.img}px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#06b6d4);align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:${Math.round(s.img * 0.45)}px;flex-shrink:0;">S</span>
      ${showText ? `
        <div style="line-height:1.1;">
          <div style="font-size:${s.text};font-weight:800;letter-spacing:-0.3px;color:#1e1b4b;">
            SAHAYAK <span style="background:linear-gradient(135deg,#7c3aed,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">B2B</span>
          </div>
          ${size === 'xl' || size === 'lg' ? `<div style="font-size:11px;color:#6b7280;font-weight:500;letter-spacing:0.3px;">Smart Business. Better Connections.</div>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

/** Compact icon-only logo badge (for sidebar collapsed state) */
export function logoIconHTML(size = 40) {
  return `
    <div style="width:${size}px;height:${size}px;cursor:pointer;" onclick="navigate('/')">
      <img
        src="/logo.jpg"
        alt="S"
        style="width:${size}px;height:${size}px;object-fit:contain;border-radius:8px;"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
      />
      <span style="display:none;width:${size}px;height:${size}px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#06b6d4);align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:${Math.round(size*0.45)}px;">S</span>
    </div>
  `;
}
