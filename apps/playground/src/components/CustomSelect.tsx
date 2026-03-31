import { useState, useRef, useEffect } from "react";
import { triggerFeedback } from "../utils/feedback";

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  className?: string;
  isMuted?: boolean;
}

export function CustomSelect({ 
  value, 
  onChange, 
  options, 
  label,
  className = "",
  isMuted = false
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="text-sm font-bold uppercase text-[var(--theme-text)] mb-2 block">{label}</label>}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          triggerFeedback('click', isMuted);
        }}
        className="w-full flex items-center justify-between border-2 p-3 font-bold bg-[var(--theme-bg)] text-[var(--theme-text)] border-[var(--theme-border)] shadow-[4px_4px_0px_0px_var(--theme-shadow)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all focus:outline-none"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <svg 
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-2 bg-[var(--theme-card-bg)] border-4 border-[var(--theme-border)] shadow-[8px_8px_0px_0px_var(--theme-shadow)] max-h-60 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                triggerFeedback('shift', isMuted);
              }}
              className={`w-full text-left p-3 font-bold hover:bg-[var(--theme-primary)] hover:text-[var(--theme-primary-text)] transition-colors border-b-2 border-[var(--theme-border)] last:border-b-0
                ${option.value === value ? "bg-[var(--theme-secondary)] text-[var(--theme-text)]" : "text-[var(--theme-text)]"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
