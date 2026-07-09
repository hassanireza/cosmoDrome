/** Small starfighter glyph matching the in-canvas ship silhouette, used for lives. */
export function ShipIcon(): React.JSX.Element {
  return (
    <svg className="ship-icon" width="18" height="20" viewBox="0 0 18 20" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 1 L11.5 9 L9 17 L6.5 9 Z" fill="#e8ecf2" stroke="#1c2128" strokeWidth="0.6" />
      <path d="M9 6 L17 10 L13 11.5 L9 9 Z" fill="#3a4252" stroke="#161a22" strokeWidth="0.5" />
      <path d="M9 6 L1 10 L5 11.5 L9 9 Z" fill="#454e60" stroke="#161a22" strokeWidth="0.5" />
      <circle cx="9" cy="6.5" r="1.3" fill="#5dd9e8" />
    </svg>
  );
}
