import type { ReactNode } from 'react';
import { useId } from 'react';
import logo from './logo.png';

const base = import.meta.env.BASE_URL;

const NAV_ITEMS = [
  { href: base, label: 'Playground' },
  { href: `${base}soft/`, label: 'Soft Nav' },
  { href: `${base}react-router-v5/`, label: 'Router v5' },
  { href: `${base}react-router-v6-declarative/`, label: 'Router v6' },
  { href: `${base}react-router-v6-data/`, label: 'Router v6 Data' },
] as const;

const Layout = ({ children }: { children: ReactNode }) => {
  const toggleId = useId();
  return (
    <>
      <nav className="site-nav">
        <a href={base} className="site-nav-logo">
          <img src={logo} alt="Embrace" />
        </a>
        <input type="checkbox" id={toggleId} className="site-nav-toggle" />
        <label htmlFor={toggleId} className="site-nav-burger">
          <span />
          <span />
          <span />
        </label>
        <div className="site-nav-links">
          {NAV_ITEMS.map(({ href, label }) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </div>
      </nav>
      <div className="container">{children}</div>
    </>
  );
};

export { Layout };
