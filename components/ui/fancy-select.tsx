"use client";

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

export type FancySelectOption = {
  value: string;
  label: string;
  description?: string;
  eyebrow?: string;
};

type FancySelectProps = {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly FancySelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M5 7.5 10 12.5l5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="m10 2 1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="m5 10 3.1 3.2L15 6.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function FancySelect({
  name,
  value,
  onChange,
  options,
  placeholder = "Choose an option",
  disabled = false,
  className,
}: FancySelectProps) {
  const selectedOption =
    options.find((option) => option.value === value) ?? null;

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      {({ open }) => (
        <div className={className}>
          {name ? (
            <input
              type="hidden"
              name={name}
              value={value}
              disabled={disabled}
            />
          ) : null}

          <div className="relative">
            <ListboxButton
              className={`group relative min-h-[4.1rem] w-full rounded-[1.55rem] border-none text-left outline-none transition ${
                disabled
                  ? "cursor-not-allowed border-line bg-white/62 opacity-70"
                  : open
                    ? "border-[color:rgba(101,168,158,0.42)] bg-white shadow-[0_24px_54px_-34px_rgba(71,125,117,0.3)]"
                    : "border-[color:rgba(36,50,74,0.12)] bg-white/84 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] hover:border-[color:rgba(101,168,158,0.28)] hover:bg-white"
              }`}
            >
              <span className="flex items-center gap-3 px-3 py-3 pr-11">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                    open
                      ? "border-[color:rgba(101,168,158,0.26)] bg-[linear-gradient(135deg,rgba(101,168,158,0.16),rgba(255,197,166,0.26))] text-accent-strong"
                      : "border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(247,249,255,0.74))] text-accent-strong"
                  } shadow-[0_16px_28px_-24px_rgba(87,93,138,0.3)]`}
                >
                  <SparkIcon />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-muted/85">
                    Pick one
                  </span>
                  <span
                    className={`mt-1 block truncate text-[0.98rem] font-semibold ${
                      selectedOption ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {selectedOption?.label ?? placeholder}
                  </span>
                </span>
              </span>

              <span
                className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted transition ${
                  open ? "rotate-180 text-accent-strong" : ""
                }`}
              >
                <ChevronDownIcon />
              </span>
            </ListboxButton>

            <ListboxOptions
              anchor={{
                to: "bottom start",
                gap: "0.75rem",
                padding: "0.75rem",
              }}
              className="z-[55] max-h-72 w-[var(--button-width)] overflow-auto rounded-[1.65rem] border border-white/78 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(251,248,255,0.9))] p-2 shadow-[0_32px_70px_-36px_rgba(53,64,98,0.36)] backdrop-blur-xl outline-none"
            >
              {options.map((option) => (
                <ListboxOption
                  key={option.value}
                  value={option.value}
                  className={({ focus }) =>
                    `group flex cursor-pointer items-start gap-3 rounded-[1.2rem] px-3 py-3 transition outline-none ${
                      focus
                        ? "bg-[linear-gradient(135deg,rgba(198,187,255,0.2),rgba(255,197,166,0.18))]"
                        : "bg-transparent"
                    }`
                  }
                >
                  {({ selected, focus }) => (
                    <>
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm shadow-[0_16px_28px_-24px_rgba(87,93,138,0.28)] ${
                          selected
                            ? "border-[color:rgba(101,168,158,0.28)] bg-[linear-gradient(135deg,#65a89e,#7fc9bc)] text-white"
                            : focus
                              ? "border-white/80 bg-white text-accent-strong"
                              : "border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(247,249,255,0.76))] text-accent-strong"
                        }`}
                      >
                        {selected ? <CheckIcon /> : <SparkIcon />}
                      </span>

                      <span className="min-w-0 flex-1">
                        {option.eyebrow ? (
                          <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-muted/80">
                            {option.eyebrow}
                          </span>
                        ) : null}
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {option.label}
                        </span>
                        {option.description ? (
                          <span className="mt-1 block text-xs leading-6 text-muted">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </>
                  )}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </div>
      )}
    </Listbox>
  );
}
