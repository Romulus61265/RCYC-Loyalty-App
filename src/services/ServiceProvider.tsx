import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Services } from './contracts';
import { createServices } from './registry';

const ServicesContext = createContext<Services | null>(null);

export function ServiceProvider({ children, services }: { children: ReactNode; services?: Services }) {
  // A demonstration's reset moves to the next generation: a fresh set of services.
  const [generation, setGeneration] = useState(0);
  const value = useMemo(
    () => services ?? createServices(undefined, { onReset: () => setGeneration((g) => g + 1) }),
    // `generation` is the reason to build again, though the factory does not read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, generation],
  );
  // The key remounts everything below, so every screen starts again with the fresh services.
  return (
    <ServicesContext.Provider key={generation} value={value}>
      {children}
    </ServicesContext.Provider>
  );
}

/** Screens obtain services only through this hook — never by importing an implementation. */
export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices must be used inside <ServiceProvider>');
  return ctx;
}
