import React from 'react';

export function BrowserFrame({ src, alt, width, height, label, className = '', eager = false }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#111c33] shadow-2xl shadow-black/30 overflow-hidden ${className}`}>
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/10 bg-white/5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        {label && <span className="ml-3 text-[11px] text-gray-400 truncate">{label}</span>}
      </div>
      <img src={src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" className="block w-full h-auto bg-white" />
    </div>
  );
}

export function PhoneFrame({ src, alt, width, height, className = '', eager = false }) {
  return (
    <div className={`relative rounded-[2.2rem] bg-gray-900 p-2 shadow-2xl shadow-black/40 ring-1 ring-white/10 ${className}`}>
      <div className="absolute left-1/2 top-3 z-10 h-1.5 w-14 -translate-x-1/2 rounded-full bg-black/60" />
      <img src={src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" className="block w-full h-auto rounded-[1.7rem] bg-white" />
    </div>
  );
}
